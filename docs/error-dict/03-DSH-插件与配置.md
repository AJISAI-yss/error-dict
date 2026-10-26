# 03 · DSH 插件 · 配置 · 模型层

> 这一卷收「插件没加载 / 配置没生效 / 模型报 400 / provider 注册失败」这类问题。
> 新增词条直接往下追加，骨架见 [_TEMPLATE.md](_TEMPLATE.md)。

共 24 条。

## ERR-DSH-001 | 坏插件拖垮整个工具树：命令「假执行」，空输出 + exit 0 + 无副作用

- 症状: shell 工具看起来在跑，但什么都不做也不报错；以为缺 PS7 / 以为编码问题，查了两天。
- 错误原文: `~/.dsh/boot-failures.json` 里有失败记录；包加载报 `ERR_MODULE_NOT_FOUND`
- 触发条件: profile 里装了一个依赖不全的插件（`@deepseek-ai/dsh-plugin-manager@0.1.6-alpha.2` 只把 tarball 丢进 `~/.dsh/profiles/node_modules`，`execa`/`yaml`/`zod`/`@deepseek-ai/dsh-app-boot` 都没装）。
- 根因: 坏插件把整条工具树拖崩；`pwsh` 工具回退/失效表现为空输出 + exit 0，完全不像故障。
- 解决: `plugin_uninstall` 卸掉坏插件 → patch 回 `[]`、`plugins.json` 变空 → 重启应用；之后 `boot-failures.json` 为 `{"failures":[]}`，pwsh 恢复正常。
- 证据: `MEMORY-<name>.md` 第 125–139 行
- 回滚点: `<workspace>/_backup\good-20261021-015451\`（干净 patch + 空 plugins.json）
- 防护: 「命令没反应但也不报错」先查 `boot-failures.json`

## ERR-DSH-002 | 「插件装上了却跑不起来」的四条根因（success 不等于能用）

- 症状: 安装返回成功、包也在 node_modules 里，但开机就 load-failure，或者按包名根本装不上。
- 错误原文: `plugin_install` 返回 success 但开机 `ERR_MODULE_NOT_FOUND`；安装器报错来源 `/^(?:dsh|pnpm|npm|npx|yarn)\b/`；`https://raw.githubusercontent.com/dsh-external/hub/main/catalog.json` 返回 `404`
- 触发条件: ① 用 `plugin_install` 装带依赖的社区插件；② 按包名装任何 `dsh-*` 前缀包；③ 用默认插件源搜索。
- 根因: ① DSH 安装器不做依赖解析；② 桌面版 `dsh-host-plugin-installer` 的正则把任何 `dsh-` 开头的包名误判成 shell 命令直接拒绝；③ `profiles/web/pnpm-workspace.yaml` 是 `nodeLinker: hoisted` + `autoInstallPeers: false`，peer 依赖不会自动补；④ 默认源仓库（dsh-external/hub）已删。
- 解决: 装插件走 `tools/dsh-plugin-safe.ps1`（临时目录 npm install 拿完整依赖闭包 → 只合并缺失包 → node 校验可解析 → 才写 patch）；peer 依赖手动补；搜索改用 npm registry 生成的 `docs/data/dsh-plugin-catalog.json`（320 条）。bundle 层的改动**必须重启 DSH 才组装生效**（工具层也才出现）。
- 证据: `MEMORY-<name>.md` 第 127–131、138、151 行；第 2176、2971 行（bundle 需重启）
- 回滚点: <workspace>/_backup\good-20261021-015451\
- 防护: 判断插件是否装好，只看 `boot-failures.json` 是否为空

## ERR-DSH-003 | llm-ollama-local 写错层级：entry not found / provider already declared

- 症状: 想加一个本地模型 provider，改完 patch 要么完全没反应（静默跳过），要么插件加载就报重复注册。
- 错误原文: `patch: entry "llm-ollama-local" not found`；`configurable provider "amazon-bedrock" is already declared`
- 触发条件: 在 `cordis.patch.yml` 里写成顶层 `- id: llm-ollama-local`，或写成 `- insert: - id: llm-ollama-local`。
- 根因: 顶层 `- id:` 只能覆盖已存在的条目，新名字找不到就静默跳过；`insert` 会新建一个 provider 容器，和 `dsh-base` 里已有的 `llm-pi-ai`（挂着 `amazon-bedrock`）撞车。
- 解决: **覆盖已有的 `llm-pi-ai`**：`- id: llm-pi-ai` + `config.providers.ollama`（`dsh-base` 注释写明它的状态是 `mounted dormant: zero routes until a llm-pi-ai: settings section supplies provider profiles`）。
- 证据: `MEMORY-<name>.md` 第 704–707 行
- 回滚点: 两个 profile 均已恢复到 API 模型
- 防护: 用 `dsh --dump-config` 看最终合并结果，别只看 patch 文件

## ERR-DSH-004 | reasoningEfforts 配置三连报错：off 的 wire value 必须写清

