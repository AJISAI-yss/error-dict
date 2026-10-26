#!/usr/bin/env node
// scripts/build.mjs —— 校验分类卷，并生成 error-dict.json + INDEX.md
// ---------------------------------------------------------------------------
// 本仓库的**源文件是 markdown**（docs/error-dict/0x-*.md），
// JSON 和索引都是派生物。改词条 → 改 md → 跑这个脚本。
//
//   用法:
//     node scripts/build.mjs            # 校验 + 重新生成 JSON / INDEX
//     node scripts/build.mjs --check    # 只校验，不写任何文件（CI 用）
//
//   退出码: 0 通过 / 1 有错误
//
// 它管四件事:
//   ① 格式校验    字段名、必填项、续行缩进
//   ② 内容校验    ID 唯一、分类与文件对应、根因不是占位符
//   ③ 生成         error-dict.json（机器读） + INDEX.md（反查表）
//   ④ 泄漏检查     用 scripts/lib/redact.mjs 反扫，看 md 里有没有漏网的真实值

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { findLeaks } from './lib/redact.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DICT = path.join(ROOT, 'docs', 'error-dict');

const VERSION = '1.0.0';

const CLASSES = {
  ENV: '环境 / 编码 / 路径',
  NET: '网络 / 证书 / 代理',
  DSH: 'DSH 插件 / 配置 / 模型层',
  QQ: 'QQ 桥接 / NapCat',
  MEDIA: '图片 / 视频 / 音频 / 表情',
  DY: '抖音运营链路',
  COST: '成本 / 上下文 / token',
  OPS: '进程 / 计划任务 / 结构',
};

const FIELD_ALIASES = {
  症状: 'symptom', 错误原文: 'rawError', 触发条件: 'trigger',
  根因: 'rootCause', 影响: 'impact', 解决: 'fix',
  证据: 'evidence', 回滚点: 'rollback', 防护: 'guard', 关联: 'related',
};
const REQUIRED = ['symptom', 'rawError', 'trigger', 'rootCause', 'fix', 'evidence'];

const RE_HEAD = /^##\s+ERR-([A-Z]+)-(\d+)\s*[|｜]\s*(.+?)\s*$/;
const RE_FIELD = /^-\s+(症状|错误原文|触发条件|根因|影响|解决|证据|回滚点|防护|关联)\s*[:：]\s*(.*)$/;
// 「未查明」允许带括号说明（未查明（已排除 A、B）），所以只在**没有任何补充说明**时算占位
const RE_PLACEHOLDER = /^(?:TODO|TBD|FIXME|待补|待补充|待填写|待确认|未查明|占位)[\s.。…·:：-]*$/i;

// ── 解析 ───────────────────────────────────────────────────────────────────

function parseFile(file) {
  const text = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
  const entries = [];
  let cur = null;
  let field = null;

  text.split('\n').forEach((line, i) => {
    const head = line.match(RE_HEAD);
    if (head) {
      if (cur) entries.push(cur);
      cur = { cls: head[1], num: Number(head[2]), id: `ERR-${head[1]}-${head[2]}`, title: head[3], fields: {}, line: i + 1 };
      field = null;
      return;
    }
    if (!cur) return;

    const f = line.match(RE_FIELD);
    if (f) {
      field = FIELD_ALIASES[f[1]];
      cur.fields[field] = f[2].trim();
      return;
    }
    // 续行：缩进 2 空格以上，且不是新标题/新字段
    if (field && /^\s{2,}\S/.test(line)) {
      cur.fields[field] = `${cur.fields[field]}\n${line.trim()}`.trim();
      return;
    }
    if (!line.trim()) field = null;
  });
  if (cur) entries.push(cur);
  return entries;
}

// 「错误原文」外面常包一层反引号，去壳但保留内容原样
// 只剥「作者为了好看包在外面的一对反引号」。
// 旧写法 `.replace(/^`+/,'').replace(/`+$/,'')` 首尾各剥一次、互不相关，
// 值里本来就有的反引号会当场被吃掉 —— 2026-10-26 导出 128 条时，
// 283 个字段在「写 md → 反向解析」的往返中全变了形。
// 现在：首尾各有一个、中间不再含反引号，才算一层外包装。
const stripTick = (s) => {
  const t = String(s || '').trim();
  if (t.length >= 2 && t.startsWith('`') && t.endsWith('`') && !t.slice(1, -1).includes('`')) {
    return t.slice(1, -1).trim();
  }
  return t;
};

