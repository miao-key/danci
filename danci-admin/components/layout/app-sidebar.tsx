"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  BookMarkedIcon,
  BookOpenIcon,
  LogOutIcon,
  UsersIcon,
} from "lucide-react";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { cn } from "cn";
import type { AdminRole } from "@/db/schema";

type SessionUser = {
  id: string;
  name: string;
  email: string;
  role: AdminRole;
};

// 菜单项可以声明需要哪些角色才显示。
// 普通管理员（normal）登录后看不到"管理员管理"。
type NavItem = {
  label: string;
  href: string;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  /** 留空表示对所有角色都可见 */
  roles?: AdminRole[];
};

const NAV_ITEMS: NavItem[] = [
  {
    label: "单词书管理",
    href: "/books",
    icon: BookOpenIcon,
  },
  {
    label: "管理员管理",
    href: "/admin-users",
    icon: UsersIcon,
    roles: ["super"],
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

  const userInitial =
    user.name?.trim()?.charAt(0)?.toUpperCase() || "?";

  const visibleItems = NAV_ITEMS.filter(
    (item) => !item.roles || item.roles.includes(user.role),
  );

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <div className="flex items-center gap-2 px-2 py-1.5">
          <div className="bg-primary/10 text-primary flex size-7 items-center justify-center rounded-md">
            <BookMarkedIcon className="size-4" />
          </div>
          <div className="grid flex-1 text-left text-sm leading-tight group-data-[collapsible=icon]:hidden">
            <span className="font-medium truncate">Danci Admin</span>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {visibleItems.map((item) => {
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
                      className={cn(
                        // 选中态：背景更深 + 字色加深 + 加粗，
                        // 关键：用 !important (Tailwind `!`) 强制压过 sidebar 内部
                        // data-active:bg-sidebar-accent / hover:bg-sidebar-accent
                        // 这类属性选择器带来的更高优先级，否则颜色被洗掉。
                        active &&
                          "!bg-sidebar-primary !text-sidebar-primary-foreground !font-semibold " +
                          "hover:!bg-sidebar-primary hover:!text-sidebar-primary-foreground " +
                          "data-[active=true]:!bg-sidebar-primary data-[active=true]:!text-sidebar-primary-foreground",
                      )}
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
            <span className="truncate font-medium">
              {user.name}
              {user.role === "super" && (
                <span className="text-muted-foreground ml-1 text-xs">
                  · 系统管理员
                </span>
              )}
            </span>
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
