/**
 * 单词卡片（学习页，proposal 5.5.2）。
 *
 * ## 极简原则
 *
 * 需求明确"只展示最少信息"，所以卡片**只渲染 4 个元素**：
 * 序号、单词本体、音标、**一条**中文释义。
 * 例句 / 短语 / 近义词 / 同根词全部下沉到详情页（验收 A8）。
 *
 * ## 为什么切换是纯客户端
 *
 * 词卡列表由服务端一次算好传下来，切词只改本地 state，
 * 零网络请求 —— 满足 design.md 12.3「切换单词 < 100ms」。
 */
'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { saveProgressAction, touchWordAction } from '@/app/actions/study-actions';
import type { StudyCard } from '@/lib/word-repo';

export function WordCard({
  cards,
  startIndex,
  total,
  bookId,
  bookTitle,
}: {
  cards: StudyCard[];
  /** 第 1 张卡在全书中的序号偏移（= 已学过的数量） */
  startIndex: number;
  /** 全书总词数，作为「第 N / M 个」的分母 */
  total: number;
  bookId: string;
  bookTitle: string;
}) {
  const [i, setI] = useState(0);
  const [isPending, startTransition] = useTransition();
  const [toast, setToast] = useState<string | null>(null);
  const router = useRouter();

  const card = cards[i];
  const isLast = i === cards.length - 1;

  function handleNext() {
    if (isLast) {
      // 完成本课：写回进度 → 轻提示 → 回首页
      const fd = new FormData();
      fd.set('bookId', bookId);
      fd.set('lastWordId', card.wordId);
      fd.set('lastWordRank', String(card.wordRank));

      startTransition(async () => {
        await saveProgressAction(fd);
        setToast(`已完成《${bookTitle}》本课学习`);
        // 轻提示 2 秒后自动消失并回首页
        setTimeout(() => {
          router.push('/');
          router.refresh();
        }, 2000);
      });
      return;
    }

    // 非末尾：先记录当前单词已学，再切下一张
    const fd = new FormData();
    fd.set('wordId', card.wordId);
    fd.set('bookId', bookId);
    fd.set('wordRank', String(card.wordRank));
    startTransition(async () => {
      await touchWordAction(fd);
    });
    setI((v) => v + 1);
  }

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
      </div>

      {/* 双按钮 */}
      <div className="flex gap-3 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-8">
        <Link
          href={`/word/${bookId}/${card.bizWordId}`}
          className="flex-1 rounded-xl border border-slate-200 bg-white py-3 text-center text-sm text-slate-600 transition-colors active:bg-slate-50"
        >
          查看详情
        </Link>
        <button
          type="button"
          onClick={handleNext}
          disabled={isPending}
          className="flex-1 rounded-xl bg-brand-600 py-3 text-sm font-medium text-white transition-colors active:bg-brand-700 disabled:opacity-60"
        >
          {isPending ? '处理中…' : isLast ? '完成本课' : '下一个 ›'}
        </button>
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
