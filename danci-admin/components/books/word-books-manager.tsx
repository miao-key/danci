"use client";

import * as React from "react";
import Image from "next/image";
import { toast } from "sonner";
import {
  BookOpenIcon,
  ImageOffIcon,
  MoreHorizontalIcon,
  PencilIcon,
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

/** 单词书（前端视图） */
export interface WordBook {
  id: string;
  title: string | null;
  wordCount: number | null;
  coverUrl: string | null;
  bookId: string;
  tags: string[];
  /** 创建时间 —— 列表按它升序排列（最老在上，最新在下） */
  createdAt: string;
}

interface BookFormValues {
  title: string;
  bookId: string;
  wordCount: string;
  coverUrl: string;
  tags: string;
}

const EMPTY_FORM: BookFormValues = {
  title: "",
  bookId: "",
  wordCount: "0",
  coverUrl: "",
  tags: "",
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

export interface WordBooksManagerHandle {
  /** 打开"新建单词书"对话框（由外部 trigger 调用） */
  openCreate: () => void;
}

export const WordBooksManager = React.forwardRef<
  WordBooksManagerHandle,
  object
>(function WordBooksManager(_props, ref) {
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

  // 暴露 imperative API：让父级"新增单词书"按钮能打开 Dialog
  React.useImperativeHandle(
    ref,
    () => ({
      openCreate: () => setCreateOpen(true),
    }),
    [],
  );

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
    if (!createForm.title.trim()) {
      toast.error("请输入标题");
      return;
    }
    if (!createForm.bookId.trim()) {
      toast.error("请输入 bookId");
      return;
    }
    setCreating(true);
    try {
      const res = await fetch("/api/books", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: createForm.title,
          bookId: createForm.bookId,
          wordCount: Number(createForm.wordCount) || 0,
          coverUrl: createForm.coverUrl,
          tags: createForm.tags,
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
      // 追加到末尾，与后端 listBooks 的"按创建时间升序"保持一致，
      // 避免新增后跳到顶部、刷新后又落到别处的错位
      setBooks((prev) => [...prev, data.book!]);
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
      title: book.title ?? "",
      bookId: book.bookId,
      wordCount: String(book.wordCount ?? 0),
      coverUrl: book.coverUrl ?? "",
      tags: book.tags.join(", "),
    });
  }

  async function handleEdit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing || saving) return;
    if (!editForm.title.trim()) {
      toast.error("请输入标题");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/books", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editing.id,
          title: editForm.title,
          wordCount: Number(editForm.wordCount) || 0,
          coverUrl: editForm.coverUrl,
          tags: editForm.tags,
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
      const data = (await res.json()) as {
        error?: string;
        deletedWords?: number;
      };
      if (!res.ok) {
        toast.error(data.error ?? "删除失败");
        return;
      }
      const n = data.deletedWords ?? 0;
      toast.success(
        n > 0 ? `已删除，同时清理 ${n.toLocaleString()} 个单词` : "已删除",
      );
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
            单词书列表
          </CardTitle>
          <CardDescription>
            {loading
              ? "加载中…"
              : `共 ${books.length.toLocaleString()} 本单词书`}
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        {books.length === 0 ? (
          <div className="text-muted-foreground flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed py-12 text-sm">
            <BookOpenIcon className="size-6" />
            还没有单词书，点击右上角创建吧～
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[64px] pl-2">
                  <span className="block text-center">封面</span>
                </TableHead>
                <TableHead className="w-[220px]">标题</TableHead>
                <TableHead className="w-[140px]">bookId</TableHead>
                <TableHead className="w-[96px] pr-4 text-right">
                  单词数
                </TableHead>
                <TableHead className="w-[200px] pl-4">标签</TableHead>
                <TableHead className="w-[150px]">创建时间</TableHead>
                <TableHead className="w-[64px] text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {books.map((book) => (
                <TableRow key={book.id}>
                  <TableCell className="align-middle pl-2">
                    <div className="flex justify-center">
                      <BookCover
                        url={book.coverUrl}
                        title={book.title ?? book.bookId}
                      />
                    </div>
                  </TableCell>
                  <TableCell className="align-middle font-medium">
                    <div
                      className="line-clamp-2 leading-snug"
                      title={book.title ?? ""}
                    >
                      {book.title ?? (
                        <span className="text-muted-foreground">（未命名）</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="align-middle">
                    <div
                      className="truncate font-mono text-xs"
                      title={book.bookId}
                    >
                      {book.bookId}
                    </div>
                  </TableCell>
                  <TableCell className="align-middle pr-4 text-right">
                    <Badge variant="secondary" className="tabular-nums">
                      {(book.wordCount ?? 0).toLocaleString()}
                    </Badge>
                  </TableCell>
                  <TableCell className="align-middle pl-4">
                    <TagList tags={book.tags} />
                  </TableCell>
                  <TableCell className="text-muted-foreground align-middle text-sm tabular-nums">
                    {formatDate(book.createdAt)}
                  </TableCell>
                  <TableCell className="align-middle text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={<Button variant="ghost" size="icon-sm" />}
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

      {/* Create Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-semibold">新增单词书</DialogTitle>
            <DialogDescription>
              填写单词书基本信息并创建
            </DialogDescription>
          </DialogHeader>
          <form
            id="create-book-form"
            onSubmit={handleCreate}
            className="space-y-4"
          >
            <Field
              id="create-book-title"
              label="标题"
              value={createForm.title}
              onChange={(v) =>
                setCreateForm((s) => ({ ...s, title: v }))
              }
              placeholder="例如：高考英语词汇"
              required
            />
            <Field
              id="create-book-id"
              label="bookId"
              value={createForm.bookId}
              onChange={(v) =>
                setCreateForm((s) => ({ ...s, bookId: v }))
              }
              placeholder="例如：CET4_2"
              required
            />
            <Field
              id="create-book-count"
              label="单词数量"
              type="number"
              value={createForm.wordCount}
              onChange={(v) =>
                setCreateForm((s) => ({ ...s, wordCount: v }))
              }
              min={0}
            />
            <Field
              id="create-book-cover"
              label="封面 URL"
              value={createForm.coverUrl}
              onChange={(v) =>
                setCreateForm((s) => ({ ...s, coverUrl: v }))
              }
              placeholder="https://example.com/cover.jpg"
            />
            <Field
              id="create-book-tags"
              label="标签"
              value={createForm.tags}
              onChange={(v) => setCreateForm((s) => ({ ...s, tags: v }))}
              placeholder="逗号分隔，例如：人教版，六年级"
            />
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

      {/* Edit Dialog */}
      <Dialog
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <PencilIcon className="size-4" />
              编辑单词书
            </DialogTitle>
            <DialogDescription>
              更新 &ldquo;{editing?.title ?? editing?.bookId}&rdquo; 的信息（bookId
              不可改）。
            </DialogDescription>
          </DialogHeader>
          <form
            id="edit-book-form"
            onSubmit={handleEdit}
            className="space-y-4"
          >
            <Field
              id="edit-book-title"
              label="标题"
              value={editForm.title}
              onChange={(v) => setEditForm((s) => ({ ...s, title: v }))}
              required
            />
            <div className="space-y-2">
              <Label htmlFor="edit-book-id">bookId</Label>
              <Input
                id="edit-book-id"
                value={editForm.bookId}
                disabled
                className="bg-muted"
              />
              <p className="text-muted-foreground text-xs">
                bookId 与单词数据关联，修改会破坏关联关系，因此不可修改
              </p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Field
                id="edit-book-count"
                label="单词数量"
                type="number"
                value={editForm.wordCount}
                onChange={(v) =>
                  setEditForm((s) => ({ ...s, wordCount: v }))
                }
                min={0}
              />
              <Field
                id="edit-book-cover"
                label="封面 URL"
                value={editForm.coverUrl}
                onChange={(v) =>
                  setEditForm((s) => ({ ...s, coverUrl: v }))
                }
                placeholder="https://example.com/cover.jpg"
              />
            </div>
            <Field
              id="edit-book-tags"
              label="标签"
              value={editForm.tags}
              onChange={(v) => setEditForm((s) => ({ ...s, tags: v }))}
              placeholder="逗号分隔，例如：人教版，六年级"
            />
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
            <DialogTitle>删除单词书</DialogTitle>
            <DialogDescription>
              确认删除 &ldquo;{deleting?.title ?? deleting?.bookId}&rdquo;？
              <br />
              该书下的{" "}
              <span className="text-foreground font-medium tabular-nums">
                {(deleting?.wordCount ?? 0).toLocaleString()}
              </span>{" "}
              个单词也会一并删除，此操作不可撤销。
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

// ============== 子组件 ==============

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

/** 封面缩略图：失败时显示图标占位 */
function BookCover({ url, title }: { url: string | null; title: string }) {
  const [failed, setFailed] = React.useState(false);

  if (!url || failed) {
    return (
      <div className="bg-muted text-muted-foreground flex h-[66px] w-[44px] items-center justify-center rounded-md border shadow-xs">
        {failed ? (
          <ImageOffIcon className="size-5" />
        ) : (
          <BookOpenIcon className="size-5" />
        )}
      </div>
    );
  }

  return (
    <div className="bg-muted relative h-[66px] w-[44px] overflow-hidden rounded-md border shadow-xs">
      <Image
        src={url}
        alt={title}
        fill
        sizes="44px"
        className="object-cover"
        onError={() => setFailed(true)}
        unoptimized
      />
    </div>
  );
}

/** 标签列表（多余用 +N 折叠） */
function TagList({ tags }: { tags: string[] }) {
  if (tags.length === 0) {
    return <span className="text-muted-foreground text-xs">—</span>;
  }
  const visible = tags.slice(0, 3);
  const extra = tags.length - visible.length;
  return (
    <div className="flex flex-wrap items-center gap-1">
      {visible.map((t, i) => (
        <Badge key={i} variant="outline" className="text-xs">
          {t}
        </Badge>
      ))}
      {extra > 0 && (
        <span className="text-muted-foreground text-xs">+{extra}</span>
      )}
    </div>
  );
}
