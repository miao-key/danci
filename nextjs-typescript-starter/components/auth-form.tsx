/**
 * 登录 / 注册表单（被登录页、注册页、登录弹窗三处共用）。
 *
 * 「复用鉴权：登录/注册 Server Action 直接迁移到弹窗组件中使用，不重复实现」
 * —— proposal 8.1。这三处调用的都是同一批 Server Action。
 */
'use client';

import { useFormState, useFormStatus } from 'react-dom';
import {
  loginAction,
  registerAction,
  type AuthState,
} from '@/app/actions/auth-actions';
import type { AuthTab } from '@/lib/constants';

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-xl bg-brand-600 py-3 text-sm font-medium text-white transition-colors active:bg-brand-700 disabled:opacity-60"
    >
      {pending ? '处理中…' : label}
    </button>
  );
}

function Field({
  label,
  error,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  error?: string;
}) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-slate-600">{label}</span>
      <input
        {...props}
        className={`mt-1.5 block w-full appearance-none rounded-xl border bg-white px-3.5 py-2.5 text-[15px] placeholder-slate-400 focus:outline-none focus:ring-2 ${
          error
            ? 'border-red-300 focus:border-red-400 focus:ring-red-100'
            : 'border-slate-200 focus:border-brand-400 focus:ring-brand-100'
        }`}
      />
      {error ? (
        <span className="mt-1 block text-xs text-red-500">{error}</span>
      ) : null}
    </label>
  );
}

const EMPTY_STATE: AuthState = {};

export function AuthForm({ mode }: { mode: AuthTab }) {
  const [loginState, loginFormAction] = useFormState<AuthState, FormData>(
    loginAction,
    EMPTY_STATE,
  );
  const [registerState, registerFormAction] = useFormState<AuthState, FormData>(
    registerAction,
    EMPTY_STATE,
  );

  const isLogin = mode === 'login';
  const state = isLogin ? loginState : registerState;

  return (
    <form
      action={isLogin ? loginFormAction : registerFormAction}
      className="space-y-3.5"
    >
      <Field
        label="邮箱"
        name="email"
        type="email"
        autoComplete="email"
        placeholder="you@example.com"
        required
        error={state.fieldErrors?.email}
      />
      <Field
        label="密码"
        name="password"
        type="password"
        autoComplete={isLogin ? 'current-password' : 'new-password'}
        placeholder={isLogin ? '••••••••' : '至少 8 位'}
        required
        minLength={isLogin ? undefined : 8}
        error={state.fieldErrors?.password}
      />
      {state.error ? (
        <p className="text-xs text-red-500">{state.error}</p>
      ) : null}
      <div className="pt-1">
        <SubmitButton label={isLogin ? '登 录' : '注 册'} />
      </div>
    </form>
  );
}
