import { NextAuthConfig } from 'next-auth';

/**
 * 需要登录才能访问的路由前缀。
 *
 * ⚠️ 这里**故意不包含** `/me`：需求要求"未登录访问 /me 时展示登录弹窗而非跳转"
 * （proposal 5.4.1），交由页面自身处理。
 */
const PROTECTED_PREFIXES = ['/study', '/word'];

/**
 * 鉴权配置（同时被 middleware.ts 与 app/auth.ts 复用）。
 *
 * ## 为什么删掉了原来的全局重定向
 *
 * 原始实现是：
 * ```ts
 * } else if (isLoggedIn) {
 *   return Response.redirect(new URL('/protected', nextUrl));
 * }
 * ```
 * 这意味着**任何已登录用户访问任何非 /protected 页面都会被弹到 /protected**，
 * 于是「登录后回首页」「我的页」「学习页」全部失效（docs/design.md 风险 R1，
 * 致命级）。改为白名单保护：只拦真正需要登录的路由，其余一律放行。
 */
export const authConfig = {
  pages: {
    signIn: '/login',
  },
  providers: [
    // added later in auth.ts since it requires bcrypt which is only compatible with Node.js
    // while this file is also used in non-Node.js environments
  ],
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const { pathname } = nextUrl;
      const needsAuth = PROTECTED_PREFIXES.some((p) => pathname.startsWith(p));
      // 返回 false → 由 NextAuth 重定向到 pages.signIn
      if (needsAuth && !auth?.user) return false;
      return true;
    },
  },
} satisfies NextAuthConfig;

export { PROTECTED_PREFIXES };
