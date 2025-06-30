import { createTRPCRouter, protectedProcedure } from "../trpc";
import { desc, eq, and, asc, or, ilike } from "drizzle-orm";
import { email } from "~/server/db/schema";
import { z } from "zod";
import { s3 } from "~/lib/s3-client";
import { GetObjectCommand } from "@aws-sdk/client-s3";

const EMAILS_PER_PAGE = 25;

export const threadRouter = createTRPCRouter({
  getThreadList: protectedProcedure
    .input(
      z.object({
        cursor: z.number().min(0).nullish(),
        search: z.string().nullish(),
      }),
    )
    .query(async ({ ctx, input }) => {
      try {
        const currentPage = input.cursor ?? 0;
        const offset = currentPage * EMAILS_PER_PAGE;

        // Get distinct thread IDs for the user, ordered by the latest email in each thread
        const latestEmailsSubquery = ctx.db
          .selectDistinctOn([email.threadId], {
            id: email.id,
            gmailId: email.gmailId,
            threadId: email.threadId,
            userId: email.userId,
            subject: email.subject,
            from: email.from,
            to: email.to,
            cc: email.cc,
            bcc: email.bcc,
            snippet: email.snippet,
            bodyS3Url: email.bodyS3Url,
            isRead: email.isRead,
            isSent: email.isSent,
            receivedAt: email.receivedAt,
            createdAt: email.createdAt,
          })
          .from(email)
          .where(
            and(
              eq(email.userId, ctx.session.user.id),
              input.search
                ? or(
                    ilike(email.subject, `%${input.search}%`),
                    ilike(email.from, `%${input.search}%`),
                    ilike(email.to, `%${input.search}%`),
                    ilike(email.cc, `%${input.search}%`),
                    ilike(email.bcc, `%${input.search}%`),
                    ilike(email.snippet, `%${input.search}%`),
                  )
                : undefined,
            ),
          )
          .orderBy(email.threadId, desc(email.receivedAt))
          .as("latest_emails_in_thread");

        const latestEmailsInThreads = await ctx.db
          .select()
          .from(latestEmailsSubquery)
          .orderBy(desc(latestEmailsSubquery.receivedAt))
          .limit(EMAILS_PER_PAGE + 1) // Fetch one more to check for next page
          .offset(offset);

        let hasNextPage = false;
        if (latestEmailsInThreads.length > EMAILS_PER_PAGE) {
          hasNextPage = true;
          latestEmailsInThreads.pop(); // Remove the extra item
        }

        return {
          threads: latestEmailsInThreads,
          nextCursor: hasNextPage ? currentPage + 1 : null,
        };
      } catch (error) {
        console.error("Failed to get thread list:", error);
        throw new Error("Failed to get thread list.");
      }
    }),

  // Get full parsed email content by Thread ID
  getThreadById: protectedProcedure
    .input(z.object({ threadId: z.string() }))
    .query(async ({ ctx, input }) => {
      try {
        const emailsInThread = await ctx.db.query.email.findMany({
          where: and(
            eq(email.threadId, input.threadId),
            eq(email.userId, ctx.session.user.id),
          ),
          orderBy: [asc(email.receivedAt)],
          with: {
            attachments: true,
          },
        });

        if (emailsInThread.length === 0) {
          throw new Error("Thread not found in database.");
        }

        return Promise.all(
          emailsInThread.map(async (emailRecord) => {
            let bodyContent = "";
            if (emailRecord.bodyS3Url) {
              try {
                bodyContent = await downloadEmailBodyFromS3(
                  emailRecord.bodyS3Url,
                );
              } catch (s3Error) {
                console.error(
                  `Failed to download S3 content for email ${emailRecord.id}:`,
                  s3Error,
                );
                bodyContent = "<p>Error loading email content from S3.</p>";
              }
            }

            return {
              ...emailRecord,
              attachments: emailRecord.attachments.map((att) => ({
                ...att,
                size: parseInt(att.size, 10),
              })),
              htmlBody: bodyContent,
            };
          }),
        );
      } catch (error) {
        console.error("Failed to get thread content from DB:", error);
        if (error instanceof Error) {
          throw new Error(
            `Failed to retrieve thread content from the database: ${error.message}`,
          );
        }
        throw new Error(
          "An unknown error occurred while fetching thread content.",
        );
      }
    }),
});

// Helper to download email body from S3
async function downloadEmailBodyFromS3(s3Url: string): Promise<string> {
  const url = new URL(s3Url);
  const bucketName = url.hostname.split(".")[0]; // Assumes bucket name is first part of hostname
  const key = url.pathname.substring(1); // Remove leading slash

  const command = new GetObjectCommand({
    Bucket: bucketName,
    Key: key,
  });

  const response = await s3.send(command);

  if (!response.Body) {
    throw new Error("S3 object body is empty");
  }

  return response.Body.transformToString();
}
