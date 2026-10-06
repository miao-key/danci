/**
 * 学习域的**服务层**：把「首页最近学习」和「学习页词卡」的组装逻辑
 * 收敛到一处，供 Server Component 与 API Route 共同调用。
 *
 * ## 为什么要这一层
 *
 * 首页既要 SSR 首屏（无闪烁、满足验收 A6「无数据整块不渲染」），
 * 又要对外提供真实数据的 API。若两处各写一份组装逻辑，字段一改
 * 就会漂移（比如 API 返回了 `percent` 而页面没算，UI 文案就对不上）。
 *
 * 所以：**Service 负责组装 + 归一化，Page / Route 只负责鉴权与传输**。
 *
 * ## 分层
 *
 * ```text
 *  app/(tabs)/page.tsx  ──────┐
 *                           ├──→  study-service.ts  ─→  progress-repo / word-repo  ─→  db
 *  app/api/study 下的路由  ────┘
 * ```
 *
 * ⚠️ 画图时注意：本文件处在块注释里，图里**不能出现** `slash-star` 或
 *    `star-slash` 这类注释定界符，否则会提前闭合注释、引发一连串
 *    "Invalid character / Unterminated template literal" 语法错误。
 */
import { findProgress, getRecentProgress, listProgress } from './progress-repo';
import { countWordsInBook, findBook, listStudyCards } from './word-repo';

/** 单批词卡上限：防止有人传 limit=99999 一次拉爆 3739 词的书 */
export const MAX_CARDS_LIMIT = 200;
/** 词卡单批默认值 */
export const DEFAULT_CARDS_LIMIT = 50;
/** 服务端首屏批量，与 DEFAULT_CARDS_LIMIT 对齐 */
export const INITIAL_BATCH_SIZE = 50;

/* ========================================================================== *
 * 最近学习
 * ========================================================================== */

export interface RecentStudy {
  bookId: string;
  title: string;
  coverUrl: string | null;
  wordCount: number;
  /** words.id 主键（字符串），null = 上次没学到具体某个词 */
  lastWordId: string | null;
  lastWordRank: number | null;
  /** ISO 8601 字符串。仓储层已把 Date 转好，这里不再出现 Date 对象。 */
  lastStudiedAt: string;
  learnedCount: number;
  /** 0~100，UI 直接喂进度条 */
  percent: number;
  hasBook: true;
}

/** 最近学习的查询结果 */
export type RecentStudyResult =
  | { kind: 'found'; data: RecentStudy }
  /** 从没学过 —— 验收 A6：整块不渲染（含标题） */
  | { kind: 'none' }
  /** 学过，但书被后台删了（孤儿进度）—— 同样不展示，但原因不同 */
  | { kind: 'book-deleted'; bookId: string };

/**
 * 组装「最近学习」。
 *
 * 注意 `percent` 用 `learnedCount / wordCount`：
 * 前者是**实际写进 user_word_records 的**数量（含最后一个词，
 * 见 progress-repo.ts 的 finishLesson），后者是 books 表的冗余总词数。
 */
export async function loadRecentStudy(
  userId: string,
): Promise<RecentStudyResult> {
  const progress = await getRecentProgress(userId);
  if (!progress) return { kind: 'none' };

  // LEFT JOIN 出来 title 为 null = 书被删了
  if (progress.title === null) {
    return { kind: 'book-deleted', bookId: progress.bookId };
  }

  const wordCount = progress.wordCount || 0;
  return {
    kind: 'found',
    data: {
      bookId: progress.bookId,
      title: progress.title,
      coverUrl: progress.coverUrl,
      wordCount,
      lastWordId: progress.lastWordId,
      lastWordRank: progress.lastWordRank,
      lastStudiedAt: progress.lastStudiedAt,
      learnedCount: progress.learnedCount,
      percent: wordCount
        ? Math.min(100, Math.round((progress.learnedCount / wordCount) * 100))
        : 0,
      hasBook: true,
    },
  };
}

