"use client";

import * as React from "react";
import { PlusIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  AdminsManager,
  type AdminsManagerHandle,
} from "@/components/admins/admins-manager";

interface AdminUsersClientProps {
  currentAdminId: string;
}

/**
 * 把"管理员管理"页面包成客户端组件：
 * - 顶部 header（标题 + 右侧"+ 新增管理员"按钮）
 * - 下面的 AdminsManager（用 ref 把 Dialog 触发权交给顶部按钮）
 *
 * 这样可以让"新增管理员"按钮放在页面标题右侧（用户需求），
 * 同时保持 AdminsManager 内部仍然管理所有对话框状态（数据流单向）。
 */
export function AdminUsersClient({ currentAdminId }: AdminUsersClientProps) {
  const managerRef = React.useRef<AdminsManagerHandle>(null);

  return (
    <div className="flex w-full flex-col gap-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
            管理员管理
          </h1>
          <p className="text-muted-foreground text-sm sm:text-base">
            管理系统管理员账号与权限
          </p>
        </div>
        <Button
          className="self-start px-6 sm:self-auto"
          onClick={() => managerRef.current?.openCreate()}
        >
          <PlusIcon />
          新增管理员
        </Button>
      </header>

      <AdminsManager ref={managerRef} currentAdminId={currentAdminId} />
    </div>
  );
}
