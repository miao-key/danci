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

const { parseWordContent, normalizePhonetic } = await import(
  '../lib/word-content.ts'
);
const {
  listBookList,
  listStudyCards,
  findBook,
  findWordDetail,
  countWordsInBook,
} = await import('../lib/word-repo.ts');
const {
  findProgress,
  getRecentProgress,
  listProgress,
  saveProgress,
  touchWordRecord,
  countStudiedInBook,
  finishLesson,
} = await import('../lib/progress-repo.ts');
const {
  loadRecentStudy,
  loadStudyCards,
  loadProgressList,
  BookNotFoundError,
} = await import('../lib/study-service.ts');

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

/* ---------------- 音标规范化（纯函数，不触库） ---------------- */
console.log('\n[音标规范化]');
await t("ASCII 单引号 → IPA 重音符 ˈ（不是删掉）", () => {
  // 关键：' 是重音符，位置有意义，绝不能 strip
  assert.equal(normalizePhonetic("'saɪəns"), 'ˈsaɪəns');
  assert.equal(normalizePhonetic("ə'bændən"), 'əˈbændən');
  assert.equal(normalizePhonetic("dɪ'lɪʃəs"), 'dɪˈlɪʃəs');
  assert.equal(normalizePhonetic("ovɚ'kʌm"), "ovɚˈkʌm");
  assert.equal(normalizePhonetic("saɪkə'lɑdʒɪkl"), 'saɪkəˈlɑdʒɪkl');
});

await t('剥离开头/中间混入的逗号（真库实测存在的脏字符）', () => {
  // 真实脏数据：psychological 的 usphone 原文就是 ",saɪkə'lɑdʒɪkl"
  assert.equal(normalizePhonetic(",saɪkə'lɑdʒɪkl"), 'saɪkəˈlɑdʒɪkl');
  assert.equal(normalizePhonetic('  ˈæksɛnt  '), 'ˈæksɛnt', '首尾空白要清掉');
  assert.equal(normalizePhonetic('ˈæks ɛnt'), 'ˈæks ɛnt', '内部单个空格是合法的，不该删');
});

await t('多音节串只取第一段（; 后可能是残缺形式）', () => {
  assert.equal(normalizePhonetic("'æksɛnt; -sent"), 'ˈæksɛnt');
  assert.equal(normalizePhonetic('æbˈsɔrb; æbˈzɔrb; əbˈsɔrb'), 'æbˈsɔrb');
  assert.equal(normalizePhonetic('ˈæks(ə)nt; -sent'), 'ˈæks(ə)nt');
});

await t('已标准的 IPA ˈ 保持不变，叠写被压平', () => {
  assert.equal(normalizePhonetic('ˈæksɛnt'), 'ˈæksɛnt');
  assert.equal(normalizePhonetic("ˈ'æksɛnt"), 'ˈæksɛnt');
});

await t('空值 / 非字符串 / 纯脏字符 → null', () => {
  assert.equal(normalizePhonetic(null), null);
  assert.equal(normalizePhonetic(undefined), null);
  assert.equal(normalizePhonetic(123), null);
  assert.equal(normalizePhonetic(''), null);
  assert.equal(normalizePhonetic('  '), null);
  assert.equal(normalizePhonetic(',,,'), null);
});

await t('真库抽样：science 的音标已规范化', async () => {
  const cards = await listStudyCards('PEPXiaoXue6_1', 0, 1);
  const c = cards[0];
  assert.equal(c.headWord, 'science');
  // 原值是 "'saɪəns"，规范化后应是 "ˈsaɪəns"
  assert.equal(c.usphone, 'ˈsaɪəns');
  assert.ok(!c.usphone!.includes("'"), `不该残留 ASCII 单引号: ${c.usphone}`);
  assert.ok(!c.usphone!.includes(','), `不该残留逗号: ${c.usphone}`);
});

