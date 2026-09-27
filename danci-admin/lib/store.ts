/**
 * 本地数据层：仅保留 word_books 的 mock 实现（待迁移到 Drizzle）。
 *
 * 管理员相关的 CRUD 已迁移到 `@/lib/admin-repo`，此处不再导出。
 * 这里保留旧的 `AdminRole` 类型只是为了兼容尚未改完的 UI 文件，
 * 一旦 UI 全部迁完就删除。
 */

export type AdminRole = "super" | "normal";

export interface WordBook {
  id: string;
  name: string;
  description?: string;
  cover?: string;
  wordCount: number;
  createdAt: string;
  updatedAt: string;
}

// 用 globalThis 持久化，避免 dev 模式 HMR 多次请求之间数据被重置。
const GLOBAL_KEY = "__danci_admin_seed__";

type Seed = {
  books: WordBook[];
};

const seed: Seed = (globalThis as Record<string, unknown>)[GLOBAL_KEY] as
  | Seed
  | undefined ??
  (() => {
    const now = new Date().toISOString();
    const initial: Seed = {
      books: [
        {
          id: "book-1",
          name: "高考英语词汇",
          description: "高考必备 3500 词",
          cover: "📘",
          wordCount: 3500,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: "book-2",
          name: "CET-4 核心词汇",
          description: "大学英语四级高频词",
          cover: "📗",
          wordCount: 2607,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: "book-3",
          name: "雅思词汇真经",
          description: "雅思考试必备词汇",
          cover: "📕",
          wordCount: 4500,
          createdAt: now,
          updatedAt: now,
        },
      ],
    };
    (globalThis as Record<string, unknown>)[GLOBAL_KEY] = initial;
    return initial;
  })();

function rid(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

// ============== WordBook ==============

export function listBooks(): WordBook[] {
  return [...seed.books].sort((a, b) =>
    b.updatedAt.localeCompare(a.updatedAt),
  );
}

export function findBookById(id: string): WordBook | undefined {
  return seed.books.find((b) => b.id === id);
}

export interface CreateBookInput {
  name: string;
  description?: string;
  cover?: string;
  wordCount?: number;
}

export function createBook(input: CreateBookInput): WordBook {
  const now = new Date().toISOString();
  const book: WordBook = {
    id: rid("book"),
    name: input.name,
    description: input.description,
    cover: input.cover ?? "📚",
    wordCount: input.wordCount ?? 0,
    createdAt: now,
    updatedAt: now,
  };
  seed.books.push(book);
  return book;
}

export interface UpdateBookInput {
  id: string;
  name?: string;
  description?: string;
  cover?: string;
  wordCount?: number;
}

export function updateBook(input: UpdateBookInput): WordBook | undefined {
  const book = findBookById(input.id);
  if (!book) return undefined;
  if (input.name !== undefined) book.name = input.name;
  if (input.description !== undefined) book.description = input.description;
  if (input.cover !== undefined) book.cover = input.cover;
  if (input.wordCount !== undefined) book.wordCount = input.wordCount;
  book.updatedAt = new Date().toISOString();
  return book;
}

export function deleteBook(id: string): boolean {
  const idx = seed.books.findIndex((b) => b.id === id);
  if (idx === -1) return false;
  seed.books.splice(idx, 1);
  return true;
}
