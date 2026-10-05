/**
 * 登录 / 注册弹窗（proposal 5.3）。
 *
 * 触发场景：
 *   1. 未登录用户在首页点任意单词书 → 跳到 /me?login=1 → 该页渲染本组件；
 *   2. 未登录直接访问 /me（兜底），也自动弹。
 *
 * 关闭行为（5.3.3）：
 *   - 点遮罩或右上角 × 关闭；关闭时把 `?login=1` 一并清掉，
 *     否则刷新页面弹窗又会自动打开。
 *
 * ⚠️ open 采用「受控优先」模式（原来只有 autoOpen 一次性行为，关闭后
 *    再也弹不回来，导致 /me 的「去登录」只能跳回首页重新触发）：
 *      - 传了 open → 完全由父组件决定开合，**且必须在受控模式下传 onClose**，
 *        否则点 × 不会有任何反应（子组件无权改父组件的状态）；
 *      - 没传 open → 退化为 autoOpen 的一次性行为（保持旧调用方兼容）。
 *
 * 表单复用 `components/auth-form.tsx`，与整页 /login、/register
 * 走完全同一批 Server Action（design.md 8.1「复用鉴权」）。
 */
'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { AuthForm } from '@/components/auth-form';
import type { AuthTab } from '@/lib/constants';

export function AuthPopup({
  defaultTab = 'login',
  /** 首次挂载时是否自动打开（仅在未传 open 时生效） */
  autoOpen = false,
  /** 受控开关：传了就由父组件决定开合，不传则用内部状态 */
  open: controlledOpen,
  /** 受控模式下点遮罩/× 的回传；未传时本组件自行关闭 */
  onClose,
}: {
  defaultTab?: AuthTab;
  autoOpen?: boolean;
  open?: boolean;
  onClose?: () => void;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<AuthTab>(defaultTab);
  const [internalOpen, setInternalOpen] = useState(autoOpen);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;

  const close = () => {
    // 受控模式：状态在父组件手里，这里必须回传，否则 × 点了没反应。
    if (isControlled) {
      onClose?.();
    } else {
      setInternalOpen(false);
    }
    // 清理 ?login=1，避免刷新后弹窗又自动打开。
    // 只在非受控模式下调 URL —— 受控模式的开关由父组件持有，
    // 父组件会自己记住「已关过」，这里改 URL 只会白白触发一次服务端重渲染。
    if (!isControlled && window.location.search.includes('login=1')) {
      router.replace(window.location.pathname, { scroll: false });
    }
  };

  // 关闭后渲染 null，底下的正文会露出来（app/(tabs)/me/page.tsx）
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-6">
      {/* 遮罩：点它关闭（proposal 5.3.3） */}
      <button
        type="button"
        aria-label="关闭"
        onClick={close}
        className="absolute inset-0 bg-slate-900/45 backdrop-blur-[2px]"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={tab === 'login' ? '登录' : '注册'}
        className="relative w-full max-w-sm overflow-hidden rounded-2xl bg-white shadow-xl"
      >
        {/* 顶部 Tab 切换 */}
        <div className="relative flex border-b border-slate-100">
          {(['login', 'register'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`flex-1 py-3.5 text-sm transition-colors ${
                tab === t
                  ? 'font-semibold text-brand-600'
                  : 'font-medium text-slate-400'
              }`}
            >
              {t === 'login' ? '登录' : '注册'}
              {tab === t ? (
                <span className="absolute inset-x-0 bottom-0 mx-auto h-0.5 w-12 rounded-full bg-brand-600" />
              ) : null}
            </button>
          ))}
          <button
            type="button"
            onClick={close}
            aria-label="关闭弹窗"
            className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-full p-2 text-slate-400 active:bg-slate-100"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              className="h-4 w-4"
              aria-hidden="true"
            >
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        {/* 表单 */}
        <div className="px-5 pb-5 pt-4">
          <p className="mb-4 text-center text-xs text-slate-400">
            {tab === 'login' ? '登录后自动记录学习进度' : '注册后即可开始学习'}
          </p>

          <AuthForm mode={tab} />

          {/* 底部次级文案：切到另一个 Tab */}
          <button
            type="button"
            onClick={() => setTab(tab === 'login' ? 'register' : 'login')}
            className="mt-4 w-full text-center text-xs text-slate-500"
          >
            {tab === 'login' ? (
              <>
                还没有账号？{' '}
                <span className="font-medium text-brand-600">去注册</span>
              </>
            ) : (
              <>
                已有账号？{' '}
                <span className="font-medium text-brand-600">去登录</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
