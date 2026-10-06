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
import { isNextControlFlowError } from '@/lib/next-redirect';

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
  } catch (err) {
    // 关键：signIn 成功时会**主动 throw NEXT_REDIRECT** 让框架完成跳转。
    // 必须识别并重抛，否则浏览器看不到 303 重定向，会停留原页。
    // NextAuth 校验失败时抛 AuthError（无 digest），归到「凭据错」分支。
    if (isNextControlFlowError(err)) throw err;
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
    // 1) 框架控制流（signIn 成功 throw NEXT_REDIRECT）→ 必须重抛
    if (isNextControlFlowError(err)) throw err;

    // 2) 邮箱已被注册 → 走「已存在则按密码直接登录」幂等路径，
    //    避免「注册失败但 DB 有记录、用户反复重试」的死循环。
    if (err instanceof EmailAlreadyExistsError) {
      try {
        await signIn('credentials', { email, password, redirectTo: '/' });
        return {}; // unreachable: signIn 成功会 throw NEXT_REDIRECT
      } catch (signInErr) {
        if (isNextControlFlowError(signInErr)) throw signInErr;
        // 邮箱存在但密码不对 → 提示「去登录」（不暴露用户枚举）
        console.warn(
          '[registerAction] email already exists but login failed',
          email,
        );
        return { fieldErrors: { email: '该邮箱已注册，请直接登录' } };
      }
    }

    console.error('[registerAction] unexpected error', err);
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
