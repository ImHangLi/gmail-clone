import { type NextRequest, NextResponse } from "next/server";
import { db } from "~/server/db";
import { account } from "~/server/db/schema";
import { eq } from "drizzle-orm";
import { syncMessagesForUser } from "~/lib/gmail";

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  try {
    const googleAccounts = await db.query.account.findMany({
      where: eq(account.providerId, "google"),
    });

    if (googleAccounts.length === 0) {
      console.log("No Google accounts found to sync.");
      return NextResponse.json({
        success: true,
        message: "No Google accounts found to sync.",
      });
    }

    let syncedCount = 0;
    for (const acc of googleAccounts) {
      try {
        if (acc.userId) {
          const syncedEmails = await syncMessagesForUser(acc.userId);
          syncedCount += syncedEmails.length;
        } else {
          console.warn(`Account found without a userId: ${acc.id}`);
        }
      } catch (userSyncError) {
        console.error(
          `Failed to sync Gmail for user ${acc.userId}:`,
          userSyncError,
        );
        // Continue to next user even if one fails
      }
    }

    console.log(`Cron job finished. Total emails synced: ${syncedCount}`);
    return NextResponse.json({ success: true, totalSyncedEmails: syncedCount });
  } catch (error) {
    console.error("Error during cron job execution:", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
