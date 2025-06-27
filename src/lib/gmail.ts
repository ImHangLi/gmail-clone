import { google } from "googleapis";
import { type ParsedMail, simpleParser, type AddressObject } from "mailparser";
import { db } from "~/server/db";
import { account, email, attachment } from "~/server/db/schema";
import { and, desc, eq } from "drizzle-orm";

interface GmailMessage {
  id: string;
  threadId: string;
  snippet: string;
  raw: string;
  internalDate: string;
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

// Sync messages for a user
export async function syncMessagesForUser(userId: string) {
  const lastSyncedEmail = await db.query.email.findFirst({
    where: eq(email.userId, userId),
    orderBy: [desc(email.receivedAt)],
  });

  const messages = await fetchMessages(userId, {
    since: lastSyncedEmail?.receivedAt,
    allPages: true,
    maxResults: 500,
  });

  const syncedEmails = [];

  for (const message of messages) {
    const existingEmail = await db.query.email.findFirst({
      where: eq(email.gmailId, message.id),
    });

    if (!existingEmail) {
      const parsed = await parseRawMessage(message);
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
          bodyS3Url: parsed.htmlBody, // Store HTML body directly
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

      syncedEmails.push({
        ...newEmail,
        htmlBody: parsed.htmlBody,
        attachments: parsed.attachments,
      });
    }
  }
  return syncedEmails;
}

// Helper to create and configure a Gmail API client
async function createGmailClient(userId: string) {
  // Get Google account from db
  const userAccount = await db.query.account.findFirst({
    where: and(eq(account.userId, userId), eq(account.providerId, "google")),
  });

  if (!userAccount?.accessToken) {
    throw new Error("No Google account found for user");
  }

  if (!userAccount.refreshToken) {
    throw new Error("No refresh token found for user");
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
        if (tokens.refresh_token) {
          await db
            .update(account)
            .set({
              refreshToken: tokens.refresh_token,
              updatedAt: new Date(),
            })
            .where(eq(account.userId, userId));

          console.log("Refresh tokens updated in db:", tokens);
        }
        if (tokens.access_token) {
          await db
            .update(account)
            .set({
              accessToken: tokens.access_token,
              updatedAt: new Date(),
            })
            .where(eq(account.userId, userId));

          console.log("Access tokens updated in db:", tokens);
        }
      } catch (error) {
        console.error("Failed to update tokens:", error);
      }
    })();
  });

  const gmail = google.gmail({ version: "v1", auth });
  return { gmail, auth };
}

// Helper to format email addresses
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

// Fetch a list of message IDs and their raw content
export async function fetchMessages(
  userId: string,
  options: {
    maxResults?: number;
    since?: Date;
    pageToken?: string;
    allPages?: boolean;
  } = {},
) {
  const { gmail, auth } = await createGmailClient(userId);
  await auth.getAccessToken();

  const { maxResults = 100, since, allPages = false } = options;
  let { pageToken } = options;
  let query = "in:inbox";
  if (since) {
    const sinceTimestamp = Math.floor(since.getTime() / 1000);
    query += ` after:${sinceTimestamp}`;
  }

  const allMessageIds: { id: string; threadId: string }[] = [];

  do {
    const response = await gmail.users.messages.list({
      userId: "me",
      maxResults,
      q: query,
      pageToken,
    });

    const messageIds = response.data.messages ?? [];
    for (const msg of messageIds) {
      if (msg.id && msg.threadId) {
        allMessageIds.push({ id: msg.id, threadId: msg.threadId });
      }
    }

    pageToken = response.data.nextPageToken ?? undefined;
  } while (allPages && pageToken);

  const messagePromises = allMessageIds.map(({ id }) =>
    gmail.users.messages.get({ userId: "me", id, format: "raw" }),
  );

  const messageResults = await Promise.allSettled(messagePromises);
  const messages: GmailMessage[] = [];
  for (const result of messageResults) {
    if (result.status === "fulfilled" && result.value.data) {
      messages.push(result.value.data as GmailMessage);
    }
  }

  return messages;
}

// Fetch a single message by its Gmail ID
export async function getMessage(userId: string, gmailId: string) {
  const { gmail, auth } = await createGmailClient(userId);
  await auth.getAccessToken();

  const messageDetail = await gmail.users.messages.get({
    userId: "me",
    id: gmailId,
    format: "raw",
  });

  if (!messageDetail.data) throw new Error("Message not found");
  return messageDetail.data as GmailMessage;
}

// Parse a raw email message
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

// Get full, parsed email content by Gmail ID
export async function getParsedEmailContent(
  userId: string,
  gmailId: string,
): Promise<FinalEmail> {
  const message = await getMessage(userId, gmailId);
  return parseRawMessage(message);
}