- 症状: 本地模型接上后一调就 400/加载失败，每改一次都要重启 DSH，连踩 4 轮。
- 错误原文: `does not support reasoning effort "off"`；`offers no level beyond "off"`；`reasoningEfforts.low needs the wire value dispatch should send; only "off" may leave it empty`；最后还差一个 `No API key for provider: ollama`
- 触发条件: 在 `llm-pi-ai.config.providers.ollama` 里配 `reasoningEfforts`。
- 根因: 桥接会传 off/max，模型必须声明 off；只写 `off:` 空值会被判成「没给等级」；除 off 外每个等级都必须给 wire value。
- 解决: 列全等级且除 off 外都给值：`off:`（可空）/ `low: low` / `high: high` / `max: max`；再在 DSH 界面「API 密钥」框随便填一个占位 key（Ollama 不校验）。
- 证据: `MEMORY-<name>.md` 第 708–711 行
    + ERR-DSH-664（已并入）: `logs/failures/2026-10.jsonl` F-2026-10-0008（L8）。
- 回滚点: `_backup` 中的 patch 快照
- 防护: 真正生效的 profile 是 `~/.dsh/profiles/web/cordis.patch.yml`，不是 `desktop`
- 关联: F-2026-10-0007、F-2026-10-0035
    + F-2026-10-0007、F-2026-10-0035

## ERR-DSH-005 | session/model-unavailable：provider 没注册成功，改错 profile 白费两轮

- 症状: 明明把本地模型配置写得齐齐全全，会话一切换就报模型不可用；桥接 `/api/dsh/model` 返回 `catalogSource: "fallback"`。
- 错误原文: `session/model-unavailable: Select an available model`；`/api/models`、`/api/providers` 全是 `401`
- 触发条件: 在 `~/.dsh/profiles/desktop/cordis.patch.yml` 里加 provider，而 DSH Desktop 实际加载的是 `profiles/web`。
- 根因: 改错 profile（desktop ≠ web）→ patch 根本没被加载；同时 DSH 不吐模型目录，`.credentials.yaml` 的 `browser-session` 也认证不过，拿不到真实 provider 列表，只能看到 fallback。
- 解决: 改 `profiles/web/cordis.patch.yml` 并重启 DSH；本轮最终回退到 API 模型（`deepseek-flash`）保证可用。
- 证据: `MEMORY-<name>.md` 第 209–210 行；第 693–698 行；第 713 行；第 766 行（「改错 profile」乌龙）
- 回滚点: 已回退到 API 模型
- 防护: 改配置前先 `dsh --dump-config`；错误日志在 `C:\Users\<user>\AppData\Roaming\DSH Desktop\logs\host\dsh-YYYY-MM-DD.error.log`

## ERR-DSH-006 | dsh-boot-guard 会静默回滚 cordis.patch.yml，把插件一起隔离

- 症状: 手改了配置文件的路径/条目，重启后改动凭空消失，插件被隔离，日志里还查不到记录。
- 错误原文: 无明显报错；`15:00:02` 的回滚只在 `<workspace>/logs\boot-guard.log` 里，而且当次**根本没记**（日志停在 10/21）
- 触发条件: 直接编辑 `~/.dsh/profiles/web/cordis.patch.yml`（它被 `dsh-boot-guard.ps1` 守护）。
- 根因: boot-guard 判定「异常」就回滚该文件并隔离对应插件，删除多行 YAML 是静默的。
- 解决: 不要直接改这个文件——移动被引用的目录时**建 Junction 保持旧路径可用**；真要跑 boot-guard 先加 `-DryRun`。
- 证据: `MEMORY-<name>.md` 第 1196–1202 行；第 319 行（「潜在雷」）
    + ERR-DSH-668（已并入）: `docs/NOTES-机器人脚本审计与修复-20261023.md` §三.1（L153-L162）。
    + ERR-DSH-661（已并入）: `logs/failures/2026-10.jsonl` F-2026-10-0004（L4）、F-2026-10-23-0010（L10）；`docs/NOTES-DSH插件依赖树与治理规则.md` §一（L13-L20）。
