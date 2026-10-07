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
 * ## 「?at=N」定位参数（修复「详情页返回后回到第 1 个」Bug）
 *
 * 用户在 `/study/[bookId]` 看第 N 张卡时点「查看详情」→ 进入
 * `/word/[bookId]/[wordId]` → 点「返回」→ 跳到
 * `/study/[bookId]?at=N`。这里 `at` 优先级**高于** `fromLast`：
 *   - `?at=N` 有效 → 直接把 N-1 作为 afterRank，定位到第 N 张卡
 *   - 否则 → 走 `fromLast`（按 user_book_progress 续学）
 *
 * ⚠️ `?at` 不参与 lastWordRank 写回：它只决定**当前**学习页显示哪张
 *    卡 —— 真正写回进度的还是 touchWordAction 里的 lastWordRank。
 *    即使用户用 `?at=999` 跳到书末尾，再点「下一个」，lastWordRank
 *    也只按实际学到的 rank 推进。
 *
 * ⚠️ 本路由在 `auth.config.ts` 的 PROTECTED_PREFIXES 白名单里，
 *    未登录会被 NextAuth 拦到 /login；这里的 currentUser() 是双保险。
 */
import { notFound } from 'next/navigation';
import { WordCard } from '@/components/word-card';
import { currentUser } from '@/lib/auth';
import { BookNotFoundError, INITIAL_BATCH_SIZE, loadStudyCards } from '@/lib/study-service';

/**
 * 把 `?at=N` 解析成合法的「要看的单词在书内的 rank」。
 *
 * 防御性解析：
 *   - 非数字、负数、0、超过 wordCount 都视作「无效」→ 返回 null，
 *     让调用方回退到 fromLast 路径。
 *   - 限定 ≤ 200000：词书的 wordCount 实际最大几千，纯粹兜底。
 */
function parseAtRank(
  raw: string | string[] | undefined,
  wordCount: number,
): number | null {
  if (!raw) return null;
  const s = Array.isArray(raw) ? raw[0] : raw;
  const n = Number(s);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 1 || n > 200000) {
    return null;
  }
  if (n > wordCount) return null;
  return n;
}

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
  searchParams,
}: {
  params: { bookId: string };
  searchParams: { at?: string | string[] };
}) {
  const user = await currentUser();
  if (!user) notFound();

  // 起点优先级：`?at=N` > `fromLast`（统一续学）> 0
  //
  // 1. 先不带 afterRange 调一次 loadStudyCards，取回 wordCount（用于校验 ?at）；
  //    此时 fromLast=true，会用 user_book_progress.lastWordRank 作为 afterRank。
  //    同时这一步返回的 batch.afterRank = lastWordRank，刚好可以
  //    推算出「不传 ?at 时用户应该看的 rank = lastWordRank + 1」。
  // 2. 决定 viewRank：
  //      - ?at 合法 → viewRank = atRank
  //      - 否则    → viewRank = batch.afterRank + 1
  // 3. 用 viewRank 反推 afterRank，**只**做一次最终加载：
  //      - viewRank > 1（书的中间）：afterRank = viewRank - 2，让 cards[0] =
  //        「上一张」，cards[1] = 用户真正要看的那张（详见下方 prependPrev
  //        块注释）。
  //      - viewRank === 1（全书首张）：afterRank = 0。
  //
  // 为什么不用 ?at 单独先 load 一次？
  //   旧实现里 ?at 的第一发 load 用的是 atRank - 1，第二发 prependPrev
  //   才会改为 atRank - 2。两次 SQL 浪费，现在直接合成一次。

  let resumeBatch;
  try {
    resumeBatch = await loadStudyCards(user.id, params.bookId, {
      fromLast: true,
      limit: INITIAL_BATCH_SIZE,
    });
  } catch (err) {
    if (err instanceof BookNotFoundError) notFound();
    throw err;
  }

  const atRank = parseAtRank(searchParams.at, resumeBatch.wordCount);
  // 「用户真正要看的那张卡」在书内的 rank（1-indexed）。
  //   - ?at=N → 直接 N
  //   - 否则 → lastWordRank + 1（first 学时 lastWordRank = 0 → 1）
  const viewRank = atRank !== null ? atRank : resumeBatch.afterRank + 1;

  // 越界（viewRank > wordCount）→ 已学完最后一张，不要再加载：
  // 旧的「从 fromLast batch 判断 cards.length === 0」在 prependPrev
  // 之后会变成有 1 张（最后一卡），把 FinishedState 给吞掉。
  // 这里在源头拦下，让 FinishedState 逻辑保持在「cards 为空」这一
  // 简单语义上。
  if (viewRank > resumeBatch.wordCount) {
    return <FinishedState title={resumeBatch.bookTitle} />;
  }

  // 「上一个」能用的最小代价：在 batch 前面**最多**塞 1 张「上一张卡」。
  // 触发条件：**viewRank > 1**（用户已经在书的中间，第 N 张之前至少有
  // 1 张）。这样 cards[1] 才是「用户真正要看的那张」（rank = viewRank），
  // cards[0] 是 rank = viewRank - 1 的「上一张」，让 WordCard 的初始
  // i = 1 → 进站即看到原卡、「上一个」按钮可见可点。
  //
  // 不这样做的代价是「用户从详情返回后 '上一个' 按钮直接消失」：
  // 因为 cards[0] 就是「当前卡」，没有更前面的卡可回退，WordCard
  // 只能把按钮藏起来 —— 但用户的心理预期是「我刚才明明看到过这张卡
  // 之前的那张」。
  //
  // viewRank === 1 时已经是全书第 1 张卡，前面没有「上一张」可塞。
  const prependPrev = viewRank > 1;

  // 最终 afterRank：保证 cards[1].wordRank = viewRank（如果 prependPrev）
  // 或 cards[0].wordRank = viewRank（否则）。
  const finalAfterRank = prependPrev ? viewRank - 2 : viewRank - 1;

  let batch;
  try {
    batch = await loadStudyCards(user.id, params.bookId, {
      afterRank: finalAfterRank,
      limit: INITIAL_BATCH_SIZE,
    });
  } catch (err) {
    if (err instanceof BookNotFoundError) notFound();
    throw err;
  }

  // WordCard 在 prependPrev 时初始 i 应为 1（让 cards[1] 正好是 viewRank）；
  // 否则初始 i = 0（首进或 viewRank = 1）。
  // 这里显式传，避免 WordCard 拿 startIndex 反推时遇到 prependPrev=true 且
  // viewRank=2（startIndex=0）的边界漏掉。
  const initialIndex = prependPrev ? 1 : 0;

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
        initialIndex={initialIndex}
        total={batch.wordCount}
        hasMore={batch.hasMore}
        bookId={batch.bookId}
        bookTitle={batch.bookTitle}
      />
    </div>
  );
}
