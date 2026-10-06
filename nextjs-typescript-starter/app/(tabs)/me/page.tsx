/**
 * 我的页（proposal 5.4）。
 *
 * 未登录 → 弹登录窗（5.4.1），并垫一层兜底正文。
 * 已登录 → 个人信息卡 + 学习进度列表 + 退出登录。
 *
 * ⚠️ 为什么要垫内容（历史 bug：关掉弹窗后停在 /me 的空白页）：
 *   `AuthPopup` 关闭时渲染 `null`。若这里 `if (!user) return <AuthPopup />`，
 *   未登录用户在弹窗关闭后就会得到一个**什么都不渲染的 /me 页面** ——
 *   地址栏没变、Tab Bar 还在，但正文是空的，用户像是被卡住了。
 *   所以未登录时也要渲染正文（见 components/me-guest-panel.tsx）。
 *
 * 未登录分支整体交给 <MeGuestPanel>：它在客户端持有弹窗开关，
 * 所以关掉后点「去登录」能**在当前页原地重开**，不必跳回首页。
 */
import Link from 'next/link';
import { BookCover } from '@/components/book-cover';
import { LogoutButton } from '@/components/logout-button';
import { MeGuestPanel } from '@/components/me-guest-panel';
import { currentUser } from '@/lib/auth';
import { loadProgressList } from '@/lib/study-service';

export default async function MePage() {
  const user = await currentUser();

  if (!user) {
    // 未登录一律自动弹窗 —— 不管是直接访问 /me，还是首页点书跳来的
    // /me?login=1，两种入口的体验应该一致。
    return <MeGuestPanel autoPopup />;
  }

  // 书被后台删掉会留下孤儿进度（title 为 null），不展示
  const progresses = (await loadProgressList(user.id)).filter(
    (p) => p.title !== null,
  );
  const learnedBooks = progresses.length;
  const initial = (user.displayName || user.email).charAt(0).toUpperCase();

  return (
    <div className="space-y-7">
      {/* 个人信息卡 */}
      <header className="flex items-center gap-3 rounded-2xl bg-white p-4 shadow-sm">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-brand-600 text-lg font-semibold text-white">
          {initial}
        </div>
        <div className="min-w-0">
          <p className="truncate font-semibold text-slate-900">{user.email}</p>
          <p className="mt-0.5 text-sm text-slate-500">
            已学习 {learnedBooks} 本单词书
          </p>
        </div>
      </header>

      {/* 学习进度 */}
      <section className="space-y-3">
        <h2 className="text-base font-semibold text-slate-900">学习进度</h2>

        {progresses.length === 0 ? (
          // 空状态文案是需求明确要求的引导，不属于「空数据占位」
          <div className="space-y-4 rounded-2xl bg-white p-6 text-center shadow-sm">
            <p className="text-sm text-slate-500">
              还没有学习记录，去首页挑一本单词书开始吧
            </p>
            <Link
              href="/"
              className="inline-block rounded-xl bg-brand-50 px-4 py-2 text-sm font-medium text-brand-600"
            >
              去看看
            </Link>
          </div>
        ) : (
          <ul className="space-y-3">
            {progresses.map((p) => {
              // percent 已由 loadProgressList 算好并做了除零与 100% 上限保护
              return (
                <li
                  key={p.bookId}
                  className="rounded-2xl bg-white p-4 shadow-sm"
                >
                  <div className="flex items-center gap-3">
                    <BookCover
                      bookId={p.bookId}
                      title={p.title ?? p.bookId}
                      coverUrl={p.coverUrl}
                      size={40}
                    />
                    <p className="min-w-0 flex-1 truncate text-[15px] font-medium text-slate-900">
                      {p.title ?? p.bookId}
                    </p>
                    <Link
                      href={`/study/${p.bookId}`}
                      className="shrink-0 text-xs font-medium text-brand-600"
                    >
                      继续学习 →
                    </Link>
                  </div>

                  <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-brand-600"
                      style={{ width: `${p.percent}%` }}
                      role="progressbar"
                      aria-valuenow={p.percent}
                      aria-valuemin={0}
                      aria-valuemax={100}
                    />
                  </div>
                  <p className="mt-1.5 text-xs text-slate-500">
                    已学 {p.learnedCount} / {p.wordCount}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* 退出登录 */}
      <LogoutButton />
    </div>
  );
}
