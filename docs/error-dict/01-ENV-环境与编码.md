# 01 · 环境 · 编码 · 路径

> 这一卷收「东西没跑起来 / 中文变乱码 / 路径找不到 / 编码炸了」这类问题。
> 新增词条直接往下追加，骨架见 [_TEMPLATE.md](_TEMPLATE.md)。

共 23 条。

## ERR-ENV-001 | 中文 .ps1 丢了 UTF-8 BOM，PS 5.1 报几十处 ParseError、控制台还全是乱码

- 症状: 同一份含中文的 .ps1，在 pwsh 7 下跑得好好的，换成 `powershell.exe`（5.1）就整片解析错误；或者不报错但中文输出变成 `宸茬嫭绔嬪惎鍔?NapCat` 这种鬼画符。
- 错误原文: `health-check.ps1` 在 PS5.1 下 **62 个 ParseError**（384 个 `"` 只剩 342 个）；`launch-napcat-detached.ps1` 日志乱码 `宸茬嫭绔嬪惎鍔?NapCat...`；`switch-bot-model.ps1` 报 `Unexpected token`
- 触发条件: 用编辑工具整文件重写含中文的 .ps1（编辑工具不保留 BOM）；或新建 .ps1 时没写 BOM 却被 `powershell.exe` 5.1 调用。
- 根因: 无 BOM → PS5.1 按 GBK/系统代码页解码；中文全角符号的末字节把后面的 ASCII 引号吞掉，语法结构被破坏。PS7 按 UTF-8 解码，所以同一文件在 PS7 下看不出问题。
- 解决: `ReadAllText(UTF8)` → CRLF 归一 → `WriteAllText(UTF8Encoding($true))`；9 个缺 BOM 的 .ps1 全部补齐，复测 25 个 .ps1 全 0 错误。
    + ERR-ENV-301 补充: 恢复配方：ReadAllText(UTF8) → CRLF 归一 → WriteAllText(UTF8Encoding($true))；改完必须三查（读首 3 字节确认 EF BB BF、PS 7 ParseFile、显式调 powershell.exe 5.1 读 PARSE-ERRORS 计数）。中文 .vbs 存 UTF-16LE 或纯 ASCII 注释。
    + ERR-ENV-604 补充: 已处置：逐个补 UTF-8 BOM。验证：launch-napcat 输出恢复 `已独立启动 NapCat（PID 9404，父进程是 WmiPrvSE，不随 DSH 退出）`；health-check PS5.1 与 PS7 结果一致（36 通过 / 1 警告 / 2 失败）；9 个脚本 PS5.1 解析错误归零。
    + ERR-ENV-601 补充: 已处置：ReadAllText(UTF8) → CRLF 归一 → WriteAllText(UTF8Encoding($true))。改完必须三查：首 3 字节确认 EF BB BF / PS 7 ParseFile / 显式调 powershell.exe 5.1 ParseFile 并读 PARSE-ERRORS 计数。已按此复查通过。
    + ERR-ENV-301 补充: 恢复配方：ReadAllText(UTF8) → CRLF 归一 → WriteAllText(UTF8Encoding($true))；改完必须三查（读首 3 字节确认 EF BB BF、PS 7 ParseFile、显式调 powershell.exe 5.1 读 PARSE-ERRORS 计数）。中文 .vbs 存 UTF-16LE 或纯 ASCII 注释。
- 证据: `MEMORY-<name>.md` 第 1124–1136 行（2026-10-23 全量审计）；同文件第 699 行（switch-bot-model.ps1）
    + ERR-ENV-301（已并入）: `logs/failures/2026-10.jsonl` L31（F-2026-10-0030）；`MEMORY-<name>.md` L4398-4407、L6358-6361、L7169
    + ERR-ENV-604（已并入）: `docs/NOTES-机器人脚本审计与修复-20261023.md` §一.3（L35-L43）、§一.12（L92-L98）、§一.14（L110-L119）。
    + ERR-ENV-601（已并入）: `logs/failures/2026-10.jsonl` F-2026-10-0030（L31）；`docs/NOTES-机器人脚本审计与修复-20261023.md` §一.12（L92-L98）。
    + ERR-ENV-301（已并入）: `logs/failures/2026-10.jsonl` L31（F-2026-10-0030）；`MEMORY-<name>.md` L4398-4407、L6358-6361、L7169
- 回滚点: 无（纯文本修复）
- 防护: **改完 .ps1 必须复查 BOM**——编辑工具会把加好的 BOM 又覆盖掉（health-check 加完 BOM 被 edit 改回去，复测才发现还有 62 个错误）
- 关联: F-2026-10-0030
    + F-2026-10-0030
    + F-2026-10-0030（同一根因的另一例）
    + F-2026-10-0030

