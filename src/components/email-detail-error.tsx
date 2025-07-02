import { Button } from "./ui/button";
import { AlertCircle, RefreshCw } from "lucide-react";

export function EmailDetailError({
  onBack,
  onRetry,
  error,
}: {
  onBack: () => void;
  onRetry: () => void;
  error?: string;
}) {
  return (
    <div className="space-y-6">
      <Button onClick={onBack} variant="outline">
        ← Back to Inbox
      </Button>

      <div className="flex flex-col items-center justify-center rounded-lg border border-red-200 bg-red-50 p-12 text-center">
        <AlertCircle className="mb-4 h-12 w-12 text-red-500" />
        <h2 className="mb-2 text-lg font-semibold text-gray-900">
          Failed to load email
        </h2>
        <p className="mb-4 max-w-md text-gray-600">
          {error ??
            "Unable to load email content. This may be due to a network issue."}
        </p>
        <div className="flex gap-2">
          <Button onClick={onRetry} variant="outline">
            <RefreshCw className="mr-2 h-4 w-4" />
            Try Again
          </Button>
        </div>
      </div>
    </div>
  );
}