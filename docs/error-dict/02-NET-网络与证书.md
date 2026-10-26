# 02 · 网络 · 证书 · 代理

> 这一卷收「要连外网 / 证书 / 代理 / 超时 / TLS」这类问题。
> 新增词条直接往下追加，骨架见 [_TEMPLATE.md](_TEMPLATE.md)。

共 5 条。

## ERR-NET-001 | Pollinations 间歇 402：同一端点有时 200 有时 402，没规律

- 症状: 画图接口时好时坏，失败的很快又恢复，看起来像限流又对不上文档的 1 req/15s。
- 错误原文: `402`（HTTP 402；最慢一次重试到第 71 秒才出图）
- 触发条件: 连续调 `https://image.pollinations.ai/prompt/...` 文生图。
- 根因: 匿名免费层限频不稳定（文档写 1 req/15s，实际是无规律的 402 抖动）——未查明底层判定规则（已排除 key 问题/已排除固定间隔限流）。
- 解决: 全局节流保守到 25 秒（比文档 15s 更保守）+ 402 自动退避重试（20s、40s 两轮）。
- 证据: `MEMORY-<name>.md` 第 534–535 行
- 回滚点: 无
- 防护: 免费层不能当高可用服务；每轮配图的重负载要换有 key 的端点

## ERR-NET-002 | SenseNova 连接限流：首次成功后 10 秒内再连必 UND_ERR_CONNECT_TIMEOUT

- 症状: 图生图第一张成功，紧接着第二张就 fetch failed，等约 40 秒又好了；连 `/models` 这种 GET 也会超时。第一反应是「图片太大」，压缩到 57KB 照样失败。
- 错误原文: `fetch failed` + `cause: UND_ERR_CONNECT_TIMEOUT`
- 触发条件: 第一次请求成功后 10 秒内再发新连接（`https://token.sensenova.cn/v1`）。
- 根因: 服务端连接级限流——是**连接阶段**失败，不是 payload 太大。
- 解决: `SN_MIN_INTERVAL_MS=45000` 全局串行节流 + 连接类错误退避重试（15s/30s 两轮）。
- 证据: `MEMORY-<name>.md` 第 558–559 行
- 回滚点: 无

## ERR-NET-003 | SenseNova images / size 参数一给错就 400，且报错不说该写什么

- 症状: 图生图怎么传参考图都被 400；size 按文生图的习惯写也 400。
- 错误原文: `400 invalid arguments`（images 传字符串数组）；`invalid images, should contain between 1 and 5 items`（传 `image` 字段）；图生图 size 给 `1024x1024` → `400`
- 触发条件: 按直觉传参，没照「images:[{image_url}] + size:'auto'」的格式。
- 根因: 图生图只认 `images: [{image_url}]`；图生图 size 必须是 `'auto'`；文生图反而要用像素值 `1024x1024`（官方 skill 里的 `2k/4k` 是 CLI 参数，不是 JSON 字段）。
- 解决: 按上述格式修正；图生图返回 `data[0].url`（OSS 临时链接，24h 有效，要自己下载）。
- 证据: `MEMORY-<name>.md` 第 553–557 行
- 回滚点: 无

## ERR-NET-641 | DeepSeek API key 失效，Authentication Fails 401 且无人察觉

- 症状: <name>无法调用模型；直接请求官方 API 返回 401 确认 key 失效；至少从 02:55 起就失效，但一直没人发现。
- 错误原文: `Authentication Fails, Your api key: ****fcg4 is invalid`
- 触发条件: 用原 DEEPSEEK_API_KEY 发起 DeepSeek API 调用时。
- 根因: 环境漂移：DEEPSEEK_API_KEY 失效（直接请求官方 API 返回 401 确认）。
- 解决: 已处置：人类提供中转站 key（ai.youyiyun.cn），provider 切到 youyiyun。
- 证据: `logs/failures/2026-10.jsonl` F-2026-10-0007（L7）。
- 关联: F-2026-10-0008（切到 youyiyun 后接着撞 reasoning effort 声明问题）

