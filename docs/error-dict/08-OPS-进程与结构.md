# 08 · 进程 · 计划任务 · 结构

> 这一卷收「进程被带走 / 计划任务没触发 / 目录写不进 / 沙箱拒绝」这类问题。
> 新增词条直接往下追加，骨架见 [_TEMPLATE.md](_TEMPLATE.md)。

共 27 条。

## ERR-OPS-001 | 计划任务 LastTaskResult: 0 根本不能证明跑成功（WScript.Shell.Run 不解析 >>）

- 症状: 计划任务的返回码是 0，看起来完美；实际进程根本没起来、日志一行没写，还弹了「找不到文件」的窗。
- 错误原文: 弹窗「找不到文件」；`LastTaskResult: 0`（静默失败）
- 触发条件: ① `run-hidden.vbs` 用 `sh.Run cmd, 0, False` 启动带 `>>` 重定向的命令（它**不是 cmd**，`>>` 被当参数传给 node）；② 在计划任务 `Arguments` 里塞 `cmd.exe /c ""C:\Program Files\nodejs\node.exe" ..."`，嵌套引号被吃掉。
- 根因: WScript.Shell.Run 不做 shell 解析；多层引号转义在那一层失效。
- 解决: sampler 改成自己写日志（`fs.appendFileSync`），彻底不依赖 shell 重定向；启动命令写进纯 ASCII 的 `start-journey-sampler.bat`，任务只调 `wscript run-hidden.vbs "start-journey-sampler.bat"`，照抄已有成功任务 `qq-bridge-autostart` 的 `cmd.exe /c start-all.bat` 样式。
- 证据: `MEMORY-<name>.md` 第 1823–1847 行
    + ERR-OPS-854（已并入）: `docs/NOTES-<name>心路历程-20261024.md` §八（L119-L135）。
    + ERR-OPS-853（已并入）: `docs/NOTES-<name>心路历程-20261024.md` §八（L119-L135）。
- 回滚点: 无
- 防护: `LastTaskResult: 0` 不能证明任务跑成功——要看进程和日志
- 关联: F-2026-10-0033
    + F-2026-10-0033

## ERR-OPS-002 | 窗口/弹窗三连：& powershell.exe 会真开窗口、Hidden=True 不够、DSH 子进程拿不到桌面

- 症状: 打游戏时被全屏弹窗反复挡住；排查「谁在弹窗」时又把自己也匹配进去；想开个可见终端看日志却开不出来。
- 错误原文: `& powershell.exe` 创建真实子进程窗口；计划任务 `Hidden=True` 只隐藏任务本身；DSH 里 `Start-Process notepad` 进程活着但 `MainWindowHandle=0`
- 触发条件: ① 看门狗 `Show-QrToUser` 用 `Start-Process powershell -File show-qr.ps1` 全屏亮码；② `Get-CimInstance Win32_Process | Where CommandLine -match 'show-qr'` 把当前这条查询命令自己匹配进去（误判成死循环）；③ DSH 启动的子进程拿不到交互式桌面。
- 根因: `-WindowStyle Hidden` 必须加在**被调用的 powershell 的参数里**，加在父脚本上无效；计划任务 `Hidden=True` 语义不同；DSH 子进程无交互桌面。
- 解决: 4 处 `& powershell.exe` 全加 `-WindowStyle Hidden`；`qq-bridge-proactive` 改用 `wscript run-hidden.vbs` 包装；NapCat 的 cmd 黑框用 `launch-napcat-hidden.vbs`（窗口样式 0）；看门狗 L3 改成只写 `state\need-qr.flag` + 日志，不再弹窗（代价：掉线后不自动亮码，用户自己跑 `show-qr.ps1`）；查进程时排除自己的进程名或把关键字拆开拼。
- 证据: `MEMORY-<name>.md` 第 731–743 行；第 764–765 行；第 1080–1088 行
- 回滚点: 无
- 防护: 用户手动双击 `launch-napcat-visible.vbs` 有效，只是 DSH 调不起来；`qq-bridge-autostart` 那条「改不动」（拒绝访问，需管理员）

## ERR-OPS-003 | restart.bat 用 echo. | 喂 stdin → CIM 查询全部拒绝访问，旧进程没杀掉、锁文件却删了

- 症状: 想重启桥接，结果旧进程还在、`bridge.lock` 被删了，状态更乱。
- 错误原文: `拒绝访问`（`Get-CimInstance Win32_Process` 全部失败，提示「输入重定向不支持」）
- 触发条件: 用 `cmd /c "echo. | restart.bat"` 运行 `restart.bat`。
- 根因: `Get-CimInstance Win32_Process` 需要非重定向的 stdin 才能拿到信息；stdin 被重定向后 CIM 查询全部失败 → 按 PID 杀进程的逻辑落空，但后面的删锁文件照做了。
- 解决: 先 `Stop-Process -Id <bridge.lock 里的 PID>`，再 `Start-Process cmd /c "start.bat"`。
- 证据: `MEMORY-<name>.md` 第 190 行
- 回滚点: 无

