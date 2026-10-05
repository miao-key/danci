/**
 * 首页「全部单词书」的列表项。
 *
 * Server Component（无交互，href 由调用方决定）：
 *   - 已登录 → /study/[bookId]
 *   - 未登录 → /me?login=1（跳过去并弹登录窗，proposal 5.2.3）
 */
import Link from 'next/link';
import { BookCover } from '@/components/book-cover';
import type { BookListItem } from '@/lib/word-repo';

export function BookCard({
  book,
  href,
}: {
  book: BookListItem;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 px-4 py-3.5 transition-colors active:bg-slate-50"
    >
      <BookCover
        bookId={book.bookId}
        title={book.title}
        coverUrl={book.coverUrl}
        size={48}
      />

      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] font-medium text-slate-900">
          {book.title}
        </p>
        {book.description ? (
          <p className="mt-0.5 truncate text-xs text-slate-500">
            {book.description}
          </p>
        ) : book.tags.length > 0 ? (
          <p className="mt-0.5 truncate text-xs text-slate-400">
            {book.tags.join(' · ')} · {book.wordCount} 词
          </p>
        ) : (
          <p className="mt-0.5 truncate text-xs text-slate-400">
            {book.wordCount} 词
          </p>
        )}
      </div>

      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-4 w-4 shrink-0 text-slate-300"
        aria-hidden="true"
      >
        <path d="m9 5 7 7-7 7" />
      </svg>
    </Link>
  );
}
