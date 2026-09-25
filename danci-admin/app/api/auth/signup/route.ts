import { NextResponse } from "next/server";

import {
  createAdmin,
  findAdminByEmail,
} from "@/lib/store";
import { setSessionCookie } from "@/lib/auth";

interface SignupBody {
  name?: unknown;
  email?: unknown;
  password?: unknown;
  confirmPassword?: unknown;
}

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
  if (password.length < 6) {
    return NextResponse.json(
      { error: "密码长度至少 6 位" },
      { status: 400 },
    );
  }
  if (password !== confirmPassword) {
    return NextResponse.json(
      { error: "两次输入的密码不一致" },
      { status: 400 },
    );
  }
  if (findAdminByEmail(email)) {
    return NextResponse.json(
      { error: "该邮箱已被注册" },
      { status: 409 },
    );
  }

  const admin = createAdmin({ name, email, password });

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
