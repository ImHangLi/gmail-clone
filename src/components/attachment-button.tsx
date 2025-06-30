"use client";

import { useState } from "react";
import { Button } from "./ui/button";
import { api } from "~/trpc/react";
import { HardDriveDownload, Loader2, AlertCircle } from "lucide-react";

export function AttachmentButton({
  attachment,
}: {
  attachment: {
    id: string;
    filename: string | null;
    contentType: string | null;
    size: number;
  };
}) {
  const [isDownloading, setIsDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getDownloadUrl = api.attachment.getAttachmentDownloadUrl.useMutation();

  const handleDownload = async () => {
    setIsDownloading(true);
    setError(null);
    try {
      const signedUrl = await getDownloadUrl.mutateAsync({ id: attachment.id });
      // Create a temporary link to trigger the download
      const link = document.createElement("a");
      link.href = signedUrl;
      link.setAttribute("download", attachment.filename ?? "download");
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      setError("Failed to get download link. Please try again.");
      console.error("Download error:", err);
    } finally {
      setIsDownloading(false);
    }
  };

  const formatSize = (num: number) => {
    if (isNaN(num)) return "0 KB";
    if (num < 1024) return `${num} B`;
    if (num < 1024 * 1024) return `${Math.round(num / 1024)} KB`;
    return `${Math.round(num / (1024 * 1024))} MB`;
  };

  return (
    <div className="flex items-center space-x-2">
      <Button
        variant="outline"
        size="sm"
        onClick={handleDownload}
        disabled={isDownloading}
        className="flex items-center justify-start"
      >
        {isDownloading ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <HardDriveDownload className="mr-2 h-4 w-4" />
        )}
        <span>
          {attachment.filename} ({formatSize(attachment.size)})
        </span>
      </Button>
      {error && (
        <div className="flex items-center text-red-500">
          <AlertCircle className="h-4 w-4" />
          <span className="ml-1 text-xs">{error}</span>
        </div>
      )}
    </div>
  );
}
