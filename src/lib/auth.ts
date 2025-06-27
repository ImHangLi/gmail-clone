import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { eq } from "drizzle-orm";
import { db } from "~/server/db";
import { account } from "~/server/db/schema";
import type { Session, User } from "better-auth/types";

export const auth = betterAuth({
  appName: "Gmail Clone",
  database: drizzleAdapter(db, {
    provider: "pg",
  }),
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      scope: [
        "openid",
        "email",
        "profile",
        "https://www.googleapis.com/auth/gmail.readonly",
        "https://www.googleapis.com/auth/gmail.modify",
      ],
      accessType: "offline",
      prompt: "consent",
    },
  },
  account: {
    updateAccountOnSignIn: true,
  },
  session: {
    storeSessionInDatabase: true,
  },
  callbacks: {
    async session({
      session,
      user,
    }: {
      session: Session & { error?: string };
      user: User;
    }): Promise<Session & { error?: string }> {
      const [googleAccount] = await db.query.account.findMany({
        where: eq(account.userId, user.id),
      });

      if (
        googleAccount?.accessTokenExpiresAt &&
        googleAccount.accessTokenExpiresAt < new Date()
      ) {
        // If the access token has expired, try to refresh it
        try {
          // https://accounts.google.com/.well-known/openid-configuration
          // We need the `token_endpoint`.
          const response = await fetch("https://oauth2.googleapis.com/token", {
            method: "POST",
            body: new URLSearchParams({
              client_id: process.env.GOOGLE_CLIENT_ID!,
              client_secret: process.env.GOOGLE_CLIENT_SECRET!,
              grant_type: "refresh_token",
              refresh_token: googleAccount.refreshToken!,
            }),
          });

          const tokensOrError = (await response.json()) as {
            access_token: string;
            expires_in: number;
            refresh_token?: string;
          };

          if (!response.ok) {
            throw new Error("Failed to refresh access token");
          }

          const newTokens = tokensOrError as {
            access_token: string;
            expires_in: number;
            refresh_token?: string;
          };

          await db
            .update(account)
            .set({
              accessToken: newTokens.access_token,
              accessTokenExpiresAt: new Date(
                Date.now() + newTokens.expires_in * 1000,
              ),
              refreshToken:
                newTokens.refresh_token ?? googleAccount.refreshToken,
              updatedAt: new Date(),
            })
            .where(eq(account.userId, user.id));
        } catch (error) {
          console.error("Error refreshing access_token", error);
          // If we fail to refresh the token, return an error so we can handle it on the page
          session.error = "RefreshTokenError";
        }
      }
      return session;
    },
  },
});
