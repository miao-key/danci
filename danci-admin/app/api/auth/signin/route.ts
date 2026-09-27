import { NextResponse } from "next/server";

import { findAdminByEmailWithSecret } from "@/lib/admin-repo";
import { verifyPassword } from "@/lib/password";
import { setSessionCookie } from "@/lib/auth";
import { MIN_PASSWORD_LENGTH } from "@/lib/constants";

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
  if (password.length < MIN_PASSWORD_LENGTH) {
    return NextResponse.json(
      {
        error: `密码长度至少 ${MIN_PASSWORD_LENGTH} 位`,
      },
      { status: 400 },
    );
  }

  const admin = await findAdminByEmailWithSecret(email);
  if (!admin || !(await verifyPassword(password, admin.passwordHash))) {
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
