// 简单的服务端会话工具。
// 在 mock 阶段：把 { id, email, role } 序列化后用 HMAC 签名写到 HttpOnly cookie。
// 接 Supabase 后：直接换成 supabase.auth.getUser() / setSession() 即可。
import { cookies } from "next/headers";
import { createHmac, timingSafeEqual } from "node:crypto";

import { findAdminById, type AdminRole } from "@/lib/store";

export const AUTH_COOKIE = "danci_admin_session";
// 7 天
const COOKIE_MAX_AGE = 60 * 60 * 24 * 7;

// 这里是本地开发用的密钥；接 Supabase 之后用不到。
// 注意：服务端会自动注入随机密钥到 env 里更安全。
const SECRET =
  process.env.AUTH_SECRET ?? "dev-only-danci-admin-secret-change-me";

export interface SessionPayload {
  id: string;
  email: string;
  name: string;
  role: AdminRole;
}

function b64url(buf: Buffer) {
  return buf
    .toString("base64")
    .replace(/=+$/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function fromB64url(s: string) {
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  return Buffer.from(s, "base64");
}

function sign(value: string) {
  return createHmac("sha256", SECRET).update(value).digest();
}

function timingEqual(a: Buffer, b: Buffer) {
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function encodeSession(payload: SessionPayload): string {
  const body = b64url(Buffer.from(JSON.stringify(payload), "utf8"));
  const sig = b64url(sign(body));
  return `${body}.${sig}`;
}

export function decodeSession(token: string): SessionPayload | null {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [body, sig] = parts;
  let expected: Buffer;
  try {
    expected = sign(body);
  } catch {
    return null;
  }
  const given = fromB64url(sig);
  if (!timingEqual(expected, given)) return null;
  try {
    const json = JSON.parse(
      fromB64url(body).toString("utf8"),
    ) as SessionPayload;
    if (!json || typeof json.id !== "string") return null;
    return json;
  } catch {
    return null;
  }
}

export async function setSessionCookie(payload: SessionPayload) {
  const jar = await cookies();
  jar.set(AUTH_COOKIE, encodeSession(payload), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: COOKIE_MAX_AGE,
    secure: process.env.NODE_ENV === "production",
  });
}

export async function clearSessionCookie() {
  const jar = await cookies();
  jar.delete(AUTH_COOKIE);
}

/**
 * 在服务端组件 / Server Action 中读取当前登录会话。
 * - 没有 cookie / 签名不匹配 → 返回 null
 * - cookie 中的 id 在数据库已不存在（被删）→ 返回 null
 */
export async function getSession(): Promise<SessionPayload | null> {
  const jar = await cookies();
  const token = jar.get(AUTH_COOKIE)?.value;
  if (!token) return null;
  const payload = decodeSession(token);
  if (!payload) return null;
  // 仍然回查一次 store，确保用户存在（管理员被删后立即失效）。
  const admin = findAdminById(payload.id);
  if (!admin || admin.email !== payload.email) return null;
  return {
    id: admin.id,
    email: admin.email,
    name: admin.name,
    role: admin.role,
  };
}
