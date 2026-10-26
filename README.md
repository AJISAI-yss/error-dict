# 报错词典 · error-dict

一台真机上跑 AI 助手踩过的 **128 个坑**。每条都有：错误原文（逐字）、根因、解法、证据、回滚点、防护。

不是 API 文档，不是教程，是**事故记录**。写给三种人看：

- **你自己**：搜错误原文，直接跳到解法
- **你的 AI 助手**：读 [AGENTS.md](AGENTS.md)，按格式查、按格式补
- **维护者**：读 [CONTRIBUTING.md](CONTRIBUTING.md)

## 为什么值得看

大部分报错你搜不到，因为它们是**几个组件凑在一起才出现**的：

```
插件加载链 + 单个 patch 配置文件 + 目录 Junction + Windows 受限令牌
        ↓ 组合起来才出现的
所有工具静默 401，日志里一句报错都没有
```

搜索引擎不认识这种组合。这份词典认识，因为它是在一台机器上真实撞出来的。

## 怎么用（三种查询方式）

**① 按关键词反查** —— 打开 [INDEX.md](docs/error-dict/INDEX.md)，搜你报错里的任意片段：

```bash
grep -n "SEC_E_NO_CREDENTIALS" docs/error-dict/INDEX.md
```

**② 按错误原文全文搜** —— 比 INDEX 准，因为 INDEX 只收关键词：

```bash
grep -rn "Authentication failed" docs/error-dict/*.md
```

**③ 按分类浏览** —— 知道你大概撞在哪一层，直接读那一卷：

| 分类 | 内容 | 条数 |
|---|---|---|
| [ENV](docs/error-dict/01-ENV-环境与编码.md) | 环境 / 编码 / 路径 | 22 |
| [NET](docs/error-dict/02-NET-网络与证书.md) | 网络 / 证书 / 代理 | 5 |
| [DSH](docs/error-dict/03-DSH-插件与配置.md) | 插件 / 配置 / 模型层 | 24 |
| [QQ](docs/error-dict/04-QQ-桥接与NapCat.md) | QQ 桥接 / NapCat | 24 |
| [MEDIA](docs/error-dict/05-MEDIA-媒体理解.md) | 图片 / 视频 / 音频 / 表情 | 16 |
| [DY](docs/error-dict/06-DY-抖音链路.md) | 抖音运营链路 | 6 |
| [COST](docs/error-dict/07-COST-成本与上下文.md) | 成本 / 上下文 / token | 4 |
| [OPS](docs/error-dict/08-OPS-进程与结构.md) | 进程 / 计划任务 / 结构 | 27 |

## 一条词条长什么样

```markdown
## ERR-NET-001 | pwsh / curl 打第三方 HTTPS 全部失败，Node 却正常

- 症状: 同一个 URL，Node 能通，PowerShell 和 curl 报证书获取失败
- 错误原文: `curl: (35) schannel: AcquireCredentialsHandle failed: SEC_E_NO_CREDENTIALS (0x8009030e)`
- 触发条件: Windows 下进程跑在受限令牌里时打第三方 HTTPS
- 根因: 进程拿不到凭据句柄，握手在建立前就失败——不是证书过期，也不是代理
- 解决: 探测第三方 API 改到 Node 下跑；pwsh 只做本机操作
- 证据: 实测 3 个 URL 全失败、Node 全成功
- 防护: 任何"网络通不通"的结论，先用能出声的那条路复验一次
```

**判定真假词条的三个标准**（已写进自动化校验）：

1. 错误原文是**贴的**，不是回忆的
2. 根因写得出机制；查不出就写 `未查明（已排除 X、Y）`——**不编**
3. 证据指得到具体文件 / 行号 / 实测数据

## 目录结构

```
├── README.md                 ← 你在这
├── AGENTS.md                 ← 给 AI 助手的说明书（格式 + 查询配方 + 红线）
├── CONTRIBUTING.md           ← 怎么加词条
├── docs/error-dict/
│   ├── 01..08-*.md           ← 按分类分卷（★ 源文件，改这里）
│   ├── _TEMPLATE.md          ← 新词条骨架
│   ├── INDEX.md              ← 关键词反查表（生成）
│   └── error-dict.json       ← 机器可读全量库（生成）
└── scripts/
    ├── build.mjs             ← 校验 + 生成 JSON / INDEX
    ├── lib/redact.mjs        ← 脱敏规则
    └── redact-denylist.example.txt
```

**markdown 是源文件，JSON 和 INDEX 都是派生物。** 只改 md，别手改生成物。

## 自己加词条

```bash
# 1. 在对应分类卷末尾追加一块（骨架见 docs/error-dict/_TEMPLATE.md）
#    分类选错也没关系，脚本会提示"分类与文件名不符"

# 2. 只校验，不写文件
node scripts/build.mjs --check

# 3. 通过后重新生成 JSON + INDEX
node scripts/build.mjs
```

校验会拦下：字段缺失、ID 重复、分类与文件不符、根因写成占位符、错误原文没贴、**疑似脱敏泄漏**。

## 关于脱敏

本仓库**不含**任何密钥、账号、群号、身份证级别的个人数据、绝对路径。

脱敏不是"删掉看着像隐私的"，那样会把错误码一起删掉——`0x8009030e`、`0xC0000005` 这类**恰是词条最有价值的部分**，全部保留。规则分两类：

- 真实敏感值（账号 / 群号 / 人名）→ **精确黑名单**替换
- 结构性泄漏（绝对路径 / key / UUID / 金额）→ 模式规则替换

详见 [scripts/lib/redact.mjs](scripts/lib/redact.mjs)。

**错误码、版本号、日期、字节数一律保留。**

还有两类指纹看着像漏，其实是**故意的**：

- `MEMORY-<name>.md 第 N 行` —— 「证据」一栏常引维护者本机的私人记忆日志，
  文件名已脱敏、正文从不公开。**保留引用而不是删掉，是为了让每条词条可回溯**
  （不溯源的“已修复”没法验证）。读者看不到那个文件是正常的，只看结论就行。
- `<workspace>/`、`C:\Users\<user>` —— 代表“某个工作区 / 某个用户目录”的占位路径。
  相对结构（`_backup\...\`、`projects\...\`）保留，因为排查靠的就是那个结构。

## 它是怎么长出来的

每天白天自动跑一轮：扫当天日志 → 挖新候选 → 与已有词条去重 → 补进 `_inbox` → 重建 → 人工过一道 → 合并。

所以词条会一直长，坏词条也会被改。**没有"最终版"。**

## 免责

- 全部经验来自**单机环境**（Windows + 特定版本组合），你的环境可能不同
- 词条里的"解决"是**当时管用**，不是官方推荐
- 上游修了就该删的词条，会标 `已失效`
- 不接受"关掉校验""放宽权限"这类**用安全换不报错**的解法——[AGENTS.md](AGENTS.md) 里有一张伪修复清单

## 许可

- 词条内容：CC BY 4.0
- 脚本代码：MIT

引用时留个仓库链接就行。
