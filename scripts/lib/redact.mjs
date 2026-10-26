// scripts/lib/redact.mjs —— 脱敏规则
// ---------------------------------------------------------------------------
// 为什么需要这个文件：
//   最直觉的做法是「把 5~12 位数字一律换成 <number>」。它会顺手抹掉
//     0x8009030e / 0xC0000005 / 文号 3850223 / 日期 20261025
//   而错误原文恰恰是词条最值钱的部分 —— 抹掉它，词典当场变废纸。
//
// 所以这里分两类规则：
//   · 真实敏感值（账号 / 群号 / 人名）→ **精确黑名单**逐个列出来
//   · 结构性泄漏（绝对路径 / key / UUID / 金额）→ **模式规则**
//   · 错误码 / 版本号 / 日期 / 字节数 / 端口 → **一律保留**
//
// 黑名单文件：scripts/redact-denylist.txt（不提交，见 .gitignore）
// 模板见 scripts/redact-denylist.example.txt

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DENYLIST_FILE = path.resolve(HERE, '..', 'redact-denylist.txt');

const DENY_LABEL = {
  group: '<qq-group>',
  uin: '<qq-uin>',
  account: '<account>',
  name: '<name>',
  host: '<host>',
  other: '<value>',
};

/**
 * 读取黑名单。每行 `类别<TAB>值`，`#` 开头为注释。文件不存在 → 空表。
 * @returns {{value:string,label:string}[]} 按 value 长度降序
 */
export function loadDenylist(file = DENYLIST_FILE) {
  const out = [];
  if (!fs.existsSync(file)) return out;
  for (const raw of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const cells = line.split(/\t+/).map((s) => s.trim()).filter(Boolean);
    const cat = cells.length >= 2 ? cells[0] : 'other';
    const value = cells.length >= 2 ? cells.slice(1).join(' ') : cells[0];
    if (value) out.push({ value, label: DENY_LABEL[cat] || DENY_LABEL.other });
  }
  // 长的先替换，否则短值会把长值切成两半
  return out.sort((a, b) => b.value.length - a.value.length);
}

const DENYLIST = loadDenylist();

// 模式规则。顺序有意义：先抹路径与密钥，再处理金额。
export const SENSITIVE = [
  // API key
  [/sk-[A-Za-z0-9_-]{16,}/g, 'sk-<redacted>'],
  // 其他常见 bearer / token 形态
  [/\bBearer\s+[A-Za-z0-9._-]{16,}/g, 'Bearer <redacted>'],

  // 用户目录。分隔符必须同时认 \ 和 / —— Node 的报错默认写正斜杠
  // （Cannot find module 'C:/Users/...'），只写反斜杠的规则会整条漏掉。
  [/[A-Za-z]:[\\/]Users[\\/](?!<user>)[^\\/\s'"]+/g, 'C:\\Users\\<user>'],

  // 家目录的 posix 写法
  [/\/(?:home|Users)\/(?!<user>)[^/\s'"]+/g, '/home/<user>'],

  // UUID：会话 id / 请求 id，暴露行为轨迹，对读者零价值
  [/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '<uuid>'],

  // 金额：暴露个人消费。必须带货币符号 —— 裸数字那是错误码和字节数。
  [/([¥$])\s?\d[\d,]*(?:\.\d+)?/g, '$1<amount>'],
];

/** 脱敏。黑名单按精确值替换，模式规则按正则替换。 */
export function redact(s, deny = DENYLIST) {
  let out = String(s ?? '');
  for (const [re, rep] of SENSITIVE) out = out.replace(re, rep);
  for (const { value, label } of deny) {
    if (!value) continue;
    // 纯数字值要卡边界，否则 1234567890 会把 11234567890123 切碎
    const re = /^\d+$/.test(value)
      ? new RegExp(`(?<!\\d)${value}(?!\\d)`, 'g')
      : new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
    out = out.replace(re, label);
  }
  return out;
}

/**
 * 反向校验：脱敏后再扫一遍，看有没有漏网的。
 * 改完规则必须跑这个 —— 「我改好了」和「扫不出来了」是两件事。
 */
export function findLeaks(s, deny = DENYLIST) {
  const hits = [];
  const text = String(s ?? '');
  for (const [i, [re]] of SENSITIVE.entries()) {
    const m = text.match(new RegExp(re.source, re.flags));
    if (m) hits.push({ rule: `pattern#${i}`, count: m.length, sample: m.slice(0, 3) });
  }
  for (const { value, label } of deny) {
    if (value && text.includes(value)) {
      hits.push({ rule: `denylist:${label}`, count: 1, sample: ['<hidden>'] });
    }
  }
  return hits;
}
