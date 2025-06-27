import { createTRPCRouter, protectedProcedure } from "../trpc";
import { desc, eq, and, asc, or, ilike } from "drizzle-orm";
import { attachment, email } from "~/server/db/schema";
import { z } from "zod";
import { syncMessagesForUser } from "~/lib/gmail";

const EMAILS_PER_PAGE = 25;

export const emailRouter = createTRPCRouter({
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

  // Sync latest emails from Gmail
  syncGmail: protectedProcedure.mutation(async ({ ctx }) => {
    try {
      const syncedEmails = await syncMessagesForUser(ctx.session.user.id);
      return {
        success: true,
        count: syncedEmails.length,
        emails: syncedEmails,
      };
    } catch (error) {
      if (error instanceof Error && error.message.includes("re-authenticate")) {
        throw new Error("REAUTH_REQUIRED");
      }
      console.error("Gmail sync error:", error);
      throw new Error("Failed to sync Gmail messages");
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
        });

        if (emailsInThread.length === 0) {
          throw new Error("Thread not found in database.");
        }

        const emailsWithAttachments = await Promise.all(
          emailsInThread.map(async (emailRecord) => {
            const attachments = await ctx.db.query.attachment.findMany({
              where: eq(attachment.emailId, emailRecord.id),
            });
            return {
              ...emailRecord,
              attachments: attachments.map((att) => ({
                ...att,
                size: parseInt(att.size, 10),
              })),
            };
          }),
        );

        return emailsWithAttachments;
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

  // Mark email as read
  markAsRead: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const [updatedEmail] = await ctx.db
          .update(email)
          .set({ isRead: true })
          .where(
            and(eq(email.id, input.id), eq(email.userId, ctx.session.user.id)),
          )
          .returning();

        return updatedEmail;
      } catch (error) {
        console.error("Failed to mark email as read:", error);
        throw new Error("Failed to mark email as read.");
      }
    }),
});
