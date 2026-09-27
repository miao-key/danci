/**
 * 服务端会话工具（DB-backed session）
 *
 * 流程：
 *  1. 用户登录成功后，在 admin_session 表里插入一行（7 天过期），把 session.id 写入 HttpOnly cookie。
 *  2. 每次请求通过 cookie 中的 sessionId 回查 DB：
 *     - 会话不存在 / 已过期 → 返回 null（视为未登录）
 *     - 会话有效 → 进一步回查 admin_users，确认管理员还存在且角色匹配，返回 SessionPayload
 *
 * 这样既保留了服务端可撤销、跨设备管理的特性，也避免把任何用户信息塞进 cookie。
 *
 * 注意：`AdminRole` 从 `@/db/schema` 重新导出，保持类型单一来源。
 */
import { cookies } from "next/headers";

import { findAdminById } from "@/lib/admin-repo";
import {
  SESSION_TTL_MS,
  createSession,
  deleteSession,
  findActiveSession,
} from "@/lib/session-repo";
import type { AdminRole } from "@/db/schema";

export const AUTH_COOKIE = "danci_admin_session";

export interface SessionPayload {
  id: string;
  email: string;
  name: string;
  role: AdminRole;
}

export { SESSION_TTL_MS };

export async function setSessionCookie(payload: SessionPayload) {
  const session = await createSession(payload.id);
  const jar = await cookies();
  jar.set(AUTH_COOKIE, session.id, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
    secure: process.env.NODE_ENV === "production",
  });
}

export async function clearSessionCookie() {
  const jar = await cookies();
  const token = jar.get(AUTH_COOKIE)?.value;
  if (token) {
    // DB 里的会话也一并删掉，避免残留。
    await deleteSession(token);
  }
  jar.delete(AUTH_COOKIE);
}

/**
 * 在服务端组件 / Server Action / API 中读取当前登录会话。
 * - 没有 cookie / DB 中会话不存在 / 已过期 → null
 * - 关联的管理员被删 → null
 */
export async function getSession(): Promise<SessionPayload | null> {
  const jar = await cookies();
  const token = jar.get(AUTH_COOKIE)?.value;
  if (!token) return null;

  const session = await findActiveSession(token);
  if (!session) return null;

  const admin = await findAdminById(session.adminId);
  if (!admin) return null;

  return {
    id: admin.id,
    email: admin.email,
    name: admin.name,
    role: admin.role,
  };
}
