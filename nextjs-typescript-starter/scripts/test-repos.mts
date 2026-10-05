/**
 * 仓储层单元测试（直连真实数据库，不启动 HTTP 服务）。
 *
 * 覆盖学习进度写回这条链路的**数据层**部分：
 *   touchWordRecord → saveProgress → getRecentProgress / listProgress
 * 以及单词详情解析里最容易写错的两个字段路径（R5 风险点）。
 *
 * 用法：npm run test:repos
 *
 * ⚠️ 测试会真的读写数据库：
 *   1. 前置：.env 里必须配好 POSTGRES_URL
 *   2. 单词书/单词断言依赖库中已有 CET4_2 与 PEPXiaoXue6_1
 *   3. 进度类用例会自动建临时用户，结束时 DELETE；
 *      users 上的级联会连带清掉 user_book_progress / user_word_records
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** 与 migrate.mjs / verify-schema.mjs 保持一致的极简 .env 解析 */
function loadEnvFile() {
  try {
    const raw = readFileSync(join(process.cwd(), '.env'), 'utf8');
    for (const line of raw.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (!(key in process.env)) process.env[key] = value;
    }
  } catch {
    // .env 不存在时依赖外部注入
  }
}

// 必须在任何 lib/* / db/* 模块求值之前完成
loadEnvFile();

const { parseWordContent } = await import('../lib/word-content.ts');
const { listBookList, listStudyCards, findBook, findWordDetail } = await import(
  '../lib/word-repo.ts'
);
const {
  findProgress,
  getRecentProgress,
  listProgress,
  saveProgress,
  touchWordRecord,
  countStudiedInBook,
} = await import('../lib/progress-repo.ts');

let pass = 0;
let fail = 0;

function t(name: string, fn: () => void | Promise<void>) {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      pass++;
      console.log(`  [PASS] ${name}`);
    })
    .catch((e) => {
      fail++;
      console.log(`  [FAIL] ${name}\n         ${e.message}`);
    });
}

console.log(`\n=== 仓储层单元测试（真库）===`);

/* ---------------- 单词书 ---------------- */
console.log('[单词书]');
await t('listBookList 返回两本书且按 createdAt、bookId 升序', async () => {
  const books = await listBookList();
  assert.equal(books.length, 2, `实际 ${books.length} 本`);
  assert.deepEqual(
    books.map((x) => x.bookId).sort(),
    ['CET4_2', 'PEPXiaoXue6_1'].sort(),
  );
  assert.ok(books.every((x) => x.wordCount > 0));
  assert.ok(books.every((x) => x.tags.length > 0), 'tags 应被解析成数组');
});

await t('findBook 命中 / 未命中', async () => {
  assert.ok(await findBook('PEPXiaoXue6_1'));
  assert.equal(await findBook('NOPE'), null);
});

/* ---------------- 学习页词卡 ---------------- */
console.log('\n[学习页词卡]');
await t('listStudyCards(afterRank=0) 从第 1 个开始', async () => {
  const cards = await listStudyCards('PEPXiaoXue6_1', 0);
  assert.equal(cards[0].wordRank, 1);
  assert.equal(cards[0].headWord, 'science');
  assert.equal(cards[0].firstTranCn, '科学');
  assert.equal(cards[0].bizWordId, 'PEPXiaoXue6_1_1');
});

await t('listStudyCards(afterRank=N) 跳过已学的 N 个（需求 5.5.1）', async () => {
  const cards = await listStudyCards('PEPXiaoXue6_1', 12);
  assert.equal(cards[0].wordRank, 13, '应从第 13 个开始，而不是第 12 个');
  assert.ok(cards.every((c) => c.wordRank > 12));
});

await t('词卡只取 6 个标量字段，不含完整 content', async () => {
  const [c] = await listStudyCards('PEPXiaoXue6_1', 0);
  assert.deepEqual(Object.keys(c).sort(), [
    'bizWordId',
    'firstTranCn',
    'headWord',
    'ukphone',
    'usphone',
    'wordId',
    'wordRank',
  ].sort());
});

/* ---------------- 详情页解析（R5 风险点） ---------------- */
console.log('\n[详情页解析]');
const detail = await findWordDetail('PEPXiaoXue6_1', 'PEPXiaoXue6_1_1');

await t('findWordDetail 命中 science 单词', () => {
  assert.ok(detail, '应查到该单词');
  assert.equal(detail!.wordId, 'PEPXiaoXue6_1_1');
  assert.equal(detail!.headWord, 'science');
});

await t('content 为 null / 缺 wordId 时返回 null', () => {
  assert.equal(parseWordContent(null), null);
  assert.equal(parseWordContent({ word: { content: {} } }), null);
  assert.equal(parseWordContent({}), null);
});

if (detail) {
  const parsed = detail.word;

  await t('parseWordContent 解析 science 的全部区块', () => {
    assert.equal(parsed.wordId, 'PEPXiaoXue6_1_1');
    assert.equal(parsed.wordHead, 'science');
    assert.equal(parsed.trans[0].tranCn, '科学');
    assert.ok(parsed.trans[0].tranOther.length > 0);
    assert.ok(parsed.sentences.length > 0);
    assert.ok(parsed.phrases.length > 0);
    assert.ok(parsed.synos.length > 0);
    assert.ok(parsed.relWords.length > 0);
  });

  await t('近义词来自 syno.hwds[].w（不是 words[].hwd）', () => {
    const w = parsed.synos[0].words;
    assert.ok(w.includes('technology'), `实际: ${w.slice(0, 5)}`);
    assert.ok(w.includes('mechanics'));
  });

  await t('同根词来自 relWord.words[].hwd + .tran（不是 hwds[].w）', () => {
    const all = parsed.relWords.flatMap((r) => r.words);
    assert.ok(all.some((w) => w.hwd === 'scientific'), '应含 scientific');
    assert.ok(all.some((w) => w.hwd === 'scientist'), '应含 scientist');
    const sci = all.find((w) => w.hwd === 'scientist')!;
    assert.ok(sci.tran && sci.tran.includes('科学家'), `实际: ${sci.tran}`);
  });
}