## ERR-ENV-002 | PS 5.1 的 Get-Content 默认按 GBK 读 UTF-8，59 行的文件被数成 11 行

- 症状: 校验记忆文件同步时，行数怎么都对不上，内容看起来「被合并」了，差点判成文件损坏。
- 错误原文: 无报错，只有结果错：`59 行的文件被数成 11 行`
- 触发条件: 在 PS5.1 里直接 `Get-Content` 一个 UTF-8 中文文件（不带 `-Encoding`）。
- 根因: PS5.1 默认按 GBK 解码，双字节汉字的首字节把换行符 `0x0A` 吃掉，多行被读成一行。
- 解决: 读中文文本必须 `Get-Content -Encoding UTF8`（或 `-Raw`）；写必须 `-Encoding UTF8`；复制用 `Copy-Item`（按字节搬，不过编码）。装了 PS7 后默认读法正常（同一份 78 行文件读出来就是 78 行）。
- 证据: `MEMORY-<name>.md` 第 141 行（2026-10-21 第二轮编码坑）；第 154 行（PS7 切换后对照）
- 回滚点: 无

## ERR-ENV-003 | .bat 致命组合是「LF-only + 非 ASCII」——注释被当命令执行

- 症状: 双击 .bat 冒出奇怪的「不是内部或外部命令」，甚至后面的命令行整段不执行；开机自启的唯一入口 `start-all.bat` 就这么坏着。
- 错误原文: `'銆? 不是内部或外部命令`；`'正在检查' is not recognized`（`check-dsh-env.bat`，echo 被吞了一半）
- 触发条件: .bat 里写了中文注释且行尾是 LF。
- 根因: cmd 按 OEM(GBK) 码页解析 .bat，LF-only + 非 ASCII 会让 cmd 的行边界错位。实测 `start-all.bat` 57 行里只有 3 行是 CRLF。
- 解决: 全文件转 CRLF，探针法验证 L2–L57 每行都正确执行。**认知纠正：致命组合是「LF-only + 非 ASCII」，不是「UTF-8 无 BOM」**，纯 CRLF + 中文 rem 完全正常。
- 证据: `MEMORY-<name>.md` 第 1114–1118 行；第 1068–1071 行；第 1127 行
    + ERR-ENV-603（已并入）: `docs/NOTES-机器人脚本审计与修复-20261023.md` §一.1（L11-L24）。
- 回滚点: 无
- 防护: 规矩定为「.bat 一律纯 ASCII」，中文注释写进 .md 或 .ps1
- 关联: F-2026-10-0001（同日机器人反复掉线的启动链路）
    + F-2026-10-0001（同日机器人反复掉线的启动链路）

## ERR-ENV-004 | ops_edit_file 改 CRLF 大文件：用 \n 拼的多行 oldText 一律 EDIT_CONFLICT

- 症状: 对同一个文件做多行替换，怎么改都报冲突；但单行替换能成功，于是很容易误判成「别的问题」。
- 错误原文: `EDIT_CONFLICT`
- 触发条件: 用 `ops_edit_file` 改 `qq-bridge/src/bridge.js`（CRLF 文件），`oldText` 用 `\n` 拼多行。
- 根因: 文件是 CRLF，`oldText` 必须自己用 `\r\n` 拼接才匹配得上；单行匹配不受行尾影响，所以症状非常迷惑。
- 解决: 多行 `oldText` 全部用 `\r\n` 显式拼接；改大 JS 文件前先确认行尾。
- 证据: `MEMORY-<name>.md` 第 186 行（2026-10-22 唤醒收敛节「编辑大文件坑（重要）」）
- 回滚点: 无

## ERR-ENV-005 | 写文件「看起来成功」，实际内容被静默改坏 / 根本没写入

