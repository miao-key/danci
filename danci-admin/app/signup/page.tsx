import { redirect } from "next/navigation";

import { SignUpForm } from "@/components/auth/sign-up-form";
import { countAdmins } from "@/lib/admin-repo";
import { getSession } from "@/lib/auth";

/**
 * /signup
 * - 数据库里已经有管理员 → 跳到 /signin（禁止再次注册系统管理员）
 * - 已登录 → /books
 */
export default async function SignUpPage() {
  const session = await getSession();
  if (session) {
    redirect("/books");
  }
  const total = await countAdmins();
  if (total > 0) {
    redirect("/signin");
  }
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-12">
      <SignUpForm />
    </main>
  );
}
