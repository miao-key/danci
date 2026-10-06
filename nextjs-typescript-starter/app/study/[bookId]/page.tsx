/**
 * 学习页（proposal 5.5）。
 *
 * ## 起始位置在服务端算好
 *
 * 「从最近学习的单词的**下一个**开始」不能在前端做，否则要把整本书
 * 载入内存。服务端读 `user_book_progress.lastWordRank` 后直接查
 * `wordRank > ?`，客户端只负责左右切换。
 *
 * ## 为什么要走 Service 层而不是直接调仓储
 *
 * 首页的 `/api/study/[bookId]/cards` 与本页共用
 * `lib/study-service.ts` 的 loadStudyCards，保证两边算出的
 * `afterRank` / `hasMore` / `wordCount` 完全一致 —— 否则会出现
 * 「页面说还有下一批、API 说没有」这种对不上的状态。
 *
 * ⚠️ 本路由在 `auth.config.ts` 的 PROTECTED_PREFIXES 白名单里，
 *    未登录会被 NextAuth 拦到 /login；这里的 currentUser() 是双保险。
 */
import { notFound } from 'next/navigation';
import { WordCard } from '@/components/word-card';
import { currentUser } from '@/lib/auth';
import { BookNotFoundError, INITIAL_BATCH_SIZE, loadStudyCards } from '@/lib/study-service';

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

function FinishedState({ title }: { title: string }) {
  return (
    <div className="mx-auto flex min-h-[100dvh] w-full max-w-app flex-col bg-white px-5 py-4">
      <BackLink />
      <div className="flex flex-1 flex-col items-center justify-center text-center">
        <p className="text-sm text-slate-500">《{title}》已全部学完</p>
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

export default async function StudyPage({
  params,
}: {
  params: { bookId: string };
}) {
  const user = await currentUser();
  if (!user) notFound();

  // fromLast: true —— 无论从「最近学习」还是「全部单词书」进入，
  // 都按该用户的上次进度续学（决策：统一续学）。
  let batch;
  try {
    batch = await loadStudyCards(user.id, params.bookId, {
      fromLast: true,
      limit: INITIAL_BATCH_SIZE,
    });
  } catch (err) {
    if (err instanceof BookNotFoundError) notFound();
    throw err;
  }

  // 后面没有词了 —— 真的学完
  if (batch.cards.length === 0) {
    return <FinishedState title={batch.bookTitle} />;
  }

  return (
    <div className="mx-auto flex min-h-[100dvh] w-full max-w-app flex-col bg-white px-5 py-4">
      <BackLink />
      <WordCard
        cards={batch.cards}
        startIndex={batch.afterRank}
        total={batch.wordCount}
        hasMore={batch.hasMore}
        bookId={batch.bookId}
        bookTitle={batch.bookTitle}
      />
    </div>
  );
}