// ── 关键词提取（给 INDEX.md 用） ────────────────────────────────────────────

const STOP = new Set([
  'THE', 'AND', 'FOR', 'NOT', 'BUT', 'WITH', 'THIS', 'THAT', 'FROM', 'ARE', 'WAS',
  'ERROR', 'FAILED', 'FAIL', 'TRUE', 'FALSE', 'NULL', 'NONE', 'JSON', 'HTTP',
]);

function keywords(e) {
  const src = `${e.title}\n${e.rawError || ''}`;
  const out = new Set();
  for (const m of src.match(/0x[0-9A-Fa-f]{6,8}/g) || []) out.add(m);
  for (const m of src.match(/\b[A-Z][A-Z0-9_]{2,}\b/g) || []) if (!STOP.has(m)) out.add(m);
  for (const m of src.match(/\b[A-Za-z][A-Za-z0-9]{4,}(?:Error|Exception|Failure)\b/g) || []) out.add(m);
  for (const m of src.match(/\b[45]\d{2}\b/g) || []) out.add(m);
  // CamelCase 标识符，长度 >= 6（AcquireCredentialsHandle 这类）
  for (const m of src.match(/\b[a-z]+(?:[A-Z][a-z0-9]+){2,}\b/g) || []) out.add(m);
  return [...out].slice(0, 5);
}

// ── 主流程 ─────────────────────────────────────────────────────────────────

const CHECK_ONLY = process.argv.includes('--check');
const errors = [];
const warnings = [];

if (!fs.existsSync(DICT)) {
  console.error(`✗ 找不到目录 ${DICT}`);
  process.exit(1);
}

const files = fs.readdirSync(DICT).filter((f) => /^\d{2}-[A-Z]+-.*\.md$/.test(f)).sort();
if (!files.length) {
  console.error('✗ docs/error-dict/ 下没有 0x-*.md 分类卷');
  process.exit(1);
}

// 分类卷必须齐。踩过：用 tar 抽仓库时 UTF-8 文件名被弄乱，只抽出 4 卷，
// 校验依旧报「✓ 通过 / 50 条」—— 少了一半词条而无人发现。
// 校验器的职责不是“现有文件合法”，而是“仓库是完整的”。
const present = new Set(files.map((f) => f.slice(3).split('-')[0]));
for (const cls of Object.keys(CLASSES)) {
  if (!present.has(cls)) errors.push(`缺少分类卷：${cls}（${CLASSES[cls]}）`);
}

const all = [];
for (const file of files) {
  const expectCls = file.match(/^\d{2}-([A-Z]+)-/)[1];
  for (const e of parseFile(path.join(DICT, file))) {
    e.srcFile = file;
    if (e.cls !== expectCls) {
      errors.push(`${file}:${e.line} ${e.id} 分类与文件名不符（文件名 ${expectCls}，条目 ${e.cls}）`);
    }
    for (const k of REQUIRED) {
      if (!stripTick(e.fields[k])) errors.push(`${file}:${e.line} ${e.id} 缺少必填字段「${k}」`);
    }
    const rc = stripTick(e.fields.rootCause);
    if (rc && RE_PLACEHOLDER.test(rc)) {
      errors.push(`${e.id} 根因是占位符「${rc}」——查不出就写「未查明（已排除 X、Y）」`);
    } else if (rc && rc.length < 8) {
      warnings.push(`${e.id} 根因只有 ${rc.length} 字，大概率是敷衍`);
    }
    if (!stripTick(e.fields.rawError)) {
      errors.push(`${e.id} 错误原文是空的 —— 这一条最不能省`);
    }
    all.push(e);
  }
}

// ID 唯一
const seen = new Map();
for (const e of all) {
  if (seen.has(e.id)) errors.push(`ID 重复：${e.id}（${seen.get(e.id)} 与 ${e.srcFile}）`);
  else seen.set(e.id, e.srcFile);
}

