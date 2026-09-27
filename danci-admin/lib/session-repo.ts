/**
 * 会话仓储：把 admin_session 表的操作封装在这里。
 */
import { and, eq, gt } from "drizzle-orm";

import { db } from "@/db";
import { adminSession, type AdminSessionRow } from "@/db/schema";

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 天

function rid() {
  return `sess-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 10)}-${Math.random().toString(36).slice(2, 10)}`;
}

export async function createSession(adminId: string): Promise<AdminSessionRow> {
  const now = new Date();
  const row: AdminSessionRow = {
    id: rid(),
    adminId,
    createdAt: now,
    expiresAt: new Date(now.getTime() + SESSION_TTL_MS),
  };
  const [inserted] = await db.insert(adminSession).values(row).returning();
  if (!inserted) throw new Error("创建会话失败");
  return inserted;
}

/**
 * 根据 session id 读取会话，同时校验未过期。
 * 返回 null 表示：不存在 / 已过期。
 */
export async function findActiveSession(
  sessionId: string,
): Promise<AdminSessionRow | null> {
  const now = new Date();
  const rows = await db
    .select()
    .from(adminSession)
    .where(
      and(
        eq(adminSession.id, sessionId),
        gt(adminSession.expiresAt, now),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

export async function deleteSession(sessionId: string): Promise<void> {
  await db.delete(adminSession).where(eq(adminSession.id, sessionId));
}

/** 删除某管理员的所有会话（用于踢下线 / 删除账号时） */
export async function deleteSessionsByAdmin(adminId: string): Promise<void> {
  await db
    .delete(adminSession)
    .where(eq(adminSession.adminId, adminId));
}

export { SESSION_TTL_MS };
