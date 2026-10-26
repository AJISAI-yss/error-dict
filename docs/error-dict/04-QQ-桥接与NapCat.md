# 04 · QQ 桥接 · NapCat

> 这一卷收「QQ 掉线 / 收不到消息 / 工具静默 401 / 注入没生效」这类问题。
> 新增词条直接往下追加，骨架见 [_TEMPLATE.md](_TEMPLATE.md)。

共 24 条。

## ERR-QQ-001 | 抢号：两套 NapCat 注入器互踢，机器人反复掉线报「身份验证失败 w21」

- 症状: 机器人反复掉线、收不到 @、好友列表变 0、收藏表情变 0、发消息 retcode 200 但 status failed；严重时 4 个 cmd 窗口同时跑引导程序，谁也登不上、二维码也不出。
- 错误原文: `身份验证失败，请你重新登录。(w21)`；`发消息 retcode 200 但 status failed`
- 触发条件: 同机存在两套 NapCat 注入器（`qq-bot\onekey\NapCat.52230.Shell\` 与旧 `qq-bot\shell\`），且 `qq-bot\启动<name>.bat` / `start-napcat.bat` / 启动项 `dafeiyu-autostart.vbs → autostart.ps1 → napcat.bat` 会 `taskkill /f /im QQ.exe` 后注入 `D:\QQ\QQ.exe`（主号）；`kill-bot-qq.ps1` 又只清 QQ 进程、不清 cmd 启动窗口，多次重启后窗口堆积。
- 根因: 多实例抢同一个 QQ 号。`napcat.bat` 不带 QQ 路径 → 退回本机默认 QQ（正是 `D:\QQ`），和计划任务 `qq-bridge-autostart → start-all.bat` 同时跑就互踢。
- 解决: 把旧的入口脚本全部改写成「转发到 `qq-bridge\start-all.bat`」；禁用启动项 `dafeiyu-autostart.vbs`（改名 `.disabled`）；`autostart.ps1` 改成显式 `NapCatWinBootMain.exe "<onekey>\QQ.exe" <qq-uin>`；`start-napcat-qr.bat` 加单实例守卫（`netstat` 发现 3001 已监听就退出）；`kill-bot-qq.ps1` 补清理 cmd 启动窗口。
- 证据: `MEMORY-<name>.md` 第 285–304 行（第二十一节）；第 1940–1951 行（2026-10-24 02:31 复发，4 个 cmd 窗口）
- 回滚点: _archive\2026-10-22-legacy-scripts\
- 防护: 核对方法 `Get-CimInstance Win32_Process -Filter "Name='QQ.exe'" | Group-Object { $_.ExecutablePath }`——只应出现 `onekey\NapCat.52230.Shell` 一组（约 4 个进程）

## ERR-QQ-002 | KickedOffLine：账号被踢下线，3000/3001 端口直接消失

- 症状: 机器人突然不说话，OneBot 3000/3001 不监听，SnowLuma 连不上；夜里写日记的回合只留下被拒记录。
- 错误原文: `[KickedOffLine] 你的账号当前登录已失效，请重新登录`；期间另见 `SnowLuma WebSocket closed before opening`（`qq_meme_add` 连报两次）
- 触发条件: 凌晨 03:04 掉线；根因链指向腾讯风控（新版 NapCat/QQ「过几小时即可被踢下线」）+ bot 号可能在手机登录。
- 根因: 腾讯检测客户端注入与设备环境（不是聊天内容）。本机 QQ `9.9.33-52230` 属偏新版本，是最可能的诱因——**属于外部资料推断，无腾讯官方文档作证**。
- 解决: 跑 `qr-login.bat` / `start-napcat-qr.bat` 重启 NapCat 重新扫码；夜间另加行为拟人化（回复延迟 6~28 秒、已读不回 22%、1:30–8:00 静默）。
- 证据: `MEMORY-<name>.md` 第 796–798 行；第 810–829 行（风控调研）；第 1932–1938 行（WS closed）
    + ERR-QQ-721（已并入）: `logs/failures/2026-10.jsonl` F-2026-10-0001（L1）。
- 回滚点: `_outputs\config.backup-before-humanize.json`、`_outputs\bridge.backup-before-humanize.js`
- 防护: **别把「看起来自己好了」归因自愈**——第 811 行明确更正：那晚实际是用户手动扫的码
- 关联: F-2026-10-0002
    + F-2026-10-0002

## ERR-QQ-003 | 快登列表是空的：「未找到该 QQ 历史登录记录」，watchdog 40 分钟救不回来

- 症状: 掉线后 watchdog 连续 40 分钟跑 L1 快登 + L2 还原备份，全部失败，日志里反复一句话；扫码能进，但 64 秒后又静默退出。
- 错误原文: `[error] 快速登录失败，未找到该 QQ 历史登录记录，将尝试密码回退登录`
- 触发条件: QQ 9.9.33-52230 + NapCat 4.18.38 组合下自动快登。
- 根因: **不是凭据丢了**。凭据完整（`quic_crypto\msf_crypto_cache` 5448 字节还在实时写；`.MSFAuthUinsV1.dat` 内容 `<qq-uin>,<qq-uin>,`）。真因是 `napcat.mjs` 里 `QQLoginList: []` / `NewQQLoginList: []` 初始为空，快登列表靠 native helper 异步填充，而 NapCat 在「网络已连接」之后**立刻**检查 `QQLoginList.some(a => a.uin === '<qq-uin>')` → 那一刻还没填上 → 判定「未找到历史登录记录」。`[Napi2NativeLoader] 加载成功` 是打出来了的，所以是时序问题不是加载失败。
- 解决: 掉线就人工扫码——这套组合下「快登」这条路基本是死的，L1/L2 对它无效；同时把备份策略改成以 `global-nt_data` 为主。
- 证据: `MEMORY-<name>.md` 第 1018–1062 行（第四十六节）
    + ERR-QQ-731（已并入）: `docs/NOTES-机器人脚本审计与修复-20261023.md` §四（L188-L203）。
- 回滚点: 无
- 防护: 别被「凭据文件丢了」误导；顺带确认 `start-napcat-boot.bat` 的 `-q <QQ.exe路径>` 本来就不带账号，不是 bug
- 关联: F-2026-10-0001
    + F-2026-10-0001

## ERR-QQ-004 | 扫码登进去了，64 秒后 Process exited 静默退出，没有任何错误日志

- 症状: 09:48:45 扫码、09:48:54 OneBot 3000 起来、好友 76 / 群 15 / 表情 40 全正常，然后一分钟就没了，日志里找不到原因。
- 错误原文: `Process exited`（紧跟在登录成功之后，无任何错误行）
- 触发条件: 扫码登录成功后约 64 秒。
- 根因: 未查明（已排除：凭据丢失——同期凭据文件完好且在写入；已排除 OneBot 端口冲突——3000 确实起过；已排除扫码环节——登录后数据全对）。同机另有「快登列表空」时序问题（见 ERR-QQ-003），两者叠加导致自动恢复完全失效。
- 解决: 当次只能人工扫码 + 观察；后续改为 watchdog 判活加「好友列表非空」判据，并对被踢后 30 分钟内零自动尝试。
- 证据: `MEMORY-<name>.md` 第 1029–1030 行；第 2025–2049 行（watchdog 重写）
- 回滚点: 无

## ERR-QQ-005 | 二维码永远扫不上：出码 117 秒自动刷新，刷新后 11 秒进程就退出

- 症状: 二维码弹出来后扫了也登不上，反复重试都不行；自己写的守护脚本越修越糟。
- 错误原文: `[Core] [Login] Login Error, ErrType: 1 ErrCode: 3`（源码含义：二维码已过期，请刷新）
- 触发条件: NapCat 出码后约 117 秒自动刷新，刷新后约 11 秒进程退出；用 `cmd /c` 启动的实例存活不稳定（有时 80 秒、有时 215 秒）。
- 根因: 过期一次这个实例就废了，必须重新启动；`qr-keeper.ps1` 每 90 秒**杀进程换新码**，用户扫的那张码对应进程已经被杀——**杀进程换码 ≠ 刷新码**（正确刷新是进程内的 `refreshQRCode()`）。
- 解决: 用 `wt.exe`（独立标签）启动更稳；显示方式三选一：官方 `napcat.bat`（自带 `chcp 65001` + pause）／`wt.exe new-tab ... cmd /k "chcp 65001 >nul && ..."`／读 `qrcode.png` 放大到 900×900 用 WinForms 显示。
- 证据: `MEMORY-<name>.md` 第 1230–1263 行（第四十八节）
    + ERR-QQ-723（已并入）: `logs/failures/2026-10.jsonl` F-2026-10-0009（L9）。
- 回滚点: _backup\2026-10-23-napcat-reinstall\
- 防护: 别再写「杀进程换码」的守护；重装 NapCat 后进程照样会在出码后退出（这是版本行为，不是装坏了）

## ERR-QQ-006 | 终端里的二维码是乱码/方块字：因为绕过官方 bat 跳过了 chcp 65001

- 症状: 二维码在终端里显示成一堆乱码字符，用户最早报的问题；一开始误判成「图片太小」。
- 错误原文: UTF-8 方块字符 `█ ▄▄▄ █` 被按 GBK 解码成 `閿㈢鼎`、`锟斤拷`
- 触发条件: 用 WMI 直接调 `NapCatWinBootMain.exe` 启动（跳过了官方 `napcat.bat` 里的 `chcp 65001`）。
- 根因: 控制台保持系统代码页 936(GBK)；时区正常（Tokyo Standard Time, UTC+09:00, 无 DST），**不是时区问题**。
- 解决: 先 `chcp 65001` 再启动（实验验证：同样的输出能正确显示 18 行方块字符，零乱码）。
- 证据: `MEMORY-<name>.md` 第 1248–1252 行
- 回滚点: 无

## ERR-QQ-007 | 有人 @ 但桥上一条日志都没有：无超时的 await 把整条消息吃了

- 症状: 群里有人 @，桥接日志 13:40:27 之后直接跳到 13:44:55 的表情同步，中间什么都没有——不入库、不唤醒、不打日志。
- 错误原文: 无报错（纯静默卡死）；同期 `fetch_custom_face_detail` 返回 `data: []`（之前 37 个）
- 触发条件: `handleIncoming` 里 `await segmentsToText(...)` → `resolveAtName` → `getGroupMemberInfo` / `getGroupMemberList`，这几个调用**没有超时**；QQ 侧 API 一卡，消息就永远停在解析阶段。
- 根因: 裸 `await` 无超时。审计发现修复前 35 处 `await bot.xxx` / `await api.xxx` 里只有 2 处有 `withTimeout`。
- 解决: `getGroupMemberInfo` 2s、`getGroupMemberList` 5s（失败后 `groupMemberListCooldownUntil` 冷却 60s，超时回退成 `@QQ号`）、`getMessage` 2s；并给全部外部调用分级加超时（SEND 15s / BOT_CALL 15s / MEDIA 30s / TINY 8s），现 0 处裸调用；`handleIncoming` 白名单检查后新增 `[收信] <key> from <uid> segs=N` 日志。
- 证据: `MEMORY-<name>.md` 第 274–282 行（第二十节）；第 380–402 行（全量加超时）
- 回滚点: 无
- 防护: 排查「有人 @ 没反应」先看 `[收信]` 那行在不在：不在 = 消息没推到桥；在但后面没有「消息已入未读」= 卡在解析。回归检查：`grep "await (bot|api)\." src/bridge.js` 不该出现不含 `withTimeout` 的行

## ERR-QQ-008 | 私聊完全不回：连续 6 轮 turn/end 全是 blocked，模型一次都没被调用

- 症状: 私聊一句都不回，群聊完全正常；桥接日志看起来像「AI 懒得说话」。
- 错误原文: `turn/end {reason:{kind:"blocked"}}`；另有一次真因是 `⚠️ agent 处理出错：Authentication Fails, Your api key: ****fcg4 is invalid`
- 触发条件: ① DSH 内核的 pre-step rejection（prompt 投递进去、进第一个 step 前被丢弃）；② provider 的 API key 失效。
- 根因: ① 直接诱因未完全锁定（时间上正好是改 `cordis.patch.yml` 的时刻，但配置本身不是原因——prompt 内容对比完全正常）；② `dsh.provider` 的 key 过期。桥接侧真 bug：turn 结束分支只处理 `completed` / `error` / `aborted`，**没有 `blocked`**，于是掉进 `else if (!ended.text.trim())` 打印「回合完成但无文本」——而 `createTurnCollector` 对 `blocked` 和 `completed` 返回的 text 都是空串，旧代码根本分辨不出来。
- 解决: ① 新增 `blocked` 分支：日志打 `⛔ 回合被拒（blocked，模型未调用）`、写活动流、清 `pendingWakeKeys` + 唤醒租约、不往 QQ 发消息；② `qq-bridge/config.json` 的 `dsh.provider` 从 `deepseek-official` 改成 `deepseek-account`。
- 证据: `MEMORY-<name>.md` 第 212–221 行（第十二节）；第 791–795 行（API key 失效导致 blocked）
- 回滚点: _outputs\config.backup-before-provider.json
- 防护: 「回合被拒 blocked」先看桥接日志有没有 `Authentication Fails`，**别急着重建会话**——删 sessions.json 映射解决不了 key 失效

## ERR-QQ-009 | MCP 静默 401：搬目录后所有发送/读图工具报「未授权」，查了 3 小时

- 症状: 账号在线（`get_login_info` 正常、好友 76 / 群 15 / 表情 40 全对），但 `qq_send_message` / `qq_send_private_message` / `qq_send_burst` / `qq_get_message_images` 全部返回未授权。
- 错误原文: `未授权：请提供控制台访问令牌`
- 触发条件: 把 `qq-bridge` 从 `<workspace>/qq-bridge` 迁到 `<workspace>/projects\qq-bridge`，但 `cordis.patch.yml` 里 3 个 MCP 的 args 还是旧路径。
- 根因: `mcp-snowluma-safe.js` 的 `const ROOT = path.resolve(__dirname, '..')` 算出已经不存在的 `<workspace>/qq-bridge` → `readConsoleToken()` 读不到 `state/console-token` → 返回空串 → 请求不带 `x-console-token` → `bridge.js` 第 3621 行最外层闸门 `if (consoleToken && !tokenMatches) → 401`。**MCP 不会崩溃、不会报错，只会静默降级**，错误信息里完全不提路径。
- 解决: 建 Junction 恢复旧路径（`cmd /c mklink /J "<workspace>/qq-bridge" "<workspace>/projects\qq-bridge"`，`qq-bot` 同理）。Node 的 `__dirname` 经过 Junction 会自动解析回真实路径，所以 ROOT 正确、令牌可读；配置文件一个字不用改，boot-guard 也感知不到。
- 证据: `MEMORY-<name>.md` 第 1144–1226 行（第四十七节事故一、事故三）
    + ERR-QQ-722（已并入）: `logs/failures/2026-10.jsonl` F-2026-10-0003（L3）；`docs/NOTES-DSH插件依赖树与治理规则.md` §一（L13-L20）。
- 回滚点: 原目录原地保留（未删）
- 防护: 移动任何被插件引用的目录前先跑 `pwsh -File <workspace>/scripts\plugin-audit.ps1 -Action Refs -Path "要移动的目录"`；注意 `~\.dsh` 不在工作区扫描范围内，最容易漏
- 关联: F-2026-10-0004
    + F-2026-10-0004

## ERR-QQ-010 | 好友列表和表情全变 0，但群列表正常 → 别急着重启 NapCat（我这么干过，断链 40 分钟）

- 症状: `get_friend_list` 返回 `data: []`（此前 76 个）、`fetch_custom_face_detail` 返回 `data: []`（此前 37 个），但 `get_group_list` 正常 15 个、收发消息也通。
- 错误原文: `get_friend_list` → `data: []`；`fetch_custom_face_detail` → `data: []`
- 触发条件: 当天多次重启 NapCat 之后（登录态已被埋雷）。
- 根因: **登录态已经过期**，不是抢号。我误判成抢号 → 直接重启 NapCat → 登录态失效、要求重新扫码 → 整条链路断了约 40 分钟，用户回家扫码才恢复。重新扫码后好友 76 / 表情 40 立刻正常。
- 解决: 「好友/表情变 0 但群列表正常」= 登录态问题的典型信号，先判断是否要重新扫码（判据：`get_login_info` 正常 + `get_group_list` 正常 + `get_friend_list` 为 0）；真要重启前先确认 `state/qq-login-backup` 是否新鲜、当天是否已多次重启。
- 证据: `MEMORY-<name>.md` 第 583–591 行（第三十六节 B「一次自找的断线事故」）；第 282 行；第 726–727 行
- 回滚点: `state\qq-login-backup\`（2730 文件 233MB）+ `restore-qq-login.ps1`
- 防护: 看门狗判活必须加 `get_friend_list` 非空这一条——「登录在但好友为 0」这个半死状态旧看门狗必然漏判

## ERR-QQ-011 | adminFix 丢了：管理员调好的 probability 0.2 被 AI 一次调用打回 0.03

- 症状: 管理员手工调好的唤醒参数（`probability: 0.2` + 19 个关键词）过一会儿又变回 `0.03` + 16 个默认关键词，`adminFix` 字段整个消失。
- 错误原文: 无报错，只有结果被覆盖（日志有 `[reserved2] 管理员锁定项已强制覆盖 <key>: keywords,probability`）
- 触发条件: 手改 `state/social-v2.json` 的 `wakeConfig` 时**漏写 `adminFix`**（14:05 重置会话那次），之后 AI 一调 `qq_set_wake_config`（默认值）就把它冲掉。
- 根因: 锁定机制**只在 `adminFix` 存在时才起作用**，字段本身没人保护；另外重置会话后 AI 会自己调 `qq_set_wake_config` 用默认值覆盖管理员参数。
- 解决: 任何手改 `wakeConfig` 的地方必须同时写 `adminFix{mode, triggers{probability, keywords}}`；改完立刻核对 `social-v2.json`，必要时停桥接改文件再启。
- 证据: `MEMORY-<name>.md` 第 263–272 行（第十九节锁定机制）；第 428–432 行（本坑复发）；第 260 行
- 回滚点: 无
- 防护: `/api/socialV2/wake-config` 在 `adminOnlyV2Paths` 里，必须用 `state/console-token`（header `x-console-token`），用 agent token 会 401

## ERR-QQ-012 | 发说说 ugc_right 参数不合法：注释写的「5 = 仅自己」是错的

- 症状: 按代码注释传 `ugc_right: 5` 直接被网关拒；传 16/128 又报缺参数。
- 错误原文: `ugc_right 参数不合法, 允许的值为: 1, 4, 16, 64, 128`；`ugc_right 为 16 或 128 时, target_uins 不能为空`
- 触发条件: 调 `send_qzone_msg` 发表说说的可见性参数。
- 根因: 旧注释的可见性语义写错了（注释说 5 = 仅自己，实际只接受 1/4/16/64/128）；16/128 必须带 `target_uins`。
- 解决: `1` = 公开（默认）、`4` = 好友可见（实测可发、无需附加参数，调试一律用 4）；同步修正 `account-ops.js` 的 JSDoc、加 `allowed` 白名单校验（错误信息比 NapCat 原文好懂）、改 `mcp-snowluma-safe.js` 里 `qq_send_qzone` 的参数描述。
- 证据: `MEMORY-<name>.md` 第 228–233 行
- 回滚点: 无

## ERR-QQ-013 | versions\<版本>\QQ.exe 被删了：OneBot 3000/3001 全不监听、QQ 活不过 10 秒

- 症状: 网关整体故障，SnowLuma `reachable: false`；直接启 `QQ.exe` 也活不过 10 秒，窗口标题是「退出」但桌面上看不到任何对话框（截图确认）。
- 错误原文: `Process resumed` 后立刻 `Process exited`；OneBot 3000/3001 全不监听
- 触发条件: `versions\9.9.33-52230\QQ.exe` 被删（`QQNT.dll` 204.7MB 还在）。
- 根因: NapCat 的启动器按 `versions/config.json` 的 `curVersion` 去对应版本目录找 `QQ.exe`，**找不到就静默失败**（boot.log 只有「请按任意键」，端口不监听）。这段记忆一度被误判成「扫码问题」。
- 解决: 从 `<workspace>/qq-bot\onekey\QQ.exe`（300MB，才是 QQ 9.9.33.52230 完整主程序，7z 显示 `Type=PE`、`CompanyName=Tencent`）复制回去；恢复后**不需要扫码**（旧登录态还在）。必须走 `start-all.bat` 全流程，单独拉 `NapCatWinBootMain.exe` 不行。
- 证据: `MEMORY-<name>.md` 第 187–198 行（第十节、第十一节）
- 回滚点: 原 `onekey\QQ.exe`（未改动）
- 防护: `onekey\QQ.exe` 别当安装包（双击它会「启动后退出」让你误判成缺件）；用 `ShowWindow` 强拽 QQ 窗口会把它变成全黑空壳，之后连窗口都不创建，只能 kill 重来

## ERR-QQ-014 | 桥接里的 JS 引用错误三连：TDZ / 局部变量误用 / 可调用对象当对象用

- 症状: 首次唤醒必崩一次；新加的收藏表情功能一调就 500；两个轻互动工具报「不是函数」。
- 错误原文: `ReferenceError`（`TIMER_WAKE_REASONS` 的 TDZ）；`assertSendAllowed is not defined`；`ob.request is not a function`；另见 `MAX_MEDIA_BYTES is not defined`
- 触发条件: ① `TIMER_WAKE_REASONS` 定义在第 10854 行却被第 10639 行的唤醒冷却逻辑引用；② `assertSendAllowed` 是 `collectStickerV2` 内部局部变量（`captureSendGuard(key)`），新函数直接调用；③ `createOneBotCaller()` 返回的是**可调用函数**，写成 `ob.request(...)`；④ `drawImageWithAi` 放在 `MAX_MEDIA_BYTES`（const）定义之前。
- 根因: 定义顺序 / 作用域 / 对返回类型的假设错误。`node --check` **查不出 TDZ 和未定义引用**，只能人肉看行号顺序。
- 解决: `TIMER_WAKE_REASONS` 前移到 `sendWakePromptV2` 之前；补 `const assertSendAllowed = captureSendGuard(key);`；正确写法 `await ob('action', {...})`；`drawImageWithAi` 挪到两个定义之后。
- 证据: `MEMORY-<name>.md` 第 183 行；第 493 行；第 620、636 行；第 537 行；第 439–443 行（定义顺序全量核对）
- 回滚点: 无
- 防护: `node --check` 通过 ≠ 能跑；必须人肉核对定义顺序（`toolJsonLine` 在 `base` 之前、超时常量在首次使用前）

## ERR-QQ-724 | 5 个 QQ 会话各映射独立 DSH session，桥接没有跨会话长期记忆

- 症状: 群 A 认识的人、发生的事，群 B 一概不知；没有跨会话自我沉淀；只有会话内的 qq_memory_*（activeTopic / pendingThought / memberImpression）。
- 错误原文: `无报文级错误（核查结论：5 个 QQ 会话 1 私聊 + 4 群各映射独立 DSH session，互不共享）`
- 触发条件: 人类问「每个群聊是否都有独立会话？她的记忆压缩在哪里」时核查发现。
- 根因: 规则缺失：长期记忆这一层从来没建，不是坏了；qq-model-view.js 的 compactModelMessage 只删重复字段与空字段，不做语义压缩。
- 解决: 已处置：新建跨会话长期记忆 state\long-term-memory.json（shared / private 两层，群聊只注入 shared、私聊注入 shared+private，群聊写 private 返回 403）；自动沉淀每 30 分钟扫非私聊会话，说话 ≥3 条的群友入库（零 token）；新增工具 qq_long_term_append / qq_long_term_query。
- 证据: `logs/failures/2026-10.jsonl` F-2026-10-0018（L17）；`docs/NOTES-<name>感知与记忆能力-20261024.md` §三（L136-L194）。
- 回滚点: `_backup\2026-10-24-long-term-memory\`。
- 关联: F-2026-10-0022

## ERR-QQ-725 | enabledTools 靠硬编码 toolMap，新加的 6 个工具 AI 根本看不见

- 症状: 长期记忆/视频/说说/发图等工具上线后 AI 一直不知道能用；qq_get_prompt 里只列 33 项而非 39 项，能力形同不存在；另本地 245 张表情图（dsh-meme 插件 ~\.dsh\meme-packs）AI 无法访问。
- 错误原文: `无报文级错误（enabledTools 由 bridge.js 第 5060 行附近的硬编码 toolMap 生成，新工具未登记）`
- 触发条件: 新增 longTerm/getVideo/qzone/sendImage/sendLike/reactMessage 六个工具之后。
- 根因: 规则缺失：toolMap 是手工维护的镜像表，新增工具时没有同步机制。
- 解决: 已处置：已补登 6 项到 toolMap；表情库打通中（只给画面，不给图库自带标签，由 AI 自己定义用法）。
- 证据: `logs/failures/2026-10.jsonl` F-2026-10-0020（L20）。

## ERR-QQ-726 | 在 AI 回合进行中重启桥接：掐断回合 + 防卡死租约丢失，会话永久繁忙

- 症状: 01:22:05 <name>的回合开始，01:29:54 为修去重 Bug 重启桥接掐断该回合（DSH 侧无 response）；桥接 30 分钟防卡死租约是进程内定时器，重启后丢失，会话永久卡在繁忙，人类 01:31 的消息只进队列不被处理，被吞 1 小时未回复。
- 错误原文: `01:22:05 <name>的回合开始，我在 01:29:54 为修去重 Bug 重启桥接，掐断该回合（DSH 侧无 response）`
- 触发条件: 在 AI 正在处理的回合中途重启桥接，且未先确认会话空闲。
- 根因: 执行偏差：重启时机错误 + 防卡死租约是进程内定时器（重启即丢），没有先确认会话空闲。
- 解决: 已处置：重启桥接清 pendingWakeKeys 解除；规矩：改代码要么等空闲、要么一次改完再重启；重启前先看会话文件 mtime 是否在 1 分钟内变动。
- 证据: `logs/failures/2026-10.jsonl` F-2026-10-0021（L21）。
- 防护: 重启前查会话空闲（mtime）。
- 关联: F-2026-10-0020

## ERR-QQ-727 | 只有短期记忆与角色卡，没有情绪状态层：每轮都是新的她

- 症状: 每轮从角色卡重新开始，只有短期记忆（60 条窗口）与长期记忆的 self 类零散条目；情绪不连续、判断不可修正、关系数值无区分度。
- 错误原文: `无报文级错误（核查结论：现有系统完全没有情绪状态层）`
- 触发条件: 落地心理状态引擎（人类批准 GPT 框架，要求先做人格/状态分离）时核查。
- 根因: 规则缺失：从设计之初就没有状态引擎，不是坏了；长期记忆只有 note 单字符串，无证据/置信度/修正机制，无法区分事实与猜测；关系用 hits 单一计数，只进不退。
- 解决: 已处置（F-2026-10-0022-RESOLVED 实测）：实现 psyche.js（三层情绪：短期 TTL 10 分钟 / 心境半衰期 6 小时 / 单轮上限 8%）+ memory-model.js（Fact-Scene-Impression-Reflection-Self 五层链，无证据强制 tentative 且 conf≤0.4，她可反驳且原条目保留为 revised）；实测「在吗」→ emotions 空、conf 0.15、状态零变化；混合情感句识别出 joy0.65/interest0.5/tired0.2 并存，mood.valence 0.5→0.58 正好 8% 上限。
- 证据: `logs/failures/2026-10.jsonl` F-2026-10-0022（L22）、F-2026-10-0022-RESOLVED（L23）；`docs/NOTES-心理状态引擎-20261024.md`。
- 回滚点: `_backup\2026-10-24-psyche-engine\`。
- 防护: 调试端点 GET/POST /api/socialV2/psyche；config.json 的 psyche.enabled 可关。
- 关联: F-2026-10-0018

## ERR-QQ-728 | 长期记忆只分 private/shared，群与群之间串权（A 群秘密会漏到 B 群）

- 症状: 实测 group:<qq-group> 与 group:<qq-group> 注入的 longTerm 完全相同（1343 字符，内容一致）；group:<qq-group> 的成员 momoga 出现在 group:<qq-group> 的记忆里；最坏情况 A 群有人说了秘密，B 群有人问起她会说出来。
- 错误原文: `无报文级错误（scopeOfKey 只分 private/shared 两档，所有群共用一个 shared 作用域）`
- 触发条件: 人类问「会不会串权」，实测群聊记忆注入时。
- 根因: 规则缺失：设计时只考虑了「私聊不串到群」，没考虑「群与群之间」。
- 解决: 待修（方案已定）：两级作用域——按群（groups[key]）+ 按人（persons[qq] 跨群索引）；人类裁定「先按群再按人，有相同的人单独记忆」。20 条 people 全在 shared、每条 note 都带 group:xxx 标识，可精确迁移。
- 证据: `logs/failures/2026-10.jsonl` F-2026-10-0025（L26）。
- 关联: F-2026-10-0023

## ERR-QQ-729 | need-qr.flag 掉线恢复后不清理，一直残留「需要人工扫码」

- 症状: state\ 下同时写 NEED-QR-LOGIN.txt 和 need-qr.flag，恢复时只清前者，后者从不清除，掉线恢复后仍残留「需要人工扫码」的误导标记。
- 错误原文: `无报文级错误（残留标记 need-qr.flag）`
- 触发条件: NapCat 掉线恢复后。
- 根因: 代码问题：恢复分支只清了 NEED-QR-LOGIN.txt，漏了 need-qr.flag。
- 解决: 已处置：恢复时两个都清。
- 证据: `docs/NOTES-机器人脚本审计与修复-20261023.md` §一.7（L63-L66）。

## ERR-QQ-730 | 抢号检查判据把用户主号当抢号，每天一条假 FAIL

- 症状: health-check 每天报一条抢号 FAIL；实际用户主号 QQ（D:\QQ）本来就该一直在，它和 NapCat 并存是正常工作状态。
- 错误原文: `每天一条 FAIL`（判据：QQ 进程不是唯一一组就报抢号）
- 触发条件: 用户主号 QQ 与 NapCat 同时运行时执行体检的抢号检查。
- 根因: 规则缺失：判据没有区分进程来源，把「主号 + NapCat 并存」误判成抢号。
- 解决: 已处置：按来源分开判——D:\QQ\QQ.exe 放行；*onekey* 是 NapCat，必须只有一组；其他任意路径标记可疑。效果：35 通过 → 37 通过，误报消除。
- 证据: `docs/NOTES-机器人脚本审计与修复-20261023.md` §一.13（L100-L108）。
- 防护: 杀 QQ 一律走 kill-bot-qq.ps1，绝不按进程名无限定杀。

## ERR-QQ-732 | 改代码只跑语法检查不跑功能：漏 export、调用未实现、编辑吃掉一行都能过

- 症状: 三类错误同时存在：① psyche 模块的 describe 忘了 export，单测直接报错；② textOfMessageForAssess / recycleCarryover 先写调用后写实现（函数根本没写）；③ retireSession 被编辑时吃掉一行 `const sessionId = state.sessions[key]`，少一行仍然合法，语法检查没抓到。
- 错误原文: `does not provide an export named 'describe'`
- 触发条件: 改完 qq-bridge 代码只跑 node --check / 语法检查、没有实际运行对应功能时。
- 根因: 验证只覆盖「语法是否成立」，不覆盖「导出是否存在、调用是否已有实现、行是否被编辑吃掉」；中文注释打错字（「是什 么」）同属这类无人验证的改动。
- 解决: 已处置：补 export；把调用改成已实现的 extractPlainText；把被吃掉的一行补回。教训：先写实现再写调用，改完必须跑功能、不只看语法。
- 证据: `docs/NOTES-心理状态引擎-20261024.md` §十（L246-L251）；`docs/NOTES-开销诊断与会话换页-20261024.md` §九（L263-L271）。
- 关联: F-2026-10-0020

## ERR-QQ-904 | NapCat 被腾讯踢下线：KickedOffLine + 身份验证失败 w21，频繁重启只会越救越死

- 症状: 网关日志出现 KickedOffLine，OneBot 的 3000/3001 端口随之消失、SnowLuma 连不上；重新登录后表现为"连得上但好友列表 0 / 收藏表情 0 / 私聊 retcode 200 但 status failed"，登录态里报身份验证失败 w21。
- 错误原文: `[KickedOffLine] 你的账号当前登录已失效，请重新登录`；`身份验证失败，请你重新登录。(w21)`
- 触发条件: 同一 QQ 号同时在手机 / 主力 QQ 登录（抢号）；NapCat / QQ 版本过新被风控；注入式加载器被检测；同一环境短时间内反复登录。
- 根因: 腾讯客户端侧的风控 / 注入检测，不是桥接代码问题。**社区已确认（非官方，但有维护者背书）**：NapCat#1728 正文直接写"风控掉线，频繁被 [KickedOffline]"，并给临时方案"降低 NapCat 与 QQ 版本"（该 issue 以 not_planned 关闭）；LLOneBot#534 的维护者回复把"登录状态失效"归为"环境被检测异常"，建议降 QQ 版本、移除手机端模块、重新登录，并指出"手机上有模块也会被检测到，导致全端下线，bot 账号最好不要在手机登录"。**官方文档只到"账号有风险"这层**：NapCat Troubleshooting 的 "Account Frozen After Login" 建议用官方 QQ App 完成安全验证、**不要短时间反复登录（两次之间等 5–10 分钟）**、保持固定 IP 与常用设备。**w21 这个码本身无官方文档**，属客户端错误码，社区解释为登录态失效 / 被踢。
- 解决: 本机做法：① 先只重启 NapCat（`qr-login.bat`），未必真需要扫码 —— 但必须核实有没有人手动扫过，别把"有人介入"记成"自愈"（本机记错过一次，见 MEMORY 2026-10-23 03:15 节的更正）；② 看门狗对 KickedOffLine 不得每 2 分钟自动重启（实测 10 分钟起 4 次全失败、只会加重风控），已加保护；③ 主号与 bot 号彻底分开，禁止 `taskkill` 主号 QQ。上游 / 社区建议：降到已知稳的版本组合（#1728 给的是 NapCat 4.15.0 / QQ 3.2.23-44343）、bot 号不在手机登录、固定 IP 与常用设备、两次登录间隔 ≥5–10 分钟。
- 证据: [NapCat#1728（风控掉线；临时方案=降版本）](https://github.com/NapNeko/NapCatQQ/issues/1728)；[LLOneBot#534（腾讯封号机制讨论；维护者回复在评论区，9 赞）](https://github.com/LLOneBot/LuckyLilliaBot/issues/534)；[NapCat 官方 Troubleshooting（Account Frozen After Login: 避免频繁登录/固定 IP）](https://mintlify.wiki/NapNeko/NapCatQQ/resources/troubleshooting)；本机 `MEMORY-<name>.md` L797-798、L811-815、L2029、L5393；`docs/SCRIPTS-INDEX.md` L146
- 回滚点: 改看门狗前的脚本副本（见当次事故的 `_backup\` 目录）
- 防护: 三档分开写清楚 —— **官方文档**：别频繁登录、固定 IP/设备、用官方 App 验证；**社区共识**：降版本、bot 号别上手机、别带模块；**社区偏方（不采信）**：LLOneBot#534 里"开年费 SVIP 会消停"被发帖人自行标注 `(unverified)` 且被其他人反驳，别当结论。本机硬规矩：KickedOffLine 后禁止自动高频重试。
- 关联: `docs/ROLE-<name>的抖音规矩.md` L58（"被踢下线后每 2 分钟重试只会越救越死"）

## ERR-QQ-905 | OneBot 发图 / 发文件报"文件处理失败: 识别URL失败"——传的是相对路径

- 症状: `send_group_msg` / `send_private_msg` 带本地文件（图片、视频）时失败，retcode 1200；把参数换成绝对路径立刻成功；再换 `base64://` 又变成超时。
- 错误原文: `文件处理失败: 识别URL失败`；AstrBot 侧对同一现象记作 `retcode 1200 (识别URL失败)`
- 触发条件: 消息段 `file` 字段传相对路径（如 `state\generated\x.png`）给 OneBot 实现（NapCat / Lagrange 等），且实现没有做裸路径到 file URI 的自动转换。
- 根因: **规范层面**：OneBot 11 的消息段规范里，发送时 `file` 只定义了四种形式 —— 收到的文件名、`file:///` 绝对路径（file URI）、网络 URL、`base64://`；裸相对路径不在其中，网关于是把它当 URL 去解析，解析失败即"识别URL失败"。**下游已确认**：AstrBot 已合并的 PR #5391 正文写"OneBot 11 标准要求本地文件路径必须使用 `file:///` 协议头。此前驱动层未对裸路径进行自动转换，导致发送本地文件时常触发 retcode 1200 (识别URL失败)"，修法是发送前自动补 `file:///`。
- 解决: 本机做法：一律传绝对路径 —— `qq_send_image` 只收 `assets/` 或 `state/` 下的相对路径，所以先把文件拷进 `qq-bridge\state\generated\` 再传；`base64://` 对视频段会 `NodeIKernelMsgService/sendMsg Timeout`，不要再试第三种编码。上游建议（规范 + 下游 PR）：本地文件用 `file:///` 前缀的绝对路径（跨机可用的写法是 `file:///C:\Users\<user> file URI。
- 证据: [OneBot 11 消息段规范（图片 file 参数的四种发送形式）](https://github.com/botuniverse/onebot-11/blob/master/message/segment.md)；[AstrBot PR#5391（merged；file:/// 与 retcode 1200 的因果关系 + 自动补前缀的修法）](https://github.com/AstrBotDevs/AstrBot/pull/5391)；本机 `MEMORY-<name>.md` L992-994、L1473-1474；`docs/NOTES-<name>感知与记忆能力-20261024.md` L200
- 回滚点: 无
- 防护: **上游确认**：相对路径不合规，别在应用层"修"网关有的行为。本机规矩「发文件先落 state/ 再传绝对路径」与规范一致。视频段**上游未给出可用解**（base64 超时，规范里也没有视频专用其它编码），本机结论：视频发不出去就只发路径让人类自取，别反复试编码。
- 关联: F-2026-10-0011
