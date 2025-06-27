"use client";

import {
  SidebarProvider,
  SidebarInset,
  SidebarTrigger,
  useSidebar,
} from "~/components/ui/sidebar";
import { AppSidebar } from "~/components/app-sidebar";
import { Separator } from "~/components/ui/separator";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "~/components/ui/breadcrumb";
import { GmailSyncButton } from "./gmail-sync-button";
import { SignOutButton } from "./sign-out-button";

interface DashboardLayoutProps {
  children: React.ReactNode;
  title?: string;
}

function DashboardContent({ children, title = "Inbox" }: DashboardLayoutProps) {
  const { open } = useSidebar();

  return (
    <SidebarInset>
      <header
        className={`flex h-16 shrink-0 items-center gap-2 border-b px-4 ${
          open ? "max-w-[calc(100vw-256px)]" : "max-w-[100vw]"
        }`}
      >
        <SidebarTrigger className="-ml-1" />
        <Separator
          orientation="vertical"
          className="mr-2 data-[orientation=vertical]:h-4"
        />
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem className="hidden md:block">
              <BreadcrumbLink className="text-black" href="/">Dashboard</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator className="hidden md:block" />
            <BreadcrumbItem>
              <BreadcrumbPage>{title}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        <div className="ml-auto flex items-center gap-2">
          <GmailSyncButton />
          <SignOutButton />
        </div>
      </header>
      <main
        className={`flex-1 overflow-y-auto p-4 ${
          open ? "max-w-[calc(100vw-256px)]" : "max-w-[100vw]"
        }`}
      >
        {children}
      </main>
    </SidebarInset>
  );
}

export function DashboardLayout({
  children,
  title = "Inbox",
}: DashboardLayoutProps) {
  return (
    <SidebarProvider>
      <AppSidebar variant="inset" />
      <DashboardContent title={title}>{children}</DashboardContent>
    </SidebarProvider>
  );
}
