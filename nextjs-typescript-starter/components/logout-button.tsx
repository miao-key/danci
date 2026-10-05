/**
 * 退出登录按钮 + 二次确认弹窗（proposal 5.4.2 第 3 条）。
 *
 * 确认后调用 `logoutAction()` → signOut 并跳回 `/`。
 */
'use client';

import { useState } from 'react';
import { useFormStatus } from 'react-dom';
import { logoutAction } from '@/app/actions/auth-actions';

function ConfirmButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-xl bg-red-600 py-3 text-sm font-medium text-white transition-colors active:bg-red-700 disabled:opacity-60"
    >
      {pending ? '退出中…' : label}
    </button>
  );
}

export function LogoutButton() {
  const [confirming, setConfirming] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="w-full rounded-2xl border border-red-200 bg-white py-3.5 text-sm font-medium text-red-600 transition-colors active:bg-red-50"
      >
        退 出 登 录
      </button>

      {confirming ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-6">
          <button
            type="button"
            aria-label="取消"
            onClick={() => setConfirming(false)}
            className="absolute inset-0 bg-slate-900/45 backdrop-blur-[2px]"
          />
          <div
            role="alertdialog"
            aria-modal="true"
            aria-label="确认退出登录"
            className="relative w-full max-w-xs overflow-hidden rounded-2xl bg-white shadow-xl"
          >
            <div className="px-5 pb-4 pt-5 text-center">
              <p className="text-sm font-semibold text-slate-900">
                确定要退出登录吗？
              </p>
              <p className="mt-1.5 text-xs text-slate-500">
                学习进度会保留在账号中
              </p>
            </div>
            <div className="flex border-t border-slate-100">
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className="flex-1 py-3 text-sm font-medium text-slate-500 active:bg-slate-50"
              >
                取消
              </button>
              <form action={logoutAction} className="flex-1 border-l border-slate-100">
                <ConfirmButton label="退出" />
              </form>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
