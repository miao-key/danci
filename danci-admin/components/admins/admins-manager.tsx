"use client";

import * as React from "react";
import { toast } from "sonner";
import {
  EyeIcon,
  EyeOffIcon,
  MoreHorizontalIcon,
  PencilIcon,
  ShieldCheckIcon,
  Trash2Icon,
  UserIcon,
  UsersIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { AdminRole } from "@/db/schema";

interface AdminRow {
  id: string;
  name: string;
  email: string;
  role: AdminRole;
  status: "active" | "disabled";
  createdAt: string;
}

interface FormValues {
  name: string;
  email: string;
  password: string;
  role: AdminRole;
}

const EMPTY_FORM: FormValues = {
  name: "",
  email: "",
  password: "",
  role: "normal",
};

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleString("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
  } catch {
    return iso;
  }
}

export interface AdminsManagerHandle {
  /** 打开"新增管理员"对话框（由外部 trigger 调用） */
  openCreate: () => void;
}

export const AdminsManager = React.forwardRef<
  AdminsManagerHandle,
  { currentAdminId: string }
>(function AdminsManager({ currentAdminId }, ref) {
  const [admins, setAdmins] = React.useState<AdminRow[]>([]);
  const [loading, setLoading] = React.useState(true);

  const [createOpen, setCreateOpen] = React.useState(false);
  const [createForm, setCreateForm] =
    React.useState<FormValues>(EMPTY_FORM);
  const [creating, setCreating] = React.useState(false);

  const [showCreatePassword, setShowCreatePassword] = React.useState(false);
  const [editing, setEditing] = React.useState<AdminRow | null>(null);
  const [editName, setEditName] = React.useState("");
  const [editPassword, setEditPassword] = React.useState("");
  const [editRole, setEditRole] = React.useState<AdminRole>("normal");
  const [savingEdit, setSavingEdit] = React.useState(false);

  const [deleting, setDeleting] = React.useState<AdminRow | null>(null);
  const [deletingBusy, setDeletingBusy] = React.useState(false);

  // 切换启用/停用
  const [togglingId, setTogglingId] = React.useState<string | null>(null);

  // 暴露 imperative API：让父级"新增管理员"按钮能打开 Dialog
  React.useImperativeHandle(
    ref,
    () => ({
      openCreate: () => setCreateOpen(true),
    }),
    [],
  );

  const fetchAdmins = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admins", { cache: "no-store" });
      const data = (await res.json()) as {
        admins?: AdminRow[];
        error?: string;
      };
      if (!res.ok) {
        toast.error(data.error ?? "加载失败");
        return;
      }
      setAdmins(data.admins ?? []);
    } catch {
      toast.error("网络错误");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    const id = window.setTimeout(() => {
      void fetchAdmins();
    }, 0);
    return () => window.clearTimeout(id);
  }, [fetchAdmins]);

  async function handleCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (creating) return;

    if (!createForm.name.trim()) {
      toast.error("请输入姓名");
      return;
    }
    if (createForm.password.length < 8) {
      toast.error("密码长度至少 8 位");
      return;
    }
    setCreating(true);
    try {
      const res = await fetch("/api/admins", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(createForm),
      });
      const data = (await res.json()) as {
        admin?: AdminRow;
        error?: string;
      };
      if (!res.ok || !data.admin) {
        toast.error(data.error ?? "创建失败");
        return;
      }
      toast.success("管理员已添加");
      setAdmins((prev) => [...prev, data.admin!]);
      setCreateForm(EMPTY_FORM);
      setCreateOpen(false);
    } catch {
      toast.error("网络错误");
    } finally {
      setCreating(false);
    }
  }

  function openEdit(admin: AdminRow) {
    setEditing(admin);
    setEditName(admin.name);
    setEditPassword("");
    setEditRole(admin.role);
  }

  async function handleEdit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing || savingEdit) return;
    if (!editName.trim()) {
      toast.error("请输入姓名");
      return;
    }
    if (editPassword && editPassword.length < 8) {
      toast.error("密码长度至少 8 位");
      return;
    }
    setSavingEdit(true);
    try {
      const body: Record<string, unknown> = {
        name: editName.trim(),
        role: editRole,
      };
      if (editPassword) body.password = editPassword;
      const res = await fetch(`/api/admins/${editing.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as {
        admin?: AdminRow;
        error?: string;
      };
      if (!res.ok || !data.admin) {
        toast.error(data.error ?? "更新失败");
        return;
      }
      toast.success("已更新");
      setAdmins((prev) =>
        prev.map((a) => (a.id === data.admin!.id ? data.admin! : a)),
      );
      setEditing(null);
    } catch {
      toast.error("网络错误");
    } finally {
      setSavingEdit(false);
    }
  }

  async function confirmDelete() {
    if (!deleting || deletingBusy) return;
    setDeletingBusy(true);
    try {
      const res = await fetch(
        `/api/admins?id=${encodeURIComponent(deleting.id)}`,
        { method: "DELETE" },
      );
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        toast.error(data.error ?? "删除失败");
        return;
      }
      toast.success("已删除");
      setAdmins((prev) => prev.filter((a) => a.id !== deleting.id));
      setDeleting(null);
    } catch {
      toast.error("网络错误");
    } finally {
      setDeletingBusy(false);
    }
  }

  async function handleToggleStatus(admin: AdminRow) {
    if (togglingId) return;
    const nextStatus = admin.status === "active" ? "disabled" : "active";
    setTogglingId(admin.id);
    try {
      const res = await fetch(`/api/admins/${admin.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      const data = (await res.json()) as {
        admin?: AdminRow;
        error?: string;
      };
      if (!res.ok || !data.admin) {
        toast.error(data.error ?? "更新状态失败");
        return;
      }
      toast.success(nextStatus === "active" ? "已启用" : "已停用");
      setAdmins((prev) =>
        prev.map((a) => (a.id === data.admin!.id ? data.admin! : a)),
      );
    } catch {
      toast.error("网络错误");
    } finally {
      setTogglingId(null);
    }
  }

  return (
    <Card>
      <CardHeader className="space-y-1">
        <div className="flex items-center gap-2">
          <UsersIcon className="text-muted-foreground size-4" />
          <h2 className="text-base font-semibold">管理员列表</h2>
        </div>
        <p className="text-muted-foreground text-sm">
          共 {admins.length} 位管理员
        </p>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="text-muted-foreground text-sm">加载中…</div>
        ) : admins.length === 0 ? (
          <div className="text-muted-foreground flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed py-12 text-sm">
            <UsersIcon className="size-6" />
            还没有管理员，点击右上角"新增管理员"添加吧。
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[24%] min-w-[120px]">姓名</TableHead>
                <TableHead className="w-[28%] min-w-[180px]">邮箱</TableHead>
                <TableHead className="w-[12%] min-w-[80px]">角色</TableHead>
                <TableHead className="w-[12%] min-w-[80px]">状态</TableHead>
                <TableHead className="w-[16%] min-w-[120px]">创建时间</TableHead>
                <TableHead className="w-[8%] text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {admins.map((admin) => {
                const isSelf = admin.id === currentAdminId;
                const isToggling = togglingId === admin.id;
                const isDisabled = admin.status === "disabled";
                return (
                  <TableRow
                    key={admin.id}
                    className={isDisabled ? "text-muted-foreground" : undefined}
                  >
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <span>{admin.name}</span>
                        {isSelf && (
                          <Badge variant="outline" className="text-xs">
                            当前账号
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {admin.email}
                    </TableCell>
                    <TableCell>
                      {admin.role === "super" ? (
                        <span className="font-medium">系统管理员</span>
                      ) : (
                        <span className="text-muted-foreground">
                          普通管理员
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      {isDisabled ? (
                        <Badge className="!bg-destructive/10 !text-destructive !border-destructive/20 hover:!bg-destructive/15">
                          停用
                        </Badge>
                      ) : (
                        <Badge className="!bg-green-600/10 !text-green-700 !border-green-600/20 hover:!bg-green-600/15 dark:!text-green-400">
                          启用
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {formatDate(admin.createdAt)}
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          render={
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              aria-label="更多操作"
                            />
                          }
                        >
                          <MoreHorizontalIcon />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() => openEdit(admin)}
                          >
                            <PencilIcon />
                            编辑
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            disabled={isSelf || isToggling}
                            onClick={() => handleToggleStatus(admin)}
                          >
                            {isDisabled ? (
                              <>
                                <ShieldCheckIcon />
                                启用
                              </>
                            ) : (
                              <>
                                <UserIcon />
                                停用
                              </>
                            )}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            variant="destructive"
                            disabled={isSelf}
                            onClick={() => setDeleting(admin)}
                          >
                            <Trash2Icon />
                            删除
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>

      {/* Create Dialog — 由父级通过 ref.openCreate() 触发；不渲染内置 trigger */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>新增管理员</DialogTitle>
            <DialogDescription>
              创建可登录管理后台的管理员账号
            </DialogDescription>
          </DialogHeader>
          <form
            id="create-admin-form"
            onSubmit={handleCreate}
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label htmlFor="admin-name">姓名</Label>
              <Input
                id="admin-name"
                type="text"
                required
                value={createForm.name}
                onChange={(e) =>
                  setCreateForm((s) => ({ ...s, name: e.target.value }))
                }
                placeholder=""
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="admin-email">邮箱</Label>
              <Input
                id="admin-email"
                type="email"
                required
                value={createForm.email}
                onChange={(e) =>
                  setCreateForm((s) => ({ ...s, email: e.target.value }))
                }
                placeholder=""
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="admin-password">密码</Label>
              <div className="relative">
                <Input
                  id="admin-password"
                  type={showCreatePassword ? "text" : "password"}
                  required
                  minLength={8}
                  value={createForm.password}
                  onChange={(e) =>
                    setCreateForm((s) => ({
                      ...s,
                      password: e.target.value,
                    }))
                  }
                  placeholder="至少8位密码"
                  className="pr-9"
                />
                <button
                  type="button"
                  aria-label={
                    showCreatePassword ? "隐藏密码" : "显示密码"
                  }
                  aria-pressed={showCreatePassword}
                  onClick={() =>
                    setShowCreatePassword((v) => !v)
                  }
                  className="text-muted-foreground hover:text-foreground absolute inset-y-0 right-0 flex w-9 items-center justify-center rounded-r-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                >
                  {showCreatePassword ? (
                    <EyeOffIcon className="size-4" />
                  ) : (
                    <EyeIcon className="size-4" />
                  )}
                </button>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="admin-role">角色</Label>
              <Select
                value={createForm.role}
                onValueChange={(v) => {
                  if (v === "super" || v === "normal") {
                    setCreateForm((s) => ({
                      ...s,
                      role: v as AdminRole,
                    }));
                  }
                }}
              >
                <SelectTrigger id="admin-role" className="w-full">
                  <SelectValue>
                    {createForm.role === "super"
                      ? "系统管理员"
                      : "普通管理员"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="normal">普通管理员</SelectItem>
                  <SelectItem value="super">系统管理员</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </form>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>
              取消
            </DialogClose>
            <Button
              type="submit"
              form="create-admin-form"
              disabled={creating}
            >
              {creating ? "创建中…" : "创建"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>编辑管理员</DialogTitle>
            <DialogDescription>
              修改管理员账号信息
            </DialogDescription>
          </DialogHeader>
          <form
            id="edit-admin-form"
            onSubmit={handleEdit}
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label htmlFor="edit-admin-name">姓名</Label>
              <Input
                id="edit-admin-name"
                type="text"
                required
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-admin-password">重置密码（可选）</Label>
              <Input
                id="edit-admin-password"
                type="password"
                minLength={6}
                value={editPassword}
                onChange={(e) => setEditPassword(e.target.value)}
                placeholder="留空则不修改"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-admin-role">角色</Label>
              <Select
                value={editRole}
                onValueChange={(v) => {
                  if (v === "super" || v === "normal") {
                    setEditRole(v as AdminRole);
                  }
                }}
                disabled={editing?.id === currentAdminId}
              >
                <SelectTrigger id="edit-admin-role" className="w-full">
                  <SelectValue>
                    {editRole === "super" ? "系统管理员" : "普通管理员"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="normal">普通管理员</SelectItem>
                  <SelectItem value="super">系统管理员</SelectItem>
                </SelectContent>
              </Select>
              {editing?.id === currentAdminId && (
                <p className="text-muted-foreground text-xs">
                  不能修改自己的角色
                </p>
              )}
            </div>
          </form>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>
              取消
            </DialogClose>
            <Button type="submit" form="edit-admin-form" disabled={savingEdit}>
              {savingEdit ? "保存中…" : "保存"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <Dialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>删除管理员？</DialogTitle>
            <DialogDescription>
              确认删除管理员 &ldquo;{deleting?.name}&rdquo;（{deleting?.email}
              ）？该操作不可撤销。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>
              取消
            </DialogClose>
            <Button
              variant="destructive"
              onClick={confirmDelete}
              disabled={deletingBusy}
            >
              {deletingBusy ? "删除中…" : "确认删除"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
});
