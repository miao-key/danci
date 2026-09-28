import { NextResponse } from "next/server";

import {
  countAdminsByRole,
  createAdmin,
  deleteAdmin,
  findAdminByEmail,
  listAdmins,
} from "@/lib/admin-repo";
import { requireSuper } from "@/lib/admin-guard";
import { deleteSessionsByAdmin } from "@/lib/session-repo";
import { MIN_PASSWORD_LENGTH } from "@/lib/constants";
import type { AdminRole } from "@/db/schema";

/**
 * /api/admins
 *
 * - GET   ：列出全部管理员，仅 super 可调用
 * - POST  ：新增管理员，仅 super 可调用；body 包含 name/email/password/role
 * - DELETE：?id=xxx 删除管理员，仅 super 可调用，且不能删自己、不能删最后一位 super
 */

// 禁用路由级缓存，确保每次请求都实时从数据库拉最新数据
export const dynamic = "force-dynamic";

export async function GET() {
  const guard = await requireSuper();
  if (!guard.ok) return guard.response;
  return NextResponse.json({ admins: await listAdmins() });
}

interface CreateBody {
  name?: unknown;
  email?: unknown;
  password?: unknown;
  role?: unknown;
}

export async function POST(request: Request) {
  const guard = await requireSuper();
  if (!guard.ok) return guard.response;

  const body = (await request.json().catch(() => ({}))) as CreateBody;
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";
  const role: AdminRole =
    body.role === "super" || body.role === "normal"
      ? body.role
      : "normal";

  if (!name) {
    return NextResponse.json({ error: "请输入姓名" }, { status: 400 });
  }
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "邮箱格式不正确" }, { status: 400 });
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return NextResponse.json(
      {
        error: `密码长度至少 ${MIN_PASSWORD_LENGTH} 位`,
      },
      { status: 400 },
    );
  }
  if (await findAdminByEmail(email)) {
    return NextResponse.json(
      { error: "该邮箱已被注册" },
      { status: 409 },
    );
  }

  const admin = await createAdmin({ name, email, password, role });
  return NextResponse.json({ admin });
}

export async function DELETE(request: Request) {
  const guard = await requireSuper();
  if (!guard.ok) return guard.response;

  const id = new URL(request.url).searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "缺少 id" }, { status: 400 });
  }
  if (id === guard.session.id) {
    return NextResponse.json(
      { error: "不能删除自己" },
      { status: 400 },
    );
  }
  // 最后一位 super 保护
  const target = await listAdmins();
  const targetAdmin = target.find((a) => a.id === id);
  if (!targetAdmin) {
    return NextResponse.json(
      { error: "管理员不存在" },
      { status: 404 },
    );
  }
  if (targetAdmin.role === "super") {
    const superCount = await countAdminsByRole("super");
    if (superCount <= 1) {
      return NextResponse.json(
        { error: "不能删除最后一位系统管理员" },
        { status: 400 },
      );
    }
  }

  const ok = await deleteAdmin(id);
  if (!ok) {
    return NextResponse.json(
      { error: "管理员不存在" },
      { status: 404 },
    );
  }
  // 删除账号时一并踢下线该账号的所有会话
  await deleteSessionsByAdmin(id);
  return NextResponse.json({ ok: true });
}
