"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";
import { BookOpenIcon, LogOutIcon, UsersIcon } from "lucide-react";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { cn } from "cn";

type SessionUser = {
  name: string;
  email: string;
};

const NAV_ITEMS = [
  {
    label: "单词书管理",
    href: "/books",
    icon: BookOpenIcon,
  },
  {
    label: "管理员管理",
    href: "/admin-users",
    icon: UsersIcon,
  },
];

export interface AppSidebarProps
  extends React.ComponentProps<typeof Sidebar> {
  user: SessionUser;
}

export function AppSidebar({ user, ...props }: AppSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [signingOut, setSigningOut] = React.useState(false);

  async function handleSignOut() {
    if (signingOut) return;
    setSigningOut(true);
    try {
      const res = await fetch("/api/auth/signout", { method: "POST" });
      if (!res.ok) {
        toast.error("退出失败");
        return;
      }
      toast.success("已退出登录");
      router.replace("/signin");
      router.refresh();
    } catch {
      toast.error("网络错误");
    } finally {
      setSigningOut(false);
    }
  }

  const userInitial = user.name?.trim()?.charAt(0)?.toUpperCase() || "?";

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <div className="flex items-center gap-2 px-2 py-1.5">
          <div className="bg-primary text-primary-foreground flex size-7 items-center justify-center rounded-md text-sm font-semibold">
            单
          </div>
          <div className="grid flex-1 text-left text-sm leading-tight group-data-[collapsible=icon]:hidden">
            <span className="font-medium truncate">单词后台</span>
            <span className="text-muted-foreground text-xs truncate">
              Danci Admin
            </span>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>导航</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {NAV_ITEMS.map((item) => {
                const active =
                  pathname === item.href ||
                  pathname.startsWith(`${item.href}/`);
                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      render={
                        <Link href={item.href} aria-current={active} />
                      }
                      isActive={active}
                      tooltip={item.label}
                    >
                      <item.icon />
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <Separator className="mb-2" />
        <div
          className={cn(
            "flex items-center gap-2 px-2 py-1.5 rounded-md",
            "group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0",
          )}
        >
          <div className="bg-muted text-foreground flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-medium">
            {userInitial}
          </div>
          <div className="grid min-w-0 flex-1 text-left text-sm leading-tight group-data-[collapsible=icon]:hidden">
            <span className="truncate font-medium">{user.name}</span>
            <span className="text-muted-foreground truncate text-xs">
              {user.email}
            </span>
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            className="group-data-[collapsible=icon]:ml-0"
            onClick={handleSignOut}
            disabled={signingOut}
            aria-label="退出登录"
            title="退出登录"
          >
            <LogOutIcon />
            <span className="sr-only">退出登录</span>
          </Button>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
