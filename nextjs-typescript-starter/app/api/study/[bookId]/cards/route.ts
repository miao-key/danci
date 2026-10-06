/**
 * GET /api/study/[bookId]/cards —— 分批拉取学习页词卡。
 *
 * 组装逻辑见 lib/study-service.ts 的 loadStudyCards。
 *
 * ## 为什么需要分批
 *
 * `CET4_2` 有 3739 个词。一次取全量 `content` JSON（每条 2–5KB）
 * 约 8–19 MB，完全不可接受。词卡走 `#>>` 只取 7 个标量字段
 * （见 lib/word-repo.ts 的 listStudyCards），单批控制在 20KB 内。
 *
 * 前端在离末尾 5 张时带 `afterRank` 拉下一批（components/word-card.tsx），
 * 所以「完成本课」只在真的学完最后一本书时才出现。
 *
 * ## 鉴权
 *
 * `/api/*` 不在 middleware 的 PROTECTED_PREFIXES 里，必须自己校验。
 *
 * ## 参数
 *
 * | 参数 | 默认 | 说明 |
 * | --- | --- | --- |
 * | `afterRank` | `0` | 只取 `wordRank > afterRank` 的词 |
 * | `from` | — | `last` 时忽略 afterRank，改用该用户进度续学（需求 5.5.1） |
 * | `limit` | `50` | 上限 200 |
 *
 * ## 返回
 *
 * ```jsonc
 * { "data": { "bookId", "bookTitle", "wordCount", "afterRank",
 *             "nextAfterRank", "hasMore", "cards": [...] } }
 * ```
 */
import { BookNotFoundError, loadStudyCards } from '@/lib/study-service';
import {
  badRequest,
  fail,
  internalError,
  intParam,
  notFound,
  ok,
  requireUser,
} from '../../../_lib/http';

export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  { params }: { params: { bookId: string } },
) {
  try {
    const user = await requireUser();
    if (!user) return fail(401, 'UNAUTHORIZED', '请先登录');

    const { searchParams } = new URL(request.url);

    const result = await loadStudyCards(user.id, params.bookId, {
      fromLast: searchParams.get('from') === 'last',
      // afterRank 只在非 from=last 时读，避免两个来源互相干扰
      afterRank: intParam(searchParams.get('afterRank'), 0, { min: 0 }),
      limit: intParam(searchParams.get('limit'), 50, { min: 1, max: 200 }),
    });

    return ok({ data: result });
  } catch (err) {
    if (err instanceof BookNotFoundError) return notFound('单词书不存在');
    return internalError(err);
  }
}

export async function POST() {
  return badRequest('该接口只支持 GET');
}
