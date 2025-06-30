// Example model schema from the Drizzle docs
// https://orm.drizzle.team/docs/sql-schema-declaration

import {
  text,
  timestamp,
  boolean,
  pgTableCreator,
  varchar,
  uuid,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

/**
 * This is an example of how to use the multi-project schema feature of Drizzle ORM. Use the same
 * database instance for multiple projects.
 *
 * @see https://orm.drizzle.team/docs/goodies#multi-project-schema
 */
export const createTable = pgTableCreator((name) => `gmail-clone_${name}`);

export const user = createTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified")
    .$defaultFn(() => false)
    .notNull(),
  image: text("image"),
  createdAt: timestamp("created_at")
    .$defaultFn(() => /* @__PURE__ */ new Date())
    .notNull(),
  updatedAt: timestamp("updated_at")
    .$defaultFn(() => /* @__PURE__ */ new Date())
    .notNull(),
});

export const session = createTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at").notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("created_at").notNull(),
  updatedAt: timestamp("updated_at").notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
});

export const account = createTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at"),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
  scope: text("scope"),
  password: text("password"),
  historyId: text("history_id"),
  createdAt: timestamp("created_at").notNull(),
  updatedAt: timestamp("updated_at").notNull(),
});

export const verification = createTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").$defaultFn(
    () => /* @__PURE__ */ new Date(),
  ),
  updatedAt: timestamp("updated_at").$defaultFn(
    () => /* @__PURE__ */ new Date(),
  ),
});

export const email = createTable("email", {
  id: uuid("id").primaryKey().defaultRandom(), // local UUID
  gmailId: varchar("gmail_id", { length: 256 }).notNull().unique(), // Gmail message ID

  threadId: varchar("thread_id", { length: 256 }).notNull(), // Gmail thread ID
  userId: text("user_id")
    .notNull()
    .references(() => user.id), // your app's user

  subject: text("subject"),
  from: text("from_"),
  to: text("to_"),
  cc: text("cc"),
  bcc: text("bcc"),

  snippet: text("snippet"), // Gmail's snippet
  bodyS3Url: text("body_s3_url"), // parsed HTML stored in S3

  isRead: boolean("is_read").default(false),
  isSent: boolean("is_sent").default(false), // if the email was sent from this app

  receivedAt: timestamp("received_at", { mode: "date" }).notNull(),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow(),
});



export const attachment = createTable("attachment", {
  id: uuid("id").primaryKey().defaultRandom(),
  emailId: uuid("email_id")
    .notNull()
    .references(() => email.id, { onDelete: "cascade" }),

  filename: text("filename").notNull(),
  contentType: text("content_type").notNull(),
  size: text("size").notNull(), // size in bytes

  createdAt: timestamp("created_at", { mode: "date" }).defaultNow(),
});

// Relations
export const emailsRelations = relations(email, ({ many }) => ({
  attachments: many(attachment),
}));

export const attachmentsRelations = relations(attachment, ({ one }) => ({
  email: one(email, {
    fields: [attachment.emailId],
    references: [email.id],
  }),
}));
