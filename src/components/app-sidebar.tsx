import * as React from "react";
import Link from "next/link";
import {
  Inbox,
  Send,
  FileText,
  Trash2,
  Users,
  Building2,
  Mail,
} from "lucide-react";

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "~/components/ui/sidebar";

// Gmail-specific navigation data
const gmailNavigation = [
  {
    title: "Mail",
    items: [
      {
        title: "Inbox",
        url: "/",
        icon: Inbox,
      },
      {
        title: "Sent",
        url: "/sent",
        icon: Send,
      },
      {
        title: "Drafts",
        url: "/drafts",
        icon: FileText,
      },
      {
        title: "Trash",
        url: "/trash",
        icon: Trash2,
      },
    ],
  },
  {
    title: "Contacts",
    items: [
      {
        title: "People",
        url: "/people",
        icon: Users,
      },
      {
        title: "Company",
        url: "/company",
        icon: Building2,
      },
    ],
  },
];

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {

  return (
    <Sidebar {...props}>
      <SidebarHeader>
        <div className="flex items-center gap-2 px-2 py-2">
          <Mail className="h-5 w-5" />
          <span className="text-lg font-semibold">Gmail Clone</span>
        </div>
      </SidebarHeader>
      <SidebarContent>
        {gmailNavigation.map((section) => (
          <SidebarGroup className="mt-6" key={section.title}>
            <SidebarGroupLabel>{section.title}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {section.items.map((item) => {
                  const Icon = item.icon;

                  return (
                    <SidebarMenuItem key={item.title}>
                      <SidebarMenuButton asChild>
                        <Link
                          href={item.url}
                          className="flex items-center gap-3"
                        >
                          <Icon className="h-4 w-4" />
                          {item.title}
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  );
}