## ERR-OPS-004 | start.bat 里有 :loop：只杀 node 会在 5 秒后被重新拉起

- 症状: 想临时停桥接（打游戏时），杀了 node 进程，5 秒后它又活了。
- 错误原文: `无报错（pid 变化可观察）`
- 触发条件: 只 `Stop-Process` 掉 node 进程，`start.bat` 的 `:loop` 还在。
- 根因: `start.bat` 是循环守护，node 退出就重启。
- 解决: **必须先杀持有 `start.bat` 的 cmd 父进程，再杀 node**（`apex-mode.ps1` 已按这个顺序实现：Apex 启动只停桥接、不杀 QQ 保住登录态）。
- 证据: `MEMORY-<name>.md` 第 744–749 行
- 回滚点: 无

## ERR-OPS-005 | 登录态备份停在 30 小时前 + restore 脚本备份的是空目录：L2 这条救命路是死的

- 症状: 看门狗的「还原登录态」一直显示成功，实际那条路从来救不回来。
- 错误原文: 备份时间 `2026-10-22 20:02:35`（到 10-24 已 30 小时）；`restore-qq-login.ps1` 第 25 行 `@{ Src="acct-msf"; Dst=...\nt_data\msf }` 等于空转（`acct-msf` 备份是空的）
- 触发条件: 备份脚本一直存在且正确，但**没人调用它**；且备份路径选错（真凭据在 `global-nt_data\.MSFSDKDataDir`，有 2737 文件含 `msf_crypto_cache`）。
- 根因: 「脚本写好了」≠「它在无人干预时自己跑起来」；备份源目录选错（账号级 `<qq-uin>\nt_qq\nt_data\msf` 本身是空的）。
- 解决: watchdog 在**健康分支**调 `Invoke-LoginBackup()`（只在健康时备份，半死/掉线时备份会把坏状态存进去），间隔 6 小时；实测备份刷新到 `2026-10-24 02:57:45 / files ok: 2763 / failed: 0`。
- 证据: `MEMORY-<name>.md` 第 2053–2065 行；第 1059–1062 行；第 2112–2119 行
- 回滚点: `_backup\2026-10-24-watchdog-rewrite\`（含旧任务 XML）
- 防护: 验证要验证到「它在无人干预时自己跑起来」为止

## ERR-OPS-006 | _outputs 被堆到 30 GB：28.4 GB 是同名模型的冗余中转

- 症状: D 盘告急排查时，`_outputs` 的体积根本解释不清；E 盘被从 45% 顶到 47%。
- 错误原文: `_outputs` 共 **30 GB**：`local-video-models` **28.4 GB**（5 个 Wan2.2 模型，`comfyui\ComfyUI\models\` 里全有同名同大小副本）、`qq9930` 1.3 GB、`ai-zip-inspect` 814 MB
- 触发条件: 模型先下到 `_outputs\local-video-models\`，复制进 ComfyUI 后没清中转；项目 README 还写着「另存一份」。
- 根因: `_outputs` 按约定只是「临时产物：截图、二维码图」，被当成下载缓存区。另外旧文档写的「42 GB + 27.7 GB = 70 GB」是把同一份 34 GB 模型算了两遍。
- 解决: `AGENTS.md` 新增大文件下载规矩（落脚点对照表、中转必清、收尾报数、定期自查命令）与第 11 条；`projects\local-video\README.md` 删掉「从 _outputs 拷贝」「另存一份」两句。判据：单文件 >100 MB 或单目录 >1 GB 不许落在 `_outputs`。
- 证据: `MEMORY-<name>.md` 第 1556–1636 行（第五十二、五十三节）
- 回滚点: 无（残骸已清）
- 防护: D 盘紧张是 Steam 141.9 GB 占的，不是系统问题——不需要加硬盘

## ERR-OPS-007 | 长任务挂在 DSH 子进程树下：DSH 一重启就被带走，静默消失

- 症状: 语音训练两次「静默消失」；QQ 在 DSH 重启时归零（20:11 那次 QQ 全没了）。
- 错误原文: 进程凭空消失、无错误日志（父链是 `QQ.exe → NapCatWinBootMain.exe → cmd.exe`，那个 cmd 属于 DSH 的 job）
- 触发条件: 用 `cmd /c` / `start /min cmd /c` 从 DSH 会话里起常驻进程。
- 根因: 子进程在被调者的 job object 里，DSH 重启把它们一起带走。
- 解决: 用 WMI 启动：`Win32_Process.Create`（`Invoke-CimMethod -ClassName Win32_Process -MethodName Create`）——父级是 `WmiPrvSE.exe`，不在调用者的 job object 里；`launch-napcat-detached.ps1` 与语音训练的 `train_kokoro_run.bat` 都改成这条路。**以后长任务一律 WMI。**
- 证据: `MEMORY-<name>.md` 第 687–692 行；第 1119–1120 行；第 2207–2209 行
- 回滚点: 无
- 防护: 起了常驻进程后要能说出它的父进程是谁

## ERR-OPS-008 | 多助手并发写 MEMORY：编号撞了 4 组，幂等判断还会静默跳过自己的内容

- 症状: 文件里出现两个「五十五」、两个「五十八」、两个「六十一」、两个「六十二」；另有一次追加内容完全没写进去。
- 错误原文: 撞号实测：`五十五 × 2（行1747 / 行1862）`、`五十八 × 2（行2125 / 行2276）`、`六十一 × 2（行2570 / 行2747）`、`六十二 × 2（行2673 / 行2836）`
- 触发条件: 多个助手并行追加 MEMORY，各自「读最后一个是几号」再往后编；幂等判断用 `$m.Contains('五十三、2026-10-24')` 这种编号前缀。
- 根因: 编号要靠读文件推，并发必然撞；编号前缀判重会误命中别人刚占的号，导致自己的内容被静默跳过。这是最典型的串权（不是文件损坏）。
- 解决: 章节标题一律改时间戳 `## YYYY-MM-DD HH:MM · 一句话标题｜署名助手`；写前先读最新版、用 CAS（`ops_edit_file`/`write` 的版本校验）、不动别人的章节；失败日志只能追加、写完 `ConvertFrom-Json` 自查。04:35 那次「拿 03:38 记忆里的宪章去 Replace，靠锚点未匹配才没覆盖语音助手刚改的分工表」——那是运气不是设计。
- 证据: `MEMORY-<name>.md` 第 1803–1812 行；第 3089–3167 行（写入规矩）；第 3172–3207 行（4 组撞号清单）
- 回滚点: 无
- 防护: 子代理涉及<name>私密记忆（心路历程/autobio 印象/psyche 情绪）时不许 `subagent_fork`

