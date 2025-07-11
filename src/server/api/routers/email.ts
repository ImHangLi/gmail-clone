import { createTRPCRouter, protectedProcedure } from "../trpc";
import { eq, and } from "drizzle-orm";
import { email, user } from "~/server/db/schema";
import { z } from "zod";
import { syncMessagesForUser, replyMessage, forwardMessage } from "~/lib/gmail";

const messageSchema = z.object({
  to: z.array(z.string().email()),
  subject: z.string(),
  body: z.string(),
});

const replyMessageSchema = messageSchema.extend({
  threadId: z.string(),
});

export const emailRouter = createTRPCRouter({
  // Sync latest emails from Gmail
  syncGmail: protectedProcedure.mutation(async ({ ctx }) => {
    try {
      const { added, removed } = await syncMessagesForUser(ctx.session.user.id);
      return {
        success: true,
        added: added.length,
        removed: removed.length,
      };
    } catch (error) {
      if (error instanceof Error && error.message.includes("re-authenticate")) {
        throw new Error("REAUTH_REQUIRED");
      }
      console.error("Gmail sync error:", error);
      throw new Error("Failed to sync Gmail messages");
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

  replyMessage: protectedProcedure
    .input(replyMessageSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        const fromUser = await ctx.db.query.user.findFirst({
          where: eq(user.id, ctx.session.user.id),
        });

        if (!fromUser?.email) {
          throw new Error("Could not find user email to send from.");
        }

        const result = await replyMessage(ctx.session.user.id, {
          ...input,
          to: input.to.join(", "),
          from: fromUser.email,
        });
        return { success: true, messageId: result.id };
      } catch (error) {
        console.error("Failed to send email:", error);
        throw new Error("Failed to send email.");
      }
    }),

  forwardMessage: protectedProcedure
    .input(messageSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        const fromUser = await ctx.db.query.user.findFirst({
          where: eq(user.id, ctx.session.user.id),
        });

        if (!fromUser?.email) {
          throw new Error("Could not find user email to send from.");
        }

        const result = await forwardMessage(ctx.session.user.id, {
          ...input,
          to: input.to.join(", "),
          from: fromUser.email,
        });
        return { success: true, messageId: result.id };
      } catch (error) {
        console.error("Failed to send email:", error);
        throw new Error("Failed to send email.");
      }
    }),
});
