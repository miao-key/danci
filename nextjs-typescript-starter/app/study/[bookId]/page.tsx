/**
 * 学习页（proposal 5.5）。
 *
 * ## 起始位置在服务端算好
 *
 * 「从最近学习的单词的**下一个**开始」不能在前端做，
 * 否则要把整本书载入内存。服务端用 `user_book_progress.lastWordRank`
 * 直接查 `wordRank > ?`，客户端只负责左右切换。
 *
 * ⚠️ 本路由在 `auth.config.ts` 的 PROTECTED_PREFIXES 白名单里，
 *    未登录会被 NextAuth 拦到 /login；这里的 currentUser() 是双保险。
 */
import { notFound } from 'next/navigation';
import { WordCard } from '@/components/word-card';
import { currentUser } from '@/lib/auth';
import { findProgress } from '@/lib/progress-repo';
import { findBook, listStudyCards } from '@/lib/word-repo';

function BackLink() {
  return (
    <a
      href="/"
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
  );
}

export default async function StudyPage({
  params,
}: {
  params: { bookId: string };
}) {
  const user = await currentUser();
  if (!user) notFound();

  const book = await findBook(params.bookId);
  if (!book) notFound();

  // 已有进度 → 从 lastWordRank 之后开始；没有 → 从头开始
  const progress = await findProgress(user.id, params.bookId);
  const afterRank = progress?.lastWordRank ?? 0;

  const cards = await listStudyCards(params.bookId, afterRank, 200);

  // 已学完：lastWordRank 已经是最后一个，后面没有词了
  if (cards.length === 0) {
    return (
      <div className="mx-auto flex min-h-[100dvh] w-full max-w-app flex-col bg-white px-5 py-4">
        <BackLink />
        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <p className="text-sm text-slate-500">
            《{book.title}》已全部学完
          </p>
          <a
            href="/"
            className="mt-6 rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-medium text-white"
          >
            回到首页
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-[100dvh] w-full max-w-app flex-col bg-white px-5 py-4">
      <BackLink />
      <WordCard
        cards={cards}
        startIndex={afterRank}
        total={book.wordCount}
        bookId={params.bookId}
        bookTitle={book.title}
      />
    </div>
  );
}
