import { NextAuthConfig } from 'next-auth';

/**
 * 需要登录才能访问的路由前缀。
 *
 * ⚠️ 这里**故意不包含** `/me`：需求要求"未登录访问 /me 时展示登录弹窗而非跳转"
 * （proposal 5.4.1），交由页面自身处理。
 */
const PROTECTED_PREFIXES = ['/study', '/word'];

/**
 * 是否信任请求的 host。
 *
 * ⚠️ 关键：本地 dev / 局域网测试时 request host 是 `localhost:3000` 这种
 * NextAuth 默认不信的 host（[auth][error] UntrustedHost）。
 * 在 authConfig 里开 trustHost 同时影响两处：
 *   - middleware.ts 里的 NextAuth 实例
 *   - app/auth.ts 里的 NextAuth 实例
 * 只在 app/auth.ts 里开会有 split-brain：middleware 不信任但 signIn 信任，
 * 行为不一致。
 *
 * 默认开 trustHost=true（覆盖本地 / 局域网 / 任何非 Vercel 部署）。
 * 若部署到 Vercel 官方环境，会自动配置 trustHost；自托管反向代理环境下
 * 需通过 env `AUTH_TRUST_HOST=false` 显式关闭以使用代理头部。
 *
 * ref: https://errors.authjs.dev#untrustedhost
 */
const trustHost = process.env.AUTH_TRUST_HOST !== 'false';

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
  trustHost,
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
