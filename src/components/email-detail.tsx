import { useState, useEffect } from "react";
import { Button } from "./ui/button";
import { api } from "~/trpc/react";
import { EmailDetailSkeleton } from "./email-detail-skeleton";
import { EmailDetailError } from "./email-detail-error";
import {
  ChevronDown,
  ChevronUp,
  Reply,
  ReplyAll,
  Forward,
} from "lucide-react";
import { AttachmentButton } from "./attachment-button";
import { EmailComposer } from "./email-composer";
import { SafeHtmlRenderer } from "./safe-html-renderer";
import {
  extractEmailAddress,
  extractAllEmailAddresses,
  formatSubject,
  formatForwardBody,
} from "~/lib/email-utils";

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

  const [expandedEmails, setExpandedEmails] = useState<Set<string>>(new Set());
  const [activeComposer, setActiveComposer] = useState<string | null>(null);

  useEffect(() => {
    if (emailsInThread && emailsInThread.length > 0) {
      setExpandedEmails((prev) => {
        const newExpanded = new Set(prev);
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
          const isReplying = activeComposer === `reply-${emailContent.id}`;
          const isReplyingAll =
            activeComposer === `reply-all-${emailContent.id}`;
          const isForwarding = activeComposer === `forward-${emailContent.id}`;
          const isComposing = isReplying || isReplyingAll || isForwarding;

          return (
            <div
              key={emailContent.id}
              className={`mb-4 overflow-hidden rounded-md border border-gray-200 last:mb-0 ${
                isExpanded ? "bg-white" : "bg-gray-50"
              }`}
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
                      <div className="mt-2 space-y-2">
                        {emailContent.attachments.map((att) => (
                          <AttachmentButton key={att.id} attachment={att} />
                        ))}
                      </div>
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
                    <Button
                      variant="outline"
                      onClick={() =>
                        setActiveComposer(`reply-${emailContent.id}`)
                      }
                    >
                      <Reply className="mr-2 h-4 w-4" />
                      Reply
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() =>
                        setActiveComposer(`reply-all-${emailContent.id}`)
                      }
                    >
                      <ReplyAll className="mr-2 h-4 w-4" />
                      Reply All
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() =>
                        setActiveComposer(`forward-${emailContent.id}`)
                      }
                    >
                      <Forward className="mr-2 h-4 w-4" />
                      Forward
                    </Button>
                  </div>

                  {isComposing && (
                    <div className="mt-4">
                      <EmailComposer
                        key={activeComposer}
                        to={
                          isReplying
                            ? [extractEmailAddress(emailContent.from ?? "")]
                            : isReplyingAll
                            ? extractAllEmailAddresses(emailContent)
                            : []
                        }
                        subject={formatSubject(
                          emailContent.subject ?? "",
                          isForwarding ? "Fwd:" : "Re:",
                        )}
                        body={
                          isForwarding
                            ? formatForwardBody(emailContent)
                            : undefined
                        }
                        threadId={
                          isForwarding ? undefined : emailContent.threadId
                        }
                        onClose={() => setActiveComposer(null)}
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