// 泄漏检查：md 是手写的，最容易漏真实值
for (const file of files) {
  const body = fs.readFileSync(path.join(DICT, file), 'utf8');
  for (const h of findLeaks(body)) {
    errors.push(`${file} 疑似泄漏（${h.rule}，${h.count} 处：${h.sample.join(' / ')}）`);
  }
}

// 组装
const entries = all
  .slice()
  .sort((a, b) => (a.cls === b.cls ? a.num - b.num : a.cls.localeCompare(b.cls)))
  .map((e) => {
    const o = { id: e.id, cls: e.cls, title: e.title };
    for (const k of ['symptom', 'rawError', 'trigger', 'rootCause', 'impact', 'fix', 'evidence', 'rollback', 'guard', 'related']) {
      const v = stripTick(e.fields[k]);
      if (v) o[k] = v;
    }
    return o;
  });

const byClass = {};
for (const e of entries) byClass[e.cls] = (byClass[e.cls] || 0) + 1;

// 报告
for (const w of warnings) console.log(`  ⚠ ${w}`);
for (const e of errors) console.log(`  ✗ ${e}`);

if (errors.length) {
  console.error(`\n✗ ${errors.length} 个错误，未生成任何文件。`);
  process.exit(1);
}

if (CHECK_ONLY) {
  console.log(`✓ 校验通过：${files.length} 卷 / ${entries.length} 条${warnings.length ? `（${warnings.length} 个警告）` : ''}`);
  process.exit(0);
}

// ── 写文件 ─────────────────────────────────────────────────────────────────

const JSON_FILE = path.join(DICT, 'error-dict.json');
const INDEX_FILE = path.join(DICT, 'INDEX.md');

// generatedAt 只在内容变化时才刷新，否则每天 diff 里都是一行噪音
const entriesKey = JSON.stringify(entries);
let generatedAt = new Date().toISOString().slice(0, 10);
if (fs.existsSync(JSON_FILE)) {
  try {
    const prev = JSON.parse(fs.readFileSync(JSON_FILE, 'utf8'));
    if (JSON.stringify(prev.entries) === entriesKey && prev.generatedAt) generatedAt = prev.generatedAt;
  } catch { /* 旧文件坏了就重写 */ }
}

const doc = {
  version: VERSION,
  license: 'CC-BY-4.0',
  generatedAt,
  note: '本文件由 scripts/build.mjs 从 docs/error-dict/0x-*.md 生成，请勿手改。源文件是 markdown。',
  count: entries.length,
  byClass,
  entries,
};
fs.writeFileSync(JSON_FILE, `${JSON.stringify(doc, null, 2)}\n`, 'utf8');

// INDEX.md
const rows = [];
for (const e of entries) {
  const kw = keywords(e);
  if (!kw.length) rows.push({ kw: '（无关键词）', id: e.id, title: e.title });
  for (const k of kw) rows.push({ kw: k, id: e.id, title: e.title });
}
rows.sort((a, b) => a.kw.localeCompare(b.kw, 'en') || a.id.localeCompare(b.id));

const index = [
  '# 报错词典 · 反查索引',
  '',
  '> 自动生成，请勿手改。找错误时先在这里搜关键词。',
  '',
  `共 ${entries.length} 条，关键词 ${new Set(rows.map((r) => r.kw)).size} 个。`,
  '',
  '| 关键词 | 条目 | 标题 |',
  '|---|---|---|',
  ...rows.map((r) => `| \`${r.kw}\` | ${r.id} | ${r.title.replace(/\|/g, '\\|')} |`),
  '',
].join('\n');
fs.writeFileSync(INDEX_FILE, index, 'utf8');

console.log(`✓ ${files.length} 卷 / ${entries.length} 条`);
console.log(`  ${Object.entries(byClass).map(([k, v]) => `${k} ${v}`).join('  ')}`);
console.log(`  写入 ${path.relative(ROOT, JSON_FILE)}`);
console.log(`  写入 ${path.relative(ROOT, INDEX_FILE)}（${rows.length} 行）`);