- 症状: 写完读回来，代码里凭空多了字面量 `NaN`；或者改了半天下次读还是旧版本（136 行），但调用当时一点错都没报。
- 错误原文: `account-ops.js` 第 118 行被写成字面量 `NaN`；PS 里 `.Replace("a`n`nb", ...)` 的 `` `n `` 变成字面反斜杠+n 且**不报错**；run_code 报的只是 TS 层字符串转义错误
- 触发条件: ① 在 run_code 里用模板字符串拼 `newText` 写含 `${...}` 的 JS；② 在 PowerShell 里用 `.Replace()` 拼 `` `n ``；③ 通过 run_code 传大量转义字符给 `ops_write_file`。
- 根因: 模板字符串被 TS 当插值求值（`${...}` 变成 NaN）；PowerShell 那层的反引号在这个上下文没被解释成换行；`ops_*` 系列**不抛异常**，失败只用返回值表达，所以「调用返回了」被当成「写成功了」。
- 解决: 含 `${...}` 的代码改用字符串拼接或转义；改文件用单引号 here-string 或 Get-Content/Set-Content 拼数组；所有 `ops_*` 都要看 `changed`/`status`/`error`，写完 read 回来核对行数与内容。
- 证据: `MEMORY-<name>.md` 第 234 行；第 886 行；第 916–917 行；第 660 行（看门狗重写节「最大坑：ops_write_file 不抛异常」）
- 回滚点: 无
- 防护: 长脚本写盘后固定复查行数/内容，别只看返回码

## ERR-ENV-007 | 沙箱 DACL 缺 AD 权限 / 0o700 目录：7z 增量解压 Access Denied、mkdtemp 与 pip 全挂

