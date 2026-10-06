/**
 * GET /api/study/recent —— 首页「最近学习」的真实数据。
 *
 * 供首页在 Server 侧复用，也供将来的原生端 / 小程序端消费。
 * 组装逻辑见 lib/study-service.ts 的 loadRecentStudy。
 *
 * ## 鉴权
 *
 * middleware 的 PROTECTED_PREFIXES 只拦 `/study`、`/word`，
 * `/api/*` 会被 matcher 放行 —— 所以**本路由必须自己鉴权**。
 * 进度按 session 的 uid 查询，不接受任何外部传入的 userId。
 *
 * ## 返回
 *
 * ```jsonc
 * // 200 有数据
 * { "data": { "bookId", "title", "coverUrl", "wordCount", "lastWordId",
 *             "lastWordRank", "lastStudiedAt", "learnedCount",
 *             "percent", "hasBook" } }
 * // 200 无数据（**不是 404**：调用方要区分「空」与「错」）
 * { "data": null }
 * // 200 书被删（孤儿进度）
 * { "data": null, "reason": "BOOK_DELETED" }
 * // 401 / 500
 * { "error": { "code", "message" } }
 * ```
 *
 * ⚠️ 用户数据要求实时，**不缓存**（docs/design.md 10.3）。
 */
import { loadRecentStudy } from '@/lib/study-service';
import { badRequest, fail, internalError, ok, requireUser } from '../../_lib/http';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const user = await requireUser();
    if (!user) return fail(401, 'UNAUTHORIZED', '请先登录');

    const result = await loadRecentStudy(user.id);

    if (result.kind === 'found') return ok({ data: result.data });
    if (result.kind === 'book-deleted') {
      return ok({ data: null, reason: 'BOOK_DELETED', bookId: result.bookId });
    }
    return ok({ data: null });
  } catch (err) {
    return internalError(err);
  }
}

/** 非 GET 一律拒绝，避免被误当成可写端点 */
export async function POST() {
  return badRequest('该接口只支持 GET');
}