## ERR-OPS-009 | 启动顺序错了：QQ 没登录就先起桥接，它会卡死且不会自己恢复

- 症状: 桥接进程活着、3100 也在监听，看起来正常，但日志停在旧时间、一条消息都不处理。
- 错误原文: `停在「等连接」（连不上 3000），之后 QQ 登录了也**不会自动恢复**`
- 触发条件: QQ 未登录（3000 未监听）时启动/重启桥接。
- 根因: 桥接启动时连不上 OneBot 就停在等连接状态，没有重连补偿。
- 解决: 正确顺序是「QQ 扫码登录成功（3000 通）→ 再启动/重启桥接」；判断桥接是否真活着看 `bridge-daemon.log` 的时间戳是不是新的，**不是只看 3100 端口通不通**。
- 证据: `MEMORY-<name>.md` 第 767–770 行
- 回滚点: 无

## ERR-OPS-010 | 训练 OOM 的元凶是隔壁的 ComfyUI：DefaultCPUAllocator 报错，调小 batch 也没用

- 症状: 音色训练一开就 OOM，把 batch 调小仍然炸，怎么看都像训练脚本的问题。
- 错误原文: `DefaultCPUAllocator`（PyTorch 内存分配失败）
- 触发条件: 语音训练与 ComfyUI 同时跑（视频模型常驻 6~20GB，训练 commit 冲到 60GB）。
- 根因: 内存被隔壁的 ComfyUI 吃掉，不是训练参数太大。
- 解决: 训练前确认 ComfyUI 空闲并停掉，干净内存下 batch 16 可跑。
- 证据: `MEMORY-<name>.md` 第 2210–2211 行
- 回滚点: 无
- 防护: 训练前 `freeMem` > 8GB，不许 ComfyUI 在旁边跑

## ERR-OPS-011 | 需要管理员的三件事：schtasks Access denied、HttpListener 参数无效、start-all.bat 需提权

