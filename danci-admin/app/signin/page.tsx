import { Suspense } from "react";
import { redirect } from "next/navigation";

import { SignInForm } from "@/components/auth/sign-in-form";
import { countAdmins } from "@/lib/admin-repo";

/**
 * /signin
 * - 数据库里没有任何管理员 → 跳到 /signup（必须先有系统管理员）
 * - 已登录 → /books
 */
export default async function SignInPage() {
  const total = await countAdmins();
  if (total === 0) {
    redirect("/signup");
  }
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-12">
      <Suspense fallback={null}>
        <SignInForm />
      </Suspense>
    </main>
  );
}
