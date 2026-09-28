/**
 * 单词书仓储层（基于 Drizzle ORM + Supabase Postgres）
 *
 * 与 `lib/admin-repo.ts` 风格保持一致：
 * - 暴露异步 CRUD
 * - 所有函数返回 `Promise<...>`
 * - 类型从 `@/db/schema` 直接取 `BookRow` / `BookInsert`
 *
 * 数据模型：
 *   books.bookId ⇋ words.bookId   (软关联，不加 FK，避免级联误删单词)
 *   tags 字段：UI 端是逗号分隔字符串，存库时序列化为 JSON 数组字符串
 */
import { asc, eq, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  books,
  words,
  type BookInsert,
  type BookRow,
} from "@/db/schema";

/** 生成 "book-<base36 时间戳>-<6 位随机>" 格式的主键 */
function rid(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

/**
 * 把 UI 上的标签字符串（"初中, PEP, 必考"）转成 JSON 字符串（'["初中","PEP","必考"]'）。
 * 空字符串返回 null（保持数据库语义清晰）。
 */
export function serializeTags(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const arr = raw
    .split(/[,，]/) // 兼容中英文逗号
    .map((s) => s.trim())
    .filter(Boolean);
  if (arr.length === 0) return null;
  return JSON.stringify(arr);
}

/** 把数据库里的 tags JSON 字符串反序列化为字符串数组 */
export function deserializeTags(json: string | null): string[] {
  if (!json) return [];
  try {
    const v = JSON.parse(json);
    if (Array.isArray(v)) {
      return v.filter((x): x is string => typeof x === "string");
    }
    return [];
  } catch {
    return [];
  }
}

/** 给前端用的"脱敏"视图：tags 是数组，日期是字符串 */
export interface BookView {
  id: string;
  title: string | null;
  wordCount: number | null;
  coverUrl: string | null;
  bookId: string;
  tags: string[];
  /** 创建时间：列表排序键 + 列表展示列。编辑时不变。 */
  createdAt: string;
  /** 更新时间：仅审计用途，列表**不**展示也不用于排序。 */
  updatedAt: string;
}

function toView(row: BookRow): BookView {
  return {
    id: row.id,
    title: row.title,
    wordCount: row.wordCount,
    coverUrl: row.coverUrl,
    bookId: row.bookId,
    tags: deserializeTags(row.tags),
    createdAt:
      row.createdAt instanceof Date
        ? row.createdAt.toISOString()
        : String(row.createdAt),
    updatedAt:
      row.updatedAt instanceof Date
        ? row.updatedAt.toISOString()
        : String(row.updatedAt),
  };
}

/**
 * 列出所有单词书
 *
 * 排序：**按创建时间升序**（最老的在最上，最新的在最下）。
 * - 用 createdAt 而非 updatedAt：编辑书本不应改变它在列表中的位置，
 *   否则用户改个标题，书就"跳"到别处去了。
 * - bookId 作二级排序键：createdAt 精度有限（同一瞬间创建的两本书会并列），
 *   加 unique 键兜底保证顺序稳定可复现。
 * - 前端新增用 `[...prev, newBook]` 追加，与此顺序保持一致。
 */
export async function listBooks(): Promise<BookView[]> {
  const rows = await db
    .select()
    .from(books)
    .orderBy(asc(books.createdAt), asc(books.bookId));
  return rows.map(toView);
}

/** 按 bookId 查询（用于按书加载单词时的关联校验） */
export async function findBookByBookId(
  bookId: string,
): Promise<BookView | null> {
  const rows = await db
    .select()
    .from(books)
    .where(eq(books.bookId, bookId))
    .limit(1);
  return rows[0] ? toView(rows[0]) : null;
}

export interface CreateBookInput {
  title: string;
  bookId: string;
  wordCount?: number;
  coverUrl?: string | null;
  tags?: string | null;
}

/**
 * 新增一本书。
 * 注意：bookId 是 unique 列；这里**先查再插**，给业务方返回 4xx 而非 500。
 * （DB unique 约束的 23505 错误码 catch 在更上一层做兜底）
 */
export async function createBook(input: CreateBookInput): Promise<BookView> {
  const existing = await findBookByBookId(input.bookId);
  if (existing) {
    throw new BookAlreadyExistsError(input.bookId);
  }

  const row: BookInsert = {
    id: rid("book"),
    title: input.title,
    bookId: input.bookId,
    wordCount: input.wordCount ?? 0,
    coverUrl: input.coverUrl ?? null,
    tags: serializeTags(input.tags),
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const [inserted] = await db.insert(books).values(row).returning();
  if (!inserted) {
    throw new Error("创建单词书失败");
  }
  return toView(inserted);
}

export interface UpdateBookInput {
  id: string;
  title?: string;
  wordCount?: number;
  coverUrl?: string | null;
  tags?: string | null;
  // bookId 不允许改：它是 words 表的外联锚点，改了会断关联
}

export async function updateBook(
  input: UpdateBookInput,
): Promise<BookView | null> {
  const updates: Partial<BookRow> = {
    updatedAt: new Date(),
  };
  // 注意：这里**绝不能**写 createdAt —— 它是列表的排序键，
  // 一旦编辑时被改动，书本就会在列表中"跳位"。
  if (input.title !== undefined) updates.title = input.title;
  if (input.wordCount !== undefined) updates.wordCount = input.wordCount;
  if (input.coverUrl !== undefined) updates.coverUrl = input.coverUrl;
  if (input.tags !== undefined) updates.tags = serializeTags(input.tags);

  const rows = await db
    .update(books)
    .set(updates)
    .where(eq(books.id, input.id))
    .returning();
  return rows[0] ? toView(rows[0]) : null;
}

/**
 * 删除单词书（级联删除该书的所有单词）
 *
 * ⚠️ 数据关联设计说明：
 * schema 里**故意没有**在 words.bookId 上建指向 books.bookId 的外键 + CASCADE
 * （见 db/schema.ts 注释）—— 那是为了防止"误删一本书 ⇒ 静默丢掉几万条单词"。
 * 但删除是用户的明确意图，所以这里在**应用层用事务显式级联**：
 *
 *   1. 先按 books.id 查出该书的 bookId（words 表存的是 bookId，不是 books.id）
 *   2. 删 words WHERE bookId = ?
 *   3. 删 books WHERE id = ?
 *
 * 用事务保证 2、3 原子：要么都成功，要么都回滚，
 * 绝不会出现"单词没了但书还在"或"书没了但单词成孤儿"的中间态。
 *
 * @param id books.id（形如 "book-m0abc-xyz123"）
 * @returns 实际删除的单词条数；书不存在时返回 null
 */
export async function deleteBook(id: string): Promise<number | null> {
  return db.transaction(async (tx) => {
    // 1. 先取出 bookId —— words 表按 bookId 关联，不是 books.id
    const [target] = await tx
      .select({ bookId: books.bookId })
      .from(books)
      .where(eq(books.id, id))
      .limit(1);

    if (!target) return null;

    // 2. 级联删除该书的所有单词
    const deletedWords = await tx
      .delete(words)
      .where(eq(words.bookId, target.bookId))
      .returning({ id: words.id });

    // 3. 删除书本记录
    await tx.delete(books).where(eq(books.id, id));

    return deletedWords.length;
  });
}

/** 统计某本书的单词数（备用，UI 一般读冗余 wordCount） */
export async function countWordsByBookId(bookId: string): Promise<number> {
  const [{ value }] = await db.execute<{
    value: string | number;
  }>(sql`SELECT count(*)::int AS value FROM words WHERE "bookId" = ${bookId}`);
  return Number(value);
}

// ============== 错误类型 ==============

export class BookAlreadyExistsError extends Error {
  constructor(bookId: string) {
    super(`bookId '${bookId}' 已存在`);
    this.name = "BookAlreadyExistsError";
  }
}
