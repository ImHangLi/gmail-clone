import { createTRPCRouter, protectedProcedure } from "../trpc";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { attachment } from "~/server/db/schema";
import { s3 } from "~/lib/s3-client";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export const attachmentRouter = createTRPCRouter({
  getAttachmentDownloadUrl: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const attachmentRecord = await ctx.db.query.attachment.findFirst({
        where: eq(attachment.id, input.id),
        // Add a security check to ensure the user owns the email this attachment belongs to
        with: {
          email: {
            columns: {
              userId: true,
            },
          },
        },
      });

      if (!attachmentRecord || attachmentRecord.email.userId !== ctx.session.user.id) {
        throw new Error("Attachment not found or you do not have access.");
      }

      if (!attachmentRecord.s3Url) {
        throw new Error("Attachment has no file associated with it.");
      }

      const url = new URL(attachmentRecord.s3Url);
      const bucketName = url.hostname.split('.')[0];
      const key = url.pathname.substring(1);

      const command = new GetObjectCommand({
        Bucket: bucketName,
        Key: key,
      });

      // Generate a presigned URL that expires in 1 minute
      const signedUrl = await getSignedUrl(s3, command, { expiresIn: 60 });

      return signedUrl;
    }),
});
