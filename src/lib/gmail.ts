"use server";

import { google, type gmail_v1 } from "googleapis";
import { type ParsedMail, simpleParser, type AddressObject } from "mailparser";
import { db } from "~/server/db";
import { account, email, attachment } from "~/server/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { s3 } from "./s3-client";
import { DeleteObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
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

  // If there's no historyId, this is the first sync.
  // We'll fetch all messages and set the initial historyId.
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

  // After the first sync, get the latest history ID to use for future incremental syncs
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

  // Process deletions
  const removedEmails = await processDeletions(idsDeleted);

  // Process additions
  const addedMessages = await fetchMessagesByIds(
    gmail,
    messagesAdded.map((m) => m.id!),
  );
  const newEmails = await processAndStoreMessages(userId, addedMessages);

  // Update history ID
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

// Data Processing Helpers
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
      const attachmentValues = parsed.attachments.map((att) => ({
        emailId: newEmail.id,
        filename: att.filename,
        contentType: att.contentType,
        size: att.size.toString(),
      }));
      await db.insert(attachment).values(attachmentValues);
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
    columns: { id: true, gmailId: true, bodyS3Url: true },
  });

  if (deletedDbRecords.length === 0) return [];

  // Delete from S3
  for (const record of deletedDbRecords) {
    if (record.bodyS3Url) {
      await deleteEmailBodyFromS3(record.bodyS3Url);
    }
  }

  // Delete from DB
  await db.delete(email).where(inArray(email.gmailId, gmailIds));
  console.log(`Deleted ${deletedDbRecords.length} emails from DB and S3.`);

  return deletedDbRecords;
}

// Gmail API Fetching Helpers
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

  // Filter out any messages that don't have the required properties and cast to GmailMessage
  return successfulMessages
    .filter((d): d is gmail_v1.Schema$Message => !!d)
    .map((d) => d as GmailMessage);
}

async function fetchHistory(gmail: gmail_v1.Gmail, startHistoryId: string) {
  const response = await gmail.users.history.list({
    userId: "me",
    startHistoryId,
  });
  return response.data;
}

// Gmail Client and Auth
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

  // Automatically update tokens if they are refreshed.
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

// Parsing and S3 Helpers

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

async function uploadEmailBodyToS3(
  userId: string,
  gmailId: string,
  htmlBody: string,
): Promise<string> {
  const bucketName = process.env.S3_BUCKET_NAME;
  if (!bucketName) throw new Error("S3_BUCKET_NAME is not defined");

  const key = `emails/${userId}/${gmailId}.html`;
  const command = new PutObjectCommand({
    Bucket: bucketName,
    Key: key,
    Body: htmlBody,
    ContentType: "text/html",
  });

  await s3.send(command);
  return `https://${bucketName}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;
}

async function deleteEmailBodyFromS3(s3Url: string) {
  const bucketName = process.env.S3_BUCKET_NAME;
  if (!bucketName) throw new Error("S3_BUCKET_NAME is not defined");

  const url = new URL(s3Url);
  const key = url.pathname.substring(1);

  const command = new DeleteObjectCommand({ Bucket: bucketName, Key: key });
  await s3.send(command);
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
