/**
 * 注册整页。
 *
 * 注册成功后 `registerAction` 会**自动登录**并跳回 `/`，
 * 不再像旧实现那样 redirect 到 /login（proposal 5.3.2）。
 */
import Link from 'next/link';
import { AuthForm } from '@/components/auth-form';

export default function RegisterPage() {
  return (
    <div className="flex min-h-[100dvh] w-full items-center justify-center bg-slate-50 px-6">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <h1 className="text-xl font-semibold text-slate-900">注册</h1>
          <p className="mt-1.5 text-sm text-slate-500">
            创建账号，开始你的单词学习
          </p>
        </div>
        <div className="rounded-2xl bg-white p-5 shadow-sm">
          <AuthForm mode="register" />
        </div>
        <p className="mt-4 text-center text-sm text-slate-500">
          已有账号？{' '}
          <Link href="/login" className="font-medium text-brand-600">
            去登录
          </Link>
        </p>
      </div>
    </div>
  );
}
