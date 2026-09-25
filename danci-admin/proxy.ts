// Next.js 16 用 proxy.ts 取代了旧的 middleware.ts。
// 这里只负责"硬性守卫"：没登录就跳 /signin。
// 软跳转（首页重定向、单点互踢登录页等）在 page/layout 里用 redirect() 实现。
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { AUTH_COOKIE } from "@/lib/auth";

const PROTECTED_PREFIXES = ["/books", "/admin-users"];

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const isProtected = PROTECTED_PREFIXES.some((p) =>
    pathname === p || pathname.startsWith(`${p}/`),
  );
  if (!isProtected) return NextResponse.next();

  const token = request.cookies.get(AUTH_COOKIE)?.value;
  if (token) return NextResponse.next();

  const url = request.nextUrl.clone();
  url.pathname = "/signin";
  url.search = "";
  if (pathname !== "/") {
    url.searchParams.set("next", pathname + (search || ""));
  }
  return NextResponse.redirect(url);
}

export const config = {
  // 排除静态资源 + 自身代理与 _next
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
