/**
 * 登录整页。
 *
 * 保留此页有两个原因（proposal 3）：
 *   1. `auth.config.ts` 的 `pages.signIn` 指向它 —— 未登录直接敲
 *      `/study/xxx` 时 NextAuth 会把用户重定向到这里兜底；
 *   2. 需求要求"保留已有逻辑"。
 *
 * 表单逻辑与登录弹窗共用同一批 Server Action，不存在两套实现。
 */
import Link from 'next/link';
import { AuthForm } from '@/components/auth-form';

export default function LoginPage() {
  return (
    <div className="flex min-h-[100dvh] w-full items-center justify-center bg-slate-50 px-6">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <h1 className="text-xl font-semibold text-slate-900">登录</h1>
          <p className="mt-1.5 text-sm text-slate-500">
            登录后自动记录你的学习进度
          </p>
        </div>
        <div className="rounded-2xl bg-white p-5 shadow-sm">
          <AuthForm mode="login" />
        </div>
        <p className="mt-4 text-center text-sm text-slate-500">
          还没有账号？{' '}
          <Link href="/register" className="font-medium text-brand-600">
            立即注册
          </Link>
        </p>
      </div>
    </div>
  );
}