## ERR-NET-901 | 沙箱内 curl / PowerShell 走 Schannel 全报 SEC_E_NO_CREDENTIALS，同 URL 的 Node / Python 却全通

- 症状: 在 workspace-write 沙箱里让子进程下载 HTTPS 源，curl 和 Invoke-WebRequest 全部失败并报 Schannel 凭证错误；同一个 URL 换成 Node 的 fetch（自带 OpenSSL + 自带 CA）三个源全通，Python requests 也通。第一反应通常是"证书坏了 / 代理配错了"，但换工具就正常。
- 错误原文: `curl: (35) schannel: AcquireCredentialsHandle failed: SEC_E_NO_CREDENTIALS`；.NET/PowerShell 侧为 `The SSL connection could not be established, see inner exception.` + 内层 `SEC_E_NO_CREDENTIALS (0x8009030e)`
- 触发条件: 在受限令牌（restricted token）沙箱里执行 curl.exe（Schannel 构建）/ PowerShell 的 Invoke-WebRequest；同一条命令在沙箱外执行正常。
- 根因: 故障点位于 Windows TLS 栈的**令牌 / per-user 凭证状态**，不在网络。上游已把这条现象单独立案且定性一致：openai/codex#17459 正文写明"HTTPS 请求只要走 Windows TLS 栈（Schannel）就失败，Python 在同一沙箱内成功、沙箱外的 PowerShell 也成功，说明是 Schannel/SSPI/token/user-profile 的交互，而非通用网络故障"；DSH 侧 Discussion #4163 的标题即把它归为 "Windows restricted-token sandbox: Schannel TLS fails"。**根因未结案**：该 issue 至今 open，其调查线索是"沙箱用户的 profile 未初始化"，而强制沙箱用户首次登录后同一沙箱内 Schannel 反而成功 —— 方向明确（缺 per-user 凭证状态），具体修复未定。
- 解决: 本机做法：下载/请求一律走 Node（`scripts\_download-model.mjs`，支持断点续传），不把 curl 的报错当网络故障排查。上游可参考的做法（均出自该 issue 的观察段）：① 换不依赖 Schannel 的 TLS 栈 —— Python/Node 在同一沙箱内直接通，编译了 OpenSSL 后端的 curl 同理（后端是 build-time 选择，运行时不能切换）；② 若必须用 Schannel，得让执行体拿到完整的 per-user 凭证/profile（issue 里"强制沙箱用户首次登录后 Schannel 恢复"）；③ 在沙箱外（非受限令牌）执行同一条命令。
- 证据: [openai/codex#17459](https://github.com/openai/codex/issues/17459)（正文逐条对照"失败/成功"矩阵）；[openai/codex#46726](https://github.com/openai/codex/issues/46726)；[deepseek-harness Discussion #4163](https://github.com/deepseek-ai/deepseek-harness/discussions/4163)；本机 `MEMORY-<name>.md` L4621-4623；`docs/error-dict/_inbox/b-memory-late.md` ERR-NET-320
    + ERR-NET-1201（已并入）: `ERR-` 实测记录——`Invoke-RestMethod` 与 `curl.exe` 均失败于 2026-10-25 21:0x；同参数 `node yjtest.js` 返回 `HTTP 200 {"id":"chatcmpl-wb-...","model":"deepseek-v4.1-flash"}`。
- 回滚点: 无（未改动任何配置）
- 防护: 归为"沙箱边界"而不是"证书问题"——**上游确认**（issue 正文的现象对照）；"关证书校验 / 设 `NODE_TLS_REJECT_UNAUTHORIZED=0` / 改代理"是**社区偏方且有害**，与本机现象无关。沙箱内 HTTPS 失败的第一动作是换 TLS 栈复测，第二步才谈排障。
- 关联: ERR-NET-320（同一坑的本机记录，当时根因写"未查明"，本条把它补上了）
    + F-2026-10-0035（同一天、同为「表象与根因不一致」类故障）
