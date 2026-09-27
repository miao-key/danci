/**
 * 管理员守卫：在 API route handler 顶部快速校验身份与角色。
 *
 * 用法：
 *   const guard = await requireSession();
 *   if (!guard.ok) return guard.response;
 *   const { session } = guard;
 *
 *   const super = await requireSuper();
 *   if (!super.ok) return super.response;
 */
import { NextResponse } from "next/server";

import { getSession, type SessionPayload } from "@/lib/auth";

export type SessionGuard =
  | { ok: true; session: SessionPayload }
  | { ok: false; response: NextResponse };

export type SuperGuard =
  | { ok: true; session: SessionPayload }
  | { ok: false; response: NextResponse };

export async function requireSession(): Promise<SessionGuard> {
  const session = await getSession();
  if (!session) {
    return {
      ok: false,
      response: NextResponse.json({ error: "未登录" }, { status: 401 }),
    };
  }
  return { ok: true, session };
}

export async function requireSuper(): Promise<SuperGuard> {
  const guard = await requireSession();
  if (!guard.ok) return guard;
  if (guard.session.role !== "super") {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "权限不足：仅系统管理员可操作" },
        { status: 403 },
      ),
    };
  }
  return guard;
}
