/**
 * 底部 Tab 容器。
 *
 * 放在**路由组** `(tabs)` 下而不是根布局，这样：
 *   - `/`、`/me` 共享同一个 layout，Tab 切换不重渲染公共部分；
 *   - `/study/*`、`/word/*`、`/login`、`/register` 物理上不经过这里，
 *     天然没有 Tab Bar（proposal 3 的路由要求），无需 usePathname 判断。
 */
import { TabBar } from '@/components/tab-bar';

export default function TabsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto flex min-h-[100dvh] w-full max-w-app flex-col bg-slate-50">
      <main className="flex-1 px-4 pb-24 pt-5">{children}</main>
      <TabBar />
    </div>
  );
}
