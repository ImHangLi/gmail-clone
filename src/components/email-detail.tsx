import { useState, useEffect } from "react";
import { Button } from "./ui/button";
import { api } from "~/trpc/react";
import { AlertCircle, RefreshCw, ChevronDown, ChevronUp } from "lucide-react";
import { EmailDetailSkeleton } from "./email-detail-skeleton";



function EmailDetailError({
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

export function EmailDetailView({
  threadId,
  onBack,
}: {
  threadId: string;
  onBack: () => void;
}) {
  const {
    data: emailsInThread,
    isLoading,
    isError,
    error,
    refetch,
  } = api.thread.getThreadById.useQuery(
    { threadId },
    {
      retry: 1,
    },
  );

  // State to manage which emails are expanded.
  const [expandedEmails, setExpandedEmails] = useState<Set<string>>(new Set());

  // Update expandedEmails when emailsInThread changes (e.g., after refetch)
  // This ensures the newest email is always expanded.
  useEffect(() => {
    if (emailsInThread && emailsInThread.length > 0) {
      setExpandedEmails((prev) => {
        const newExpanded = new Set(prev);
        // Ensure the last email is expanded when data loads or changes
        const lastEmail = emailsInThread[emailsInThread.length - 1];
        if (lastEmail) {
          newExpanded.add(lastEmail.id);
        }
        return newExpanded;
      });
    }
  }, [emailsInThread]);

  const toggleExpand = (emailId: string) => {
    setExpandedEmails((prev) => {
      const newExpanded = new Set(prev);
      if (newExpanded.has(emailId)) {
        newExpanded.delete(emailId);
      } else {
        newExpanded.add(emailId);
      }
      return newExpanded;
    });
  };

  if (isLoading) {
    return <EmailDetailSkeleton onBack={onBack} />;
  }

  if (isError) {
    return (
      <EmailDetailError
        onBack={onBack}
        onRetry={() => void refetch()}
        error={error.message}
      />
    );
  }

  if (!emailsInThread || emailsInThread.length === 0) {
    return (
      <EmailDetailError
        onBack={onBack}
        onRetry={() => void refetch()}
        error="Thread content not found."
      />
    );
  }

  return (
    <div className="space-y-6">
      <Button onClick={onBack} variant="outline">
        ← Back to Inbox
      </Button>

      <div className="rounded-lg border border-gray-200 bg-white p-8 shadow-sm">
        {emailsInThread.map((emailContent) => {
          const isExpanded = expandedEmails.has(emailContent.id);
          return (
            <div
              key={emailContent.id}
              className={`mb-4 overflow-hidden rounded-md border border-gray-200 last:mb-0 ${isExpanded ? 'bg-white' : 'bg-gray-50'}`}
            >
              <div
                className="flex cursor-pointer items-center justify-between bg-white p-4 hover:bg-gray-100"
                onClick={() => toggleExpand(emailContent.id)}
              >
                <div className="flex-grow">
                  <h2 className="text-lg font-semibold text-gray-900">
                    {emailContent.subject ?? "(No Subject)"}
                  </h2>
                  <p className="text-sm text-gray-600">
                    From: {emailContent.from} | Date:{" "}
                    {emailContent.receivedAt.toLocaleString()}
                  </p>
                  {!isExpanded && (
                    <p className="mt-1 truncate text-xs text-gray-500">
                      {emailContent.snippet}
                    </p>
                  )}
                </div>
                <Button variant="ghost" size="icon">
                  {isExpanded ? (
                    <ChevronUp className="h-4 w-4" />
                  ) : (
                    <ChevronDown className="h-4 w-4" />
                  )}
                </Button>
              </div>

              {isExpanded && (
                <div className="border-t border-gray-200 bg-gray-50 p-4">
                  <div className="mb-4 space-y-2 text-sm text-gray-600">
                    <p>
                      <strong>To:</strong> {emailContent.to}
                    </p>
                    {emailContent.cc && (
                      <p>
                        <strong>CC:</strong> {emailContent.cc}
                      </p>
                    )}
                  </div>

                  {emailContent.attachments.length > 0 && (
                    <div className="mt-4 mb-4">
                      <strong className="text-sm text-gray-600">
                        Attachments:
                      </strong>
                      <ul className="mt-2 space-y-1">
                        {emailContent.attachments.map((att, attIndex) => (
                          <li key={attIndex} className="text-sm text-gray-500">
                            📎 {att.filename} ({att.contentType},{" "}
                            {Math.round(att.size / 1024)}KB)
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <div className="email-content h-auto border-t border-gray-100 pt-4">
                    {emailContent.htmlBody ? (
                      <SafeHtmlRenderer html={emailContent.htmlBody} />
                    ) : (
                      <div className="rounded bg-gray-50 p-4 font-mono text-sm whitespace-pre-wrap">
                        {emailContent.snippet ?? "No content available"}
                      </div>
                    )}
                  </div>

                  <div className="mt-6 flex space-x-2">
                    <Button variant="outline">Reply</Button>
                    <Button variant="outline">Forward</Button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SafeHtmlRenderer({ html }: { html: string }) {
  return (
    <div className="h-full w-full">
      <iframe
        srcDoc={html}
        sandbox="allow-same-origin"
        className="h-full w-full border-none"
        style={{ minHeight: "480px" }}
      />
    </div>
  );
}
