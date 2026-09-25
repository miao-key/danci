"use client";

import * as React from "react";
import { toast } from "sonner";
import {
  BookOpenIcon,
  MoreHorizontalIcon,
  PencilIcon,
  PlusIcon,
  Trash2Icon,
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import type { WordBook } from "@/lib/store";

interface BookFormValues {
  name: string;
  description: string;
  cover: string;
  wordCount: string;
}

const EMPTY_FORM: BookFormValues = {
  name: "",
  description: "",
  cover: "📚",
  wordCount: "0",
};

function formatDate(iso: string) {
  try {
    const d = new Date(iso);
    return d.toLocaleString("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function WordBooksManager() {
  const [books, setBooks] = React.useState<WordBook[]>([]);
  const [loading, setLoading] = React.useState(true);

  const [createOpen, setCreateOpen] = React.useState(false);
  const [createForm, setCreateForm] =
    React.useState<BookFormValues>(EMPTY_FORM);
  const [creating, setCreating] = React.useState(false);

  const [editing, setEditing] = React.useState<WordBook | null>(null);
  const [editForm, setEditForm] =
    React.useState<BookFormValues>(EMPTY_FORM);
  const [saving, setSaving] = React.useState(false);

  const [deleting, setDeleting] = React.useState<WordBook | null>(null);
  const [deletingBusy, setDeletingBusy] = React.useState(false);

  const fetchBooks = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/books", { cache: "no-store" });
      const data = (await res.json()) as {
        books?: WordBook[];
        error?: string;
      };
      if (!res.ok) {
        toast.error(data.error ?? "加载单词书失败");
        return;
      }
      setBooks(data.books ?? []);
    } catch {
      toast.error("网络错误");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    const id = window.setTimeout(() => {
      void fetchBooks();
    }, 0);
    return () => window.clearTimeout(id);
  }, [fetchBooks]);

  async function handleCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (creating) return;
    if (!createForm.name.trim()) {
      toast.error("请输入单词书名称");
      return;
    }
    setCreating(true);
    try {
      const res = await fetch("/api/books", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: createForm.name,
          description: createForm.description,
          cover: createForm.cover,
          wordCount: Number(createForm.wordCount) || 0,
        }),
      });
      const data = (await res.json()) as {
        book?: WordBook;
        error?: string;
      };
      if (!res.ok || !data.book) {
        toast.error(data.error ?? "创建失败");
        return;
      }
      toast.success("单词书已创建");
      setBooks((prev) => [data.book!, ...prev]);
      setCreateForm(EMPTY_FORM);
      setCreateOpen(false);
    } catch {
      toast.error("网络错误");
    } finally {
      setCreating(false);
    }
  }

  function openEdit(book: WordBook) {
    setEditing(book);
    setEditForm({
      name: book.name,
      description: book.description ?? "",
      cover: book.cover ?? "📚",
      wordCount: String(book.wordCount ?? 0),
    });
  }

  async function handleEdit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing || saving) return;
    if (!editForm.name.trim()) {
      toast.error("请输入单词书名称");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/books", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editing.id,
          name: editForm.name,
          description: editForm.description,
          cover: editForm.cover,
          wordCount: Number(editForm.wordCount) || 0,
        }),
      });
      const data = (await res.json()) as {
        book?: WordBook;
        error?: string;
      };
      if (!res.ok || !data.book) {
        toast.error(data.error ?? "更新失败");
        return;
      }
      toast.success("已更新");
      setBooks((prev) =>
        prev.map((b) => (b.id === data.book!.id ? data.book! : b)),
      );
      setEditing(null);
    } catch {
      toast.error("网络错误");
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    if (!deleting || deletingBusy) return;
    setDeletingBusy(true);
    try {
      const res = await fetch(
        `/api/books?id=${encodeURIComponent(deleting.id)}`,
        { method: "DELETE" },
      );
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        toast.error(data.error ?? "删除失败");
        return;
      }
      toast.success("已删除");
      setBooks((prev) => prev.filter((b) => b.id !== deleting.id));
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
            <BookOpenIcon className="size-4" />
            单词书管理
          </CardTitle>
          <CardDescription>
            维护后台可用的单词书，包括创建、编辑和删除。
          </CardDescription>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger
            render={
              <Button>
                <PlusIcon />
                新建单词书
              </Button>
            }
          />
          <DialogContent>
            <DialogHeader>
              <DialogTitle>新建单词书</DialogTitle>
              <DialogDescription>
                填写单词书的基本信息，留空描述也可以。
              </DialogDescription>
            </DialogHeader>
            <form
              id="create-book-form"
              onSubmit={handleCreate}
              className="space-y-4"
            >
              <Field
                id="book-name"
                label="名称"
                value={createForm.name}
                onChange={(v) =>
                  setCreateForm((s) => ({ ...s, name: v }))
                }
                placeholder="例如：高考英语词汇"
                required
              />
              <Field
                id="book-desc"
                label="描述"
                value={createForm.description}
                onChange={(v) =>
                  setCreateForm((s) => ({ ...s, description: v }))
                }
                placeholder="可选"
              />
              <div className="grid grid-cols-2 gap-4">
                <Field
                  id="book-cover"
                  label="封面（emoji 或文字）"
                  value={createForm.cover}
                  onChange={(v) =>
                    setCreateForm((s) => ({ ...s, cover: v }))
                  }
                />
                <Field
                  id="book-count"
                  label="单词数"
                  type="number"
                  value={createForm.wordCount}
                  onChange={(v) =>
                    setCreateForm((s) => ({ ...s, wordCount: v }))
                  }
                  min={0}
                />
              </div>
            </form>
            <DialogFooter>
              <DialogClose render={<Button variant="outline" />}>
                取消
              </DialogClose>
              <Button
                type="submit"
                form="create-book-form"
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
        ) : books.length === 0 ? (
          <div className="text-muted-foreground flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed py-12 text-sm">
            <BookOpenIcon className="size-6" />
            还没有单词书，点击右上角创建吧～
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12"></TableHead>
                <TableHead>名称</TableHead>
                <TableHead>描述</TableHead>
                <TableHead className="w-24 text-right">单词数</TableHead>
                <TableHead className="w-44">更新时间</TableHead>
                <TableHead className="w-16 text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {books.map((book) => (
                <TableRow key={book.id}>
                  <TableCell className="text-xl">
                    {book.cover ?? "📚"}
                  </TableCell>
                  <TableCell className="font-medium">{book.name}</TableCell>
                  <TableCell className="text-muted-foreground max-w-[280px] truncate">
                    {book.description || "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    <Badge variant="secondary">
                      {book.wordCount.toLocaleString()}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {formatDate(book.updatedAt)}
                  </TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={
                          <Button variant="ghost" size="icon-sm" />
                        }
                        aria-label="更多操作"
                      >
                        <MoreHorizontalIcon />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => openEdit(book)}>
                          <PencilIcon />
                          编辑
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          variant="destructive"
                          onClick={() => setDeleting(book)}
                        >
                          <Trash2Icon />
                          删除
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      {/* Edit Dialog */}
      <Dialog
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>编辑单词书</DialogTitle>
            <DialogDescription>
              更新 &ldquo;{editing?.name}&rdquo; 的信息。
            </DialogDescription>
          </DialogHeader>
          <form
            id="edit-book-form"
            onSubmit={handleEdit}
            className="space-y-4"
          >
            <Field
              id="edit-book-name"
              label="名称"
              value={editForm.name}
              onChange={(v) => setEditForm((s) => ({ ...s, name: v }))}
              required
            />
            <Field
              id="edit-book-desc"
              label="描述"
              value={editForm.description}
              onChange={(v) =>
                setEditForm((s) => ({ ...s, description: v }))
              }
            />
            <div className="grid grid-cols-2 gap-4">
              <Field
                id="edit-book-cover"
                label="封面"
                value={editForm.cover}
                onChange={(v) => setEditForm((s) => ({ ...s, cover: v }))}
              />
              <Field
                id="edit-book-count"
                label="单词数"
                type="number"
                value={editForm.wordCount}
                onChange={(v) =>
                  setEditForm((s) => ({ ...s, wordCount: v }))
                }
                min={0}
              />
            </div>
          </form>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>
              取消
            </DialogClose>
            <Button type="submit" form="edit-book-form" disabled={saving}>
              {saving ? "保存中…" : "保存"}
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
            <DialogTitle>删除单词书？</DialogTitle>
            <DialogDescription>
              确认删除 &ldquo;{deleting?.name}&rdquo;？该操作不可撤销。
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

interface FieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  required?: boolean;
  min?: number;
}

function Field({
  id,
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  required,
  min,
}: FieldProps) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        min={min}
      />
    </div>
  );
}
