/**
 * 数据表结构定义（按 README 第 71-74 行约定）
 *
 * 在这里用 `pgTable` 定义数据表。
 */
import { sql } from "drizzle-orm";
import { pgEnum, pgTable, text, timestamp } from "drizzle-orm/pg-core";

/**
 * 管理员角色枚举
 * - super：系统管理员（首个注册者永远是 super，可管理其他管理员）
 * - normal：普通管理员（只能使用单词书等业务功能）
 */
export const adminRoleEnum = pgEnum("admin_role", ["super", "normal"]);

/**
 * 管理员账号状态枚举
 * - active  ：正常启用，可登录后台
 * - disabled：停用，禁止登录（保留账号与历史数据）
 */
export const adminStatusEnum = pgEnum("admin_status", [
  "active",
  "disabled",
]);

/**
 * 管理员账户表
 */
export const adminUsers = pgTable("admin_users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: adminRoleEnum("role").notNull().default("normal"),
  status: adminStatusEnum("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/**
 * 管理员登录会话表
 * - sessionId：写入 HttpOnly cookie 的值（随机字符串）
 * - adminId：所属管理员
 * - expiresAt：7 天后过期；服务端读 cookie 时回查并校验过期
 */
export const adminSession = pgTable("admin_session", {
  id: text("id").primaryKey(),
  adminId: text("admin_id")
    .notNull()
    .references(() => adminUsers.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});

// 导出类型，方便上层使用
export type AdminUserRow = typeof adminUsers.$inferSelect;
export type AdminUserInsert = typeof adminUsers.$inferInsert;
export type AdminSessionRow = typeof adminSession.$inferSelect;
export type AdminSessionInsert = typeof adminSession.$inferInsert;
export type AdminRole = (typeof adminRoleEnum.enumValues)[number]; // "super" | "normal"
export type AdminStatus = (typeof adminStatusEnum.enumValues)[number]; // "active" | "disabled"

// 业务上需要的视图类型：不含 passwordHash
export type SafeAdmin = {
  id: string;
  name: string;
  email: string;
  role: AdminRole;
  status: AdminStatus;
  createdAt: Date | string;
};

// 让 `sql` 保持导入（drizzle-orm 工具函数，后续可能用到）
export { sql };
