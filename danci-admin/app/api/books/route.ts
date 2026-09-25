import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth";
import {
  createBook,
  deleteBook,
  listBooks,
  updateBook,
} from "@/lib/store";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }
  return NextResponse.json({ books: listBooks() });
}

interface CreateBody {
  name?: unknown;
  description?: unknown;
  cover?: unknown;
  wordCount?: unknown;
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as CreateBody;
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) {
    return NextResponse.json(
      { error: "单词书名称不能为空" },
      { status: 400 },
    );
  }
  const description =
    typeof body.description === "string" ? body.description.trim() : "";
  const cover = typeof body.cover === "string" ? body.cover.trim() : "";
  const wordCount =
    typeof body.wordCount === "number"
      ? body.wordCount
      : Number.parseInt(String(body.wordCount ?? "0"), 10) || 0;

  const book = createBook({
    name,
    description: description || undefined,
    cover: cover || undefined,
    wordCount,
  });
  return NextResponse.json({ book });
}

interface UpdateBody {
  id?: unknown;
  name?: unknown;
  description?: unknown;
  cover?: unknown;
  wordCount?: unknown;
}

export async function PATCH(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }
  const body = (await request.json().catch(() => ({}))) as UpdateBody;
  if (typeof body.id !== "string") {
    return NextResponse.json({ error: "缺少 id" }, { status: 400 });
  }
  const book = updateBook({
    id: body.id,
    name:
      typeof body.name === "string"
        ? body.name.trim()
        : undefined,
    description:
      typeof body.description === "string"
        ? body.description
        : undefined,
    cover: typeof body.cover === "string" ? body.cover : undefined,
    wordCount:
      typeof body.wordCount === "number"
        ? body.wordCount
        : Number.isFinite(Number(body.wordCount))
          ? Number(body.wordCount)
          : undefined,
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
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }
  const id = new URL(request.url).searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "缺少 id" }, { status: 400 });
  }
  const ok = deleteBook(id);
  if (!ok) {
    return NextResponse.json(
      { error: "单词书不存在" },
      { status: 404 },
    );
  }
  return NextResponse.json({ ok: true });
}
