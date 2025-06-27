import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "~/lib/auth";
import { HydrateClient } from "~/trpc/server";
import { EmailList } from "~/components/email-list";
import { DashboardLayout } from "~/components/dashboard-layout";
import { ErrorBoundary } from "react-error-boundary";

export default async function Home() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });
  if (!session) {
    redirect("/login");
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
