#!/usr/bin/env node
/**
 * json2csv.mjs
 * ---------------------------------------------------------------------------
 * 把 `temp/CET4_2.json`（或任意 JSON 输入）转换成 CSV。
 *
 * 输入格式：自动识别两种
 *   1. 标准 JSON 数组：[{...},{...},...]
 *   2. JSON Lines（NDJSON）：每行一个 {...}
 * 输出列：
 *   - wordRank  number
 *   - headWord  string
 *   - content   string（把原始 JSON 对象用 JSON.stringify 序列化）
 *   - bookId    string
 *
 * 用法：
 *   node scripts/json2csv.mjs                 # 默认读 temp/CET4_2.json
 *   node scripts/json2csv.mjs input.json      # 指定输入
 *   node scripts/json2csv.mjs input.json out  # 指定输入和输出
 *
 * 输出 CSV 用 UTF-8（带 BOM，方便 Excel 直接打开不乱码），
 * 字段按 RFC 4180 转义：含逗号/引号/换行时整段用双引号包裹，内部 " -> ""。
 */

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** 默认输入路径：`scripts/json2csv.mjs` -> `../temp/CET4_2.json` */
const DEFAULT_INPUT = resolve(__dirname, "..", "temp", "PEPXiaoXue6_1.json");
/** 默认输出路径：同目录同文件后缀改 .csv */
const DEFAULT_OUTPUT_SUFFIX = ".csv";

/**
 * CSV 字段转义（RFC 4180）。
 * 含 `, " \r \n` 时整段用 " 包裹，内部 " 替换成 ""。
 */
function escapeCsvField(value) {
  if (value === null || value === undefined) return "";
  const str = String(value);
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/** 把一行对象按指定列顺序转成 CSV 行。 */
function rowToCsv(row, columns) {
  return columns.map((col) => escapeCsvField(row[col])).join(",");
}

/**
 * 解析输入 JSON。
 * 支持三种格式：
 *   1. 标准 JSON 数组：[ {...}, {...}, ... ]             → 直接 JSON.parse
 *   2. 多个独立 JSON 对象并排（},{  分隔，最外层是大括号不是数组）
 *   3. JSON Lines（NDJSON）：每行一个 {...}
 * 第 2、3 种走逐对象解析（边界识别 + 失败 warning 但不中断）。
 */
function parseInput(text) {
  const trimmed = text.trim();
  if (!trimmed) return [];

  // --- 模式 1：标准 JSON 数组 ---
  if (trimmed.startsWith("[")) {
    try {
      const data = JSON.parse(trimmed);
      if (!Array.isArray(data)) {
        throw new Error("顶层 JSON 不是数组");
      }
      return data;
    } catch (err) {
      throw new Error(`JSON 数组解析失败：${err.message}`);
    }
  }

  // --- 模式 2：}{ 分隔的多对象流（典型如 CET4_2.json）---
  // 尝试首段 JSON.parse：如果成功说明整个文件就是一个对象，直接返回。
  // 否则把整个文件当作"对象+对象+..."的拼接，按 },{  边界切分再逐个解析。
  if (trimmed.startsWith("{")) {
    // 先试一次 JSON.parse（如果整文件就是一个对象就走这条）
    try {
      return [JSON.parse(trimmed)];
    } catch {
      // 不是单对象，进入流式切分
      return parseConcatObjects(trimmed);
    }
  }

  // --- 模式 3：NDJSON ---
  return parseNdjson(text);
}

/**
 * 把 "对象1},{对象2},{...},{对象N" 形式的拼接文本切成多个 JSON 对象。
 * 实现：用括号/字符串计数器跟踪嵌套深度，顶层 depth=0 时遇到 `}` 且下一非空字符是 `,`
 * （即 "边界"）就断开。
 */
function parseConcatObjects(text) {
  const records = [];
  let depth = 0;
  let inString = false;
  let escape = false;
  let start = -1;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (inString) {
      if (escape) {
        escape = false;
      } else if (ch === "\\") {
        escape = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === "{" || ch === "[" || ch === "(") {
      if (depth === 0 && ch === "{" && start === -1) start = i;
      depth++;
      continue;
    }
    if (ch === "}" || ch === "]" || ch === ")") {
      depth--;
      // 在 depth 回到 0 后，下一个有效 JSON 字符要么是逗号，要么是 EOF
      if (depth === 0 && start !== -1) {
        const objText = text.slice(start, i + 1);
        try {
          records.push(JSON.parse(objText));
        } catch (err) {
          console.warn(`[warn] 偏移 ${start} 起的对象解析失败：${err.message}`);
        }
        start = -1;
      }
      continue;
    }
  }

  return records;
}

/** NDJSON 解析：每行一个对象，失败 warning。 */
function parseNdjson(text) {
  const lines = text.split(/\r?\n/);
  const records = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    try {
      records.push(JSON.parse(line));
    } catch (err) {
      console.warn(`[warn] 第 ${i + 1} 行解析失败，已跳过：${err.message}`);
    }
  }
  return records;
}

/** UTF-8 BOM，便于 Excel 双击打开时识别为 UTF-8。 */
const UTF8_BOM = "\ufeff";

function main() {
  const [, , inputArg, outputArg] = process.argv;
  const inputPath = resolve(inputArg ?? DEFAULT_INPUT);
  const outputPath = outputArg
    ? resolve(outputArg)
    : inputPath.replace(/\.json$/i, DEFAULT_OUTPUT_SUFFIX);

  const raw = readFileSync(inputPath, "utf8");
  const records = parseInput(raw);

  const columns = ["wordRank", "headWord", "content", "bookId"];

  // 把每行规整成 4 列
  const rows = records.map((r) => ({
    wordRank: r.wordRank ?? "",
    headWord: r.headWord ?? "",
    // content 字段在源数据里就已经是个对象 → JSON.stringify 后存为字符串
    content:
      r.content === undefined || r.content === null
        ? ""
        : typeof r.content === "string"
        ? r.content
        : JSON.stringify(r.content),
    bookId: r.bookId ?? "",
  }));

  const csv =
    UTF8_BOM +
    columns.join(",") +
    "\r\n" +
    rows.map((r) => rowToCsv(r, columns)).join("\r\n") +
    "\r\n";

  writeFileSync(outputPath, csv, "utf8");

  console.log(`✅ 已转换 ${rows.length.toLocaleString()} 条记录`);
  console.log(`   输入：${inputPath}`);
  console.log(`   输出：${outputPath}`);
}

main();
