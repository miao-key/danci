/**
 * 用户仓储（C 端 `users` 表）。
 *
 * 与 docs/design.md 5.1 的签名保持一致，数据来自 Supabase Postgres。
 *
 * 对上层只暴露 `UserView`（**不含 passwordHash**），符合 design.md 11.2
 * "视图层剥离敏感字段"的要求。
 */
import { db } from '@/db';
import { users, type UserRow } from '@/db/schema';
import { eq, sql } from 'drizzle-orm';
import { compare } from 'bcrypt-ts';

import { hashPassword } from './password';

export { hashPassword };

export interface UserView {
  id: string;
  email: string;
  displayName: string;
}

/** 登录用：返回脱敏用户，邮箱不存在或密码错误都返回 null（防用户枚举） */
export async function authenticateUser(
  email: string,
  password: string,
): Promise<UserView | null> {
  const rows = await db
    .select()
    .from(users)
    .where(sql`lower(${users.email}) = lower(${email.trim()})`)
    .limit(1);
  const row = rows[0];
  if (!row) return null;

  const ok = await compare(password, row.passwordHash);
  if (!ok) return null;

  return {
    id: row.id,
    email: row.email,
    displayName: row.displayName ?? row.email.split('@')[0],
  };
}

/** 按 id 读取脱敏用户 */
export async function findUserById(id: string): Promise<UserView | null> {
  const rows = await db.select().from(users).where(eq(users.id, id)).limit(1);
  const row = rows[0];
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    displayName: row.displayName ?? row.email.split('@')[0],
  };
}

export async function userEmailExists(email: string): Promise<boolean> {
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(sql`lower(${users.email}) = lower(${email.trim()})`)
    .limit(1);
  return rows.length > 0;
}

/** 主键生成：与 db/schema.ts 注释里的约定一致 */
const rid = (p: string) =>
  `${p}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

/**
 * 注册。`passwordHash` 由调用方 hash，避免仓储层耦合密码库。
 *
 * 重复邮箱处理：表上有 `users_email_unique` 与 `users_email_lower_uidx` 两个
 * 唯一约束，依赖 DB 抛 23505 后再翻译为本仓库自定义的 `EmailAlreadyExistsError`。
 * 不预检 `userEmailExists()` 是因为并发场景下两次注册都过预检仍会撞唯一索引，
 * 必须有事后兜底，否则 catch 里走"通用失败"路径，用户看到的就是
 * "注册失败，请稍后再试"而不是"该邮箱已注册"。
 *
 * @throws EmailAlreadyExistsError 邮箱已存在
 */
export async function createUser(input: {
  email: string;
  passwordHash: string;
  displayName?: string;
}): Promise<UserView> {
  const now = new Date();

  let row: UserRow | undefined;
  try {
    const inserted = await db
      .insert(users)
      .values({
        id: rid('usr'),
        email: input.email.trim().toLowerCase(),
        passwordHash: input.passwordHash,
        displayName: input.displayName?.trim() || null,
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    row = inserted[0];
  } catch (e) {
    if (isUniqueViolation(e)) {
      throw new EmailAlreadyExistsError();
    }
    throw e;
  }

  if (!row) throw new Error('创建用户失败');
  return {
    id: row.id,
    email: row.email,
    displayName: row.displayName ?? row.email.split('@')[0],
  };
}

/**
 * Postgres `23505` (unique_violation) 判断。
 *
 * `drizzle-orm/postgres-js` 把 `pg` 抛出的原始 error 原样透传：
 *   - `err.code === '23505'`
 *   - `err.constraint_name` 是被命中的约束名（注意是 `constraint_name`，
 *     **不是** Node pg 驱动 / TypeORM 风格的 `constraint` —— 早期脚过这个坑）。
 *
 * 优先用约束名锁定到「邮箱相关」两个唯一约束之一，避免日后表上新增唯一索引
 * 误把别的字段冲突也当成"邮箱已存在"。
 */
function isUniqueViolation(e: unknown): boolean {
  if (!e || typeof e !== 'object') return false;
  const code = (e as { code?: string }).code;
  const constraintName = (e as { constraint_name?: string }).constraint_name;
  return (
    code === '23505' &&
    (constraintName === 'users_email_unique' ||
      constraintName === 'users_email_lower_uidx')
  );
}

/** 邮箱已存在。仓储层抛这个，供 Server Action 转成表单错误。 */
export class EmailAlreadyExistsError extends Error {
  constructor() {
    super('该邮箱已注册');
    this.name = 'EmailAlreadyExistsError';
  }
}
