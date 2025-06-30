"use server";

import { google, type gmail_v1 } from "googleapis";
import { type ParsedMail, simpleParser, type AddressObject } from "mailparser";
import { db } from "~/server/db";
import { account, email, attachment } from "~/server/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import {
  deleteS3Object,
  uploadAttachmentToS3,
  uploadEmailBodyToS3,
} from "./s3-client";
import type { account as Account } from "~/server/db/schema";

interface GmailMessage {
  id: string;
  threadId: string;
  snippet: string;
  raw: string;
  internalDate: string;
  historyId: string;
}

export interface FinalEmail {
  gmailId: string;
  threadId: string;
  subject: string;
  from: string;
  to: string;
  cc?: string;
  bcc?: string;
  snippet: string;
  htmlBody: string;
  textBody: string;
  receivedAt: Date;
  attachments: Array<{
    filename: string;
    contentType: string;
    size: number;
    content: Buffer;
  }>;
}

// Main function to sync messages for a user
export async function syncMessagesForUser(userId: string) {
  const userAccount = await db.query.account.findFirst({
    where: and(eq(account.userId, userId), eq(account.providerId, "google")),
  });

  if (!userAccount) {
    throw new Error("No Google account found for user to sync.");
  }

  const { gmail } = await createGmailClient(userAccount);

  if (!userAccount.historyId) {
    return await performInitialSync(userId, gmail);
  } else {
    return await performIncrementalSync(userId, userAccount, gmail);
  }
}

async function performInitialSync(userId: string, gmail: gmail_v1.Gmail) {
  console.log(`Performing initial sync for user ${userId}`);
  const allMessages = await fetchAllMessages(gmail);
  const newEmails = await processAndStoreMessages(userId, allMessages);

  const profile = await gmail.users.getProfile({ userId: "me" });
  const newHistoryId = profile.data.historyId;

  if (newHistoryId) {
    await db
      .update(account)
      .set({ historyId: newHistoryId })
      .where(eq(account.userId, userId));
    console.log(`Initial sync complete. Set historyId to ${newHistoryId}`);
  }

  return { added: newEmails, removed: [] };
}

async function performIncrementalSync(
  userId: string,
  userAccount: typeof Account.$inferSelect,
  gmail: gmail_v1.Gmail,
) {
  console.log(
    `Performing incremental sync for user ${userId} from historyId ${userAccount.historyId}`,
  );
  const history = await fetchHistory(gmail, userAccount.historyId!);

  if (!history.history) {
    console.log("No new history found.");
    return { added: [], removed: [] };
  }

  const messagesAdded = history.history
    .flatMap((h) => h.messagesAdded ?? [])
    .filter((ma) => ma.message?.id)
    .map((ma) => ma.message!);

  const idsDeleted = history.history
    .flatMap((h) => h.messagesDeleted ?? [])
    .map((md) => md.message?.id)
    .filter((id): id is string => !!id);

  const removedEmails = await processDeletions(idsDeleted);

  const addedMessages = await fetchMessagesByIds(
    gmail,
    messagesAdded.map((m) => m.id!),
  );
  const newEmails = await processAndStoreMessages(userId, addedMessages);

  const newHistoryId = history.historyId;
  if (newHistoryId) {
    await db
      .update(account)
      .set({ historyId: newHistoryId.toString() })
      .where(eq(account.id, userAccount.id));
    console.log(`Incremental sync complete. New historyId is ${newHistoryId}`);
  }

  return { added: newEmails, removed: removedEmails };
}

async function processAndStoreMessages(
  userId: string,
  messages: GmailMessage[],
) {
  const syncedEmails = [];
  for (const message of messages) {
    const existingEmail = await db.query.email.findFirst({
      where: eq(email.gmailId, message.id),
    });

    if (existingEmail) continue;

    const parsed = await parseRawMessage(message);
    const bodyS3Url = await uploadEmailBodyToS3(
      userId,
      parsed.gmailId,
      parsed.htmlBody,
    );

    const [newEmail] = await db
      .insert(email)
      .values({
        userId,
        gmailId: parsed.gmailId,
        threadId: parsed.threadId,
        subject: parsed.subject,
        from: parsed.from,
        to: parsed.to,
        cc: parsed.cc,
        bcc: parsed.bcc,
        snippet: parsed.snippet,
        bodyS3Url: bodyS3Url,
        receivedAt: parsed.receivedAt,
      })
      .returning();

    if (newEmail && parsed.attachments.length > 0) {
      for (const att of parsed.attachments) {
        const attachmentS3Url = await uploadAttachmentToS3(
          userId,
          newEmail.id,
          att,
        );
        await db.insert(attachment).values({
          emailId: newEmail.id,
          filename: att.filename,
          contentType: att.contentType,
          size: att.size.toString(),
          s3Url: attachmentS3Url,
        });
      }
    }

    if (newEmail) {
      syncedEmails.push({ ...newEmail, attachments: parsed.attachments });
    }
  }
  return syncedEmails;
}

async function processDeletions(gmailIds: string[]) {
  if (gmailIds.length === 0) return [];

  const deletedDbRecords = await db.query.email.findMany({
    where: inArray(email.gmailId, gmailIds),
    with: { attachments: true },
  });

  if (deletedDbRecords.length === 0) return [];

  for (const record of deletedDbRecords) {
    if (record.bodyS3Url) {
      await deleteS3Object(record.bodyS3Url);
    }
    for (const att of record.attachments) {
      if (att.s3Url) {
        await deleteS3Object(att.s3Url);
      }
    }
  }

  await db.delete(email).where(inArray(email.gmailId, gmailIds));
  console.log(
    `Deleted ${deletedDbRecords.length} emails and their assets from DB and S3.`,
  );

  return deletedDbRecords;
}