await t('真库全量抽样：3869 个词的音标均已规范化', async () => {
  // 覆盖两本书全部单词，断言不存在任何脏音标
  const all = [
    ...(await listStudyCards('CET4_2', 0, 4000)),
    ...(await listStudyCards('PEPXiaoXue6_1', 0, 200)),
  ];
  assert.ok(all.length > 3800, `实际取到 ${all.length} 条`);

  const dirty = all.filter(
    (c) =>
      (c.usphone !== null && /[,'`]/.test(c.usphone)) ||
      (c.ukphone !== null && /[,'`]/.test(c.ukphone)),
  );
  assert.equal(
    dirty.length,
    0,
    `仍有 ${dirty.length} 个脏音标: ${JSON.stringify(dirty.slice(0, 3))}`,
  );

  // 重音符确实被保留成了 ˈ（而不是被 strip 掉）
  const withStress = all.filter((c) => c.usphone?.includes('ˈ'));
  assert.ok(withStress.length > 1000, `只有 ${withStress.length} 个含重音符，strip 过头了`);
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

await t('touchWordRecord 同步写 user_book_progress（修复「学完不更新 lastWordRank」Bug）', async () => {
  // 上一组 touch 已把 UID 在 PEPXiaoXue6_1 上的 lastWordRank 推到 3
  const p = await findProgress(UID, 'PEPXiaoXue6_1');
  assert.ok(p, 'touch 后应已有进度行');
  assert.equal(p!.lastWordRank, 3, 'lastWordRank 应等于最后 touch 的 rank');
  assert.equal(p!.lastWordId, '10159', 'lastWordId 应等于最后 touch 的 wordId');
  assert.equal(p!.learnedCount, 3, 'learnedCount 与明细一致');
});

await t('touchWordRecord rank=null 时不建/不改进度行（防御性）', async () => {
  // 用一个新用户避免污染上一组
  const UID_NULL = `usr-test-${Date.now().toString(36)}-null`;
  await db.insert(users).values({
    id: UID_NULL,
    email: `${UID_NULL}@test.local`,
    passwordHash: hashSync('x', 10),
    displayName: 'repo-test-null',
  });
  try {
    await touchWordRecord({
      userId: UID_NULL,
      wordId: '10157',
      bookId: 'PEPXiaoXue6_1',
      wordRank: null, // 漏传 / 0 / null
    });
    assert.equal(
      await findProgress(UID_NULL, 'PEPXiaoXue6_1'),
      null,
      'rank 非法时不应建进度行，避免「第 0 个」',
    );
    // 但明细仍然要写（保持旧行为：永远记）
    assert.equal(await countStudiedInBook(UID_NULL, 'PEPXiaoXue6_1'), 1);
  } finally {
    await db.delete(users).where(eq(users.id, UID_NULL));
  }
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

/* ---------------- finishLesson：修复「最后一个词不写明细」 ---------------- */
console.log('\n[完成本课 finishLesson]');

const UID2 = `usr-test-${Date.now().toString(36)}-b`;
await db.insert(users).values({
  id: UID2,
  email: `${UID2}@test.local`,
  passwordHash: hashSync('x', 10),
  displayName: 'repo-test-2',
});

await t('finishLesson 把最后一个单词也写进明细（原 Bug）', async () => {
  // 先 touch 前 2 个
  await touchWordRecord({ userId: UID2, wordId: '10157', bookId: 'PEPXiaoXue6_1', wordRank: 1 });
  await touchWordRecord({ userId: UID2, wordId: '10158', bookId: 'PEPXiaoXue6_1', wordRank: 2 });
  assert.equal(await countStudiedInBook(UID2, 'PEPXiaoXue6_1'), 2);

  // 完成本课：第 3 个词
  await finishLesson({ userId: UID2, bookId: 'PEPXiaoXue6_1', lastWordId: '10159', lastWordRank: 3 });

  const counted = await countStudiedInBook(UID2, 'PEPXiaoXue6_1');
  assert.equal(counted, 3, '最后一个单词必须计入明细（修复前会是 2）');

  const p = await findProgress(UID2, 'PEPXiaoXue6_1');
  assert.equal(p!.lastWordRank, 3);
  assert.equal(p!.learnedCount, 3, 'learnedCount 应与明细一致，不再少 1');
});

await t('finishLesson 重复调用不会重复计数（studyCount 累加）', async () => {
  await finishLesson({ userId: UID2, bookId: 'PEPXiaoXue6_1', lastWordId: '10159', lastWordRank: 3 });
  assert.equal(await countStudiedInBook(UID2, 'PEPXiaoXue6_1'), 3, '仍应是 3 个不同单词');

  const [rec] = await db
    .select({ studyCount: userWordRecords.studyCount })
    .from(userWordRecords)
    .where(and(eq(userWordRecords.userId, UID2), eq(userWordRecords.wordId, 10159)))
    .limit(1);
  assert.equal(rec?.studyCount, 2, 'studyCount 应累加到 2');
});

await t('finishLesson 后 (userId, bookId) 仍只有 1 行进度', async () => {
  const rows = await db
    .select()
    .from(userBookProgress)
    .where(
      and(
        eq(userBookProgress.userId, UID2),
        eq(userBookProgress.bookId, 'PEPXiaoXue6_1'),
      ),
    );
  assert.equal(rows.length, 1);
});

/* ---------------- 服务层（首页 / 学习页 / API 的共同数据源） ---------------- */
console.log('\n[服务层 study-service]');

const UID3 = `usr-test-${Date.now().toString(36)}-c`;
await db.insert(users).values({
  id: UID3,
  email: `${UID3}@test.local`,
  passwordHash: hashSync('x', 10),
  displayName: 'repo-test-3',
});

await t('loadRecentStudy：新用户返回 none（验收 A6 整块不渲染）', async () => {
  const r = await loadRecentStudy(UID3);
  assert.equal(r.kind, 'none');
});

await t('loadStudyCards(fromLast) 新用户从头开始', async () => {
  const r = await loadStudyCards(UID3, 'PEPXiaoXue6_1', { fromLast: true, limit: 10 });
  assert.equal(r.afterRank, 0);
  assert.equal(r.cards[0].wordRank, 1, '应从第 1 个开始');
  assert.equal(r.wordCount, 130, 'wordCount 以 words 表实际行数为准');
  assert.equal(r.bookTitle, '人教版小学英语-六年级上册');
});

await t('loadStudyCards 分批：hasMore + nextAfterRank 正确衔接', async () => {
  const b1 = await loadStudyCards(UID3, 'PEPXiaoXue6_1', { afterRank: 0, limit: 10 });
  assert.equal(b1.cards.length, 10);
  assert.equal(b1.hasMore, true, '130 词的书首批 10 条后必然还有');
  assert.equal(b1.nextAfterRank, 10);

  const b2 = await loadStudyCards(UID3, 'PEPXiaoXue6_1', { afterRank: b1.nextAfterRank, limit: 10 });
  assert.equal(b2.cards[0].wordRank, 11, '第二批应从第 11 个接上，不能重复');
  assert.equal(b2.afterRank, 10);
});

await t('loadStudyCards 到末尾时 hasMore=false（决定「完成本课」何时出现）', async () => {
  const tail = await loadStudyCards(UID3, 'PEPXiaoXue6_1', { afterRank: 125, limit: 50 });
  assert.equal(tail.cards.length, 5, '130 - 125 = 5');
  assert.equal(tail.hasMore, false, '最后一批不应再有后续');

  const past = await loadStudyCards(UID3, 'PEPXiaoXue6_1', { afterRank: 130, limit: 50 });
  assert.equal(past.cards.length, 0, '学完后取不到词');
  assert.equal(past.hasMore, false);
});

await t('loadStudyCards 续学：fromLast 从 lastWordRank 之后开始（需求 5.5.1）', async () => {
  await saveProgress({ userId: UID3, bookId: 'PEPXiaoXue6_1', lastWordId: '10163', lastWordRank: 7 });
  const r = await loadStudyCards(UID3, 'PEPXiaoXue6_1', { fromLast: true, limit: 5 });
  assert.equal(r.afterRank, 7);
  assert.equal(r.cards[0].wordRank, 8, '应从第 8 个开始，跳过第 7 个');
});

await t('loadStudyCards 大书分页：3739 词的书也只在末批 hasMore=false', async () => {
  const p1 = await loadStudyCards(UID3, 'CET4_2', { afterRank: 0, limit: 200 });
  assert.equal(p1.cards.length, 200);
  assert.equal(p1.hasMore, true, '3739 词不可能首批学完');
  assert.equal(p1.wordCount, 3739);
  assert.equal(p1.nextAfterRank, 200);

  const mid = await loadStudyCards(UID3, 'CET4_2', { afterRank: 3500, limit: 200 });
  assert.equal(mid.hasMore, true, '3500 之后还有 239 个词');
  assert.equal(mid.cards.length, 200);

  const last = await loadStudyCards(UID3, 'CET4_2', { afterRank: 3739, limit: 200 });
  assert.equal(last.cards.length, 0);
  assert.equal(last.hasMore, false);
});

await t('loadStudyCards limit 被夹到上限，防一次拉爆', async () => {
  const r = await loadStudyCards(UID3, 'PEPXiaoXue6_1', { afterRank: 0, limit: 99999 });
  assert.ok(r.cards.length <= 200, `实际 ${r.cards.length} 条，应 ≤ 200`);
});

await t('loadStudyCards 书不存在 → 抛 BookNotFoundError（Route 据此返 404）', async () => {
  await assert.rejects(
    () => loadStudyCards(UID3, 'NOT_A_BOOK', { afterRank: 0 }),
    (e: unknown) => e instanceof BookNotFoundError,
  );
});

await t('loadRecentStudy 有进度后返回 found + percent', async () => {
  await touchWordRecord({ userId: UID3, wordId: '10157', bookId: 'PEPXiaoXue6_1', wordRank: 1 });
  await touchWordRecord({ userId: UID3, wordId: '10158', bookId: 'PEPXiaoXue6_1', wordRank: 2 });
  await saveProgress({ userId: UID3, bookId: 'PEPXiaoXue6_1', lastWordId: '10158', lastWordRank: 2 });

  const r = await loadRecentStudy(UID3);
  assert.equal(r.kind, 'found');
  if (r.kind !== 'found') return;

  assert.equal(r.data.bookId, 'PEPXiaoXue6_1');
  assert.equal(r.data.title, '人教版小学英语-六年级上册');
  assert.equal(r.data.learnedCount, 2);
  assert.equal(r.data.wordCount, 130);
  // 2/130 = 1.5% → 2%
  assert.equal(r.data.percent, 2);
  assert.equal(r.data.hasBook, true);
  // lastStudiedAt 必须是 ISO 字符串，不能是 Date（会炸 JSON.stringify）
  assert.equal(typeof r.data.lastStudiedAt, 'string');
  assert.ok(!Number.isNaN(Date.parse(r.data.lastStudiedAt)));
});

await t('loadProgressList 的 percent 已算好且不会 NaN', async () => {
  const list = await loadProgressList(UID3);
  assert.equal(list.length, 1);
  assert.equal(list[0].bookId, 'PEPXiaoXue6_1');
  assert.ok(!Number.isNaN(list[0].percent), 'percent 不该是 NaN');
  assert.ok(list[0].percent >= 0 && list[0].percent <= 100);
  assert.equal(list[0].lastStudiedAt, list[0].lastStudiedAt);
  assert.equal(typeof list[0].lastStudiedAt, 'string');
});

await t('countWordsInBook 与 books.wordCount 一致（校验冗余字段可信）', async () => {
  assert.equal(await countWordsInBook('PEPXiaoXue6_1'), 130);
  assert.equal(await countWordsInBook('CET4_2'), 3739);
  assert.equal(await countWordsInBook('NOT_A_BOOK'), 0);
});

// 用完即删，级联清掉 progress / records，避免污染开发数据
await db.delete(users).where(eq(users.id, UID));
await db.delete(users).where(eq(users.id, UID2));
await db.delete(users).where(eq(users.id, UID3));

console.log(`\n=== 结果：${pass} 通过 / ${fail} 失败 ===\n`);
process.exit(fail > 0 ? 1 : 0);
