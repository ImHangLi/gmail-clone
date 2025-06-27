import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "~/lib/auth";
import { api, HydrateClient } from "~/trpc/server";
import { EmailList } from "~/components/email-list";
import { DashboardLayout } from "~/components/dashboard-layout";
import { Suspense } from "react";
import { ErrorBoundary } from "react-error-boundary";

export default async function Home() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });
  if (!session) {
    redirect("/login");
  }

  void api.email.getThreadList.prefetchInfinite({
    cursor: 0,
  });

  return (
    <HydrateClient>
      <DashboardLayout>
        <div className="flex h-full flex-col">
          <div className="min-h-0 flex-1">
            <ErrorBoundary fallback={<div>Error loading emails</div>}>
              <Suspense fallback={<div>Loading...</div>}>
                <EmailList />
              </Suspense>
            </ErrorBoundary>
          </div>
        </div>
      </DashboardLayout>
    </HydrateClient>
  );
}
