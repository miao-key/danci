"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { SignInForm } from "@/components/auth/sign-in-form";

/**
 * /signin (客户端)
 *
 * 为什么不放在服务端组件里查 DB：
 *   Next.js 16 默认会在 `next build` 阶段预渲染所有路由，
 *   服务端组件里直接 await countAdmins() 会触发 DATABASE_URL 检查。
 *   把分发逻辑放到客户端后，构建期不再访问数据库。
 */
export default function SignInPage() {
  const router = useRouter();

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/auth/has-admin", { cache: "no-store" });
        if (!res.ok) return; // 出错就让用户继续看到登录页
        const data = (await res.json()) as { hasAdmin?: boolean };
        if (!cancelled && data.hasAdmin === false) {
          router.replace("/signup");
        }
      } catch {
        // 静默失败：保持登录页可见
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-12">
      <SignInForm />
    </main>
  );
}