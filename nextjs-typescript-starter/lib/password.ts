/**
 * 密码哈希。
 *
 * 用项目已有的 `bcrypt-ts`（原生绑定，rounds=10）。
 *
 * ⚠️ `bcrypt-ts` 是 **Node.js 原生模块**，不能跑在 Edge Runtime 上。
 *    Server Action 默认就是 Node runtime，无需额外声明；
 *    但如果把这个文件 import 进 middleware，会直接构建失败。
 *    docs/design.md 附录 B 建议长期迁到纯 JS 的 `bcryptjs`。
 */
import { genSaltSync, hashSync } from 'bcrypt-ts';

const ROUNDS = 10;

export function hashPassword(plain: string): string {
  return hashSync(plain, genSaltSync(ROUNDS));
}
