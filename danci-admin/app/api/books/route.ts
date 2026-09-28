/**
 * /api/books  单词书 CRUD
 *
 * - GET    ：列出全部单词书（任意已登录管理员可访问）
 * - POST   ：新增单词书（任意已登录管理员可访问）
 * - PATCH  ：更新单词书（任意已登录管理员可访问；不允许改 bookId）
 * - DELETE ：删除单词书（任意已登录管理员可访问）
 *
 * 鉴权：使用 `requireSession`（普通管理员即可），与 `requireSuper`（仅超管）
 * 区分开 —— 单词书是日常业务。
 */
import { NextResponse } from "next/server";

import { requireSession } from "@/lib/admin-guard";
import {
  BookAlreadyExistsError,
  createBook,
  deleteBook,
  listBooks,
  updateBook,
} from "@/lib/book-repo";

export const dynamic = "force-dynamic";

export async function GET() {
  const guard = await requireSession();
  if (!guard.ok) return guard.response;
  return NextResponse.json({ books: await listBooks() });
}

interface CreateBody {
  title?: unknown;
  bookId?: unknown;
  wordCount?: unknown;
  coverUrl?: unknown;
  tags?: unknown;
}

export async function POST(request: Request) {
  const guard = await requireSession();
  if (!guard.ok) return guard.response;

  const body = (await request.json().catch(() => ({}))) as CreateBody;
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const bookId = typeof body.bookId === "string" ? body.bookId.trim() : "";
  const coverUrl =
    typeof body.coverUrl === "string" && body.coverUrl.trim().length > 0
      ? body.coverUrl.trim()
      : null;
  const tagsRaw = typeof body.tags === "string" ? body.tags : "";
  const wordCount =
    typeof body.wordCount === "number"
      ? body.wordCount
      : Number.parseInt(String(body.wordCount ?? "0"), 10) || 0;

  if (!title) {
    return NextResponse.json(
      { error: "请输入单词书标题" },
      { status: 400 },
    );
  }
  if (!bookId) {
    return NextResponse.json(
      { error: "请输入 bookId" },
      { status: 400 },
    );
  }
  if (!/^[A-Za-z0-9_\-]+$/.test(bookId)) {
    return NextResponse.json(
      { error: "bookId 只能包含字母、数字、下划线和短横线" },
      { status: 400 },
    );
  }

  try {
    const book = await createBook({
      title,
      bookId,
      wordCount,
      coverUrl,
      tags: tagsRaw,
    });
    return NextResponse.json({ book });
  } catch (err) {
    if (err instanceof BookAlreadyExistsError) {
      return NextResponse.json(
        { error: "该 bookId 已存在" },
        { status: 409 },
      );
    }
    if (String((err as { code?: string })?.code) === "23505") {
      // 兜底：DB unique 约束冲突
      return NextResponse.json(
        { error: "该 bookId 已存在" },
        { status: 409 },
      );
    }
    console.error("[api/books POST]", err);
    return NextResponse.json(
      { error: "服务器错误" },
      { status: 500 },
    );
  }
}

interface UpdateBody {
  id?: unknown;
  title?: unknown;
  wordCount?: unknown;
  coverUrl?: unknown;
  tags?: unknown;
}

export async function PATCH(request: Request) {
  const guard = await requireSession();
  if (!guard.ok) return guard.response;

  const body = (await request.json().catch(() => ({}))) as UpdateBody;
  if (typeof body.id !== "string") {
    return NextResponse.json({ error: "缺少 id" }, { status: 400 });
  }
  if (typeof body.title === "string" && body.title.trim().length === 0) {
    return NextResponse.json(
      { error: "标题不能为空" },
      { status: 400 },
    );
  }

  const book = await updateBook({
    id: body.id,
    title: typeof body.title === "string" ? body.title.trim() : undefined,
    wordCount:
      typeof body.wordCount === "number"
        ? body.wordCount
        : Number.isFinite(Number(body.wordCount))
          ? Number(body.wordCount)
          : undefined,
    coverUrl:
      body.coverUrl === null
        ? null
        : typeof body.coverUrl === "string"
          ? body.coverUrl.trim()
          : undefined,
    tags: typeof body.tags === "string" ? body.tags : undefined,
  });

  if (!book) {
    return NextResponse.json(
      { error: "单词书不存在" },
      { status: 404 },
    );
  }
  return NextResponse.json({ book });
}

export async function DELETE(request: Request) {
  const guard = await requireSession();
  if (!guard.ok) return guard.response;

  const id = new URL(request.url).searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "缺少 id" }, { status: 400 });
  }

  let deletedWords: number;
  try {
    const result = await deleteBook(id);
    if (result === null) {
      return NextResponse.json(
        { error: "单词书不存在" },
        { status: 404 },
      );
    }
    deletedWords = result;
  } catch (err) {
    console.error("[api/books DELETE]", err);
    return NextResponse.json(
      { error: "删除失败，单词数据未能同步清理" },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, deletedWords });
}