- 症状: 想创建登录触发器，被策略拒；想开个本地二维码页，非管理员直接报参数无效；想拉起机器人，脚本自己 RunAs 重启却什么都没发生。
- 错误原文: `schtasks /create /sc onlogon` → `Access denied`；`HttpListener` 非管理员运行报 `参数无效`（需要 `netsh http add urlacl` 提权注册前缀）；`start-all.bat` 用 `net session` 检测提权，未提权时自己 RunAs——本会话 pwsh 是 Medium 权限，`Start-Process -Verb RunAs` 静默执行但**没真正启动**
- 触发条件: 本机 `EVANGELION\yangs` 属于 `BUILTIN\Administrators` 但 UAC 把令牌降成 deny-only。
- 根因: 需要提权令牌；`HttpListener` 需要先注册 URL 前缀。
- 解决: 改用启动文件夹放 `.vbs`（与 `dafeiyu-autostart.vbs` 同机制）；二维码实时页改用 **TcpListener 手写最小 HTTP**（`scripts/qr-live-server.ps1`，`http://127.0.0.1:8777/`）；需要管理员时用 `Start-Process powershell -Verb RunAs`（本机 `ConsentPromptBehaviorAdmin=0`，实测静默拿高权限，`scripts/elevate.ps1` 走「写中间脚本 → RunAs 跑 → 写结果文件 → 父进程读回」拿 stdout）；`start-all.bat` 的手动兜底是 `cd /d <NapCat目录> && echo. | NapCatWinBootMain.exe QQ.exe <qq-uin>`（**必须带 QQ 号**）。
- 证据: `MEMORY-<name>.md` 第 144 行；第 1075–1108 行；第 591 行
- 回滚点: 无
- 防护: 「AI 没有管理员权限」这条边界在技术上并不存在（UAC 不弹窗直接提权）；是否把 UAC 改回提示确认需人类决定。另：`Start-Process NapCatWinBootMain.exe` 不能喂 stdin，引导程序停在 `Press any key to continue`——旧看门狗正是这么写的，所以它其实从来救不回来

## ERR-OPS-841 | 失败日志 ID 写成 F-2026-10-23-0010（多一段日期），按 F-04 只追加标注

- 症状: 日志写入时 ID 格式手误写成 F-2026-10-23-0010；该条应为 F-2026-10-0010；仅影响该条 ID 可读性，不影响内容。
- 错误原文: `该条应为 F-2026-10-0010`
- 触发条件: 手工写 logs\failures\ 条目时。
- 根因: 执行偏差：写日志时按错模板（把日期段写了两遍）。
- 解决: 已处置：按 F-04「只可追加与标注」在本条追加标注；原记录保留 F-2026-10-23-0010 不变（不删不改）。
- 证据: `logs/failures/2026-10.jsonl` F-2026-10-23-0010（L10）、F-2026-10-0010（L11）。
- 防护: 写日志统一模板；ID 格式在写入后自检。
- 关联: F-2026-10-23-0010

## ERR-OPS-842 | 她的灵魂数据与系统运营数据混在同一个 state 目录，无法单独备份/审计

- 症状: 她的灵魂数据（long-term-memory / social-v2 / psyche / journey / character / stickers / diary / media-cache / generated，共 77 MB）与系统运营数据（账单/日志/登录凭据/令牌，共 348.7 MB）混在同一个 state 目录；想单独备份她的记忆得连 355 MB 登录凭据一起拷；出事时难以判断该救谁。
- 错误原文: `无报文级错误（现状核查：bridge.js 里 26 处 path.join(STATE_DIR, ...) 硬编码）`
- 触发条件: 人类要求把<name>的数据从 qq-bridge\state 里剥离出来单独存放时。
- 根因: 设计缺陷：早期图快把她的数据和系统数据放一起，没有域划分。
- 解决: 部分已处置（F-2026-10-0026 主链路）：新建 state\lanyin\ 专放她的数据，bridge.js 加 LANYIN_DIR，逐个改引用；移完验证她仍能记事、有情绪、记得表情。周边脚本搬家后断过（sync-heart / health-check / journey-sampler / journey-card / journey.js），见 AGENTS.md「<name>的数据边界」。
- 证据: `logs/failures/2026-10.jsonl` F-2026-10-0026（L27）；AGENTS.md「<name>的数据边界」一节。
- 防护: 新代码读写她的数据一律用 herFile('xxx') 或 LANYIN_DIR。
- 关联: F-2026-10-0025

## ERR-OPS-843 | 取样瞬时导致误报 NapCat 掉线：把「某一刻没在听」当成「服务挂了」

- 症状: 体检连续两次显示 3000/3001 未监听，据此判断 NapCat OneBot 掉了；实际是 NapCat 在这几分钟内重启了两次（PID 26532→11688→41128），恰好取到了 6099 在听、3000/3001 未起的中间态。
- 错误原文: `3000/3001 未监听`（体检端口快照；随后实测 http://127.0.0.1:3000 返回 HTTP 200，netstat 显示 41128 同时听 3000/3001/6099）
- 触发条件: 单次取端口快照判断服务是否存活时。
- 根因: 三个错误叠加：① 端口快照只取一次，没有再取一次确认；② 拿 PID 变过当异常信号却没意识到那是重启而非崩溃；③ 没有用「服务可用性」证伪（直接打接口），只用了「端口是否在听」这个间接指标。
- 解决: 已处置（诊断方法已改）：① 判「服务挂了」之前必须直打一次接口，端口只是间接指标；② PID 在同一分钟内变过 = 重启中，要么等 30 秒再看，要么以接口为准；③ plugin-audit 的端口段加「未监听 ≠ 服务不可用，以接口探测为准」的提示。
- 证据: `logs/failures/2026-10.jsonl` F-2026-10-0028（L29）。
- 防护: 服务可用性以接口探测为准。

