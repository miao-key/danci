/**
 * 把 `words.content` 里的松散 JSON 收敛成强类型，供 UI 直接消费。
 *
 * ## 为什么需要这一层
 *
 * 源数据（金山词霸导出）的 content 有几个**极易写错**的地方：
 *
 * | 区块 | 路径 | 陷阱 |
 * | --- | --- | --- |
 * | 近义词 | `syno.synos[].hwds[].w` | 单词在 **`hwds`** 下的 **`w`** |
 * | 同根词 | `relWord.rels[].words[].hwd` | 单词在 **`words`** 下的 **`hwd`**，且释义是 `tran` |
 *
 * 两者字段名不同（`hwds[].w` vs `words[].hwd`），docs/design.md 风险登记 R5
 * 专门记录了"写混"这个坑。本文件用**不同的中间类型**把差异固化下来：
 * `synos` 归一化成 `words: string[]`（近义词不需要释义），
 * `relWords` 保留 `{ hwd, tran }` 对象（同根词需要释义）。
 *
 * ## 其它约束
 *
 * 1. content 可能为 `null`（历史脏数据），所有取值都走 `str()` 兜底。
 * 2. content 来自外部词库，**不可信**。本文件只做读取和 trim，
 *    UI 侧禁止 `dangerouslySetInnerHTML`（见 docs/design.md 11.5）。
 * 3. 所有空数组会被 `filter` 掉 —— 对应需求"空字段整块不渲染"。
 */

/* ========================================================================== *
 * 1. 原始 JSON 结构（宽松，只声明我们关心的形状）
 * ========================================================================== */

interface RawWordContent {
  word?: {
    wordHead?: string;
    wordId?: string;
    content?: {
      usphone?: string | null;
      ukphone?: string | null;
      usspeech?: string | null;
      ukspeech?: string | null;
      trans?: RawTrans[];
      sentence?: { sentences?: RawSentence[] };
      phrase?: { phrases?: RawPhrase[] };
      syno?: { synos?: RawSyno[] };
      relWord?: { rels?: RawRelWord[] };
    };
  };
}

interface RawTrans {
  tranCn?: string;
  tranOther?: string;
  /** 词性，如 "art" / "n"；部分数据源有，暂不渲染但保留 */
  pos?: string;
}

interface RawSentence {
  sContent?: string;
  sCn?: string;
}

interface RawPhrase {
  pContent?: string;
  pCn?: string;
}

/** 近义词：单词藏在 `hwds[].w` */
interface RawSyno {
  pos?: string;
  tran?: string;
  hwds?: { w?: string }[];
}

/** 同根词：单词藏在 `words[].hwd`，释义是 `tran` */
interface RawRelWord {
  pos?: string;
  words?: { hwd?: string; tran?: string }[];
}

/* ========================================================================== *
 * 2. 归一化后（严格，UI 直接消费）
 * ========================================================================== */

export interface ParsedTrans {
  tranCn: string;
  tranOther: string | null;
}

export interface ParsedSentence {
  sContent: string;
  sCn: string | null;
}

export interface ParsedPhrase {
  pContent: string;
  pCn: string | null;
}

/** 近义词：已拍平成 `string[]`，因为 UI 只展示单词本身 */
export interface ParsedSyno {
  pos: string;
  tran: string | null;
  words: string[];
}

/** 同根词：保留 `{ hwd, tran }`，UI 要展示词 + 释义 */
export interface ParsedRelWord {
  pos: string;
  words: { hwd: string; tran: string | null }[];
}

export interface ParsedWord {
  wordId: string;
  wordHead: string;
  usphone: string | null;
  ukphone: string | null;
  usspeech: string | null;
  ukspeech: string | null;
  trans: ParsedTrans[];
  sentences: ParsedSentence[];
  phrases: ParsedPhrase[];
  synos: ParsedSyno[];
  relWords: ParsedRelWord[];
}

/* ========================================================================== *
 * 3. 解析实现
 * ========================================================================== */

/** 取非空字符串，trim 后返回；其余一律 null */
function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim().length > 0 ? v.trim() : null;
}

function asArray<T>(v: T[] | undefined | null): T[] {
  return Array.isArray(v) ? v : [];
}

/**
 * 解析 `words.content`。
 *
 * @param raw       数据库里 `words.content` 的原值
 * @param fallbackHead 顶层 `words.headWord`，当 content 内没有 wordHead 时兜底
 * @returns 解析结果；缺少 `wordId`（无法唯一定位单词）时返回 null
 */
export function parseWordContent(
  raw: unknown,
  fallbackHead?: string | null,
): ParsedWord | null {
  const root = (raw ?? {}) as RawWordContent;
  const w = root.word;
  const c = w?.content;

  // wordId 是详情页路由的业务主键，缺失则无法继续
  if (!w?.wordId) return null;

  return {
    wordId: w.wordId,
    wordHead: str(w.wordHead) ?? str(fallbackHead) ?? w.wordId,
    usphone: str(c?.usphone),
    ukphone: str(c?.ukphone),
    usspeech: str(c?.usspeech),
    ukspeech: str(c?.ukspeech),
    trans: asArray(c?.trans)
      .map((t) => ({ tranCn: str(t.tranCn) ?? '', tranOther: str(t.tranOther) }))
      .filter((t) => t.tranCn.length > 0),
    sentences: asArray(c?.sentence?.sentences)
      .map((s) => ({ sContent: str(s.sContent) ?? '', sCn: str(s.sCn) }))
      .filter((s) => s.sContent.length > 0),
    phrases: asArray(c?.phrase?.phrases)
      .map((p) => ({ pContent: str(p.pContent) ?? '', pCn: str(p.pCn) }))
      .filter((p) => p.pContent.length > 0),
    // 近义词：hwds[].w → 拍平成 string[]（注意：不是 words[].hwd）
    synos: asArray(c?.syno?.synos)
      .map((s) => ({
        pos: str(s.pos) ?? '',
        tran: str(s.tran),
        words: asArray(s.hwds)
          .map((h) => str(h.w) ?? '')
          .filter((w) => w.length > 0),
      }))
      .filter((s) => s.words.length > 0),
    // 同根词：words[].hwd + words[].tran（注意：不是 hwds[].w）
    relWords: asArray(c?.relWord?.rels)
      .map((r) => ({
        pos: str(r.pos) ?? '',
        words: asArray(r.words)
          .map((w) => ({ hwd: str(w.hwd) ?? '', tran: str(w.tran) }))
          .filter((w) => w.hwd.length > 0),
      }))
      .filter((r) => r.words.length > 0),
  };
}

/**
 * 词性缩写 → 中文标签。详情页的「近义词 (n)」「同根词 adj」标题用。
 * 源数据的 pos 字段是金山词霸的缩写（n/v/adj/adv/art），映射不全时原样返回。
 */
const POS_LABELS: Record<string, string> = {
  n: '名词',
  noun: '名词',
  v: '动词',
  vt: '及物动词',
  vi: '不及物动词',
  verb: '动词',
  adj: '形容词',
  a: '形容词',
  adv: '副词',
  ad: '副词',
  d: '副词',
  art: '冠词',
  prep: '介词',
  conj: '连词',
  pron: '代词',
  num: '数词',
  int: '感叹词',
  aux: '助动词',
};

export function posLabel(pos: string): string {
  if (!pos) return '';
  return POS_LABELS[pos.toLowerCase()] ?? pos;
}
