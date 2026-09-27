import { NextResponse } from "next/server";

import {
  countAdminsByRole,
  listAdmins,
  updateAdmin,
} from "@/lib/admin-repo";
import { requireSuper } from "@/lib/admin-guard";
import { MIN_PASSWORD_LENGTH } from "@/lib/constants";
import type { AdminRole } from "@/db/schema";

/**
 * /api/admins/[id]
 *
 * - PATCH：编辑管理员（name / role / password）
 *   - 仅 super 可调用
 *   - 不能修改自己的 role（避免误把自己降级）
 *   - 不能把最后一位 super 降级为 normal
 */
interface RouteContext {
  params: Promise<{ id: string }>;
}

interface PatchBody {
  name?: unknown;
  role?: unknown;
  password?: unknown;
  status?: unknown;
}

export async function PATCH(
  request: Request,
  context: RouteContext,
) {
  const guard = await requireSuper();
  if (!guard.ok) return guard.response;

  const { id } = await context.params;

  const body = (await request.json().catch(() => ({}))) as PatchBody;
  const updates: {
    id: string;
    name?: string;
    role?: AdminRole;
    password?: string;
    status?: "active" | "disabled";
  } = { id };

  if (body.name !== undefined) {
    if (typeof body.name !== "string" || !body.name.trim()) {
      return NextResponse.json(
        { error: "姓名不合法" },
        { status: 400 },
      );
    }
    updates.name = body.name.trim();
  }
  if (body.role !== undefined) {
    if (body.role !== "super" && body.role !== "normal") {
      return NextResponse.json(
        { error: "角色不合法" },
        { status: 400 },
      );
    }
    // 不能修改自己的 role
    if (id === guard.session.id) {
      return NextResponse.json(
        { error: "不能修改自己的角色" },
        { status: 400 },
      );
    }
    // 最后一位 super 保护
    if (body.role === "normal") {
      const targetList = await listAdmins();
      const target = targetList.find((a) => a.id === id);
      if (target?.role === "super") {
        const superCount = await countAdminsByRole("super");
        if (superCount <= 1) {
          return NextResponse.json(
            { error: "不能降级最后一位系统管理员" },
            { status: 400 },
          );
        }
      }
    }
    updates.role = body.role;
  }
  if (body.password !== undefined) {
    if (
      typeof body.password !== "string" ||
      body.password.length < MIN_PASSWORD_LENGTH
    ) {
      return NextResponse.json(
        {
          error: `密码长度至少 ${MIN_PASSWORD_LENGTH} 位`,
        },
        { status: 400 },
      );
    }
    updates.password = body.password;
  }
  if (body.status !== undefined) {
    if (body.status !== "active" && body.status !== "disabled") {
      return NextResponse.json(
        { error: "状态不合法" },
        { status: 400 },
      );
    }
    // 不能停用自己
    if (body.status === "disabled" && id === guard.session.id) {
      return NextResponse.json(
        { error: "不能停用当前登录账号" },
        { status: 400 },
      );
    }
    updates.status = body.status;
  }

  const updated = await updateAdmin(updates);
  if (!updated) {
    return NextResponse.json(
      { error: "管理员不存在" },
      { status: 404 },
    );
  }
  return NextResponse.json({ admin: updated });
}
