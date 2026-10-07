/**
 * 首页「最近学习」卡片。
 *
 * 整卡可点击跳 `/study/[bookId]`（proposal 5.2.2）。
 *
 * 文案「上次学到：第 N 个单词 · 共 M 个」：
 *   - N = 续学起点（= lastWordRank + 1，即「下一个要学的」单词的 rank）
 *   - M = wordCount（books 表的冗余词数，UI 直接读，不做 count(*)）
 *
 * 为什么显示 lastWordRank + 1 而不是 lastWordRank？
 *   user_book_progress.lastWordRank 存的是「**最后学完**的单词 rank」
 *   （1-indexed），但用户读「第 N 个」时大脑模型是「**下一次进入
 *   学习页时从第 N 个开始**」。两者差 1。
 *   比如学完 3 个 → lastWordRank=3 → 学习页首张卡是第 4 个。
 *   若直接显示「第 3 个」会让用户以为「第 3 个就是下一张」，
 *   跟学习页右上「第 4 / 130 个」对不上。
 *   加 1 后两边口径一致，都是「下一张是第 N 个」。
 *
 * 数据由 lib/study-service.ts 的 loadRecentStudy 组装 —— 首页与
 * `GET /api/study/recent` 共用同一份逻辑，故这里直接用 RecentStudy
 * 类型而不是仓储层的 ProgressWithBook。
 */
import Link from 'next/link';
import { BookCover } from '@/components/book-cover';
import type { RecentStudy } from '@/lib/study-service';

export function RecentStudyCard({ recent }: { recent: RecentStudy }) {
  const hasStudied =
    recent.lastWordRank !== null && recent.lastWordRank > 0;
  // 续学起点 = 「最后学完的」 + 1 = 「下一张卡」的 rank
  // 与 /study/[bookId] 的「第 N / M 个」完全对齐。
  const nextRank = hasStudied ? (recent.lastWordRank as number) + 1 : 0;

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
          {hasStudied ? (
            <>
              上次学到：第 {nextRank} 个单词 · 共 {recent.wordCount} 个
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
