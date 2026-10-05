/**
 * 首页（proposal 5.2）。
 *
 * 两种形态由登录态决定：
 *   - 已登录：Greeting Bar + 「最近学习」（有数据才渲染）+ 「全部单词书」
 *   - 未登录：只有「全部单词书」，点任一项 → /me?login=1 弹登录窗
 *
 * ⚠️ 空数据整块不渲染：recent 为 null 时连标题一起不渲染
 *    （proposal 5.2.2 / design.md 12.2 验收 A6）。
 */
import { AuthPopup } from '@/components/auth-popup';
import { BookCard } from '@/components/book-card';
import { RecentStudyCard } from '@/components/recent-study-card';
import { currentUser } from '@/lib/auth';
import { getRecentProgress } from '@/lib/progress-repo';
import { listBookList } from '@/lib/word-repo';

export default async function HomePage({
  searchParams,
}: {
  searchParams: { login?: string };
}) {
  const [user, books] = await Promise.all([currentUser(), listBookList()]);

  // 未登录时不需要查进度
  const recent = user ? await getRecentProgress(user.id) : null;
  // 书被后台删掉会留下孤儿进度（title 为 null），此时当"无数据"处理
  const showRecent = recent !== null && recent.title !== null;

  return (
    <div className="space-y-7">
      {/* 顶部 Greeting Bar */}
      {user ? (
        <p className="text-sm text-slate-500">
          Hello,{' '}
          <span className="font-medium text-slate-700">
            {user.displayName}
          </span>
        </p>
      ) : (
        <h1 className="text-lg font-semibold tracking-tight text-slate-900">
          学英语单词
        </h1>
      )}

      {/* 最近学习：无数据整块不渲染（含标题） */}
      {showRecent && recent ? (
        <section className="space-y-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900">最近学习</h2>
            <p className="mt-0.5 text-xs text-slate-500">继续上次的单词书</p>
          </div>
          <RecentStudyCard progress={recent} />
        </section>
      ) : null}

      {/* 全部单词书 */}
      <section className="space-y-3">
        <h2 className="text-base font-semibold text-slate-900">全部单词书</h2>
        <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl bg-white shadow-sm">
          {books.map((b) => (
            <li key={b.bookId}>
              <BookCard
                book={b}
                /* 未登录 → 跳 /me?login=1，由该页自动弹出登录窗 */
                href={user ? `/study/${b.bookId}` : '/me?login=1'}
              />
            </li>
          ))}
        </ul>
      </section>

      {/* 未登录且带 login 参数时（例如直接访问 /?login=1）也弹窗。
          ⚠️ 必须显式传 autoOpen —— AuthPopup 的 open 默认 false，
             组件本身没有「有 login 参数就弹」的默认行为。 */}
      {!user && searchParams.login ? (
        <AuthPopup defaultTab="login" autoOpen />
      ) : null}
    </div>
  );
}
