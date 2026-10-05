/**
 * 登录 / 注册 Server Actions（弹窗与整页共用）。
 *
 * 关键点（docs/design.md 6.5 / proposal 5.3.2）：
 *   - **注册成功直接登录**，不再 redirect 到 /login，省掉一次手动输入；
 *   - 登录失败统一返回「邮箱或密码不正确」，不区分"邮箱不存在"与"密码错误"，
 *     防用户枚举（design.md 11.1）。
 *
 * ⚠️ 本项目锁定 React 18（next@14），Server Actions 的表单状态 hook 是
 *    `useFormState`（来自 react-dom），**不是** React 19 的 `useActionState`。
 */
'use server';

import { signIn } from '@/app/auth';
import { currentUser } from '@/lib/auth';
import { MIN_PASSWORD_LENGTH } from '@/lib/constants';
import {
  createUser,
  EmailAlreadyExistsError,
  hashPassword,
} from '@/lib/user-repo';

export interface AuthState {
  error?: string;
  fieldErrors?: {
    email?: string;
    password?: string;
  };
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function readCredentials(formData: FormData) {
  return {
    email: String(formData.get('email') ?? '').trim(),
    password: String(formData.get('password') ?? ''),
  };
}

/** 登录。成功后由 signIn 抛出的 redirect 中断，返回值不会到达客户端。 */
export async function loginAction(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const { email, password } = readCredentials(formData);

  const fieldErrors: AuthState['fieldErrors'] = {};
  if (!email) fieldErrors.email = '请输入邮箱';
  if (!password) fieldErrors.password = '请输入密码';
  if (Object.keys(fieldErrors).length > 0) return { fieldErrors };

  try {
    await signIn('credentials', { email, password, redirectTo: '/' });
    return {};
  } catch {
    // NextAuth v5 credentials 校验失败时抛 AuthError，
    // 而登录成功时抛 NEXT_REDIRECT —— 两者都要在 useFormState 里被 catch。
    return { error: '邮箱或密码不正确' };
  }
}

/** 注册。成功后自动登录。 */
export async function registerAction(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const { email, password } = readCredentials(formData);

  const fieldErrors: AuthState['fieldErrors'] = {};
  if (!EMAIL_RE.test(email)) fieldErrors.email = '邮箱格式不正确';
  if (password.length < MIN_PASSWORD_LENGTH) {
    fieldErrors.password = `密码至少 ${MIN_PASSWORD_LENGTH} 位`;
  }
  if (Object.keys(fieldErrors).length > 0) return { fieldErrors };

  try {
    await createUser({ email, passwordHash: hashPassword(password) });
    // 注册成功直接登录，省掉一次手动登录（proposal 5.3.2）
    await signIn('credentials', { email, password, redirectTo: '/' });
    return {};
  } catch (err) {
    if (err instanceof EmailAlreadyExistsError) {
      return { fieldErrors: { email: '该邮箱已注册，请直接登录' } };
    }
    console.error('[registerAction]', err);
    return { error: '注册失败，请稍后再试' };
  }
}

/** 退出登录并跳回首页。 */
export async function logoutAction() {
  const { signOut } = await import('@/app/auth');
  await signOut({ redirectTo: '/' });
}

/** 给弹窗用的探针：登录态是否已就绪。 */
export async function isAuthenticatedAction(): Promise<boolean> {
  return (await currentUser()) !== null;
}
