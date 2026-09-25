"use client";

import * as React from "react";
import { toast } from "sonner";
import {
  MoreHorizontalIcon,
  PlusIcon,
  ShieldCheckIcon,
  Trash2Icon,
  UserIcon,
  UsersIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
import type { AdminRole } from "@/lib/store";

interface AdminRow {
  id: string;
  name: string;
  email: string;
  role: AdminRole;
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

export function AdminsManager({ currentAdminId }: { currentAdminId: string }) {
  const [admins, setAdmins] = React.useState<AdminRow[]>([]);
  const [loading, setLoading] = React.useState(true);

  const [createOpen, setCreateOpen] = React.useState(false);
  const [createForm, setCreateForm] =
    React.useState<FormValues>(EMPTY_FORM);
  const [creating, setCreating] = React.useState(false);

  const [deleting, setDeleting] = React.useState<AdminRow | null>(null);
  const [deletingBusy, setDeletingBusy] = React.useState(false);

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
    if (createForm.password.length < 6) {
      toast.error("密码长度至少 6 位");
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
      setAdmins((prev) => [data.admin!, ...prev]);
      setCreateForm(EMPTY_FORM);
      setCreateOpen(false);
    } catch {
      toast.error("网络错误");
    } finally {
      setCreating(false);
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

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2 text-lg">
            <UsersIcon className="size-4" />
            管理员管理
          </CardTitle>
          <CardDescription>
            添加或移除系统管理员，超级管理员拥有全部权限。
          </CardDescription>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger
            render={
              <Button>
                <PlusIcon />
                新增管理员
              </Button>
            }
          />
          <DialogContent>
            <DialogHeader>
              <DialogTitle>新增管理员</DialogTitle>
              <DialogDescription>
                填写新管理员的姓名、邮箱和初始密码。
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
                  placeholder="例如：王小明"
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
                  placeholder="editor@example.com"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="admin-password">初始密码</Label>
                <Input
                  id="admin-password"
                  type="password"
                  required
                  minLength={6}
                  value={createForm.password}
                  onChange={(e) =>
                    setCreateForm((s) => ({
                      ...s,
                      password: e.target.value,
                    }))
                  }
                  placeholder="至少 6 位"
                />
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
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="normal">普通管理员</SelectItem>
                    <SelectItem value="super">超级管理员</SelectItem>
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
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="text-muted-foreground text-sm">加载中…</div>
        ) : admins.length === 0 ? (
          <div className="text-muted-foreground flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed py-12 text-sm">
            <UsersIcon className="size-6" />
            还没有其他管理员，点击右上角添加吧。
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12"></TableHead>
                <TableHead>姓名</TableHead>
                <TableHead>邮箱</TableHead>
                <TableHead className="w-28">角色</TableHead>
                <TableHead className="w-36">注册时间</TableHead>
                <TableHead className="w-16 text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {admins.map((admin) => {
                const isSelf = admin.id === currentAdminId;
                return (
                  <TableRow key={admin.id}>
                    <TableCell>
                      <div className="bg-muted text-foreground flex size-7 items-center justify-center rounded-full text-xs font-medium">
                        {admin.name?.charAt(0)?.toUpperCase() || "?"}
                      </div>
                    </TableCell>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        {admin.name}
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
                        <Badge>
                          <ShieldCheckIcon />
                          超级管理员
                        </Badge>
                      ) : (
                        <Badge variant="secondary">
                          <UserIcon />
                          普通管理员
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
                              disabled={isSelf}
                              aria-label="更多操作"
                            />
                          }
                        >
                          <MoreHorizontalIcon />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
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
}