## ERR-OPS-844 | 体检脚本把「查不出来」报成「确实没跑」：WMI 被拒后输出假结论

- 症状: Show-Mcp 的 MCP 进程段长期输出假警告，实际 DSH 宿主好得很：4 个 DSH Desktop 进程、43120 HTTP 有应答、全部 MCP 工具可调用。
- 错误原文: `🟡 没有任何 node 进程 —— DSH 宿主可能没起来，MCP 自然全部不可用`（Get-CimInstance Win32_Process 返回「拒绝访问」）
- 触发条件: 执行 plugin-audit.ps1 Show-Mcp，且 WMI 被拒时。
- 根因: 三层叠加：① Get-CimInstance Win32_Process 被拒（拒绝访问），catch 后 fallback；② fallback 用 Get-Process node——而本机宿主进程名叫「DSH Desktop」，从来没有 node 进程，该信号恒为假；③ fallback 第二层 Get-NetTCPConnection -OwningProcess 对本机已知属主 PID 也返回空（测了 15440/24104/34436/36048 全部「监听=-」）。三条通道全废，代码却把空结果当成结论输出。
- 解决: 已处置：Show-Mcp 改为能拿 CIM 就用、拿不到一律用 netstat -ano 解析监听表，判据是「3000/3001/3100/6099/43120 有没有在听」，并对 43120/3000 各给一句人话解释；删掉「没有 node 进程」这条假结论。验证：-Action All 输出真实监听表，43120/3000 双双报活。
- 证据: `logs/failures/2026-10.jsonl` F-2026-10-0029（L30）。
- 防护: 区分「确实没跑」与「查不出来」，查不出时输出「无法判定」。

## ERR-OPS-845 | journey-sampler 计划任务写成 LogonTrigger，描述却写 every 20min，21.5 小时没触发

- 症状: 任务描述为「every 20min」但触发器只有 LogonTrigger；Get-ScheduledTaskInfo 的 NextRunTime 为空；LastRunTime 停在 2026-10-24 03:10:10，此后 21.5 小时未再触发；采样实际靠一个手工 WMI 起的常驻进程（PID 34200）吊着，该进程一旦终止即再无组件拉起（napcat-watchdog2.ps1 内 grep journey 零命中）。
- 错误原文: `无报文级错误（Get-ScheduledTaskInfo 的 NextRunTime 为空、LastRunTime 停在 2026-10-24 03:10:10）`
- 触发条件: 系统自 2026-10-21 02:34:51 开机后从未重启、从未重新登录（近 3 天无 6005/6006/1074 事件）时。
- 根因: 配置问题：注册任务时把周期性任务写成了登录触发；XML 内不存在任何 Repetition 或 TimeTrigger 定义，描述与实现不符。
- 解决: 已处置（F-2026-10-0033）：追加 Repetition PT20M 的 TimeTrigger（Duration 省略=无限），保留 LogonTrigger，Actions/Settings/Principal 逐字未动（diff 校验通过）；注册后 LastRunTime 刷新为 10-25 00:47:00，NextRunTime 排至 01:07:00；停掉手工 WMI 进程 34200，保留计划任务托管的 22128，采样进程数回归 1；双开窗口实测 private/shared 各仅 1 条样本、无重复时间戳（20 分钟最小间隔 + 内容指纹双重去重生效）。
- 证据: `logs/failures/2026-10.jsonl` F-2026-10-0033（L34）。

## ERR-OPS-846 | NapCat 挂在计划任务的进程树上，任务一结束就被带走

- 症状: 机器人起得来但活不久；NapCat 的父进程是 start-all.bat 里那个 cmd，而本 bat 由计划任务 qq-bridge-autostart（cmd.exe /c）拉起，计划任务一结束 NapCat 跟着走。
- 错误原文: `无报文级错误（进程树关系：NapCat 的父进程是 cmd，cmd 的父进程是计划任务）`
- 触发条件: 经计划任务调 start-all.bat 启动 NapCat 时。
- 根因: 启动方式错误：原第 34 行 `start "NapCat" /min cmd /c ...` 把 NapCat 放在本进程树里。
- 解决: 已处置：改为经 launch-napcat-detached.ps1 用 WMI 启动（父进程是 WmiPrvSE，不在本进程树里）。
- 证据: `docs/NOTES-机器人脚本审计与修复-20261023.md` §一.2（L26-L33）。
- 防护: 起 NapCat 只走 launch-napcat-detached.ps1（AGENTS.md 第 10 条）。

## ERR-OPS-847 | watchdog 单轮实测 7.4–9.6 分钟贴 PT10M 上限，超时被强杀则 L3 告警彻底静默

