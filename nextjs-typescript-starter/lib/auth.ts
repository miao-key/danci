/**
 * 统一的当前用户读取。
 *
 * 只在 Server Component / Server Action 里调用（`auth()` 依赖 cookies()，
 * 会让路由变成 dynamic，这是符合预期的 —— 用户数据必须实时）。
 *
 * 分层原则（docs/design.md 11.2）：判定"是不是你"永远在服务端，
 * 前端只做展示裁剪。
 */
import { auth } from '@/app/auth';
import { findUserById, type UserView } from '@/lib/user-repo';

/** 读取当前登录用户；未登录返回 null */
export async function currentUser(): Promise<UserView | null> {
  const session = await auth();
  const uid = session?.user?.id;
  if (!uid) return null;
  return findUserById(uid);
}
