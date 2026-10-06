/**
 * 识别 Next.js 框架抛出的"控制流"异常。
 *
 * ## 为什么需要这个
 *
 * `next/navigation` 的 `redirect()` / `notFound()` 实现里**不是走 return**，
 * 而是**主动 throw** 一个带 `digest` 字段的 Error，让 Next.js 框架在
 * Server Component / Server Action 的最外层 catch 它并转成 303/404 响应。
 *
 * Server Action 里如果无差别 `try { ... } catch {}` 会把这两种**预期**异常
 * 也吞掉，函数就 return 了普通值，浏览器看不到重定向也看不到 404。
 *
 * ## 为什么不用 next/dist 内部路径
 *
 * `next/dist/client/components/redirect.js` 虽然导出了 `isRedirectError`，
 * 但那是**客户端/内部**路径，Server Action 里 import 它在 Next.js 14.2 上
 * 行为未定义（webpack chunk 解析可能找不到、或被当作 client-only 引用挂掉）。
 *
 * ## 为什么不用 try/catch 匹配 `NEXT_REDIRECT` 字符串
 *
 * 也可以，但没这个 helper 集中可读。
 *
 * ## 适用判断
 *
 * - `NEXT_REDIRECT` —— `redirect()` / `signIn({ redirectTo })` 抛出
 * - `NEXT_NOT_FOUND` —— `notFound()` 抛出
 * - `NEXT_HTTP_ERROR_FALLBACK;404` 等 —— 不算"成功"控制流，要重抛
 *
 * ⚠️ 此 helper 只判 Next.js 框架异常，不会误判业务异常；
 *    业务异常没有 `digest` 字段。
 */
export function isNextRedirectError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const digest = (err as { digest?: unknown }).digest;
  return typeof digest === 'string' && digest.startsWith('NEXT_REDIRECT');
}

export function isNextNotFoundError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const digest = (err as { digest?: unknown }).digest;
  return typeof digest === 'string' && digest.startsWith('NEXT_NOT_FOUND');
}

/** 任何 Next.js 框架控制流异常（redirect / notFound / HTTPErrors）。 */
export function isNextControlFlowError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const digest = (err as { digest?: unknown }).digest;
  return typeof digest === 'string' && digest.startsWith('NEXT_');
}
