/**
 * 单词卡片（学习页，proposal 5.5.2）。
 *
 * ## 极简原则
 *
 * 需求明确"只展示最少信息"，所以卡片**只渲染 4 个元素**：
 * 序号、单词本体、音标、**一条**中文释义。
 * 例句 / 短语 / 近义词 / 同根词全部下沉到详情页（验收 A8）。
 *
 * ## 为什么要「边学边加载」
 *
 * 单词书大小差异极大：`PEPXiaoXue6_1` 只有 130 词，`CET4_2` 有 3739 词。
 * 首屏固定只带 50 张卡（见 app/study/[bookId]/page.tsx 的 BATCH_SIZE），
 * 否则 3739 条词卡会一次性塞进 HTML。
 *
 * 剩下一批时按钮**不能**变成「完成本课」—— 否则用户学到第 50 个词
 * 会被误导成学完了一整本。所以：
 *   - 还有下一批 → 按钮仍叫「下一个」，并静默预取
 *   - 真的没有下一批 → 才显示「完成本课」
 *
 * 预取在离末尾还有 5 张时触发，等用户点到那里数据已经就位，体验上
 * 与无限滚动一致，且切词仍是纯本地 state（< 100ms，验收指标 12.3）。
 *
 * ## 三个必须注意的边界
 *
 * 1. **不能越界**：若已加载到末张但下一批还在加载中，此时点「下一个」
 *    不能让 index 超出数组（否则 `card` 为 undefined，页面整块变白）。
 *    所以按钮在这种情况下进入「加载中」禁用态。
 * 2. **游标必须单调前进**：请求用独立的 `cursor` state 而非
 *    `cards[cards.length-1].wordRank`。若某批全是已见过的词，
 *    追加后数组长度不变，用数组尾推导游标会永远停在原地 → 死循环。
 * 3. **连续失败 3 次即停止预取**并给出重试入口，避免无限重试打服务端。
 */
'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import { finishLessonAction, touchWordAction } from '@/app/actions/study-actions';
import type { StudyCard } from '@/lib/word-repo';

/** 离末尾还有几张时开始预取下一批 */
const PREFETCH_THRESHOLD = 5;
/** 单批拉取条数，与服务端 BATCH_SIZE 保持一致 */
const FETCH_BATCH = 50;
/** 连续失败几次后放弃自动预取 */
const MAX_RETRY = 3;

interface CardsResponse {
  data: {
    cards: StudyCard[];
    nextAfterRank: number;
    hasMore: boolean;
    wordCount: number;
  } | null;
  error?: { code: string; message: string };
}

