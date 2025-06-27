CREATE TABLE "gmail-clone_account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gmail-clone_attachment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email_id" varchar(256) NOT NULL,
	"filename" text NOT NULL,
	"content_type" text NOT NULL,
	"size" text NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "gmail-clone_email" (
	"gmail_id" varchar(256) PRIMARY KEY NOT NULL,
	"thread_id" varchar(256) NOT NULL,
	"user_id" text NOT NULL,
	"subject" text,
	"from_" text,
	"to_" text,
	"cc" text,
	"bcc" text,
	"snippet" text,
	"body_s3_url" text,
	"is_read" boolean DEFAULT false,
	"is_sent" boolean DEFAULT false,
	"received_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "gmail-clone_session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "gmail-clone_session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "gmail-clone_user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean NOT NULL,
	"image" text,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	CONSTRAINT "gmail-clone_user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "gmail-clone_verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp,
	"updated_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "gmail-clone_account" ADD CONSTRAINT "gmail-clone_account_user_id_gmail-clone_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."gmail-clone_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gmail-clone_attachment" ADD CONSTRAINT "gmail-clone_attachment_email_id_gmail-clone_email_gmail_id_fk" FOREIGN KEY ("email_id") REFERENCES "public"."gmail-clone_email"("gmail_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gmail-clone_email" ADD CONSTRAINT "gmail-clone_email_user_id_gmail-clone_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."gmail-clone_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gmail-clone_session" ADD CONSTRAINT "gmail-clone_session_user_id_gmail-clone_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."gmail-clone_user"("id") ON DELETE cascade ON UPDATE no action;