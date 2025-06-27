import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "~/lib/auth";
import { HydrateClient } from "~/trpc/server";
import { DashboardLayout } from "~/components/dashboard-layout";

export default async function TrashPage() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });
  if (!session) {
    redirect("/login");
  }

  return (
    <HydrateClient>
      <DashboardLayout title="Trash">
        <div className="space-y-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Trash</h1>
            <p className="text-sm text-gray-600">
              Your deleted emails will appear here
            </p>
          </div>

          <div className="rounded-lg border border-gray-200 bg-gray-50 p-8 text-center">
            <p className="text-gray-500">No deleted emails to display yet.</p>
            <p className="mt-2 text-sm text-gray-400">
              This feature will be implemented to show your deleted messages.
            </p>
          </div>
        </div>
      </DashboardLayout>
    </HydrateClient>
  );
}
