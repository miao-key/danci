/**
 * 学习页 Server Actions。
 *
 * ## ⚠️ 鉴权绝不可省略（docs/design.md 8.3）
 *
 * Server Action 是**公开的 HTTP 端点**，前端不显示按钮 ≠ 不能被调用。
 * 所以每个 action **函数体首行**都自查 `currentUser()`，
 * 且 `userId` **一律从 session 取，绝不从 formData 取** ——
 * 否则用户可以伪造别人的 userId 写入进度。
 */
'use server';

import { currentUser } from '@/lib/auth';
import { saveProgress, touchWordRecord } from '@/lib/progress-repo';

/** 点「下一个」时记录当前单词已学。 */
export async function touchWordAction(formData: FormData): Promise<void> {
  const user = await currentUser();
  if (!user) throw new Error('UNAUTHORIZED');

  const bookId = String(formData.get('bookId') ?? '');
  const wordId = String(formData.get('wordId') ?? '');
  const rankRaw = String(formData.get('wordRank') ?? '');
  if (!bookId || !wordId) throw new Error('BAD_REQUEST');

  await touchWordRecord({
    userId: user.id, // ← 来自 session，不是 formData
    bookId,
    wordId,
    wordRank: rankRaw ? Number(rankRaw) : null,
  });
}

/** 点「完成本课」时写回进度。 */
export async function saveProgressAction(formData: FormData): Promise<void> {
  const user = await currentUser();
  if (!user) throw new Error('UNAUTHORIZED');

  const bookId = String(formData.get('bookId') ?? '');
  const lastWordId = String(formData.get('lastWordId') ?? '');
  const rankRaw = String(formData.get('lastWordRank') ?? '');
  if (!bookId || !lastWordId) throw new Error('BAD_REQUEST');

  await saveProgress({
    userId: user.id, // ← 来自 session，不是 formData
    bookId,
    lastWordId,
    lastWordRank: rankRaw ? Number(rankRaw) : null,
  });
}
