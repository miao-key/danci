import { redirect } from "next/navigation";

import { getSession } from "@/lib/auth";

// / → 已登录 /books，未登录 /signin
export default async function RootRedirectPage() {
  const session = await getSession();
  redirect(session ? "/books" : "/signin");
}
