"use client";

import { useState, useEffect, Fragment } from "react";
import { useDebounce } from "~/hooks/use-debounce";
import { api } from "~/trpc/react";
import { EmailDetailView } from "./email-detail";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import EmailListSkeleton from "./email-skeleton";

export function EmailList() {
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);

  const [searchTerm, setSearchTerm] = useState("");
  const debouncedSearchTerm = useDebounce(searchTerm, 800);

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    error,
  } = api.email.getThreadList.useInfiniteQuery(
    { search: debouncedSearchTerm },
    {
      getNextPageParam: (lastPage) => lastPage.nextCursor,
      refetchOnWindowFocus: false,
    },
  );

  const utils = api.useUtils();

  useEffect(() => {
    void utils.email.getThreadList.invalidate();
  }, [debouncedSearchTerm, utils.email.getThreadList]);

  const markAsRead = api.email.markAsRead.useMutation({
    onSuccess: () => {
      void utils.email.getThreadList.invalidate();
      void utils.email.getThreadById.invalidate(); // Invalidate thread detail as well
    },
  });

  // Handle loading state
  if (isLoading) {
    return <EmailListSkeleton />;
  }

  // Handle error state
  if (error) {
    return (
      <div className="py-12 text-center">
        <p className="mb-4 text-red-600">Failed to load emails</p>
        <p className="text-sm text-gray-500">{error.message}</p>
      </div>
    );
  }

  if (!data || data.pages.length === 0) {
    return (
      <div className="py-12 text-center">
        <p className="mb-4 text-gray-600">No threads found.</p>
        <p className="text-sm text-gray-500">
          Use the sync button above to fetch messages from Gmail.
        </p>
      </div>
    );
  }

  const handleThreadClick = (thread: (typeof data.pages)[0]["threads"][0]) => {
    if (!thread.isRead) {
      markAsRead.mutate({ id: thread.id });
    }
    setSelectedThreadId(thread.threadId);
  };

  const allThreads = data?.pages.flatMap((page) => page.threads) ?? [];

  if (selectedThreadId) {
    return (
      <EmailDetailView
        threadId={selectedThreadId}
        onBack={() => setSelectedThreadId(null)}
      />
    );
  }

  return (
    <div className="flex h-full flex-col space-y-6 p-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Inbox</h1>
          <div className="text-sm text-gray-600">{allThreads.length} threads</div>
        </div>
        <Input
          type="text"
          placeholder="Search emails..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="max-w-sm"
        />
      </div>

      <div className="flex-1 overflow-hidden rounded-sm border border-gray-200 bg-white">
        <div className="h-full overflow-y-auto">
          {data.pages.map((page, pageIndex) => (
            <Fragment key={pageIndex}>
              {page.threads.map((thread) => (
                <div
                  key={thread.id}
                  className={`flex cursor-pointer items-center gap-4 border-b p-3 text-sm transition-colors hover:bg-gray-50 ${
                    thread.isRead
                      ? "border-gray-200 bg-white"
                      : "border-blue-200 bg-blue-50 font-medium text-gray-900"
                  }`}
                  onClick={() => handleThreadClick(thread)}
                  onMouseEnter={() => {
                    if (thread.threadId) {
                      void utils.email.getThreadById.prefetch({
                        threadId: thread.threadId,
                      });
                    }
                  }}
                >
                  <div
                    className={`w-40 shrink-0 truncate px-2 ${
                      thread.isRead ? "font-normal" : "font-bold"
                    }`}
                  >
                    {extractNameFromEmail(thread.from)}
                  </div>
                  <div className="flex-grow truncate">
                    <span
                      className={
                        thread.isRead ? "text-gray-800" : "text-blue-900"
                      }
                    >
                      {thread.subject ?? "(No Subject)"}
                    </span>
                    <span className="ml-2 text-xs text-gray-500">
                      {thread.snippet}
                    </span>
                  </div>
                  <div className="w-24 shrink-0 px-2 text-right text-xs text-gray-500">
                    {thread.receivedAt && (
                      <ClientSideFormattedDate date={thread.receivedAt} />
                    )}
                  </div>
                </div>
              ))}
            </Fragment>
          ))}

          {hasNextPage && (
            <div className="border-t bg-gray-50 p-4 text-center">
              <Button
                onClick={() => fetchNextPage()}
                disabled={isFetchingNextPage}
                variant="outline"
              >
                {isFetchingNextPage ? "Loading more..." : "Load More"}
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// A component to safely render dates on the client
function ClientSideFormattedDate({ date }: { date: Date }) {
  const [formattedDate, setFormattedDate] = useState<string | null>(null);

  useEffect(() => {
    const now = new Date();
    const isToday = now.toDateString() === date.toDateString();

    if (isToday) {
      setFormattedDate(
        date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }),
      );
    } else {
      setFormattedDate(
        date.toLocaleDateString([], { month: "short", day: "numeric" }),
      );
    }
  }, [date]);

  if (!formattedDate) {
    // Render a placeholder or nothing on the server and initial client render
    return <span className="h-4 w-16 animate-pulse rounded bg-gray-200"></span>;
  }

  return <span className="whitespace-nowrap">{formattedDate}</span>;
}

// Helper function to extract name from email address
function extractNameFromEmail(emailString: string | null): string {
  if (!emailString) return "Unknown Sender";

  // Check if it's in format "Name <email@domain.com>"
  const nameRegex = /^(.+?)\s*<.*>$/;
  const nameMatch = nameRegex.exec(emailString);
  if (nameMatch?.[1]) {
    return nameMatch[1].trim().replace(/^["']|["']$/g, ""); // Remove quotes if present
  }

  // If it's just an email address, extract the part before @
  const emailRegex = /^([^@<]+)@/;
  const emailMatch = emailRegex.exec(emailString);
  if (emailMatch?.[1]) {
    return emailMatch[1].trim();
  }

  return emailString.trim();
}