async function fetchAllMessages(gmail: gmail_v1.Gmail) {
  let pageToken: string | undefined;
  const allMessageIds: { id: string; threadId: string }[] = [];
  do {
    const response = await gmail.users.messages.list({
      userId: "me",
      maxResults: 500,
      pageToken,
    });
    const messages = response.data.messages ?? [];
    for (const msg of messages) {
      if (msg.id && msg.threadId) {
        allMessageIds.push({ id: msg.id, threadId: msg.threadId });
      }
    }
    pageToken = response.data.nextPageToken ?? undefined;
  } while (pageToken);

  return fetchMessagesByIds(
    gmail,
    allMessageIds.map((m) => m.id),
  );
}

async function fetchMessagesByIds(gmail: gmail_v1.Gmail, ids: string[]) {
  if (ids.length === 0) return [];
  const messagePromises = ids.map((id) =>
    gmail.users.messages.get({ userId: "me", id, format: "raw" }),
  );
  const results = await Promise.allSettled(messagePromises);

  // Extract successful messages from the settled promises
  const successfulMessages: gmail_v1.Schema$Message[] = [];
  for (const result of results) {
    if (result.status === "fulfilled" && result.value.data) {
      successfulMessages.push(result.value.data);
    }
  }

  return successfulMessages.map((d) => d as GmailMessage);
}

async function fetchHistory(gmail: gmail_v1.Gmail, startHistoryId: string) {
  const response = await gmail.users.history.list({
    userId: "me",
    startHistoryId,
  });
  return response.data;
}

async function createGmailClient(userAccount: typeof Account.$inferSelect) {
  if (!userAccount.accessToken || !userAccount.refreshToken) {
    throw new Error("Missing tokens for Gmail client");
  }

  const auth = new google.auth.OAuth2({
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    redirectUri: process.env.GOOGLE_REDIRECT_URI,
  });

  auth.setCredentials({
    access_token: userAccount.accessToken,
    refresh_token: userAccount.refreshToken,
  });

  auth.on("tokens", (tokens) => {
    void (async () => {
      try {
        const updatePayload: Partial<typeof Account.$inferSelect> = {
          updatedAt: new Date(),
        };
        if (tokens.access_token) {
          updatePayload.accessToken = tokens.access_token;
        }
        if (tokens.refresh_token) {
          updatePayload.refreshToken = tokens.refresh_token;
        }
        await db
          .update(account)
          .set(updatePayload)
          .where(eq(account.id, userAccount.id));
      } catch (error) {
        console.error("Failed to update tokens in db:", error);
      }
    })();
  });

  return { gmail: google.gmail({ version: "v1", auth }), auth };
}

export async function parseRawMessage(
  message: GmailMessage,
): Promise<FinalEmail> {
  if (!message.raw) throw new Error("No raw content for parsing");
  const rawEmail = Buffer.from(message.raw, "base64url").toString();
  const parsed: ParsedMail = await simpleParser(rawEmail);

  const attachments = (parsed.attachments || []).map((att) => ({
    filename: att.filename ?? "unnamed",
    contentType: att.contentType ?? "application/octet-stream",
    size: att.size ?? 0,
    content: att.content,
  }));

  return {
    gmailId: message.id,
    threadId: message.threadId,
    subject: parsed.subject ?? "(No Subject)",
    from: formatAddress(parsed.from),
    to: formatAddress(parsed.to),
    cc: formatAddress(parsed.cc),
    bcc: formatAddress(parsed.bcc),
    snippet: parsed.text?.substring(0, 200) ?? "",
    htmlBody: parsed.html || "",
    textBody: parsed.text ?? "",
    receivedAt: parsed.date ?? new Date(parseInt(message.internalDate)),
    attachments,
  };
}

function formatAddress(
  addressData: AddressObject | AddressObject[] | undefined,
): string {
  if (!addressData) return "";
  const addresses = Array.isArray(addressData) ? addressData : [addressData];
  return addresses
    .flatMap((addrObj) => addrObj.value || [])
    .map((addr) =>
      addr.name ? `${addr.name} <${addr.address ?? ""}>` : (addr.address ?? ""),
    )
    .join(", ");
}

export async function sendMessage(
  userId: string,
  options: {
    to: string;
    from: string;
    subject: string;
    body: string;
    threadId?: string; // For threading replies
  },
) {
  const userAccount = await db.query.account.findFirst({
    where: and(eq(account.userId, userId), eq(account.providerId, "google")),
  });

  if (!userAccount) {
    throw new Error("No Google account found for user to send message from.");
  }

  const { gmail } = await createGmailClient(userAccount);

  // Construct the raw email
  const emailLines = [
    `From: ${options.from}`,
    `To: ${options.to}`,
    `Subject: ${options.subject}`,
    "Content-Type: text/html; charset=utf-8",
    "",
    options.body,
  ];
  const email = emailLines.join("\n");

  const base64EncodedEmail = Buffer.from(email).toString("base64url");

  const requestBody: gmail_v1.Params$Resource$Users$Messages$Send = {
    userId: "me",
    requestBody: {
      raw: base64EncodedEmail,
    },
  };

  // If it's a reply, we need to include the threadId to keep it in the same thread
  if (options.threadId) {
    requestBody.requestBody!.threadId = options.threadId;
  }

  const response = await gmail.users.messages.send(requestBody);

  if (!response.data) {
    throw new Error("Failed to send email.");
  }

  // TODO: Maybe change this to optimistic update? or wait for the push notification implementation.
  void syncMessagesForUser(userId);

  return response.data;
}
