/**
 * 「我的」页未登录时的内容：登录弹窗 + 兜底正文。
 *
 * 为什么要单独抽成 Client Component：
 *   弹窗的开合状态必须有地方存 —— AuthPopup 是受控组件，状态在父组件手里。
 *   /me 的正文是 Server Component 渲染的，存不了，所以由本组件持有。
 *
 * 两处必须成对出现，缺一不可：
 *   <AuthPopup open={popupOpen} onClose={...} />
 *   - open 让「去登录」能原地重开弹窗；
 *   - onClose 让点遮罩/× 能真正关掉（少了它 × 完全没反应）。
 *
 * @param autoPopup 首次渲染是否自动弹窗（未登录访问 /me 时为 true）
 */
'use client';

import { useState } from 'react';
import { AuthPopup } from '@/components/auth-popup';

export function MeGuestPanel({ autoPopup }: { autoPopup: boolean }) {
  const [popupOpen, setPopupOpen] = useState(autoPopup);

  return (
    <div className="space-y-7">
      {/* 受控：open 管打开，onClose 管关闭 */}
      <AuthPopup
        defaultTab="login"
        open={popupOpen}
        onClose={() => setPopupOpen(false)}
      />

      <section className="space-y-3">
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-slate-900">
            我的
          </h1>
          <p className="mt-0.5 text-xs text-slate-500">登录后可查看学习进度</p>
        </div>

        {/* 登录引导卡 */}
        <div className="space-y-4 rounded-2xl bg-white p-6 text-center shadow-sm">
          <p className="text-sm text-slate-500">未登录</p>
          <button
            type="button"
            onClick={() => setPopupOpen(true)}
            className="inline-block rounded-xl bg-brand-50 px-4 py-2 text-sm font-medium text-brand-600 active:bg-brand-100"
          >
            去登录
          </button>
        </div>
      </section>
    </div>
  );
}
