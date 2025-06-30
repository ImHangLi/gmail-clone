import {
  DeleteObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import type { FinalEmail } from "./gmail";

export const s3 = new S3Client({
  region: process.env.AWS_REGION,
});

export async function uploadEmailBodyToS3(
  userId: string,
  gmailId: string,
  htmlBody: string,
): Promise<string> {
  const bucketName = process.env.S3_BUCKET_NAME;
  if (!bucketName) throw new Error("S3_BUCKET_NAME is not defined");

  const key = `emails/${userId}/${gmailId}.html`;
  await uploadToS3(bucketName, key, htmlBody, "text/html");
  return `https://${bucketName}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;
}

export async function uploadAttachmentToS3(
  userId: string,
  emailId: string,
  attachment: FinalEmail["attachments"][0],
): Promise<string> {
  const bucketName = process.env.S3_BUCKET_NAME;
  if (!bucketName) throw new Error("S3_BUCKET_NAME is not defined");

  const key = `attachments/${userId}/${emailId}/${attachment.filename}`;
  await uploadToS3(bucketName, key, attachment.content, attachment.contentType);
  return `https://${bucketName}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;
}

async function uploadToS3(
  bucket: string,
  key: string,
  body: Buffer | string,
  contentType: string,
) {
  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: body,
    ContentType: contentType,
  });
  await s3.send(command);
}

export async function deleteS3Object(s3Url: string) {
  const bucketName = process.env.S3_BUCKET_NAME;
  if (!bucketName) {
    console.error("S3_BUCKET_NAME not configured, cannot delete object.");
    return;
  }
  try {
    const url = new URL(s3Url);
    const key = url.pathname.substring(1);
    const command = new DeleteObjectCommand({ Bucket: bucketName, Key: key });
    await s3.send(command);
  } catch (error) {
    console.error(`Failed to delete S3 object at ${s3Url}:`, error);
  }
}
