import { redirect } from "next/navigation";

import { getSession } from "@/lib/auth";
import { AdminUsersClient } from "@/components/admins/admin-users-client";

export default async function AdminUsersPage() {
  const session = await getSession();
  if (!session) {
    // 兜底：(admin) layout 已 guard，这里再次保护。
    redirect("/signin");
  }
  if (session.role !== "super") {
    // 普通管理员无权进入该页面 → 直接回 /books。
    // 三层防线的第三层：
    //   1) 侧边栏不显示入口（UI 层）
    //   2) 服务端 layout/route guard 拦截（这里）
    //   3) /api/admins 在路由处理器里 requireSuper（API 层）
    redirect("/books");
  }

  return <AdminUsersClient currentAdminId={session.id} />;
}
