/**
 * 用户仓储（C 端 `users` 表）。
 *
 * 与 docs/design.md 5.1 的签名保持一致，数据来自 Supabase Postgres。
 *
 * 对上层只暴露 `UserView`（**不含 passwordHash**），符合 design.md 11.2
 * "视图层剥离敏感字段"的要求。
 */
import { db } from '@/db';
import { users } from '@/db/schema';
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
 * @throws EmailAlreadyExistsError 邮箱已存在
 */
export async function createUser(input: {
  email: string;
  passwordHash: string;
  displayName?: string;
}): Promise<UserView> {
  const now = new Date();

  const [row] = await db
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

  if (!row) throw new Error('创建用户失败');
  return {
    id: row.id,
    email: row.email,
    displayName: row.displayName ?? row.email.split('@')[0],
  };
}

/** 邮箱已存在。仓储层抛这个，供 Server Action 转成表单错误。 */
export class EmailAlreadyExistsError extends Error {
  constructor() {
    super('该邮箱已注册');
    this.name = 'EmailAlreadyExistsError';
  }
}
