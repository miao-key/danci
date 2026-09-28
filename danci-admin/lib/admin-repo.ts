/**
 * 管理员仓储层（基于 Drizzle ORM + Supabase Postgres）
 *
 * 暴露的方法与旧 `lib/store.ts` 中的 admin 接口保持一致，
 * 便于上层 UI / API 最小化改动。
 */
import { asc, count, eq } from "drizzle-orm";

import { db } from "@/db";
import {
  adminUsers,
  type AdminRole,
  type AdminUserRow,
  type SafeAdmin,
} from "@/db/schema";
import { hashPassword } from "@/lib/password";

function rid(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

function toSafe(row: AdminUserRow): SafeAdmin {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    status: row.status,
    createdAt: row.createdAt,
  };
}

/** 数据库里有没有任何管理员（用于判断是否进入首次注册流） */
export async function countAdmins(): Promise<number> {
  const [{ value }] = await db
    .select({ value: count() })
    .from(adminUsers);
  return Number(value);
}

/** 列出所有管理员（按创建时间正序：最早创建的在上，最新创建的在最下方） */
export async function listAdmins(): Promise<SafeAdmin[]> {
  const rows = await db
    .select()
    .from(adminUsers)
    .orderBy(asc(adminUsers.createdAt), asc(adminUsers.id));
  return rows.map(toSafe);
}

export async function findAdminById(
  id: string,
): Promise<SafeAdmin | null> {
  const rows = await db
    .select()
    .from(adminUsers)
    .where(eq(adminUsers.id, id))
    .limit(1);
  return rows[0] ? toSafe(rows[0]) : null;
}

/**
 * 按邮箱查找，返回完整行（含 passwordHash），仅用于登录校验。
 * 业务层请勿把 passwordHash 暴露出去。
 */
export async function findAdminByEmailWithSecret(
  email: string,
): Promise<AdminUserRow | null> {
  const rows = await db
    .select()
    .from(adminUsers)
    .where(eq(adminUsers.email, email.toLowerCase()))
    .limit(1);
  return rows[0] ?? null;
}

export async function findAdminByEmail(
  email: string,
): Promise<SafeAdmin | null> {
  const row = await findAdminByEmailWithSecret(email);
  return row ? toSafe(row) : null;
}

export interface CreateAdminInput {
  name: string;
  email: string;
  password: string;
  role?: AdminRole;
}

/** 创建管理员。email 重复会抛 unique 约束错误，由调用方捕获。 */
export async function createAdmin(
  input: CreateAdminInput,
): Promise<SafeAdmin> {
  const passwordHash = await hashPassword(input.password);
  const row: AdminUserRow = {
    id: rid("admin"),
    name: input.name,
    email: input.email.toLowerCase(),
    passwordHash,
    role: input.role ?? "normal",
    status: "active",
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const [inserted] = await db.insert(adminUsers).values(row).returning();
  if (!inserted) {
    throw new Error("创建管理员失败");
  }
  return toSafe(inserted);
}

export interface UpdateAdminInput {
  id: string;
  name?: string;
  role?: AdminRole;
  password?: string;
  status?: "active" | "disabled";
}

/** 更新管理员资料。name/role/password/status 中需要更新的字段才传。 */
export async function updateAdmin(
  input: UpdateAdminInput,
): Promise<SafeAdmin | null> {
  const updates: Partial<AdminUserRow> = {
    updatedAt: new Date(),
  };
  if (input.name !== undefined) updates.name = input.name;
  if (input.role !== undefined) updates.role = input.role;
  if (input.password !== undefined) {
    updates.passwordHash = await hashPassword(input.password);
  }
  if (input.status !== undefined) updates.status = input.status;
  const rows = await db
    .update(adminUsers)
    .set(updates)
    .where(eq(adminUsers.id, input.id))
    .returning();
  return rows[0] ? toSafe(rows[0]) : null;
}

export async function deleteAdmin(id: string): Promise<boolean> {
  const rows = await db
    .delete(adminUsers)
    .where(eq(adminUsers.id, id))
    .returning({ id: adminUsers.id });
  return rows.length > 0;
}

/** 统计指定角色的管理员数量（用于最后一位 super 保护） */
export async function countAdminsByRole(role: AdminRole): Promise<number> {
  const [{ value }] = await db
    .select({ value: count() })
    .from(adminUsers)
    .where(eq(adminUsers.role, role));
  return Number(value);
}
