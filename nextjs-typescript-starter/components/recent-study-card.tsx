/**
 * 首页「最近学习」卡片。
 *
 * 整卡可点击跳 `/study/[bookId]`（proposal 5.2.2）。
 *
 * 文案「上次学到：第 N 个单词 · 共 M 个」：
 *   - N = lastWordRank（该用户最近学到的单词在这本书里的排名）
 *   - M = wordCount（books 表的冗余词数，UI 直接读，不做 count(*)）
 *
 * 数据由 lib/study-service.ts 的 loadRecentStudy 组装 —— 首页与
 * `GET /api/study/recent` 共用同一份逻辑，故这里直接用 RecentStudy
 * 类型而不是仓储层的 ProgressWithBook。
 */
import Link from 'next/link';
import { BookCover } from '@/components/book-cover';
import type { RecentStudy } from '@/lib/study-service';

export function RecentStudyCard({ recent }: { recent: RecentStudy }) {
  const studied =
    recent.lastWordRank && recent.lastWordRank > 0 ? recent.lastWordRank : 0;

  return (
    <Link
      href={`/study/${recent.bookId}`}
      className="flex items-center gap-3 rounded-2xl bg-white p-4 shadow-sm transition-shadow active:shadow-none"
    >
      <BookCover
        bookId={recent.bookId}
        title={recent.title}
        coverUrl={recent.coverUrl}
        size={64}
      />

      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] font-semibold text-slate-900">
          {recent.title}
        </p>
        <p className="mt-1 text-xs text-slate-500">
          {studied > 0 ? (
            <>
              上次学到：第 {studied} 个单词 · 共 {recent.wordCount} 个
            </>
          ) : (
            <>共 {recent.wordCount} 个单词</>
          )}
        </p>
      </div>

      <span className="shrink-0 rounded-full bg-brand-600 px-3.5 py-1.5 text-xs font-medium text-white">
        继续学习
      </span>
    </Link>
  );
}
