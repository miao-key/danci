/**
 * 底部 Tab Bar。
 *
 * 只在 `(tabs)` 路由组下的 `/` 和 `/me` 渲染 ——
 * 由 `app/(tabs)/layout.tsx` 决定，不需要在这里判断 pathname 是否属于 tab 页
 * （`/study/*`、`/word/*` 根本不经过这个 layout）。
 *
 * 固定定位的实现细节：
 *   - `fixed inset-x-0 bottom-0` + `mx-auto max-w-app`：桌面端居中不拉伸；
 *   - `pb-[env(safe-area-inset-bottom)]`：iPhone 全面屏底部 Home Indicator 避让；
 *   - 页面主体用 `pb-24` 留出等高的滚动空间，避免最后一项被遮住。
 */
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS = [
  { href: '/', label: '首页' },
  { href: '/me', label: '我的' },
] as const;

/** 首页图标：屋顶 + 门 */
function HomeIcon({ active }: { active: boolean }) {
  const fill = active ? 'currentColor' : 'none';
  return (
    <svg
      viewBox='0 0 24 24'
      fill='none'
      stroke='currentColor'
      strokeWidth={1.8}
      strokeLinecap='round'
      strokeLinejoin='round'
      className='h-6 w-6'
      aria-hidden='true'
    >
      <path d='M3 10.5 12 3l9 7.5' fill={fill} />
      <path d='M5.5 9.5V20h13V9.5' fill={fill} />
      <path d='M9.75 20v-5.5h4.5V20' />
    </svg>
  );
}

/** 我的图标：头 + 肩 */
function UserIcon({ active }: { active: boolean }) {
  const fill = active ? 'currentColor' : 'none';
  return (
    <svg
      viewBox='0 0 24 24'
      fill='none'
      stroke='currentColor'
      strokeWidth={1.8}
      strokeLinecap='round'
      strokeLinejoin='round'
      className='h-6 w-6'
      aria-hidden='true'
    >
      <circle cx={12} cy={8} r={3.75} fill={fill} />
      <path
        d='M4.5 20c0-3.6 3.4-5.5 7.5-5.5s7.5 1.9 7.5 5.5'
        fill={fill}
      />
    </svg>
  );
}

export function TabBar() {
  const pathname = usePathname();

  return (
    <nav
      className='fixed inset-x-0 bottom-0 z-40 mx-auto w-full max-w-app border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur'
      aria-label='主导航'
    >
      <ul className='grid grid-cols-2'>
        {TABS.map((t) => {
          const active =
            t.href === '/' ? pathname === '/' : pathname.startsWith(t.href);
          const Icon = t.href === '/' ? HomeIcon : UserIcon;
          return (
            <li key={t.href}>
              <Link
                href={t.href}
                aria-current={active ? 'page' : undefined}
                className={`flex h-14 flex-col items-center justify-center gap-0.5 text-[11px] transition-colors ${
                  active
                    ? 'font-semibold text-brand-600'
                    : 'font-medium text-slate-400'
                }`}
              >
                <Icon active={active} />
                <span>{t.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
