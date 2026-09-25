import { NextResponse } from "next/server";

import { findAdminByEmail, verifyPassword } from "@/lib/store";
import { setSessionCookie } from "@/lib/auth";

interface SigninBody {
  email?: unknown;
  password?: unknown;
}

export async function POST(request: Request) {
  let body: SigninBody;
  try {
    body = (await request.json()) as SigninBody;
  } catch {
    return NextResponse.json(
      { error: "请求体格式错误" },
      { status: 400 },
    );
  }

  const email = typeof body.email === "string" ? body.email.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";

  if (!email || !password) {
    return NextResponse.json(
      { error: "请输入邮箱和密码" },
      { status: 400 },
    );
  }

  const admin = findAdminByEmail(email);
  if (!admin || !verifyPassword(admin, password)) {
    return NextResponse.json(
      { error: "邮箱或密码错误" },
      { status: 401 },
    );
  }

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