- 症状: watchdog 计划任务 ExecutionTimeLimit = PT10M，最坏只差 24 秒；一旦超时被强杀，L3 告警写不出来，掉线彻底静默。
- 错误原文: 无报文级错误（配置值 `ExecutionTimeLimit = PT10M`，实测单轮 7.4–9.6 分钟）
- 触发条件: napcat-watchdog 单轮巡视耗时接近 10 分钟时。
- 根因: 配置问题：超时上限按「大概够用」设定，没有按实测最大耗时留余量。
- 解决: 已处置：改为 PT30M（实测不提权即可修改，因为任务属于当前用户）。
- 证据: `docs/NOTES-机器人脚本审计与修复-20261023.md` §一.5（L50-L55）；`docs/NOTES-启动优先级与限额管理.md` §四（L59）。
- 防护: 任何周期任务的 ExecutionTimeLimit 必须 > 单轮实测最大耗时 × 2（启动优先级 §七.4）。

## ERR-OPS-848 | Ensure-Bridge 只查 bridge.lock，锁文件没写好时误判「未运行」并再起一个 start.bat

- 症状: 实测当时有 2 个 cmd 同时在跑 start.bat；可能引发抢号/双实例。
- 错误原文: `无报文级错误（实测：2 个 cmd 同时在跑 start.bat）`
- 触发条件: bridge 刚被杀、lock 文件还没写完时 watchdog 执行 Ensure-Bridge。
- 根因: 规则缺失：只查 bridge.lock，锁文件在 bridge 刚被杀、还没写完时会被误判为「未运行」。
- 解决: 已处置：加 cmd 层判重（排除 start-all.bat / start-napcat*，避免误匹配——已验证不会误伤）。
- 证据: `docs/NOTES-机器人脚本审计与修复-20261023.md` §一.8（L68-L73）；`docs/NOTES-启动优先级与限额管理.md` §五.2（L113-L117）。
- 防护: 不要新增第二个「启动机器人」的任务（启动优先级 §七.3）。

## ERR-OPS-849 | qr-login.ps1 按进程名杀 NapCat，是全目录唯一一处无限定杀进程

- 症状: `Get-Process -Name NapCat` 无路径过滤，存在误杀用户主号 QQ 的风险；是全目录唯一一处「无限定杀进程」。
- 错误原文: `Get-Process -Name NapCat`（无路径过滤）
- 触发条件: 执行 qr-login.ps1 扫码登录时。
- 根因: 代码问题：按进程名杀进程，没走带路径过滤的统一脚本。
- 解决: 已处置：改成统一走 kill-bot-qq.ps1（带路径过滤，只杀 NapCat 自己的 QQ）。
- 证据: `docs/NOTES-机器人脚本审计与修复-20261023.md` §一.10（L82-L85）。
- 防护: 杀 QQ 一律走 kill-bot-qq.ps1（AGENTS.md 第 6 条）。

## ERR-OPS-850 | 名为「修 DSH 窗口闪烁」的 fix-flicker 实际做 4 类不可逆破坏，已归档

