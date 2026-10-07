/**
 * 单词详情页（proposal 5.6）。
 *
 * 路由参数 `[wordId]` 用的是**业务单词 ID**（content.word.wordId，
 * 如 "PEPXiaoXue6_1_1"），不是 words.id 主键 —— 详见 lib/word-repo.ts 的注释。
 *
 * 音标行按需求 6.7 线框图展示美/英两个音标：
 *   源数据里 usphone/ukphone 都不带首尾斜杠，这里补上 `/`。
 * 「▶ US / ▶ UK」是本期占位，音频资源接入后再接 <audio>（需求 1.3 非目标）。
 *
 * ## 「返回」定位（修复「详情页返回后回到第 1 个」Bug）
 *
 * 学习页点「查看详情」时，会把当前卡片的 `wordRank` 作为 `?from=N`
 * 带过来。详情页的「返回」链接据此拼成 `/study/[bookId]?at=N`，
 * 让学习页定位到原本那张卡，而不是 user_book_progress.lastWordRank
 * 指示的位置（两者可能差 1：用户可能没点过「下一个」就看了详情）。
 *
 * - 无 `?from` → 退回到 `/study/[bookId]`（不传 at），由学习页
 *   按 user_book_progress 续学；适用于从「我的」页直接进来的场景。
 */
import { notFound } from 'next/navigation';
import { WordDetailSections } from '@/components/word-detail-sections';
import { findWordDetail } from '@/lib/word-repo';

/**
 * 解析 `?from=N`。
 *
 * 与 study 页的 parseAtRank 镜像，但**不做 wordCount 校验** —— 详情页
 * 不便多查一次，且即使用户传了离谱的 N，study 页会兜底回退到 fromLast。
 */
function parseFromRank(raw: string | string[] | undefined): number | null {
  if (!raw) return null;
  const s = Array.isArray(raw) ? raw[0] : raw;
  const n = Number(s);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 1 || n > 200000) {
    return null;
  }
  return n;
}

export default async function WordDetailPage({
  params,
  searchParams,
}: {
  params: { bookId: string; wordId: string };
  searchParams: { from?: string | string[] };
}) {
  const detail = await findWordDetail(params.bookId, params.wordId);
  if (!detail) notFound();

  const { word } = detail;
  const hasPhone = Boolean(word.usphone || word.ukphone);

  // 详情页里这个单词的 wordRank（不是「在学习页上的第几张」，
  // 而是书内绝对排名）。`findWordDetail` 已经返回了它。
  const fromRank = parseFromRank(searchParams.from);
  const backHref =
    fromRank !== null
      ? `/study/${params.bookId}?at=${fromRank}`
      : `/study/${params.bookId}`;

  return (
    <div className="mx-auto min-h-[100dvh] w-full max-w-app bg-white">
      <div className="px-5 py-4">
        <a
          href={backHref}
          className="inline-flex items-center gap-1 text-sm text-slate-500"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-4 w-4"
            aria-hidden="true"
          >
            <path d="m15 5-7 7 7 7" />
          </svg>
          返回
        </a>

        {/* 词头区：单词 + 音标 + 发音占位 */}
        <header className="mt-6 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="break-words text-3xl font-semibold tracking-tight text-slate-900">
              {word.wordHead}
            </h1>
            {hasPhone ? (
              <p className="mt-1.5 flex flex-wrap gap-x-3 text-sm text-slate-500">
                {word.usphone ? <span>/{word.usphone}/</span> : null}
                {word.ukphone ? <span>/{word.ukphone}/</span> : null}
              </p>
            ) : null}
          </div>

          {/* 发音入口：v1 占位，音频资源接入后接 <audio> */}
          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              disabled
              title="发音功能待接入"
              className="rounded-full border border-slate-200 px-3 py-1 text-[11px] text-slate-400"
            >
              ▶ US
            </button>
            <button
              type="button"
              disabled
              title="发音功能待接入"
              className="rounded-full border border-slate-200 px-3 py-1 text-[11px] text-slate-400"
            >
              ▶ UK
            </button>
          </div>
        </header>
      </div>

      <WordDetailSections word={word} />
    </div>
  );
}