/* ========================================================================== *
 * 我的页：学习进度列表
 * ========================================================================== */

export interface ProgressRow {
  bookId: string;
  /** 书被后台删掉时为 null，调用方应过滤掉 */
  title: string | null;
  coverUrl: string | null;
  wordCount: number;
  lastWordId: string | null;
  lastWordRank: number | null;
  /** ISO 8601 字符串 */
  lastStudiedAt: string;
  learnedCount: number;
  /** 0~100，已做上限保护 */
  percent: number;
}

/**
 * 「我的」页的学习进度列表，按最近学习时间倒序。
 *
 * 顺带把 `percent` 算好，避免 me 页各处重复「learnedCount / wordCount」
 * 且忘了除零保护（wordCount 为 0 时会得到 NaN）。
 */
export async function loadProgressList(userId: string): Promise<ProgressRow[]> {
  const rows = await listProgress(userId);
  return rows.map((p) => {
    const total = p.wordCount || 0;
    return {
      bookId: p.bookId,
      title: p.title,
      coverUrl: p.coverUrl,
      wordCount: total,
      lastWordId: p.lastWordId,
      lastWordRank: p.lastWordRank,
      lastStudiedAt: p.lastStudiedAt,
      learnedCount: p.learnedCount,
      percent: total
        ? Math.min(100, Math.round((p.learnedCount / total) * 100))
        : 0,
    };
  });
}

/* ========================================================================== *
 * 学习页词卡
 * ========================================================================== */

export interface StudyCardsResult {
  bookId: string;
  bookTitle: string;
  /** 以 words 表 count(*) 为准，不是 books.wordCount 冗余值 */
  wordCount: number;
  /** 本批起点（= 之前已学过的数量） */
  afterRank: number;
  /** 传回作为下一次请求的 afterRank；hasMore=false 时无意义 */
  nextAfterRank: number;
  hasMore: boolean;
  cards: Awaited<ReturnType<typeof listStudyCards>>;
}

/** 词卡查询的错误分类，Route 据此映射 HTTP 状态码 */
export class BookNotFoundError extends Error {
  constructor(bookId: string) {
    super(`单词书不存在: ${bookId}`);
    this.name = 'BookNotFoundError';
  }
}

export interface LoadCardsOptions {
  /** 显式起点；与 fromLast 二选一 */
  afterRank?: number;
  /** true 时忽略 afterRank，改为按该用户的上次进度续学（需求 5.5.1） */
  fromLast?: boolean;
  limit?: number;
}

/**
 * 组装一批词卡。
 *
 * `limit + 1` 多取一条来判定 `hasMore`，省掉一次 count(*)。
 * 分母 `wordCount` 用 words 表实际行数：books.wordCount 是后台维护的
 * 冗余字段，与实际不一致时会让「第 N / M」和「完成本课」出现错位。
 */
export async function loadStudyCards(
  userId: string,
  bookId: string,
  opts: LoadCardsOptions = {},
): Promise<StudyCardsResult> {
  const limit = Math.min(
    MAX_CARDS_LIMIT,
    Math.max(1, Math.trunc(opts.limit ?? DEFAULT_CARDS_LIMIT)),
  );

  const book = await findBook(bookId);
  if (!book) throw new BookNotFoundError(bookId);

  // from=last：以「上次学到的单词的下一个」为起点，不依赖前端记住数字
  const afterRank =
    opts.fromLast === true
      ? (await findProgress(userId, bookId))?.lastWordRank ?? 0
      : Math.max(0, Math.trunc(opts.afterRank ?? 0));

  const rows = await listStudyCards(bookId, afterRank, limit + 1);
  const hasMore = rows.length > limit;
  const cards = hasMore ? rows.slice(0, limit) : rows;

  return {
    bookId: book.bookId,
    bookTitle: book.title,
    wordCount: await countWordsInBook(bookId),
    afterRank,
    nextAfterRank: cards.length > 0 ? cards[cards.length - 1].wordRank : afterRank,
    hasMore,
    cards,
  };
}
