"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { SignUpForm } from "@/components/auth/sign-up-form";

/**
 * /signup (客户端)
 *
 * 同 /signin：分发逻辑放客户端，避免构建期触碰 DB。
 * 已登录用户走客户端硬跳：在 form 加载后用 /api/auth/me 探测一次。
 */
export default function SignUpPage() {
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
          if (data.hasAdmin === true) {
            router.replace("/signin");
          }
        }
      } catch {
        // 静默失败：保持当前页可见
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-12">
      <SignUpForm />
    </main>
  );
}