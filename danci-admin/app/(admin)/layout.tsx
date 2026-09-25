import { redirect } from "next/navigation";
import type * as React from "react";

import { getSession } from "@/lib/auth";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { AppSidebar } from "@/components/layout/app-sidebar";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  // 这里作为第二层保险：proxy 已经把没登录的用户挡在了外面，
  // 但用户被管理员删除/会话失效的情况下，这里再校一次。
  if (!session) {
    redirect("/signin");
  }

  return (
    <SidebarProvider>
      <AppSidebar user={{ name: session.name, email: session.email }} />
      <SidebarInset>
        <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 h-4" />
          <span className="text-sm font-medium">单词后台管理系统</span>
        </header>
        <div className="flex flex-1 flex-col p-4 md:p-6">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
