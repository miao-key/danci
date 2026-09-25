// 管理员账户的本地模拟数据层。
// 后面接入 Supabase 时，把里面的实现替换为 supabase client 调用即可，
// 暴露的方法签名（CRUD）保持不变即可最小化改动到上层。

export type AdminRole = "super" | "normal";

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  // 仅用于本地 mock；正式接入后下掉。
  password: string;
  role: AdminRole;
  createdAt: string;
}

export interface WordBook {
  id: string;
  name: string;
  description?: string;
  // 示例封面 emoji/色标，便于 mock 数据展示。
  cover?: string;
  wordCount: number;
  createdAt: string;
  updatedAt: string;
}

// 用 globalThis 持久化，避免 dev 模式 HMR 多次请求之间数据被重置。
const GLOBAL_KEY = "__danci_admin_seed__";

type Seed = {
  admins: AdminUser[];
  books: WordBook[];
};

const seed: Seed = (globalThis as Record<string, unknown>)[GLOBAL_KEY] as
  | Seed
  | undefined
  ??
  (() => {
    const now = new Date().toISOString();
    const initial: Seed = {
      admins: [
        {
          id: "admin-1",
          name: "超级管理员",
          email: "admin@example.com",
          password: "admin123456",
          role: "super",
          createdAt: now,
        },
      ],
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

// ============== Admin ==============

export function listAdmins(): Omit<AdminUser, "password">[] {
  return seed.admins.map(({ password: _password, ...rest }) => {
    void _password;
    return rest;
  });
}

export function findAdminByEmail(
  email: string,
): AdminUser | undefined {
  return seed.admins.find(
    (a) => a.email.toLowerCase() === email.toLowerCase(),
  );
}

export function findAdminById(id: string): AdminUser | undefined {
  return seed.admins.find((a) => a.id === id);
}

export function verifyPassword(
  admin: AdminUser,
  password: string,
): boolean {
  // Mock 阶段明文比较；接 Supabase 后使用 bcrypt / supabase auth。
  return admin.password === password;
}

export interface CreateAdminInput {
  name: string;
  email: string;
  password: string;
  role?: AdminRole;
}

export function createAdmin(input: CreateAdminInput): AdminUser {
  const admin: AdminUser = {
    id: rid("admin"),
    name: input.name,
    email: input.email,
    password: input.password,
    role: input.role ?? "normal",
    createdAt: new Date().toISOString(),
  };
  seed.admins.push(admin);
  return admin;
}

export function deleteAdmin(id: string): boolean {
  const idx = seed.admins.findIndex((a) => a.id === id);
  if (idx === -1) return false;
  seed.admins.splice(idx, 1);
  return true;
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
