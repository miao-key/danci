/**
 * Route Handler 的公共工具。
 *
 * ## 为什么要这一层
 *
 * 项目内所有 DB 访问都经服务端 Drizzle（持有 Supabase service key），
 * 所以 **API 路由必须自己鉴权** —— middleware 的 PROTECTED_PREFIXES
 * 只覆盖 `/study`、`/word`，`/api/*` 不在其中（auth.config.ts 注释）。
 * 任何 `/api/*` 路由只要碰用户数据，就**必须**在函数体首行调 `currentUser()`。
 */
import { NextResponse } from 'next/server';

import { currentUser } from '@/lib/auth';
import type { UserView } from '@/lib/user-repo';

/** 统一成功响应 */
export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

/** 统一错误响应 */
export function fail(
  status: number,
  code: string,
  message: string,
): NextResponse {
  return NextResponse.json({ error: { code, message } }, { status });
}

/** 401：未登录 */
export function unauthorized() {
  return fail(401, 'UNAUTHORIZED', '请先登录');
}

/** 400：参数非法 */
export function badRequest(message: string) {
  return fail(400, 'BAD_REQUEST', message);
}

/** 404：资源不存在 */
export function notFound(message = '资源不存在') {
  return fail(404, 'NOT_FOUND', message);
}

/**
 * 读取当前登录用户；未登录返回 null。
 *
 * ⚠️ 绝不能从 query/body 里取 userId —— 那等于让任何人都能伪造
 *    别人的身份读写进度（docs/design.md 8.3 / 11.2）。
 */
export async function requireUser(): Promise<UserView | null> {
  return currentUser();
}

/** 把 500 的内部异常收敛成统一形状，绝不把堆栈/连接串泄给客户端 */
export function internalError(err: unknown) {
  console.error('[api]', err);
  return fail(500, 'INTERNAL_ERROR', '服务器开小差了，请稍后再试');
}

/**
 * 解析正整数参数；非法或缺省时返回 fallback。
 *
 * 词卡分批加载的 `afterRank` / `limit` 都要过这里，避免把 NaN、
 * 负数、超大值直接透进 SQL（`limit` 尤其危险）。
 */
export function intParam(
  raw: string | null,
  fallback: number,
  opts: { min?: number; max?: number } = {},
): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  const min = opts.min ?? 0;
  const max = opts.max ?? Number.MAX_SAFE_INTEGER;
  return Math.min(max, Math.max(min, Math.trunc(n)));
}
