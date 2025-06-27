import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "~/lib/auth";
import { HydrateClient } from "~/trpc/server";
import { EmailList } from "~/components/email-list";
import { DashboardLayout } from "~/components/dashboard-layout";
import { ErrorBoundary } from "react-error-boundary";
import { db } from "~/server/db";
import { email } from "~/server/db/schema";
import { eq } from "drizzle-orm";
import { syncMessagesForUser } from "~/lib/gmail";

export default async function Home() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });
  if (!session) {
    redirect("/login");
  }

  // Check if the user has any emails synced
  const userHasEmails = await db.query.email.findFirst({
    where: eq(email.userId, session.user.id),
  });

  // If no emails are found, trigger an initial sync
  if (!userHasEmails) {
    console.log(`No emails found for user ${session.user.id}. Initiating sync...`);
    try {
      await syncMessagesForUser(session.user.id);
      console.log(`Initial sync completed for user ${session.user.id}.`);
    } catch (syncError) {
      console.error(`Initial sync failed for user ${session.user.id}:`, syncError);
      // Optionally, handle this error more gracefully in the UI
    }
  }

  return (
    <HydrateClient>
      <DashboardLayout>
        <div className="flex h-full flex-col">
          <div className="min-h-0 flex-1">
            <ErrorBoundary fallback={<div>Error loading emails</div>}>
              <EmailList />
            </ErrorBoundary>
          </div>
        </div>
      </DashboardLayout>
    </HydrateClient>
  );
}
