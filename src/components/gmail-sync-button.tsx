"use client";

import { useState } from "react";
import { Button } from "./ui/button";
import { api } from "~/trpc/react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

export function GmailSyncButton() {
  const [needsReauthentication, setNeedsReauthentication] = useState(false);
  const utils = api.useUtils();

  const syncGmail = api.email.syncGmail.useMutation({
    onSuccess: (data) => {
      toast.success("Sync Complete", {
        description: `Successfully synced ${data.added} new emails`,
      });
      void utils.thread.getThreadList.invalidate();
      void utils.thread.getThreadById.invalidate();
    },
    onError: (error) => {
      if (error.data?.code === "UNAUTHORIZED") {
        setNeedsReauthentication(true);
        toast.error("Re-authentication needed", {
          description:
            "Your session with Google has expired. Please sign in again.",
          action: {
            label: "Sign In",
            onClick: () => (window.location.href = "/login"),
          },
        });
      } else {
        toast.error("Sync Failed", {
          description: "Failed to sync emails. Please try again.",
        });
      }
    },
  });

  const handleSync = () => {
    setNeedsReauthentication(false);
    syncGmail.mutate();
  };

  if (needsReauthentication) {
    return (
      <Button
        onClick={() => (window.location.href = "/login")}
        variant="destructive"
      >
        Reconnect to Google
      </Button>
    );
  }

  return (
    <Button
      onClick={handleSync}
      disabled={syncGmail.isPending}
      variant="default"
    >
      {syncGmail.isPending ? (
        <>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Syncing...
        </>
      ) : (
        "Sync Mails"
      )}
    </Button>
  );
}
