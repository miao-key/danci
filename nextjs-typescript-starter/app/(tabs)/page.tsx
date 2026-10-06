/**
 * 首页（proposal 5.2）。
 *
 * 两种形态由登录态决定：
 *   - 已登录：Greeting Bar + 「最近学习」（有数据才渲染）+ 「全部单词书」
 *   - 未登录：只有「全部单词书」，点任一项 → /me?login=1 弹登录窗
 *
 * ## 「最近学习」为什么 SSR 直读而不是客户端 fetch
 *
 * 决策：**SSR 直读服务层做首屏 + 同时提供 `GET /api/study/recent`**。
 *
 * 理由：验收 A6 要求「无进度时连标题一起不渲染」。若改成客户端
 * onMount 后 fetch，首屏必然要渲染一个 loading 骨架，等数据回来才消失 ——
 * 新用户每次进首页都会看到一次内容闪烁。SSR 直读在服务端就判定好
 * 有没有数据，首屏即最终态。
 *
 * 那个 API 不是重复劳动，而是同一份**服务层逻辑**的对外出口：
 * `loadRecentStudy()` 被本页和 API route 共同调用（lib/study-service.ts），
 * 字段口径天然一致，原生端 / 小程序端可直接复用。
 *
 * ⚠️ 空数据整块不渲染：recent 为 null 时连标题一起不渲染
 *    （proposal 5.2.2 / design.md 12.2 验收 A6）。
 */
import { AuthPopup } from '@/components/auth-popup';
import { BookCard } from '@/components/book-card';
import { RecentStudyCard } from '@/components/recent-study-card';
import { currentUser } from '@/lib/auth';
import { loadRecentStudy } from '@/lib/study-service';
import { listBookList } from '@/lib/word-repo';

export default async function HomePage({
  searchParams,
}: {
  searchParams: { login?: string };
}) {
  const [user, books] = await Promise.all([currentUser(), listBookList()]);

  // 未登录时不需要查进度
  const recentResult = user ? await loadRecentStudy(user.id) : null;

  // 'none' → 没学过；'book-deleted' → 书被后台删了（孤儿进度）。
  // 两种都按「无数据」处理，验收 A6 要求整块不渲染。
  const showRecent = recentResult?.kind === 'found';
  const recent = showRecent ? recentResult.data : null;

  return (
    <div className="space-y-7">
      {/* 顶部 Greeting Bar */}
      {user ? (
        <p className="text-sm text-slate-500">
          Hello,{' '}
          <span className="font-medium text-slate-700">
            {user.email}
          </span>
        </p>
      ) : (
        <h1 className="text-lg font-semibold tracking-tight text-slate-900">
          学英语单词
        </h1>
      )}

      {/* 最近学习：无数据整块不渲染（含标题） */}
      {recent ? (
        <section className="space-y-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900">最近学习</h2>
            <p className="mt-0.5 text-xs text-slate-500">继续上次的单词书</p>
          </div>
          <RecentStudyCard recent={recent} />
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
