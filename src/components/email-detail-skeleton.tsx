import { Button } from "./ui/button";

export function EmailDetailSkeleton({ onBack }: { onBack: () => void }) {
  return (
    <div className="space-y-4">
      <Button onClick={onBack} variant="outline">
        ← Back to Inbox
      </Button>
      <div className="animate-pulse">
        <div className="mb-4 h-8 w-3/4 rounded bg-gray-300"></div>
        <div className="mb-2 h-4 w-1/2 rounded bg-gray-300"></div>
        <div className="h-96 w-full rounded bg-gray-300"></div>
      </div>
    </div>
  );
}
