import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth";
import {
  createAdmin,
  deleteAdmin,
  findAdminByEmail,
  listAdmins,
} from "@/lib/store";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }
  return NextResponse.json({ admins: listAdmins() });
}

interface CreateBody {
  name?: unknown;
  email?: unknown;
  password?: unknown;
  role?: unknown;
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }
  // 简化：现阶段任何已登录用户都能新增管理员。
  // 后续接入 RBAC 时，仅 super 角色可操作。
  const body = (await request.json().catch(() => ({}))) as CreateBody;
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";
  const role =
    body.role === "super" || body.role === "normal"
      ? body.role
      : "normal";

  if (!name) {
    return NextResponse.json({ error: "请输入姓名" }, { status: 400 });
  }
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "邮箱格式不正确" }, { status: 400 });
  }
  if (password.length < 6) {
    return NextResponse.json(
      { error: "密码长度至少 6 位" },
      { status: 400 },
    );
  }
  if (findAdminByEmail(email)) {
    return NextResponse.json(
      { error: "该邮箱已被注册" },
      { status: 409 },
    );
  }

  const admin = createAdmin({ name, email, password, role });
  return NextResponse.json({
    admin: {
      id: admin.id,
      email: admin.email,
      name: admin.name,
      role: admin.role,
      createdAt: admin.createdAt,
    },
  });
}

export async function DELETE(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }
  const id = new URL(request.url).searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "缺少 id" }, { status: 400 });
  }
  if (id === session.id) {
    return NextResponse.json(
      { error: "不能删除自己" },
      { status: 400 },
    );
  }
  const ok = deleteAdmin(id);
  if (!ok) {
    return NextResponse.json(
      { error: "管理员不存在" },
      { status: 404 },
    );
  }
  return NextResponse.json({ ok: true });
}
