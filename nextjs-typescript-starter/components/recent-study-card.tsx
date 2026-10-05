/**
 * 首页「最近学习」卡片。
 *
 * 整卡可点击跳 `/study/[bookId]`（proposal 5.2.2）。
 *
 * 文案「上次学到：第 N 个单词 · 共 M 个」：
 *   - N = lastWordRank（该用户最近学到的单词在这本书里的排名）
 *   - M = books.wordCount（冗余词数，UI 直接读，不做 count(*)）
 */
import Link from 'next/link';
import { BookCover } from '@/components/book-cover';
import type { ProgressWithBook } from '@/lib/progress-repo';

export function RecentStudyCard({
  progress,
}: {
  progress: ProgressWithBook;
}) {
  const title = progress.title ?? progress.bookId;
  const studied =
    progress.lastWordRank && progress.lastWordRank > 0
      ? progress.lastWordRank
      : 0;

  return (
    <Link
      href={`/study/${progress.bookId}`}
      className="flex items-center gap-3 rounded-2xl bg-white p-4 shadow-sm transition-shadow active:shadow-none"
    >
      <BookCover
        bookId={progress.bookId}
        title={title}
        coverUrl={progress.coverUrl}
        size={64}
      />

      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] font-semibold text-slate-900">
          {title}
        </p>
        <p className="mt-1 text-xs text-slate-500">
          {studied > 0 ? (
            <>
              上次学到：第 {studied} 个单词 · 共 {progress.wordCount} 个
            </>
          ) : (
            <>共 {progress.wordCount} 个单词</>
          )}
        </p>
      </div>

      <span className="shrink-0 rounded-full bg-brand-600 px-3.5 py-1.5 text-xs font-medium text-white">
        继续学习
      </span>
    </Link>
  );
}
