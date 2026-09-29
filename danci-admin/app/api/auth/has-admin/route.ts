import { NextResponse } from "next/server";

import { countAdmins } from "@/lib/admin-repo";

/**
 * GET /api/auth/has-admin
 *
 * 仅用于客户端（首屏）探测：当前库内是否存在管理员。
 * 故意保持极简：不读 cookie、不查 session，避免任何额外 DB 调用。
 *
 * 注意：路由会在每次请求时执行（默认 is dynamic 因为导入了 db）。
 * 不要在 RSC 页面顶层调用 —— 会导致构建期预渲染去连 DB。
 */

/** 探测 DB 的最长等待时间 —— 超过即视为"暂不可用"。 */
const PROBE_TIMEOUT_MS = 3000;

/** 把任意 Promise 包成"超时即失败"，避免拖死首屏跳转。 */
function withProbeTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("probe-timeout")), ms);
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

export async function GET() {
  let total = 0;
  try {
    total = await withProbeTimeout(countAdmins(), PROBE_TIMEOUT_MS);
  } catch {
    // DB 暂时不可用（含超时）：视为"有管理员"，让用户进入 /signin 流程，
    // 由 signin 接口的真实错误提示问题所在，而不是直接暴露 DB 错误。
    total = 1;
  }
  return NextResponse.json({ hasAdmin: total > 0 });
}

// 显式标记为动态路由：永远不在构建期预渲染，避免触发 DB 连接。
export const dynamic = "force-dynamic";