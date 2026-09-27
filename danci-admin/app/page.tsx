import { redirect } from "next/navigation";

import { getSession } from "@/lib/auth";
import { countAdmins } from "@/lib/admin-repo";

/**
 * 根路径分发：
 * - 数据库里没有任何管理员 → /signup（首次注册系统管理员）
 * - 已登录 → /books
 * - 未登录 → /signin
 */
export default async function RootRedirectPage() {
  const session = await getSession();
  if (session) {
    redirect("/books");
  }
  const total = await countAdmins();
  redirect(total === 0 ? "/signup" : "/signin");
}