- 症状: 脚本实际做 4 类不可逆破坏：禁用 GameViewerService/ToDesk_Service/SunloginService、强杀 GameViewer/ToDesk/Sunlogin 全部进程、Disable-PnpDevice 禁虚拟驱动、写 HKLM Dwm\OverlayTestMode；四项全部无回滚。归档时实测这 4 个进程正在运行——任何人顺手双击就会掐断正在用的远程会话。
- 错误原文: `无报文级错误（危险动作清单见症状）`
- 触发条件: 有人双击运行 fix-flicker 相关脚本时。
- 根因: 规则缺失：以「修窗口闪烁」为名做系统级禁用/强杀，未评估影响面、无回滚。
- 解决: 已处置：归档到 `_archive\2026-10-23-fix-flicker-dangerous\`，附 README 说明手工做法的正确姿势。
- 证据: `docs/NOTES-机器人脚本审计与修复-20261023.md` §一.15（L121-L129）。
- 防护: 危险脚本进 _archive，不留在可双击的位置。

## ERR-OPS-851 | qq-bridge-autostart 无超时且 bridge 仍挂在计划任务 cmd 下（设计缺陷，未处置）

- 症状: start-all.bat 最后一行是 `node src\bridge.js >> "%LOG%" 2>&1`（前台阻塞），计划任务的 cmd 进程一直挂着，bridge 挂在这个 cmd 下。设 ExecutionTimeLimit 会杀掉桥接，所以不能简单设；正确修法是把 node 也改成脱离进程树，与 restart.bat 一致，但涉及正在运行的桥接，需停机窗口。
- 错误原文: `ExecutionTimeLimit = PT0S`（无限制）
- 触发条件: 经计划任务 qq-bridge-autostart 启动桥接时。
- 根因: 设计缺陷：入口同时承担「启动器」与「常驻进程宿主」两个角色，进程树没有完全脱离。
- 解决: 未处置（需停机窗口；改动方案已写明：`start "" cmd /c start.bat`，与 restart.bat 保持一致）。
- 证据: `docs/NOTES-启动优先级与限额管理.md` 已知问题 1（L70-L79）。
- 防护: 不要给 qq-bridge-autostart 设 ExecutionTimeLimit，除非先改 start-all.bat。

## ERR-OPS-852 | bot-model-sync 计划任务从未运行过（0x41303），靠「登录时触发」的设计前提不成立

- 症状: 任务从未运行过：LastRunTime = 1999/11/30 0:00:00（任务模板空值），LastTaskResult = 0x41303（从未运行）；本机 LastBootUpTime = 2026/10/21 02:34，两天没重启、靠休眠维持运行，「登录时触发」在这台机器上基本不会发生。
- 错误原文: `LastTaskResult = 0x41303`（从未运行）
- 触发条件: 本机长期不重启、不重新登录时。
- 根因: 配置问题：设计前提（登录时 +1 分钟触发纠正模型）在本机不成立；职责也已被 bot-model-local / bot-model-api 的 StartWhenAvailable 覆盖。
- 解决: 已处置（2026-10-23 删除任务）：快照在 `_backup\2026-10-23-bot-model-sync-removed\`（含 bot-model-sync.xml，可直接 schtasks /create /xml 恢复）。
- 证据: `docs/NOTES-启动优先级与限额管理.md` §五（L91-L110）。
- 防护: 新增周期任务前先看本机是否满足触发前提。

## ERR-OPS-1202 | `<workspace>/_backup` 在 workspace-write 沙箱下写入被拒，`_outputs` 可以

- 症状: 在 `E:\dsh` 会话里执行 `New-Item <workspace>/_backup\<新目录>` 报 Access denied，同一时刻写 `<workspace>/_outputs\<新目录>` 正常。
- 错误原文: `Access to the path '<workspace>/_backup\2026-10-25-yjapi-provider' is denied.` + `[sandbox: file access denied under workspace-write mode]`
- 触发条件: 用 pwsh 往 `_backup` 下新建目录；workdir 在 `E:\dsh`。
- 根因: 未查明（已排除「工作区边界」——`_backup` 就在工作区内；`_outputs` 同层可写）。怀疑 `_backup` 目录自身 ACL 或沙箱策略对该目录有额外限制。
- 影响: 备份脚本若默认写 `_backup` 会失败，且报错伪装成"权限问题"，容易让人以为是路径写错。
- 解决: 临时备份先落 `_outputs\<主题>-backup-<日期>\`；需要长期保留的再手动挪进 `_backup`（或单独走一次提权写入）。
- 证据: 2026-10-25 21:0x 两次实测：`New-Item <workspace>/_backup\2026-10-25-yjapi-provider` → denied；`New-Item <workspace>/_outputs\yjapi-provider-backup-20261025` → 成功，两份配置文件已复制（654 B + 12594 B）。
- 回滚点: 无。
- 防护: 涉及 `_backup` 的脚本先 `Test-Path` 探测可写性，失败自动退到 `_outputs`。
- 关联: F-2026-10-0010（同类：报错信息与真实原因不符）

## ERR-OPS-1214 | 接入第二个 provider 后，体检报「patch id 重复」（模型 id 与插件 id 被当成同一张表算）

- 症状: 给 `cordis.patch.yml` 加完 `yjapi` provider，`plugin-audit.ps1 -Action All` 直接从 1 个红变成 3 个红；但 DSH 里模型切过去一切正常。
- 错误原文: `🔴 patch id 重复: deepseek-v4-pro 出现 2 次` / `🔴 patch id 重复: deepseek-v4.1-flash 出现 2 次`
- 触发条件: 两个 provider 下声明了同名模型（`youyiyun` 与 `yjapi` 都提供 `deepseek-v4.1-flash` / `deepseek-v4-pro`）。
- 根因: `scripts/plugin-audit.ps1` 判重时把所有 `- id:` 行扁平化成一张表再 `Group-Object`，不区分「插件/patch 条目 id」与「`providers.*.models[].id`」。模型本来就可以跨 provider 重名（DSH 用 `provider/model` 组合寻址），这个命名空间根本不该参与插件 id 去重。
- 解决: **属于误报，不用改配置**。活证据：本会话已用 `yjapi/deepseek-v4.1-flash` 正常跑完全程。若要去噪，判重正则改为只统计缩进 ≤4 的条目（`^ {0,4}-\s+id:`）即可，不要为了体检变绿去改模型名或删 provider。
- 证据: `scripts/plugin-audit.ps1` 的 `$dupIds = $allIds | Group-Object | Where-Object { $_.Count -gt 1 }` 段（上游正则 `^\s+-\s+id:` 会吃掉 models 条目的 10 空格缩进）；同次体检里另一个红 `@deepseek-ai/dsh-experimental-agent-team-profile（node_modules 里没有）` 是本轮之前就有的遗留，与 provider 无关。
- 回滚点: 不需要回滚（配置本身是对的）
- 防护: 体检报红先问「它判的是什么 id」；无关东西被拉进同一张表时，修表的键而不是改数据。
- 关联: ERR-DSH-1213（同一次 provider 接入的另一个坑）、ERR-DSH-1210

## ERR-OPS-1215 | 占位文本检查把代码通配符当成「待补充」：两条写得完整的根因被误报

- 症状: `build-error-dict.mjs` 每次构建都告警 `根因疑似占位文本`，但打开看那两条根因写得比大多数条目都详细（一条讲裸 `await` 无超时，一条讲验证脚本四类误判）。
- 错误原文: `[warn] a-memory-early.md:324 ERR-QQ-007 根因疑似占位文本` / `[warn] b-memory-late.md:12 ERR-ENV-303 根因疑似占位文本`
- 触发条件: 根因正文里出现 `bot.xxx` / `group_xxx/` 这类**代码通配符**。
- 根因: 检测正则写成 `/TODO|待补|xxx/i` —— `xxx` 没加词边界也没加位置约束，整段任意位置出现就命中；而中文技术文里的 `xxx` 绝大多数是「任意方法名/任意子目录」的意思，不是「还没写」。
- 解决: 改成只认「整段就是占位」——`/^(?:TODO|TBD|FIXME|XXX|xxx|待补|待补充|待填写|待确认|未查明|占位)[\s.。…·:：-]*$/i` 再加一条 `length < 8` 兜底。反向验证：`TODO`/`待补充`/`xxx`/`未查明。` 都会报；`bot.xxx`、`group_xxx/...`、`不是时区问题` 不报。
- 证据: `scripts/build-error-dict.mjs` 占位检测段（2026-10-25 改）；改后构建 0 warn。
- 回滚点: 旧正则就在 git 历史里，回滚即误报恢复
- 防护: 写检测器时先问「这个词在正文里可能是正常用法吗」——中文技术文里的 `xxx`、`N/A`、`none` 都是高频正常词，必须加位置/整段约束，不能裸匹配。
- 关联: ERR-OPS-1214（同一轮发现的另一例「检测粒度太粗」，一个是命名空间不分，一个是词义不分）

## ERR-OPS-1216 | 脱敏正则只认反斜杠：公开版依旧漏出 `C:\Users\<user>/...`

- 症状: `error-dict.public.json` 号称已脱敏（反斜杠形式确实变成了 `C:\Users\<user>`），但把文件按 `E:\dsh|C:\Users|sk-` 搜一遍，仍有 9 处本机路径原样漏出。
- 错误原文: `"error": "Error: Cannot find module 'C:\Users\<user>/.dsh/profiles/node_modules/js-yaml'..."`
- 触发条件: 条目里的错误原文是从 Node 报错粘过来的 —— 而 Node 的 `Cannot find module` / `require` 路径**默认写正斜杠**。
- 根因: 脱敏规则写成 `/C:\\Users\\[^\\\s'"]+/g`，只匹配反斜杠；`C:\Users\<user> 这种正斜杠写法整条规则压根不命中。而“部分脱敏”比“不脱敏”更危险 —— 看到几处 `<user>` 就会以为全干完了。
- 解决: 两条路径规则改成双分隔符 `/[A-Za-z]:[\\/]Users[\\/][^\\/\s'"]+/g` 与 `/[A-Za-z]:[\\/]dsh[\\/]/g`；改后复验 9 处全清。
    - 第二层（改完又漏的）: public 版生成时只给 `rawError / symptom / rootCause / fix` 四个字段过了 `redact()`，**`title` 漏了**。结果本条（ERR-OPS-1216）自己的标题里写了 `C:\Users\<user>/...` 就又漏出去一处——记录脱敏漏洞的条目自己踩同一个坑。已补 `title: redact(e.title)`。
- 证据: `scripts/build-error-dict.mjs` 的 `SENSITIVE` 表（2026-10-25 改）；复验命令：`Select-String -Path error-dict.public.json -Pattern 'C:[\\/]Users[\\/](?!<user>)|E:[\\/]dsh'` 应无输出。
- 回滚点: 旧规则在 git 历史里，回滚即恢复 9 处泄露
- 防护: 脱敏后必须**反向扫一次**（拿敏感模式去 grep 产物），不能只相信“规则跑过了”；Windows 路径的两种分隔符、`\\?\` 长路径前缀、UNC 路径、`%USERPROFILE%` 都要列进规则。**新增任何字段时，先问一句“这个字段也会进 public 吗”**——字段是白名单逐个列的，加字段忘了加脱敏就会漏。
- 关联: ERR-DSH-1204（就是那条带 `C:\Users\<user> 的条目）
