import { NextResponse } from "next/server";

import { countAdmins, createAdmin, findAdminByEmail } from "@/lib/admin-repo";
import { setSessionCookie } from "@/lib/auth";
import { MIN_PASSWORD_LENGTH } from "@/lib/constants";

interface SignupBody {
  name?: unknown;
  email?: unknown;
  password?: unknown;
  confirmPassword?: unknown;
}

/**
 * /api/auth/signup
 *
 * 业务规则：
 * - 仅当数据库中没有任何管理员时，才允许注册。第一个注册的账号自动获得 "super" 角色。
 * - 只要数据库里已有管理员，本接口直接拒绝 403（前端也会做服务端守卫）。
 */
export async function POST(request: Request) {
  let body: SignupBody;
  try {
    body = (await request.json()) as SignupBody;
  } catch {
    return NextResponse.json(
      { error: "请求体格式错误" },
      { status: 400 },
    );
  }

  const total = await countAdmins();
  if (total > 0) {
    return NextResponse.json(
      { error: "已存在系统管理员，禁止再次注册" },
      { status: 403 },
    );
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";
  const confirmPassword =
    typeof body.confirmPassword === "string" ? body.confirmPassword : "";

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
  if (password !== confirmPassword) {
    return NextResponse.json(
      { error: "两次输入的密码不一致" },
      { status: 400 },
    );
  }
  if (await findAdminByEmail(email)) {
    return NextResponse.json(
      { error: "该邮箱已被注册" },
      { status: 409 },
    );
  }

  // 第一个管理员固定为 super
  const admin = await createAdmin({
    name,
    email,
    password,
    role: "super",
  });

  await setSessionCookie({
    id: admin.id,
    email: admin.email,
    name: admin.name,
    role: admin.role,
  });

  return NextResponse.json({
    ok: true,
    user: {
      id: admin.id,
      email: admin.email,
      name: admin.name,
      role: admin.role,
    },
  });
}
