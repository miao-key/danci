"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

/**
 * 根路径分发（客户端）
 *
 * 故意做成客户端组件：构建期不连 DB。
 * 流程：
 *   1) /api/auth/me 探测是否已登录（已登录 → /books）
 *   2) /api/auth/has-admin 探测是否存在管理员
 *      - 无管理员 → /signup
 *      - 有管理员 → /signin
 */
export default function RootRedirectPage() {
  const router = useRouter();

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [meRes, adminRes] = await Promise.all([
          fetch("/api/auth/me", { cache: "no-store" }),
          fetch("/api/auth/has-admin", { cache: "no-store" }),
        ]);
        if (cancelled) return;

        if (meRes.ok) {
          const me = (await meRes.json()) as { admin?: unknown };
          if (me.admin) {
            router.replace("/books");
            return;
          }
        }
        if (adminRes.ok) {
          const data = (await adminRes.json()) as { hasAdmin?: boolean };
          router.replace(data.hasAdmin ? "/signin" : "/signup");
          return;
        }
        // 两个探测都失败：保守跳登录页
        router.replace("/signin");
      } catch {
        if (!cancelled) router.replace("/signin");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-12">
      <p className="text-muted-foreground text-sm">正在跳转…</p>
    </main>
  );
}