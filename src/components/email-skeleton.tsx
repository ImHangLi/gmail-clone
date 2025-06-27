"use client";

import { Skeleton } from "./ui/skeleton";

export default function EmailListSkeleton() {
  return (
    <div className="flex h-full flex-col space-y-6 p-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            <Skeleton className="h-8 w-32" />
          </h1>
          <div className="text-sm text-gray-600">
            <Skeleton className="mt-1 h-4 w-48" />
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-hidden rounded-sm border border-gray-200 bg-white">
        <div className="h-full overflow-y-auto">
          {Array.from({ length: 10 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-4 border-b p-3 text-sm"
            >
              <div className="w-40 shrink-0 px-2">
                <Skeleton className="h-4 w-3/4" />
              </div>
              <div className="flex-grow truncate">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="mt-1 h-3 w-5/6" />
              </div>
              <div className="w-24 shrink-0 px-2 text-right">
                <Skeleton className="h-4 w-full" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