export function WordCard({
  cards: initialCards,
  startIndex,
  initialIndex,
  total,
  hasMore: initialHasMore,
  bookId,
  bookTitle,
}: {
  cards: StudyCard[];
  /** 第 1 张卡在全书中的序号偏移（= 已学过的数量） */
  startIndex: number;
  /**
   * 起始 i（默认 0）。
   *
   * 服务端在两种场景下会刻意把 cards[0] 设为「上一张卡」：
   *   - `?at=N` 从详情页回来，且 N > 1（用户在书的中间）
   *   - `fromLast` 续学，且 lastWordRank > 0（用户已经学了一些）
   * 此时 cards[1] 才是「用户真正要看的那张」，服务端把
   * `initialIndex` 显式传成 1，保证进站即看到原卡，同时
   * 「上一个」按钮立刻可见可点（点完回退到 cards[0] = 上一张）。
   *
   * 首进或 `?at=1` 时传 0，沿用旧行为。
   */
  initialIndex?: number;
  /** 全书总词数，作为「第 N / M 个」的分母 */
  total: number;
  /** 首屏这批之后是否还有词 */
  hasMore: boolean;
  bookId: string;
  bookTitle: string;
}) {
  const [cards, setCards] = useState(initialCards);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [i, setI] = useState(() => {
    if (initialCards.length === 0) return 0;
    if (typeof initialIndex === 'number') return initialIndex;
    return 0;
  });

  /** 下一批的起点。独立于 cards 推导，保证单调前进（见文件头边界 2） */
  const [cursor, setCursor] = useState(
    initialCards.length > 0
      ? initialCards[initialCards.length - 1].wordRank
      : startIndex,
  );

  const [isPending, startTransition] = useTransition();
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const router = useRouter();

  /** 防止预取 effect 并发重复触发 */
  const loadingRef = useRef(false);

  const card = cards[i];
  const remaining = cards.length - i;
  /** 还有词可学：下一批有词，或当前批后面还有卡 */
  const canContinue = hasMore || remaining > 1;
  /** 已到当前批末张、但下一批还没到位 —— 按钮进禁用态而非越界 */
  const waitingForNextBatch = remaining <= 1 && hasMore;
  /** 「上一个」可见性：i > 0（不是当前批首张） */
  const hasPrev = i > 0;
  /** 「下一个」可见性：与 canContinue 同义 —— 还能往后学 */
  const hasNext = canContinue;

  /** 拉取下一批词卡并追加到本地列表 */
  const loadMore = useCallback(async () => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setIsLoadingMore(true);
    setError(null);

    try {
      const url = `/api/study/${encodeURIComponent(bookId)}/cards?afterRank=${
        cursor
      }&limit=${FETCH_BATCH}`;

      const res = await fetch(url, { credentials: 'include' });
      const json = (await res.json()) as CardsResponse;

      if (!res.ok || !json.data) {
        setError(json.error?.message ?? '加载失败');
        setRetryCount((n) => n + 1);
        return;
      }

      const batch = json.data.cards;
      // 游标无条件前进：即使这批全是重复词，nextAfterRank 也保证下次请求不同
      setCursor(json.data.nextAfterRank);
      setHasMore(json.data.hasMore);
      setRetryCount(0);

      if (batch.length === 0) {
        // 服务端说没有却返回空 —— 视为到底了，防止预取 effect 反复触发
        setHasMore(false);
        return;
      }

      setCards((prev) => {
        const seen = new Set(prev.map((c) => c.wordId));
        const fresh = batch.filter((c) => !seen.has(c.wordId));
        return fresh.length > 0 ? [...prev, ...fresh] : prev;
      });
    } catch {
      setError('网络异常');
      setRetryCount((n) => n + 1);
    } finally {
      loadingRef.current = false;
      setIsLoadingMore(false);
    }
  }, [bookId, cursor]);

  /** 接近末尾时预取下一批；连续失败超过上限则停止，交由用户手动重试 */
  useEffect(() => {
    if (hasMore && remaining <= PREFETCH_THRESHOLD && retryCount < MAX_RETRY) {
      void loadMore();
    }
  }, [hasMore, remaining, retryCount, loadMore]);

  function handleNext() {
    if (!card) return;

    // 末批学完 → 记录最后一个单词 + 写回进度
    if (!canContinue) {
      const fd = new FormData();
      fd.set('bookId', bookId);
      fd.set('lastWordId', card.wordId);
      fd.set('lastWordRank', String(card.wordRank));

      startTransition(async () => {
        try {
          // ⚠️ 用 finishLessonAction 而不是 saveProgressAction：
          // 后者不写 user_word_records，会让明细永远少最后一个词。
          await finishLessonAction(fd);
          setToast(`已完成《${bookTitle}》本课学习`);
          setTimeout(() => {
            router.push('/');
            router.refresh();
          }, 1500);
        } catch {
          setError('保存进度失败，请重试');
        }
      });
      return;
    }

    // 还有词：先记录当前单词已学，再切下一张
    const fd = new FormData();
    fd.set('wordId', card.wordId);
    fd.set('bookId', bookId);
    fd.set('wordRank', String(card.wordRank));
    startTransition(async () => {
      try {
        await touchWordAction(fd);
      } catch {
        setError('记录学习进度失败');
      }
    });
    setI((v) => v + 1);
  }

  /**
   * 「上一个」：纯本地回退，不发请求也不写进度。
   *
   * 设计取舍：
   *   - 当前卡 N 是「点过 N 的 下一个」之后才进的，所以 N 一定已经
   *     touch 过了，回退到 N-1 不需要回滚 user_word_records。
   *   - 但有一种边缘情况：用户从未点过「下一个」、直接点「查看详情」
   *     再回到学习页，此时 i=0，按钮根本不会渲染（见下方 hasPrev）。
   *   - 因此 handlePrev 只动 i，不碰服务端，UI 状态自洽。
   */
  function handlePrev() {
    if (i <= 0) return;
    setI((v) => v - 1);
    setError(null);
  }

  if (!card) return null;

  return (
    <div className="flex flex-1 flex-col">
      {/* 单词主体 */}
      <div className="flex flex-1 flex-col items-center justify-center px-2 text-center">
        <p className="text-sm text-slate-400">
          第 {startIndex + i + 1} / {total} 个
        </p>

        <p className="mt-10 break-words text-[44px] font-semibold leading-tight tracking-tight text-slate-900">
          {card.headWord}
        </p>

        {card.usphone ? (
          <p className="mt-3 text-lg text-slate-500">/{card.usphone}/</p>
        ) : null}

        {card.firstTranCn ? (
          <p className="mt-12 text-2xl leading-snug text-slate-800">
            {card.firstTranCn}
          </p>
        ) : null}

        {waitingForNextBatch || isLoadingMore ? (
          <p className="mt-8 text-xs text-slate-400">正在加载后续单词…</p>
        ) : null}

        {error ? (
          <button
            type="button"
            onClick={() => {
              setRetryCount(0);
              void loadMore();
            }}
            className="mt-8 text-xs text-brand-600 underline"
          >
            {error}（点击重试）
          </button>
        ) : null}
      </div>

      {/* 三按钮：上一个 / 查看详情 / 下一个（首末两端的按钮会随上下文隐藏） */}
      <div className="flex gap-3 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-8">
        {hasPrev ? (
          <button
            type="button"
            onClick={handlePrev}
            // 仅本地状态变更，不发请求，所以无需 isPending 禁用。
            // 预取仍在后台跑（见 useEffect），即使有 in-flight 也只是
            // 拉下一批词卡，不影响回退。
            className="flex-1 rounded-xl border border-slate-200 bg-white py-3 text-center text-sm text-slate-600 transition-colors active:bg-slate-50"
          >
            上一个
          </button>
        ) : null}

        <Link
          // ?from=wordRank 让详情页的「返回」能精准回到这张卡，
          // 而不是 lastWordRank 指示的位置（两者可能差 1：
          // 用户可能没点过「下一个」就进了详情页）。
          href={`/word/${bookId}/${card.bizWordId}?from=${card.wordRank}`}
          className="flex-1 rounded-xl border border-slate-200 bg-white py-3 text-center text-sm text-slate-600 transition-colors active:bg-slate-50"
        >
          查看详情
        </Link>

        {hasNext ? (
          <button
            type="button"
            onClick={handleNext}
            // 越界保护：下一批没到位时不允许推进（见文件头边界 1）
            disabled={isPending || (waitingForNextBatch && !isLoadingMore)}
            className="flex-1 rounded-xl bg-brand-600 py-3 text-sm font-medium text-white transition-colors active:bg-brand-700 disabled:opacity-60"
          >
            {isPending ? '处理中…' : waitingForNextBatch && !isLoadingMore ? '加载中…' : '下一个'}
          </button>
        ) : (
          // 末张卡：没有「下一个」，换成「完成本课」。
          // 用与「下一个」相同的 primary 样式，保持视觉权重一致。
          <button
            type="button"
            onClick={handleNext}
            disabled={isPending}
            className="flex-1 rounded-xl bg-brand-600 py-3 text-sm font-medium text-white transition-colors active:bg-brand-700 disabled:opacity-60"
          >
            {isPending ? '处理中…' : '完成本课'}
          </button>
        )}
      </div>

      {/* 完成轻提示 */}
      {toast ? (
        <div className="pointer-events-none fixed inset-x-0 bottom-24 z-50 flex justify-center px-6">
          <div className="rounded-full bg-slate-900/90 px-4 py-2 text-xs text-white shadow-lg">
            {toast}
          </div>
        </div>
      ) : null}
    </div>
  );
}