- 回滚点: boot-guard 自身会留隔离目录 `_backup\quarantine-<时间>\`
- 防护: `docs/NOTES-DSH插件依赖树与治理规则.md` 规定插件层级只有 DSH 运维 agent 可改
- 关联: F-2026-10-0003
    + F-2026-10-0004
    + F-2026-10-0003

## ERR-DSH-007 | 插件激活失败 TypeError: Cannot read properties of undefined (reading 'validate')

- 症状: 插件装进 `profiles/web` 后在条目上报错，探针证明 `apply()` 一行都没跑到，模块级代码也没执行。
- 错误原文: `shortfilm (dsh-shortfilm): TypeError: Cannot read properties of undefined (reading 'validate')`
- 触发条件: 把自写插件 link 进 `~/.dsh/profiles/web`（同目录下 `qq-mode-console` 却能正常用）。
- 根因: 未查明（已排除：插件代码本身——换 `@deepseek-ai/schemastery` 的 `z.object()` 一样报；已排除 `profiles\web\node_modules\@deepseek-ai\cordis` 副本——加日志证明不是从那里读的；已排除 Desktop 模块解析 hook——探针一次都没触发）。结论指向 Desktop 宿主的激活路径。
- 解决: 安全回滚：还原 `lib\module-resolution-CcoXnXDo.js`、删临时 cordis 副本、从 `dsh.profile.bundles` 移除 `dsh-shortfilm`（并写成 `[]`，因为 `remove_bundle` 不会删依赖）；改走 CLI 路线（`scripts\dsh-shortfilm\cli\shortfilm.mjs`）绕过插件层。
- 证据: `MEMORY-<name>.md` 第 887–906 行
- 回滚点: `_outputs\module-resolution.backup.js`、`_outputs\profile-web-package.backup-before-shortfilm.json`、`_outputs\shortfilm-plugin-backup-20261023`
- 防护: `ctx.effect` 在已激活的上下文里可能根本不执行回调（`qq-mode-console` 也写着「0.2.0 下 apply 是空操作」），别把注册点只放在那里

## ERR-DSH-008 | thinking 历史冲突 400：同一会话中途改过 reasoningEffort

- 症状: 某个群反复报 agent 处理出错，其他群都正常；重建会话后立刻好了。
- 错误原文: `The content[].thinking in the thinking mode must be passed back to the API. (request_id: ...)`
- 触发条件: 在 DSH GUI 里给该会话手动改过推理强度（`model/selection` 序列 `off → off → low`）。
- 根因: DeepSeek thinking 模式要求历史里**每条** assistant 消息都带 thinking；该会话前 22 条是 off 时期（无 thinking）、后 3 条是 low 时期（有 thinking），历史无法回填 → 400。对比其他会话 `efforts=[off]` 全无 thinking 所以没事。
- 解决: ① 自愈：`bridge.js` 的 `ended.reason.kind === "error"` 分支检测 `/content\[\]\.thinking|thinking mode must be passed back/i` 就 `retireSession(key)` 并告知群里「推理模式中途变过，已自动重置」；② 清现场：停桥接 → 删 `state/sessions.json` 里该 key 映射 → 把该群 `bootstrapSent=false` + 清 unread → 重启。
- 证据: `MEMORY-<name>.md` 第 250–261 行
- 回滚点: 会话级操作，无文件回滚
- 防护: 别在 GUI 里给桥接会话改推理强度；要改就改 `config.json` 的 `dsh.reasoningEffort`

## ERR-DSH-009 | reasoning_effort 只认字面量 'off'：空串会偷偷推理，别的写法全报错

- 症状: 想彻底关掉思考省钱，配了 `off:` 空值，结果 reasoning_tokens 还是 17。
- 错误原文: `'reasoning_effort': 'off'` → reasoning_tokens = 0 ✅；`''` → reasoning_tokens = 17 ❌；`'none'` / `'false'` / `'disabled'` → 全部报错
- 触发条件: 配置里写 `reasoningEfforts: { off: }`（空值）或传 `reasoning_effort: ''`。
- 根因: 空串被当成「没指定」，服务端按默认偷偷推理；只有字面量 `'off'` 才算关闭。
- 解决: 必须写 `off: 'off'`，请求里传 `reasoning_effort: 'off'`。
- 证据: `MEMORY-<name>.md` 第 1353–1361 行
    + ERR-DSH-669（已并入）: `docs/NOTES-<name>感知与记忆能力-20261024.md` §四（L196-L208）。
- 回滚点: 无
- 关联: F-2026-10-0008
    + F-2026-10-0008

## ERR-DSH-662 | 模型请求 JSON 节点数超 32768，所有会话 400

- 症状: <name>完全无法回话，所有会话 400；请求含 rea MCP 约 100 个工具 + snowluma 42 个 + 基础 70 个。
- 错误原文: `400: Invalid request JSON: JSON node count cannot exceed 32768`
- 触发条件: QQ 会话模型请求携带大量 MCP 工具 schema 时（rea + snowluma + 基础工具合计约 212 个）。
- 根因: 规则缺失：qq-tool-restrict.mjs 用 ctx.tools.guard 做执行期拦截，不缩减 schema；未预料到 MCP 工具数量会把请求 JSON 节点数顶过中转站上限。
- 解决: 已处置（临时）：临时禁用 rea-mcp（注释 cordis.patch.yml 第 35-47 行）。
    + ERR-DSH-903 补充: 本机做法：先拿掉超大工具集 —— 工具 schema 是节点数大户（深嵌套对象尤甚）；必要时改用 guard 而非 restrict 模型；长会话仍撞墙就新建会话。上游建议（#96 报告者 + 已合并的修复 PR #97）：把它当**结构**上限处理 —— 新建会话，或减少消息条数与图片数量后重试；**不要**靠压缩上下文（PR 明确写"压缩上下文通常不足以降到该上限以内"），也不要重试（同请求必然再被拒），更不要轮换账号。
- 证据: `logs/failures/2026-10.jsonl` F-2026-10-0005（L5）；`docs/NOTES-DSH插件依赖树与治理规则.md`（L2 patch 层说明）。
    + ERR-DSH-903（已并入）: [Mars-Sea/dsh-commandcode-provider#96（含两层转义的真实报文与失败请求形状表）](https://github.com/Mars-Sea/dsh-commandcode-provider/issues/96)；[同仓已合并修复 PR #97（把该 400 单独分类，不再落入通用拒绝）](https://github.com/Mars-Sea/dsh-commandcode-provider/pull/97)；本机 `docs/ROLE-诊断助手.md` L102-104
- 关联: F-2026-10-0035（同为「工具集畸形导致 400」的另一例）
    + ERR-DSH-906（另一种"请求结构被上游拒"的形态）

## ERR-DSH-663 | preset "qq-chat-v2" 不在 DSH 可用清单，群/私聊能收不能回

- 症状: <name>能收消息但无法生成回复；群聊/仿真会话缺少 preset，DSH 拒绝回退。
- 错误原文: `preset "qq-chat-v2" 不在 DSH 可用清单（standard, ptc, minimal, cordis）中；群聊/仿真会话缺少 preset，拒绝回退`
- 触发条件: DSH 0.1.7 切到 bundle patch 层机制后，检查<name>收发功能时。
- 根因: 环境漂移：DSH 0.1.7 改为 bundle patch 层机制，~/.dsh/.agent-presets/ 不再被读取；qq-agent-presets 和 qq-mode-console 从未被注册进 bundles。
- 解决: 已处置：补注册两个 bundle 到 package.json。
- 证据: `logs/failures/2026-10.jsonl` F-2026-10-0006（L6）。
- 防护: 新增插件必须登记到插件依赖树文档（AGENTS.md 第 18 条）。

## ERR-DSH-665 | 插件体检只验路径存在，5 类问题一起漏（僵尸登记 / junction / WMI / 残留 / patch 残条）

- 症状: 插件体检查出 5 类问题：① plugins.json 里 @wishp3/dsh-friend-all 指向的目录已不存在（僵尸登记）；② plugin-audit.ps1 的 L1 树检查根本不看 LinkType，4 个目标在 profile 外的 junction 长期被判「没事」；③ MCP 进程枚举用 Get-CimInstance Win32_Process 本机被拒（拒绝访问），永远输出「没有 MCP 进程在跑」的假警告；④ 两个 .ignored_* 残留目录误导判断；⑤ @dsh-pet/bridge 与 @noob-stupid/dsh-plugin-console 的 patch 残条仍在，各触发 64/66 次 PackageOverlayNotFoundError。
- 错误原文: `PackageOverlayNotFoundError`（今天 @dsh-pet/bridge 触发 64 次、@noob-stupid/dsh-plugin-console 触发 66 次）
- 触发条件: 执行 plugin-audit.ps1 -Action All 做插件体检时。
- 根因: 体检脚本只验「路径存在」不验「路径怎么来的」：Test-Path 对 junction 恒为真，掩盖了 2026-10-23 那次 9 个 junction 导致整批拒载的同一根因；WMI 枚举失败被 catch 后降级成一句普通 Yellow，没有区分「确实没跑」和「查不出来」，把观察失败当成了结论。
- 解决: 已处置 ①②③：① 删 @wishp3/dsh-friend-all 登记（7 条登记与目录一一对应）；② plugin-audit.ps1 新增 Show-Junction 段，逐个检查 bundle 的 LinkType，目标不在 profile 内则告警，并报告 .ignored_* 残留；③ MCP 进程枚举补 Get-Process + 端口兜底，查不出时输出「无法判定」而不是「没有在跑」。④⑤ 未在本条写明处置结果，待修。
- 证据: `logs/failures/2026-10.jsonl` F-2026-10-0027（L28）。
- 关联: F-2026-10-0029、F-2026-10-0031

## ERR-DSH-666 | mcp-client(muretai) 连续 10 次 SdkError: Connection closed 后放弃，工具被注销

- 症状: dsh-2026-10-24.error.log 中 mcp-client(muretai) 连接失败从 attempt 8/10 涨到 10/10，最后放弃，muretai 相关工具在本会话不可用。
- 错误原文: `mcp-client(muretai): connection attempt failed: SdkError: Connection closed`；`giving up after 10 consecutive failed reconnect attempts — tools unregistered; reload the plugin`
- 触发条件: DSH 启动/重连 muretai MCP server 时。
- 根因: 未查明（需区分是 muretai server 进程起不来、stdio 握手失败，还是宿主 reload 时机问题）。
- 解决: 未处置（待查）：核对 cordis.patch.yml 里 muretai 的启动命令与路径是否存在；单独手工启动该 server 看是否秒退；比对宿主日志中的 spawn 阶段报错。
- 证据: `logs/failures/2026-10.jsonl` F-2026-10-0032（L33）。
    + ERR-NET-321（已并入）: `logs/failures/2026-10.jsonl` L33（F-2026-10-0032）
    + ERR-DSH-1207（已并入）: `dsh-2026-10-25.log` 第 2744/3223/3386/3654/3861/4022/4176/4543/4700/5019/5516/5976/7495/7904 行，从 03:13 到 20:28 反复出现。
    + ERR-NET-321（已并入）: `logs/failures/2026-10.jsonl` L33（F-2026-10-0032）
- 防护: 体检里 MCP 段应能区分「查不出来」与「确实没跑」（见 ERR-DSH-665）。
- 关联: F-2026-10-0032
    + F-2026-10-0032
    + F-2026-10-0032

## ERR-DSH-667 | 进程级切 PTC 后全部有历史的会话永久 400：唯一工具被标 deferLoading

- 症状: 2026-10-25 05:38–06:51（JST）运维助手会话 session-56656f6f 连续 8 轮失败，量化助手会话 session-3e88a726 失败 1 次；会话记录里 request/header 的 tools 数组在 10-24T20:37:56Z 从 172 个突变为 1 个 [run_code]。06:57 起改走 youyiyun 又撞 403 欠费（剩余 ¥<amount>，需 ¥<amount>），把单一故障掩盖成两个问题。
- 错误原文: `tools: at least one tool must have defer_loading=false. All tools cannot be deferred.`（request_id 依次为 <uuid> / <uuid> / <uuid> / <uuid> / <uuid> / <uuid> / <uuid> / <uuid>；量化会话 request_id <uuid>）
- 触发条件: 进程以 DSH_TOOLS_MODE=ptc 启动后，在已有历史的会话里发任何请求时。
- 根因: 三层叠加：① 进程以 DSH_TOOLS_MODE=ptc 启动，dsh-web-app/cordis.patch.yml 的 tools 行 `mode: !!js process.env.DSH_TOOLS_MODE` 把整个进程切进 PTC，工具从 172 个塌缩为 1 个 run_code；② dsh-llm/lib/index.js:761 的 toolDeclarations() 把「会话中途新增」的工具一律打 deferLoading:true，run_code 不在该会话基线里（运维会话基线 343 个工具，建于 10-23 00:31）；③ deepseek-account 路由声明 toolUpdate:"addition-only"，同文件 :767 会删掉所有不在当前激活列表里的工具，172 个旧工具全删，只剩被 defer 的 run_code。与 provider 无关：turn 324–328 走 deepseek-account 照样 400。回滚卡失效原因：删掉 HKCU\Environment 的 DSH_TOOLS_MODE 后只重启了 DSH（06:32:47），而 DSH 从父进程 explorer.exe 继承环境，explorer 在 ptc 生效期间启动、内存里仍持有该变量，新 DSH 又把 ptc 继承回来。
- 解决: 待修（三步方案已定）：① 结束 explorer.exe 后重新启动（或整机重启），把 ptc 从进程环境彻底挤掉；② 启动 DSH，进程回到 native（HKCU/Machine 的 DSH_TOOLS_MODE 已于 10-25 凌晨删除）；③ agent-default-model 从 youyiyun/deepseek-v4.1-flash 改为 deepseek-account/deepseek-flash，否则重启后新会话立刻 403。根治：不再用进程级开关，需要 PTC 就新建会话选内置 ptc preset（dsh-web-app/presets/ptc.patch.yml:123-126 自带 mode: ptc）。
- 证据: `logs/failures/2026-10.jsonl` F-2026-10-0035（L36）。
    + ERR-DSH-906（已并入）: [OpenAI · Tool search（defer_loading 语义、eager vs deferred 策略表、"Adding tool_search does not defer every function"）](https://developers.openai.com/api/docs/guides/tools-tool-search)；[Azure OpenAI · Use tool search（"Tools without defer_loading: true are callable immediately"）](https://learn.microsoft.com/en-us/azure/foundry/openai/how-to/tool-search)；本机 `MEMORY-<name>.md` L5465-5560（8 个 request_id 与三层根因）、`dsh-llm/lib/index.js:761/767`；[deepseek-harness Discussion #10812（大工具目录延迟加载相关讨论）](https://github.com/deepseek-ai/deepseek-harness/discussions/10812)
- 关联: F-2026-10-0007（欠费/provider 切换叠加）
    + F-2026-10-0035；ERR-DSH-903（另一种"请求结构被上游拒"）

## ERR-DSH-908 | PackageOverlayNotFoundError: cannot resolve package —— node_modules 里的 junction 指向 profile 之外，被 overlay 校验整批拒载

- 症状: DSH 启动时一批包整批报错，PTC、主题、pet、preset-guard 一起挂；错误说"from the Desktop installation or active Profile"，但包明明在 `node_modules` 里，手写 `require` 也能解析；`dsh.profile.bundles` 里也列着它。
- 错误原文: `PackageOverlayNotFoundError: dsh-plugin-desktop: cannot resolve package "dsh-plugin-preset-default-guard" from the Desktop installation or active Profile`
- 触发条件: `~/.dsh/profiles/<profile>/node_modules/<pkg>` 是 junction / symlink，解析后的真实路径落在 `~/.dsh/profiles/node_modules`（共享 fallback 目录）或任何 profile 目录之外。
- 根因: **上游已确认（DSH Desktop 侧源码 / PR 描述）**：Desktop 的 overlay 解析（`dsh-plugin-desktop/src/module-resolution.ts` 的 `selectedOverlayCandidate()`）按**解析后的真实路径**判断包是否在 active Profile 的 `node_modules` 内；只装在共享 Profile fallback 目录里的包被 policy 排除，于是抛 `PackageOverlayNotFoundError` —— 该错误名**不携带 `error.code`**。anywhere-labs/dsh-desktop#934 原文："packages installed only into the shared Profile fallback directory (`<dsh-home>/profiles/node_modules`) that the Desktop overlay excludes by policy (`selectedOverlayCandidate()` ...)"。这解释了"包明明在却报找不到"：名字对、目录在，但真实路径不在 profile 内。
- 解决: 本机做法：把 9 个 junction 全换成实目录（`cmd /c rmdir` 删链接 → `robocopy /E` 复制真实内容），改完 `剩余 junction: 0`，PTC 恢复正常；判断依据永远是"真实路径是否在 profile/node_modules 内"，而不是 `dsh.profile.bundles` 有没有列它（列了但 `dependencies` 没声明属正常现象，不是问题所在）。上游建议：DSH Desktop #934 的修法是"把 `PackageOverlayNotFoundError` 当成'这次查找没有结果'，继续走上游文件系统解析"；#1132 则让可停用的第三方 bundle 解析失败时**跳过并记日志**，而不是让整个 Profile 合成失败。**版本相关**：这两条修复是否进了本机所装版本必须单独确认，不能假定已修。
- 证据: [anywhere-labs/dsh-desktop#934（PackageOverlayNotFoundError 与 shared fallback 被 policy 排除；含 selectedOverlayCandidate 定位）](https://github.com/anywhere-labs/dsh-desktop/pull/934)；[anywhere-labs/dsh-desktop#1115（残缺 bundle 导致每次启动卡在 profile-composition）](https://github.com/anywhere-labs/dsh-desktop/issues/1115)；[ht719/dsh-session-categories#1（同一错误原文的另一种成因：patch 里的包名与实际发布的包名不一致）](https://github.com/ht719/dsh-session-categories/issues/1)；[Node.js CLI 文档 --preserve-symlinks（默认解析会 follow symlink 到 realpath）](https://nodejs.org/api/cli.html#--preserve-symlinks)；本机 `MEMORY-<name>.md` L750-763
    + ERR-ENV-006（已并入）: `MEMORY-<name>.md` 第 750–763 行（2026-10-22 22:00→10-23 01:10 节 D 段）
- 回滚点: 改 junction 前先 robocopy 出目标目录（复制本身就是副本）；另在 `_backup\` 留一份
- 防护: **上游确认**：判断"包能不能被加载"要用**真实路径**，不是符号链接位置的表面路径；DSH 会因为**路径在 policy 之外**拒载，即使包本身完好。机制来源是 Node 默认解析会 follow symlink 到 realpath（`--preserve-symlinks` 才不 follow）。本机规矩：profile 的 `node_modules` 里不放 junction。
- 关联: 与本工作区对 `qq-bridge` / `qq-bot` 故意保留 junction 的用法是**相反场景**（那里是维持旧路径可用，靠的是插件配置不校验真实路径）
    + F-2026-10-0027

## ERR-DSH-1204 | profile `node_modules` 下的 junction 指向不存在的旧安装路径（悬空链接）

- 症状: `~/.dsh/profiles/node_modules/js-yaml`、`yaml` 显示为 Junction，但 `require()` 它们报 `Cannot find module`。
- 错误原文: `Error: Cannot find module 'C:\Users\<user>/.dsh/profiles/node_modules/js-yaml'`；`Test-Path "C:\Users\<user>\AppData\Local\Programs\@dshcodedesktop\resources\app\node_modules\js-yaml"` → False
- 触发条件: DSH 安装目录从 `@dshcodedesktop` 迁到 `DSH Desktop` 后，profile 里这些 junction 的 Target 没跟着更新。
- 根因: junction 的 Target 是绝对路径，安装路径变化后不会自动跟随；`Get-Item` 仍显示 LinkType=Junction，只有实际访问目标才暴露悬空。
- 影响: 任何脚本试图从 profile 复用 js-yaml/yaml 都会失败；更糟的是「看起来装好了」——`Get-Item` 和目录列表都显示存在。
- 解决: 不要从 `profiles/node_modules` require 第三方包；直接用 DSH 安装目录下的：`C:\Users\<user>/AppData/Local/Programs/DSH Desktop/resources/app/node_modules/js-yaml`。
- 证据: 2026-10-25 21:1x 实测：`Get-Item ...js-yaml | Select LinkType,Target` → `Junction  C:\Users\<user>\AppData\Local\Programs\@dshcodedesktop\...`；同路径 `Test-Path` → False；改用 `DSH Desktop\resources\app\node_modules\js-yaml` → 解析成功。
- 回滚点: 无。
- 防护: 体检脚本的 junction 检查应加一条「Target 是否存在」，不能只看 LinkType（与 F-2026-10-0031 同源）。

## ERR-DSH-1205 | 修改 `cordis.patch.yml` 后出现 `[hmr] config reload ... failed`

- 症状: 宿主日志出现 `[W] [hmr] config reload at C:\Users\<user>\.dsh\profiles\web\cordis.patch.yml failed`，但 DSH 仍在运行、旧配置仍生效。
- 错误原文: `[hmr] config reload at C:\Users\<user>\.dsh\profiles\web\cordis.patch.yml failed`
- 触发条件: 在 DSH 运行中直接编辑 `profiles/web/cordis.patch.yml`。
- 根因: 未查明（该行日志只报"failed"，不带原因；当时是哪个键不合法没有记录）。已知同类：`!!js` 标签、重复 loader entry id、插件包解析失败都会让整次 reload 失败。
- 影响: 改动「看起来保存了」，实际没进内存；若误以为已生效，会拿旧配置去排查新问题。
- 解决: 改完必须做三步验证：① 用 js-yaml 解析通过；② 查宿主日志有没有 `[hmr] ... reload` 成功/失败；③ 重启 DSH 后在新会话里确认 provider/模型列表包含改动。
- 证据: `C:\Users\<user>\AppData\Roaming\DSH Desktop\logs\host\dsh-2026-10-25.log` 第 3451 行（05:18:26）。
- 回滚点: `_outputs\yjapi-provider-backup-20261025\cordis.patch.yml`。
- 防护: 改 `cordis.patch.yml` 前先备份；改后用 js-yaml 校验；reload 失败时优先重启而不是继续叠加修改。
- 关联: F-2026-10-0004、F-2026-10-0010

## ERR-DSH-1206 | `agents-anywhere-runtime` 持续刷 `sync.failed` / `rpc.failed INVALID_PARAMS`

- 症状: 宿主 error.log 每 20-30 秒刷一组 `[agents-anywhere-runtime] event=sync.failed`，随后 `bridge.sync_failed`、`rpc.failed ... method=runtime.sync.ack errorCode=INVALID_PARAMS retryable=false`。
- 错误原文: `event=rpc.failed {"method":"runtime.sync.ack","errorCode":"INVALID_PARAMS","bridgeCode":"INVALID_PARAMS","retryable":false}`
- 触发条件: 每次 agent 回合推送事件时；`queuedEvents` 字段显示积压到 10000。
- 根因: 未查明。`INVALID_PARAMS` 且 `retryable:false` 说明对端（bridge-next）拒收同步批次，不是网络抖动；积压到 10000 后仍重复入队。
- 影响: 日志体积暴涨（error.log 已 1.1 MB/天量级），真实故障容易被淹没；事件同步失败可能影响远端观察能力。
- 解决: 暂无（待查 bridge-next `runtime.sync.ack` 的参数契约）。
- 证据: `C:\Users\<user>\AppData\Roaming\DSH Desktop\logs\host\dsh-2026-10-25.error.log` 2026-10-25 21:03:00-21:03:40 段，连续 4 组。
- 回滚点: 无。
- 防护: 排查日志前先按 `[E]` 过滤并排除 `agents-anywhere-runtime`，否则会被淹没。
- 关联: 无（新发现，2026-10-25）

## ERR-DSH-1208 | 渲染进程刷 `conversation Definition "system-message" withdrew materialized target`，单类超过 7000 行

- 症状: 宿主日志被同一组渲染进程错误刷屏，10-23 到 10-25 共 7008 行命中，把真实故障完全淹没。
- 错误原文: `conversation Definition "system-message" withdrew materialized target "chat"; return the same key with hidden visibility instead`（另有 `[desktop-ui-error] Error:` / `Uncaught Error:` / `[session-controller] event feed subscriber failed: Error:` 三个前缀变体）
- 触发条件: DSH Desktop 渲染进程重建 conversation 视图时反复触发。
- 根因: 未查明。调用栈指向 `ConversationNodeAssembler.buildTargetUpserts`；报错自带提示「return the same key with hidden visibility instead」，说明某个定义撤回了已物化的 target，但没改用 hidden 可见性。
- 影响: error.log 体积与可读性极差；排查其他故障时必须先排除它，否则会被淹没；是否伴随真实功能异常尚未确认。
- 解决: 暂无（等上游）。临时办法：读日志前先 `grep -v 'system-message.*withdrew'`。
- 证据: `C:\Users\<user>\AppData\Roaming\DSH Desktop\logs\host\dsh-2026-10-2*.log` 与 `...\logs\dsh-2026-10-2*.log`，2026-10-23 ~ 2026-10-25 共 7008 行（4 个变体合计）。
- 回滚点: 无。
- 防护: 日志排查脚本先按此字符串过滤；不要在未过滤的 error.log 上统计「错误数」。
- 关联: ERR-DSH-1206（同类：日志噪音）

## ERR-DSH-1209 | compaction 触发了但摘要不比原文小，1826 次压缩失败

- 症状: 日志刷 `step compaction failed: summary is not smaller than the shadowed content`，从 10-23 到 10-25 持续出现。
- 错误原文: `[basic-compaction-engine] step compaction failed: summary is not smaller than the shadowed content (1412 estimated framed tokens >= 1385); continuing the turn`
- 触发条件: 上下文压缩时，摘要输出 token 数 ≥ 被压缩内容（例子 1412 >= 1385）。
- 根因: 未查明（摘要没有压缩效果：可能是摘要提示让模型复述过多，或原文本身已很短）。
- 影响: 压缩无效但照常消耗一次摘要调用；与 ERR-COST-001「compaction 从不触发」是**两个不同问题**——那条是没触发，这条是触发了但失败。
- 解决: 暂无。
- 证据: 2026-10-23 16:47:16 ~ 2026-10-25 06:02:56，1826 行（`dsh-2026-10-2*.log`）。
- 回滚点: 无。
- 防护: 看到 `compaction failed` 先看括号里的 token 比值，>= 1 就是这一类，别误判成「没压缩」。
- 关联: ERR-COST-001

## ERR-DSH-1210 | 前端 `Identifier 'PROVIDER_SETUP' has already been declared`，同一段脚本被求值两次

- 症状: 渲染进程报语法错误，356 行；出现时模型/provider 设置界面可能初始化不全。
- 错误原文: `SyntaxError: Identifier 'PROVIDER_SETUP' has already been declared`（伴 `Uncaught SyntaxError:` 变体）
- 触发条件: DSH Desktop 加载客户端插件脚本时。
- 根因: 未查明。症状是同一段脚本被注入/求值两次（经典 const/let 重复声明），可能与 HMR 或插件重载有关（同类：ERR-DSH-1205）。
- 影响: 该段 UI 初始化不执行；重启渲染进程可暂时恢复。
- 解决: 暂无（重启 DSH 后消失）。
- 证据: 2026-10-24 21:14:44 起至 2026-10-25，共 356 行（`dsh-2026-10-2*.log`）。
- 回滚点: 无。
- 防护: 改完插件后若设置页空白，先搜这条错误再看插件代码。
- 关联: ERR-DSH-1205

## ERR-DSH-1211 | `preset-default-guard: check failed: TypeError: settings.get is not a function`

- 症状: 宿主启动日志每次都有这条，守卫插件静默失效。
- 错误原文: `[host-resolved-root-include] preset-default-guard: check failed: TypeError: settings.get is not a function`
- 触发条件: 宿主加载 `dsh-plugin-preset-default-guard` 时（每次启动）。
- 根因: 未查明（插件调用的 settings 服务接口已变，`get` 不再是函数）。
- 影响: 本该保证默认 preset 不被改写的守卫失效，但没人注意到——属于「守卫自己坏了」。
- 解决: 暂无（需按新 settings 接口改插件，或禁用该插件）。
- 证据: 2026-10-23 00:52:21 ~ 2026-10-25 20:26:12，96 行（`dsh-2026-10-2*.log`）。
- 回滚点: 无。
- 防护: 体检时看到 `preset-default-guard` 报错，不要以为只是噪音——它意味着默认 preset 失去保护。
- 关联: 无

## ERR-DSH-1212 | `agent disposed listener threw: TypeError: Cannot read properties of undefined (reading 'catch')`

- 症状: agent 销毁阶段报错，210 行，跨 10-21 ~ 10-25。
- 错误原文: `[agent-registry] agent "<uuid>": agent/disposed listener threw: TypeError: Cannot read properties of undefined (reading 'catch')`
- 触发条件: agent 被销毁时（会话结束/切换）。
- 根因: 未查明（某个 disposed 监听器对 undefined 调了 `.catch()`）。
- 影响: 销毁阶段的清理逻辑中断，可能残留句柄/定时器。
- 解决: 暂无。
- 证据: 2026-10-21 21:53:23 ~ 2026-10-25 21:09:51，210 行（`dsh-2026-10-2*.log`）。
- 回滚点: 无。
- 防护: 会话结束后若进程数不降，搜这条错误。
- 关联: 无

## ERR-DSH-1213 | provider 里 `reasoningEfforts.off` 写成 `'off'`，中转站直接 400（不是不发，是发了个非法值）

- 症状: 接入第三方中转站（yjapi.shop）后，某些会话一切就 400；同 provider 换个 thinking 档位又正常。
- 错误原文: `{"error":{"message":"upstream 400: {\"code\":11133,\"msg\":\"the request parameters were rejected by the model provider\",\"extError\":{\"code\":\"invalid_request_error\"...},\"displayMsg\":{\"zh\":\"模型无法处理此请求，请重试\"}}"}}`
- 触发条件: `cordis.patch.yml` 里写 `reasoningEfforts: { off: 'off', low: low, high: high }`，且 DSH 当前会话的 thinking 档是 off。
- 根因: DSH 的语义是「档位名 → 发给上游的值」，`off: 'off'` = **真的发 `reasoning_effort: "off"`**；而上游枚举只认 none/minimal/low/medium/high/max。只有 `off: null` 才是「这个档不发参数」。实测：两个模型 × 7 档，唯一 400 的就是 `off`。
- 解决: `off: null`（其余档照写 low/medium/high/max）。改完必须重启 DSH 才生效。
- 证据: `_outputs/check-yjapi-effort.mjs` 的逐档矩阵（deepseek-v4.1-flash / deepseek-v4-pro × off/none/minimal/low/medium/high/max，每次 3–5s 真实请求）；**不传 effort 与全部非-off 档均 200**。
- 回滚点: _outputs/yjapi-provider-backup-20261025/cordis.patch.before-off-fix.yml
- 防护: 新接任何中转 provider，先跑一遍「不传 / 逐档」探测再写 reasoningEfforts；不要把字面量 `'off'` 当成「不发」。
- 关联: ERR-NET-1201（同一轮接入时发现的验证通道问题）