- 症状: 往已经存在的目录里补解压，直接 Access Denied；Python 里建完临时目录，pip 和 tempfile 全线失败。
- 错误原文: `Access Denied`（7z 补子项）；`tempfile.mkdtemp` / pip 走 `os.mkdir(0o700)` 时的权限坑
- 触发条件: ① 用 7z 往已存在的目录增量子项；② DSH 沙箱下 Python 建 0700 临时目录。
- 根因: 沙箱 DACL 是 `W,D,DC`，没有 `AD`（追加子项）权限；`os.mkdir(0o700)` 建出来的目录受限 token 不可写。
- 解决: 先解压到 `_outputs\` 或临时目录再 `robocopy` 搬；quant 项目用 `pyenv/sitecustomize.py`（把 mkdtemp 默认 mode 改掉 + 吞掉 `_resetperms` 的 chmod 失败）。
- 证据: `MEMORY-<name>.md` 第 968–969 行；第 1469 行；第 2253、2272 行（量化助手踩坑）
    + ERR-ENV-608（已并入）: `docs/NOTES-本地视频生成-gfx1031-实测.md` §三.3（L39-L40）。
- 回滚点: 无
- 防护: `projects/quant/pyenv/sitecustomize.py` 是 DSH 沙箱兼容层，**别删**

## ERR-ENV-008 | 配置文件放错目录或改了名 → 报「缺 key」/ 配置完全不生效

- 症状: 明明写了 API key 却报缺 key；ComfyUI 的模型路径配置写了却完全不认。
- 错误原文: `缺少 sensenova_api_key`；`extra_model_paths.yaml` 在 ComfyUI 0.42 下不生效（已改名 `extra_models_config.yaml`）
- 触发条件: ① 把 SenseNova key 存进 `qq-bot/secrets.json`；② 沿用 `extra_model_paths.yaml`。
- 根因: `bridge.js` 的 `ROOT = path.resolve(__dirname, '..')` 解析到 `<workspace>/qq-bridge`，读的是 `qq-bridge/secrets.json`；ComfyUI 0.42 换了配置文件名。
- 解决: key 写进 `qq-bridge/secrets.json`；模型路径最稳是直接 `robocopy` 进 `ComfyUI\models\`。
- 证据: `MEMORY-<name>.md` 第 549 行；第 970 行；第 1470 行
    + ERR-MEDIA-780（已并入）: `docs/NOTES-本地视频生成-gfx1031-实测.md` §三.4（L41-L42）。
- 回滚点: 无

## ERR-ENV-009 | 资源耗尽被误判成「驱动掉了」：真凶是虚拟内存 + 语音训练

- 症状: 生成跑着跑着进程没了，第一反应是 AMD 驱动/ROCm 炸了，差点把锅全算在刚跑的程序头上。
- 错误原文: 系统日志 6:09~6:48 连续 7 条 `Resource-Exhaustion-Detector`：`python.exe 使用了 21592014848 字节`（≈20.1GB）
- 触发条件: ComfyUI 与语音训练同时跑（提交上限 = 物理 31.9GB + 页面文件 12.7GB = 44.3GB，单次就要 20GB+）。
- 根因: 提交内存超限。真正占大头的是 `D:\dsh-voice\sovits\so-vits-svc-fork` 的 `svc.exe train -c configs\kokoro\config.json`（11.76GB 物理 / 15.35GB 提交），不是 ComfyUI。
- 解决: 报「资源不足」之前先 `Get-Process | Sort WorkingSet` 看是谁占的；当次决定「先不调页面文件、本地视频这条线暂停」。
- 证据: `MEMORY-<name>.md` 第 1450–1462 行
- 回滚点: 无
- 防护: 别看到自己刚启动的程序就默认是它

## ERR-ENV-010 | Python 中文输出编码三连：rich emoji 崩、表格乱码、invalid PYTHONUTF8

- 症状: 训练脚本一打日志就崩；pwsh 里跑 Python 打出来的中文表格全是乱码；bat 里设了变量还说环境变量非法。
- 错误原文: rich 在 GBK 下写 emoji 直接崩；Python 报 `invalid PYTHONUTF8`
- 触发条件: ① rich/emoji 输出到重定向文件；② pwsh 直接跑 Python 打中文表格；③ bat 里写 `set A=1 && …`（带尾随空格）。
- 根因: 控制台/重定向的代码页不是 UTF-8；`set A=1 && ...` 的尾随空格被算进变量值。
- 解决: `PYTHONIOENCODING=utf-8` + `PYTHONUTF8=1` + `chcp 65001` + 日志重定向（已固化进 bat）；pwsh 侧设 `[Console]::OutputEncoding=[Text.Encoding]::UTF8`；bat 写 `set "A=1"`。
- 证据: `MEMORY-<name>.md` 第 2212 行；第 2273 行；第 2213 行
- 回滚点: 无

## ERR-ENV-302 | 给 $HOME 赋值当移动目标，$dst 变空，9 个项目被移到了 C:\Users\<user>

- 症状: 数据剥离脚本跑完，日志说"搬好了"，但目标目录里那 9 个东西不见了；实际全落在 C:\Users\<user> 下。若没立刻核对就重启桥接，她会看到空目录、记忆全空。
- 错误原文: `$home = "<workspace>/qq-bridge\state\lanyin"` + `Move-Item $src $dst`（$dst 为空）
- 触发条件: 在 PowerShell 脚本里给 `$home` 赋值，随后把它派生出的变量当 Move-Item 的目标。
- 根因: `$HOME` / `$PID` 是 PowerShell 只读自动变量，赋值不生效，`$dst` 解析为空 → 移动目标退化成当前用户目录。
- 解决: 变量改名 `$lanyinHome` / `$dest`；动迁前后各打印一次目标的绝对路径再执行；同类只读变量还有 `$pid`（查端口对应进程时不能写 `$pid = $conn.OwningProcess`）。
- 证据: `MEMORY-<name>.md` L3350-3360、L4419
- 回滚点: 无（把误移的 9 项移回即可）
- 防护: 脚本里不用 `$home` / `$pid` / `$host` 当自定义变量名

## ERR-ENV-303 | 迁移验证脚本四类误判：0 文件/0 KB、role=1 字符、[int] 强转只在 stderr 报错

- 症状: 验证脚本报 `media-cache 0 文件 / 0 KB`、`role = 1 字符`，两次都差点当成"67 个文件 / 36.7 MB 全丢了"去抢救；另有一次 `[int]$c.unread` 抛类型转换错，但错误只出现在 stderr，主输出看起来完全正常。
- 错误原文: `无法将类型 System.Object[] 转换为 System.Int32`
- 触发条件: 用 readdirSync 数按群分子目录的 media-cache；把 JSON 对象的 role 当字符串取 `.Length`；对 `social-v2.json` 的 `unread` 做 `[int]` 强转。
- 根因: 三层同类错——只数顶层目录（media-cache/group_xxx/... 的二级文件全不计）、role 是对象 `{name, hint}` 而 `.Length` 返回属性个数 1、unread 是消息对象数组不是数字。
- 解决: 递归统计（实测 media-cache 36724.1 KB / 67 文件，与搬前一致）；判断内容前先看返回值类型；数组取 `.Length`。
- 证据: `MEMORY-<name>.md` L3362-3388、L4409-4413
- 回滚点: 无
- 防护: 验证脚本必须打印"总数 + 抽样路径"，只打印计数等于没验证

## ERR-ENV-304 | 搬完数据目录后周边脚本静默读不到旧路径，20 分钟一次的采样开始长出两份心路

- 症状: 把她的数据从 `state\` 搬进 `state\lanyin\` 后，没有任何角色或脚本知道搬家了。sync-heart.ps1 礼貌地说「跳过：long-term-memory.json 不存在」然后什么都不做；健康检查报 [FAIL] 二代会话状态 / [WARN] 表情库缺失；journey-sampler 每 20 分钟读 `state/psyche`，采不到情绪；journey-card.mjs 往旧路径写卡；journey.js 写死 state/journey。
- 错误原文: `跳过：long-term-memory.json 不存在`
- 触发条件: 迁移 `qq-bridge\state\` 下的数据子目录之后。
- 根因: 主链路有 `stateDir` 参数好改，但周边脚本各自写死 `state/psyche`、`state/journey`；它们不报错，只悄悄读不到，然后**该做的事没做**。bridge.js 里原本有 26 处 `path.join(STATE_DIR, ...)` 硬编码。
- 解决: bridge.js 加 `LANYIN_DIR` + `herFile()`，14 处引用全改；journey.js / journey-sampler.mjs / journey-card.mjs / sync-heart.ps1 / health-check.ps1 逐个改；4 个 docs 8 处路径。实测 sync-heart「没有新内容」、health-check [OK] 190.8 KB / [OK] 21.7 KB、采样进程 PID 15368 读新路径无报错。
- 证据: `MEMORY-<name>.md` L3390-3415、L3467-3471；`logs/failures/2026-10.jsonl` L27（F-2026-10-0026）
- 回滚点: _backup\2026-10-24-lanyin-home\
- 防护: 搬目录后要查的不只是主链路，还有所有"顺便读一下"的脚本；迁移完必须跑 `scripts\health-check.ps1` + `sync-heart.ps1` 双验证
- 关联: F-2026-10-0026

## ERR-ENV-305 | 子进程（node/python/curl）写 projects\local-video 一律 EPERM，同一时刻 DSH 原生文件工具却能写

- 症状: 下载模型、pip 装依赖时，node / python / curl 往 `projects\local-video\` 写文件全部失败退 EPERM；而同一秒用 `ops_write_file` 写同一目录成功。
- 错误原文: `EPERM`
- 触发条件: 沙箱子进程向 `<workspace>/projects\local-video\` 及 ComfyUI 目录写文件。
- 根因: 未查明（已排除磁盘只读、目录不存在、磁盘满：同路径用 DSH 原生文件工具可写、文件系统可写）。
- 解决: 写这些路径时显式申请 `sandbox_permissions: danger-full-access`（每次申请会弹一次审批）；或让人类手动执行写入。
- 证据: `MEMORY-<name>.md` L4626-4628
- 回滚点: 无
- 防护: 往 `projects\local-video\` 落文件前先测一次写权限，别等下载完才发现

## ERR-ENV-306 | 嵌入式 Python 的 python312._pth 接管 sys.path，同目录模块 import 不进来

- 症状: 在 ComfyUI 的嵌入式 Python 里跑自己写的脚本，脚本同目录的模块导不进来——`sys.path[0]` 指向的是 ComfyUI 目录，不是脚本目录。
- 错误原文: `sys.path[0]` 指向 ComfyUI 而非脚本目录（同目录模块导入失败）
- 触发条件: 用 ComfyUI 自带的嵌入式 Python 3.12 跑 `_env.py` / `train_lora.py` 这类与依赖同目录的脚本。
- 根因: `python312._pth` 接管了 sys.path 初始化，脚本目录不在搜索路径首位。
- 解决: 脚本开头 `sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))`；这一行必须写在 `import _env` **之前**，否则先触发导入失败。
- 证据: `MEMORY-<name>.md` L4637-4640
- 回滚点: 无
- 防护: 嵌入式 Python 环境里，"同目录能 import"是错觉，一律显式插 sys.path

## ERR-ENV-307 | MIOpen 调优缓存写不进沙箱外目录，训练脚本一跑就 miopenStatusInternalError

- 症状: AMD 卡上跑训练，第一步就报 MIOpen 访问 SQLite 数据库内部错误；另一次是 `from_single_file()` 拉 config 时需要建 symlink，直接 PermissionError。
- 错误原文: `MIOpen Error: Internal error while accessing SQLite database` / `miopenStatusInternalError` / `PermissionError`
- 触发条件: 默认 MIOpen 缓存写 `C:\Users\<user>\.miopen\db`（workspace 之外）；HF hub 缓存机制需要 symlink（Windows 上要管理员或开发者模式）。
- 根因: 缓存目录落在沙箱外被拒；Windows 建 symlink 需特权。
- 解决: 设 `MIOPEN_CUSTOM_CACHE_DIR=<workspace>/douyin-ops\datasets\lanyin-lora\.miopen-cache` + `MIOPEN_FIND_MODE=FAST`；把 SDXL 的 config 文件集（14 个小文件，共 3.2 MB）下到本地，用 `from_single_file(path, config=<本地目录>)` 完全离线加载。
- 证据: `MEMORY-<name>.md` L4642-4654
- 回滚点: 无
- 防护: 凡是有"默认写在用户目录"的缓存，进这个工作区先改到项目目录下

## ERR-ENV-308 | Docker Desktop 装了但引擎起不来：WSL2 没装 + BIOS 虚拟化是关的

- 症状: Docker Desktop 4.96.3 装好了，`docker version` 的引擎段空返回；WSL 报没有已安装的发行版；再查 `VirtualizationFirmwareEnabled = False`、`HypervisorPresent = False`。而且人类那次"重启"实际没重启——`LastBootUpTime` 仍是 07:26，已运行 12.5 小时（可能被 Windows 更新吞了）。
- 错误原文: `适用于 Linux 的 Windows 子系统没有已安装的发行版`
- 触发条件: 想用 Docker 跑 Hindsight（`ghcr.io/vectorize-io/hindsight`）时。
- 根因: 两级硬阻塞叠加：① WSL2 未安装；② 主板 BIOS 里 Intel VT-x 关闭（i7-10700KF 支持但没开）。
- 解决: `wsl --install --no-distribution`（管理员）+ 重启；BIOS：开机 Del → F7 Advanced Mode → Advanced → CPU Configuration → Intel(R) Virtualization Technology → Enabled → F10。`scripts\setup-hindsight.ps1` 第一步就检查虚拟化，没开直接停，不瞎跑。
- 证据: `MEMORY-<name>.md` L6511-6516、L7079-7093、L7167-7178
- 回滚点: 无
- 防护: 报"已重启"要核对 `LastBootUpTime`，别信操作的意图，信系统记的时间

## ERR-ENV-309 | 沙箱权限在对话里批准不算数，必须在具体操作上申请

- 症状: 用 ask_user_question 弹窗问"要不要给我写权限"，人类选了 danger-full-access，**但运行时策略没变**，写入 `state\lanyin\` 仍被拦；改成在 pwsh 调用上带 `sandbox_permissions: danger-full-access` + `justification`，第一次就成功，文件直接写进素材库。
- 错误原文: 写入被拒但无错误码（`state\lanyin\` + OneDrive 备份目录）
- 触发条件: 需要写 workspace 外或 ACL 保护目录（`state\lanyin\`、`_backup\`、OneDrive）。
- 根因: 审批是**操作级**的，不是对话级/会话级；在对话里"同意"不会改变运行时沙箱策略。
- 解决: 在具体那一次工具调用上带 sandbox_permissions + 理由申请，批准后本次操作生效；写之前先跑一次写权限探测，别写完才发现被拒。
- 证据: `MEMORY-<name>.md` L6667-6679、L5806-5816
- 回滚点: 无
- 防护: 写受保护目录前先测；需求写"这一条操作要写哪个路径"，不要笼统问"给我权限"

## ERR-ENV-605 | napcat-watchdog L1 分支捕获 powershell.exe 输出未做编码保护，跨进程乱码

- 症状: watchdog 的 L1 分支捕获 powershell.exe 输出时中文乱码；L2 分支此前已修，L1 漏了。
- 错误原文: `未查明（文档未记录 L1 的具体乱码文本）`
- 触发条件: napcat-watchdog.ps1 的 L1 分支（第 81 行）捕获 powershell.exe 输出时。
- 根因: 捕获子进程输出时未设 [Console]::OutputEncoding 保护，父进程按错误代码页解码子进程的 UTF-8 字节。
- 解决: 已处置：L1 分支包上 [Console]::OutputEncoding 保护，与 L2 一致。
- 证据: `docs/NOTES-机器人脚本审计与修复-20261023.md` §一.4（L45-L48）。（同一脚本族的计划任务）

## ERR-ENV-606 | 二维码路径硬编码 versions\9.9.33-52230，NapCat 一升级就失效

- 症状: qr-login.ps1 / qr-watch.ps1 / show-qr.ps1 / napcat-watchdog.ps1 四处写死 `versions\9.9.33-52230\...qrcode.png`，而 versions\ 下实际有两个版本目录；NapCat 一升级这四个脚本就找不到码。
- 错误原文: 无报文级错误（路径 `versions\9.9.33-52230\...qrcode.png` 失效）
- 触发条件: NapCat 升级或 versions\config.json 的 curVersion 变化后。
- 根因: 路径按版本号硬编码，没有统一解析层。
- 解决: 已处置：新增 qq-bridge\napcat-paths.ps1，按 versions\config.json 的 curVersion 解析；读不到时退 baseVersion，再退唯一版本目录（多个就报错，不瞎猜）；ffmpeg 路径改为先查 PATH。
- 证据: `docs/NOTES-机器人脚本审计与修复-20261023.md` §一.9（L74-L80）。
- 防护: AGENTS.md 第 9 条「不要写死 versions\9.9.33-52230」。

## ERR-ENV-607 | zip 内文件名是 GBK 且未置 UTF-8 标志位，解压出来全是乱码文件名

- 症状: ai (1).zip（342,680,210 字节）里的文件名是 GBK 编码且没有 UTF-8 标志位，PowerShell / 资源管理器直接解压得到 `?籥?` 这类乱码名，无法按名索引文件。
- 错误原文: 无报文级错误（解压后文件名形如 `?籥?`）
- 触发条件: 用 Windows 自带解压 / PowerShell Expand-Archive 解压非 UTF-8 标志的 zip 时。
- 根因: zip 规范默认 cp437 解码，中文文件名按 GBK 写入且未置 UTF-8 标志位；Windows 解压链按错误编码解释字节。
- 解决: 已处置：用 Python zipfile 取原始文件名字节后 `raw.decode('gbk')` 还原，再解压到 `_outputs\ai-zip-inspect\`（2092 个文件，约 500 MB+）。
- 证据: `docs/RESEARCH-ai压缩包解析.md` §1（L39-L41）、§7 可复现步骤。
- 防护: 处理中文 zip 先看是否置 UTF-8 标志位；没有就用 zipfile + decode('gbk')。

## ERR-ENV-902 | 含中文的 .ps1 存成 UTF-8 无 BOM，powershell.exe 5.1 按 ANSI 解码 → ParseError / "字符串缺少终止符"

- 症状: 同一脚本 pwsh 7 下全绿，powershell.exe 5.1 一解析就崩；报"字符串缺少终止符"以及成批 PARSE-ERRORS；文件首 3 字节不是 `EF BB BF`。同源问题还有中文 .vbs 存 UTF-8 无 BOM，wscript 按 GBK 读，注释变乱码。
- 错误原文: `The string is missing the terminator: ".` + `ParserError ... FullyQualifiedErrorId : TerminatorExpectedAtEndOfString`；本机计数形态 `PARSE-ERRORS: 25`
- 触发条件: 用编辑工具整文件重写含中文（或任何非 ASCII，如 `ℹ`、全角括号逗号）的 .ps1，BOM 被吃掉之后，由 `powershell.exe` 5.1 加载 —— 包括"被 pwsh 7 脚本以 `& powershell.exe` 调起来"这种间接路径。
- 根因: **上游确认**。官方文档 `about_Character_Encoding` 原文："If you need to use non-Ascii characters in your scripts, save them as UTF-8 with BOM. Without the BOM, Windows PowerShell misinterprets your script as being encoded in the legacy \"ANSI\" codepage."，同一页还写明 "ANSI is also what the PowerShell engine uses when it reads source code from files"。PS 6+ 默认 `utf8NoBOM`，所以 PS 7 看不出问题 —— 这就是"只在一台解释器上炸"的原因。
- 解决: 本机做法：`ReadAllText(UTF8)` → CRLF 归一 → `WriteAllText(UTF8Encoding($true))`；改完必须三查（首 3 字节 `EF BB BF`、PS 7 解析、显式调 `powershell.exe` 5.1 读 PARSE-ERRORS 计数）。上游建议（官方文档）：非 ASCII 脚本一律存 UTF-8 **with BOM**（PS 7.1+ 对应 `-Encoding utf8BOM`）；Microsoft Q&A 3850223 另给两条同效 workaround —— 存成 ANSI（会替换掉原字符）或升到 PowerShell 7.5（该 bug 不复现）。反向提醒也来自官方文档：带 BOM 的 UTF-8 在 Unix 侧可能出问题，所以只给 Windows 专用脚本加 BOM。
- 证据: [about_Character_Encoding（Microsoft Learn）](https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.core/about/about_character_encoding)；[Microsoft Q&A 3850223 · PowerShell 5.1 Parser Bug: Failure to Parse UTF-8 (No BOM) Script Containing Unicode Characters](https://learn.microsoft.com/en-us/answers/questions/3850223/powershell-5-1-parser-bug-failure-to-parse-utf-8-n)；本机 `MEMORY-<name>.md` L4398-4407、L1121-1136；`docs/NOTES-机器人脚本审计与修复-20261023.md` L35-42、L94-98
- 回滚点: 无（纯文本修复）
- 防护: **上游确认**：BOM 是 PS 5.1 读非 ASCII 源码的**必要条件**，不是保险措施。本机规矩「含中文 .ps1 必须带 BOM，且改完复查」正好落在官方建议上；"转 ANSI/GBK 也能跑"是文档列出的次优 workaround（有损），不采用。
- 关联: ERR-ENV-301（同坑的本机记录）

## ERR-ENV-1203 | YAML 解析器把 `off:` 当布尔键，Python 校验报 "`'<' not supported between 'str' and 'bool'`"

- 症状: 用 python PyYAML 校验 `cordis.patch.yml` 的 `reasoningEfforts` 段时抛 TypeError，看起来像配置写错，实际 DSH（js-yaml）加载正常。
- 错误原文: `TypeError: '<' not supported between instances of 'str' and 'bool'`
- 触发条件: PyYAML 按 YAML 1.1 解析 `off: 'off'` 这一行——`off` 在 1.1 里是布尔字面量，key 被解析成 `False`。
- 根因: YAML 1.1 的「挪威问题」（Norway problem）：`on/off/yes/no` 都是布尔。js-yaml v4 默认走 YAML 1.2 核心 schema，`off` 是普通字符串，所以 DSH 侧完全正常。
- 影响: 同一份 YAML，Python 校验器报错、Node 校验器通过，容易误改一份好配置。
- 解决: 校验 DSH 配置必须用 DSH 自己的解析器：`require('C:\Users\<user>/AppData/Local/Programs/DSH Desktop/resources/app/node_modules/js-yaml').load(fs.readFileSync(f))`。PyYAML 只用来做宽松结构检查，且要把 key 全部 `str()` 化再比较。
- 证据: `_outputs/verify-yaml.py`（PyYAML 6.0.3）报错；`_outputs/` 同内容经 js-yaml 解析输出 `providers: deepseek, youyiyun, yjapi` 且 reasoningEfforts 三档齐全。
- 回滚点: 无。
- 防护: 配置校验脚本固定用 js-yaml；`scripts/build-error-dict.mjs` 这类 Node 脚本天生规避。
- 关联: F-2026-10-0008（reasoningEfforts 声明缺失会把模型挡在门外，校验器必须可信）

## ERR-ENV-1217 | git archive 打 tar + Windows tar.exe 解包，中文文件名变八进制转义，文件静默丢失

- 症状: 为验证「别人 clone 下来能不能跑通」，用 `git archive` 打 tar，再用 Windows 自带 `tar.exe` 解到临时目录；解完只剩 15 个文件（应 19 个），4 个带中文的卷名根本没落地，而命令"看起来跑完了"。
- 错误原文: `docs/error-dict/01-ENV-\257\345\242\203与编码.md: Invalid empty pathname: Unknown error`（4 个中文卷名各一行，中文被转成八进制）末尾 `tar.exe: Error exit delayed from previous errors`
- 触发条件: `git archive -o x.tar HEAD` 后用 `C:\Windows\System32\tar.exe -xf x.tar` 解开，且仓库里有非 ASCII 文件名。
- 根因: git 写 tar 时按 UTF-8 存文件名但没置 pax 的 UTF-8 标志；Windows 的 bsdtar 按当前 ANSI 代码页解码，得到非法字节序列后**放弃这几个条目**，并把解码为空的路径报成 "Invalid empty pathname"。不是权限、不是磁盘。
- 影响: 只影响"离线自测干净副本"这一步，不影响交付；真正的危害是静默——tar 退出码为 1、被夹在一屏 stderr 里，只数"抽出文件数"会以为成功。
- 解决: 干净副本不要走 tar。两条路：① `robocopy 源 目标 /E /XD .git`（本机采用，19 文件 / 8 卷 / 128 条，`--check` 通过）；② `git clone` 本地路径——但沙箱里 git 会起 `sh.exe` 建信号管道被拦（`*** fatal error - couldn't create signal pipe, Win32 error 5`），所以最终用 robocopy。
- 证据: 2026-10-26 22:0x 本机实测（`_outputs\ed-clone-test`、`_outputs\ed-head.tar`）；`docs/error-dict/_public/scripts/build.mjs`
- 回滚点: 无（只动了 `_outputs\` 下的临时目录与 tar 包，已删）
- 防护: 解包后**先数文件数再跑校验**，两个数对不上就当失败；沙箱内 `git clone` 不可用属于已知边界（管道被拦），别硬试。
- 关联: ERR-OPS-1217（同一轮暴露：文件少了，校验却报通过）