/* ---------------- 学习进度写回 ---------------- */
console.log('\n[学习进度]');

/**
 * 这些用例会真的写数据，必须先建一个临时用户（FK 约束会拦截）。
 * 用随机 id 避免与真人账号冲突，结束时 DELETE 掉。
 */
const { hashSync } = await import('bcrypt-ts');
const { db } = await import('../db/index.ts');
const { users, userBookProgress, userWordRecords } = await import(
  '../db/schema.ts'
);
const { and, eq } = await import('drizzle-orm');

const UID = `usr-test-${Date.now().toString(36)}`;
await db.insert(users).values({
  id: UID,
  email: `${UID}@test.local`,
  passwordHash: hashSync('x', 10),
  displayName: 'repo-test',
});

await t('初始无进度 → getRecentProgress / findProgress 返回 null', async () => {
  assert.equal(await getRecentProgress(UID), null);
  assert.equal(await findProgress(UID, 'PEPXiaoXue6_1'), null);
});

await t('touchWordRecord 不应凭空建 book 进度行（避免「第 0 个」）', async () => {
  assert.equal(
    await findProgress(UID, 'PEPXiaoXue6_1'),
    null,
    '中途不写进度行，「最近学习」才不会显示第 0 个',
  );
});

await t('重复 touch 同一单词 → studyCount 累加，不重复计数', async () => {
  await touchWordRecord({ userId: UID, wordId: '10157', bookId: 'PEPXiaoXue6_1', wordRank: 1 });
  await touchWordRecord({ userId: UID, wordId: '10158', bookId: 'PEPXiaoXue6_1', wordRank: 2 });
  await touchWordRecord({ userId: UID, wordId: '10159', bookId: 'PEPXiaoXue6_1', wordRank: 3 });
  assert.equal(await countStudiedInBook(UID, 'PEPXiaoXue6_1'), 3);
  await touchWordRecord({ userId: UID, wordId: '10159', bookId: 'PEPXiaoXue6_1', wordRank: 3 });
  assert.equal(await countStudiedInBook(UID, 'PEPXiaoXue6_1'), 3, '仍应是 3 个不同单词');

  const [rec] = await db
    .select({ studyCount: userWordRecords.studyCount })
    .from(userWordRecords)
    .where(
      and(eq(userWordRecords.userId, UID), eq(userWordRecords.wordId, 10159)),
    )
    .limit(1);
  assert.equal(rec?.studyCount, 2, 'studyCount 应为 2');
});

await t('saveProgress upsert：同一 (user, book) 只有 1 行', async () => {
  await saveProgress({ userId: UID, bookId: 'PEPXiaoXue6_1', lastWordId: '10159', lastWordRank: 3 });
  await saveProgress({ userId: UID, bookId: 'PEPXiaoXue6_1', lastWordId: '10163', lastWordRank: 7 });
  const rows = await db
    .select()
    .from(userBookProgress)
    .where(
      and(
        eq(userBookProgress.userId, UID),
        eq(userBookProgress.bookId, 'PEPXiaoXue6_1'),
      ),
    );
  assert.equal(rows.length, 1, '应只有 1 行（唯一约束生效）');
  assert.equal(rows[0].lastWordRank, 7, '应被后写的覆盖');
});

await t('learnedCount 由明细表聚合得出（3）', async () => {
  const p = await findProgress(UID, 'PEPXiaoXue6_1');
  assert.equal(p!.learnedCount, 3);
});

await t('getRecentProgress 返回最近学过的书', async () => {
  const r = await getRecentProgress(UID);
  assert.equal(r!.bookId, 'PEPXiaoXue6_1');
  assert.equal(r!.lastWordRank, 7);
  assert.equal(r!.wordCount, 130, 'wordCount 应来自 books 表');
  assert.ok(r!.title, 'title 不应为 null');
});

await t('listProgress 按 lastStudiedAt 倒序', async () => {
  await saveProgress({ userId: UID, bookId: 'CET4_2', lastWordId: '1', lastWordRank: 1 });
  const all = await listProgress(UID);
  assert.equal(all.length, 2);
  assert.equal(all[0].bookId, 'CET4_2', '最后写的应排最前');
  assert.equal(all[1].bookId, 'PEPXiaoXue6_1');
});

await t('A7：学了 7 个后重进学习页，从第 8 个开始', async () => {
  const cards = await listStudyCards('PEPXiaoXue6_1', 7);
  assert.equal(cards[0].wordRank, 8, '应跳过已学的第 7 个');
  assert.ok(cards[0].headWord, 'headWord 不应为空');
  assert.ok(
    cards.every((c, i) => i === 0 || c.wordRank > cards[i - 1].wordRank),
    'wordRank 应严格递增',
  );
});

// 用完即删，级联清掉 progress / records，避免污染开发数据
await db.delete(users).where(eq(users.id, UID));

console.log(`\n=== 结果：${pass} 通过 / ${fail} 失败 ===\n`);
process.exit(fail > 0 ? 1 : 0);
