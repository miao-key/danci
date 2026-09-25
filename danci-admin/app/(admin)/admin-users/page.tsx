import { getSession } from "@/lib/auth";
import { AdminsManager } from "@/components/admins/admins-manager";

export default async function AdminUsersPage() {
  const session = await getSession();
  // 这里的 layout 已经做了未登录守卫，这里再过一次保护类型。
  if (!session) return null;
  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <AdminsManager currentAdminId={session.id} />
    </div>
  );
}
