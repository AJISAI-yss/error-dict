# 05 · 图片 · 视频 · 音频 · 表情

> 这一卷收「图片视频看不懂 / 抽帧失败 / 模型 OOM / 表情取不到图」这类问题。
> 新增词条直接往下追加，骨架见 [_TEMPLATE.md](_TEMPLATE.md)。

共 16 条。

## ERR-MEDIA-001 | 表情库被清空成 0 条：12 条收藏表情全没了，且没有备份

- 症状: 桥接重启后日志说 `已同步 QQ 收藏表情 0 个（本地库 0 条）`，本地 `state/stickers.json` 被写成 `[]`。
- 错误原文: `已同步 QQ 收藏表情 0 个（本地库 0 条）`
- 触发条件: 网关 `fetch_custom_face_detail` 返回 `data: []`（实测 count=50/100/500 全是空数组，而 `get_login_info` 正常），同时 `sticker-lib.js` 的 `mergeStickerLibrary` 拿到 `complete=true`。
- 根因: `mergeStickerLibrary` 在 `complete=true` + `fetchedIds` 为空时，把所有 `source:'qq'` 条目当成「用户已删除」清掉了。诱因是 QQ 账号侧真没了（登录态问题），不是桥接的锅——但桥接不该因此清库。
- 解决: 加 `if (fetchedIds.size === 0) return out;`——**空结果一律不清库**。实测：3 条本地 + 空结果 → 保留 3 条（修复前为 0）；3 条本地 + 返回 2 条 → 正确保留 2 条，正常删除推断不受影响。
- 证据: `MEMORY-<name>.md` 第 637–643 行（第十六节）
- 回滚点: 无（腾讯侧不提供恢复接口）
- 防护: 丢的表情只能在手机/PC 的 QQ 里重新收藏；无法区分「用户真清空了」和「网关这次没拿到」时，选择不清库

## ERR-MEDIA-002 | ENAMETOOLONG：add_custom_face 只认文件路径，传 base64:// 会被当路径去 stat

- 症状: 收藏表情功能上线后**一次都没成功过**，日志里六次失败都在同一处；另外还伴随一个 ReferenceError 掩盖真相。
- 错误原文: `ENAMETOOLONG`（NapCat 把 `base64://…` 当文件路径去 stat）；伴生 `assertSendAllowed is not defined`
- 触发条件: 调 `add_custom_face` 时传 `base64://` 图片数据。
- 根因: NapCat 的 `add_custom_face` 只接受文件路径。日志里 01:10/01:11/03:35/11:47/12:08/16:28 六次失败全是这个原因。
- 解决: 新增 `addFaceFromBuffer()`——先把字节写到 `os.tmpdir()` 的临时文件，传路径，`finally` 里删。另外 `add_custom_face` 成功只回 `{result:0, isExist:0}`、**没有 emoji_id**，靠「添加前记录现有 id 集合 → 添加后轮询 `syncStickerLibrary` 最多 6 次、间隔 1.2s → 前后 diff」拿新增条目（**不要用 md5 匹配**，QQ 可能重编码）。
- 证据: `MEMORY-<name>.md` 第 492–504 行（第三十二节）
- 回滚点: 无
- 防护: 测试时往用户收藏夹加了 3 张（地球/加载/纯黑），如需清理可在 QQ 表情管理里删

## ERR-MEDIA-003 | 收藏表情取不到图：市场 CDN 的 gif/png 全部 404，真实地址在 p.qpic.cn

- 症状: 群友发来的表情、机器人自己收藏的表情都拿不到图，日志里一串「获取失败」。
- 错误原文: 市场 CDN `https://gxh.vip.qq.com/club/item/parcel/item/<前2位>/<id>/raw300.gif` 返回 **404 / 0 字节**；真实地址 `https://p.qpic.cn/qq_expression/<QQ>/<resId>/0` 抽样 6/6 全部 200（1~2.4MB）
- 触发条件: `emojiCdnCandidates()` 用市场表情的域名去拼**账号收藏的表情**地址。
- 根因: 两套 CDN 域名混用——收藏表情根本不在市场域名下。GIF 本身一直是支持的（格式识别、mime、尺寸解析、DSH 接收、8MB 上限全绿）。
- 解决: 新增 `stickerUrlFromLibrary(emojiId)`（把 `stickers.json` 的 `md5 -> url` 建映射，缓存 5 分钟），在候选 URL 顺序里把库 URL 排到市场 CDN 前面；失败日志降噪成一行。
- 证据: `MEMORY-<name>.md` 第 404–424 行（第四十节附近的 GIF 排查节）
- 回滚点: 无
- 防护: 群友发的、机器人没收藏过的表情客观上取不到，现在会静默降级成 `[表情#id]`——**这不是 bug**，别再去调 gif 处理逻辑

## ERR-MEDIA-004 | 模型没有视觉能力却返回 image 块 → DSH 把整条响应（含文字）一起丢掉

- 症状: 她「看不见图」，连转述的文字也一起没了；判断模型有没有视觉能力时我两次看错。
- 错误原文: `model "<model>" does not declare image input`（`@deepseek-ai/dsh-mcp-client` 抛错）
- 触发条件: 中转站模型没有视觉能力，工具仍返回 `type:'image'` 内容块。
- 根因: DSH 侧 `if (!info.inputModalities.includes("image")) throw new Error(...)` → 整条响应作废，连文字描述一起丢。另：**判断视觉能力要看 `usage.prompt_tokens_details.image_tokens`（0 = 没有视觉），不能用 `read_image` 测**——那是 DSH 自己的视觉通道，不是 QQ 会话走的那条路。
- 解决: 新增 `shouldOmitImageBlock()`，改了 4 处工具：模型无视觉时不返回 image 块，只返回文字转述。
    + ERR-MEDIA-775 补充: 已处置：模型无视觉能力时不返回 image 块、只返回文字——新增 shouldOmitImageBlock()（默认跟随 describe.enabled）；改了 4 处工具（qq_get_message_images / qq_get_sticker_image / qq_get_self_image / 另一处图片工具）。
- 证据: `MEMORY-<name>.md` 第 1317–1361 行（第五十节，含 `image_tokens: 0` 判据）；第 1333–1341 行
    + ERR-MEDIA-775（已并入）: `docs/NOTES-<name>感知与记忆能力-20261024.md` §一.故障3（L62-L84）。
- 回滚点: `_backup\2026-10-23-fix-image-path\`、`-vision-fallback\`
- 防护: 「改好了但用户说不行」先问：我的验证路径和用户的执行路径是同一条吗
- 关联: F-2026-10-0013、F-2026-10-0019
    + F-2026-10-0013、F-2026-10-0019

## ERR-MEDIA-005 | 腾讯图片 URL 几十秒就过期；QQ 给的扩展名还会撒谎（.png 实际是 GIF89a）

- 症状: 刚收到的图晚几十秒去读就 400；读图工具还直接拒绝某些文件（扩展名与实际格式不符）。
- 错误原文: 腾讯图片 URL 过期后取图返回 `400`；按扩展名当 PNG 打开被读图工具拒绝
- 触发条件: 收信后才去下载图片（URL 时效极短）；或直接用 QQ 给的扩展名当真实格式。
- 根因: 图片 URL 是临时签名；QQ 报的扩展名不可信。
- 解决: `precacheMessageMedia` 收信即落盘（绕开 URL 过期）+ `sniffImageMime` 看文件头不信扩展名；配合 `describeImages`（免费 Qwen2.5-VL-72B）转述、`describeAnimation` 抽 5 帧按时间顺序理解动画（视频走同一通道）。
    + ERR-MEDIA-776 补充: 已修并实测（F-2026-10-0017-RESOLVED）：加 sniffImageMime 按文件头识别（89 50 4E 47→png / 47 49 46→gif / FF D8 FF→jpeg / RIFF....WEBP→webp）；describeAnimation 用 ffmpeg 均匀抽 5 帧交视觉模型按时间顺序理解；fetchMediaData 补传 path 供 ffmpeg 读取。实测同一张猫 GIF：单帧只能描述「站立遮脸」，5 帧能完整描述「双手抱胸→抬右手→举高→出现橙色物体→放下，整体是跳舞，传达欢快自信」。
    + ERR-MEDIA-774 补充: 已处置：收到消息的当下就下载落盘——收信 → precacheMessageMedia() → state\media-cache\<group_群号|private_QQ号>\<文件名>，读图时 readCachedMedia() 优先命中；每小时 pruneMediaCache 清理一次，保留 7 天、总量上限 200MB。
- 证据: `MEMORY-<name>.md` 第 1317–1371 行（第五十节能力表）
    + ERR-MEDIA-776（已并入）: `logs/failures/2026-10.jsonl` F-2026-10-0017（L16）、F-2026-10-0017-RESOLVED（L18）；`docs/NOTES-<name>感知与记忆能力-20261024.md` §一.故障4（L88-L105）、§二（L109-L132）。
    + ERR-MEDIA-774（已并入）: `docs/NOTES-<name>感知与记忆能力-20261024.md` §一.故障2（L41-L58）。
- 回滚点: `_backup\2026-10-23-media-precache\`、`-gif-video-frames\`
- 防护: 视频转述必须放在 `fs.rm(temp.dir)` **之前**，否则源文件已删、ffmpeg 读不到
- 关联: F-2026-10-0013
    + F-2026-10-0016
    + F-2026-10-0013

## ERR-MEDIA-006 | QQ 发视频三种编码全失败：相对路径、绝对路径、base64 各挂一种

- 症状: 本地视频做好了发不出去，换着花样试完三种编码方式全部失败。
- 错误原文: `识别URL失败`（给 OneBot 传相对路径）；`NodeIKernelMsgService/sendMsg Timeout`（传 `base64://` 数据 URL）
- 触发条件: 用 `qq_send_image` 发 mp4；文件不在 assets/ 或 state/ 下；或一步给 base64。
- 根因: `qq_send_image` 只收 assets/ 或 state/ 下的相对路径；网关不认相对路径；QQ 网关对视频段支持有限。**别再试第三种编码方式了。**
- 解决: 先把文件拷进 `qq-bridge\state\generated\`；结论是「视频目前发不出去，只能发路径让用户自取」。
- 证据: `MEMORY-<name>.md` 第 990–994 行；第 1473–1474 行
- 回滚点: 无
- 防护: 给用户发技术内容时不要写完整 Windows 路径——路径 + 版本号 + 技术词组合会被判「含敏感信息」直接拦

## ERR-MEDIA-007 | Wan2.2 用 Wan2.1 的 VAE：通道数不匹配，VAE 解码必炸

- 症状: 图生视频链路跑到 VAE 解码就崩，换分辨率也一样。
- 错误原文: `weight of size [16,16,1,1,1] expected input to have 16 channels but got 48`
- 触发条件: VAE 用了 `wan2.1_vae`，而 Wan2.2 的隐变量是 48 通道。
- 根因: Wan2.1 VAE 是 16 通道，Wan2.2 隐变量是 48 通道，不通用。
- 解决: VAE 必须用 `wan2.2_vae.safetensors`；文本编码器用 `umt5_xxl_fp16.safetensors`。
- 证据: `MEMORY-<name>.md` 第 977–981 行（本地出片补记）
- 回滚点: 无

## ERR-MEDIA-008 | VAE 解码爆显存：Total VRAM 12272MB，可用只剩 1.68GB，只加 --lowvram 无效

- 症状: 640×360 能跑，一上 832×480 / 960×544 就在 VAE 解码爆显存；明明「只加了 --lowvram」还是不行。
- 错误原文: `Total VRAM 12272MB` 但解码要 2.3~3.2GB，实际可用只剩 **1.68GB**
- 触发条件: RX 6700 XT 12GB 跑 ComfyUI（默认 pin 了 13GB 内存 + smart memory 缓存旧模型）。
- 根因: 内存被 pin 死 + smart memory 缓存旧模型占显存。
- 解决: **必须同时加 `--lowvram` 和 `--disable-smart-memory`**；配合 `--use-quad-cross-attention --disable-async-offload`。640×360 能出片（96 秒），1080p 靠 `ffmpeg scale=1920:1080:flags=lanczos` 超分。
- 证据: `MEMORY-<name>.md` 第 983–987 行；第 1438–1446 行（必须的五个启动参数）
- 回滚点: 无
- 防护: 别指望这张 12GB 卡原生出 1080p 视频；图生视频约 13 分钟 `0xC0000005` 也是同一原因

## ERR-MEDIA-009 | gfx1031 上的三连崩：comfy_kitchen 缺 kernel、fp8 编码器、KJNodes import triton

- 症状: 卸载一个包就启动失败；换 fp8 模型一跑就炸；关掉某个开关后整个服务起来又崩。
- 错误原文: `CK grouped conv library not found for device gfx1031`（MIOpen 日志）；`'NoneType' object has no attribute 'Params'`（fp8 文本编码器）；KJNodes 的 `PatchTritonVAE` 顶层 import triton → `ImportError`
- 触发条件: 在 RX 6700 XT（gfx1031）上跑 ComfyUI + Wan2.2。
- 根因: ① `comfy_kitchen` 只有 gfx1030 kernel，而新版 ComfyUI 无条件 import 它——卸载会启动失败；② fp8 文本编码器在 gfx1031 上必炸，只能 fp16；③ 关掉 aimdo（`DSH_GFX1031_NO_AIMDO=1`）后回退 legacy ModelPatcher，KJNodes 的顶层 triton import 会连带整个服务崩。
- 解决: 写 stub（`comfy_kitchen/__init__.py` + `rope.py` 纯 torch 回退），并手写两个算子 **`apply_rope1`（文生视频必需）/ `adaln`（图生视频必需）**，缺任何一个都在 KSampler 里炸；用 fp16 文本编码器；把 KJNodes 目录改名成 `ComfyUI-KJNodes.disabled`。
- 证据: `MEMORY-<name>.md` 第 959–972 行；第 1003–1010 行；第 1466–1476 行
    + ERR-MEDIA-779（已并入）: `docs/NOTES-本地视频生成-gfx1031-实测.md` §三.2（L37-L38）。
    + ERR-MEDIA-778（已并入）: `docs/NOTES-本地视频生成-gfx1031-实测.md` §三.1（L33-L36）。
- 回滚点: `docs\NOTES-本地视频生成-gfx1031-实测.md` 有完整记录
- 防护: 改了 stub 记得重启 Python 进程——「改了没效果」多半是 ComfyUI 还在跑旧代码

## ERR-MEDIA-010 | 语音转文字全线不可用：四个 provider 全缺，语音只能变 [语音] 占位

- 症状: 群里有人发语音，她只看到 `[语音]` 两个字，听不见内容；想手动转写还报目录不允许。
- 错误原文: Groq 无 Key 返回 `401 invalid_api_key`；`transcribe_audio` 拒绝非白名单目录时报 `path is outside allowed audio directories`
- 触发条件: `transcribe_audio` 的提供方 groq 缺 `GROQ_API_KEY`、hf 缺 `HF_TOKEN`、local-whisper 的 127.0.0.1:8001 没服务、SenseVoice 插件没装模型，本机也没有 whisper/faster-whisper/funasr。
- 根因: 本机没有可用 ASR 引擎；`transcribe_audio` 只允许 `C:\Users\<user>\.dsh\storages` 下的音频。
- 解决: 搭好基础设施（`translateInboundRecord()` 用网关 `get_record` 取音频 → 落盘 → 调 OpenAI 兼容 `/v1/audio/transcriptions`，开关 `socialV2.voice.transcribeInbound` 默认 false）；后来补上 Groq key（`<workspace>/qq-bridge\set-groq-key.ps1 -Key "gsk_..."`，写完自动自检），转写返回 `[语音：<转写文本>]`。失败一律回退 `[语音]` 占位，绝不编造内容。
- 证据: `MEMORY-<name>.md` 第 621–625 行；第 630–649 行
- 回滚点: 无
- 防护: 这个 Groq Key 曾出现在聊天记录里，如担心泄露可去 console.groq.com 轮换后重新写入

## ERR-MEDIA-771 | 发图传相对路径 state/generated/*.png，OneBot 报「识别URL失败」

- 症状: <name>发 AI 画图产物 100% 失败；OneBot send_group_msg 报文件处理失败，NapCat 无法解析相对路径；失败重试还可能加剧风控踢号。
- 错误原文: `OneBot send_group_msg 失败：文件处理失败: 识别URL失败, uri= state/generated/snedit-1792741479526-7853f30f.png`
- 触发条件: qq_send_image 传入本地相对路径 state/generated/*.png 时。
- 根因: 代码问题：bridge.js:7756 把相对路径原样传给 accountSendImage，account-ops.js:146 直接塞进 OneBot 的 file 字段，缺「本地相对路径 → 绝对路径」的转换。
- 解决: 已修复（F-2026-10-0011 / -RESOLVED 实测）：bridge.js 增加 path.resolve(ROOT, source)，文件不存在时返回明确错误；两种斜杠写法均能正确解析到 <workspace>/projects\qq-bridge\state\generated\*.png；node --check 语法通过，桥接已重启生效；AI 画图产物可正常发到 QQ。
- 证据: `logs/failures/2026-10.jsonl` F-2026-10-0002（L2）、F-2026-10-0011（L12）、F-2026-10-0011-RESOLVED（L13）；`docs/NOTES-<name>感知与记忆能力-20261024.md` §四（L200）。
- 回滚点: `_backup\2026-10-23-fix-image-path\bridge.js.bak`（778KB / 13646 行）。
- 关联: F-2026-10-0001

## ERR-MEDIA-772 | 翻唱耗时 15 分 19 秒被当卡死，实际未死锁（后台算力被训练占满）

- 症状: 用户反馈「图传和联网搜曲卡住了」；翻唱 19:11:59 开始 → 19:27:18 完成，耗时 15 分 19 秒；期间日志正常（仍在回其他消息），非死锁。
- 错误原文: `无报文级错误（结果记录：翻唱 19:11:59 开始 → 19:27:18 完成，耗时 15 分 19 秒）`
- 触发条件: 用户点翻唱/唱歌类操作，同时后台正在训练模型占满算力时。
- 根因: 待归因（人类说明：后台正在训练模型，占满算力，本来可以更快）。
- 解决: 暂不处置（人类决定：暂就这样）。
- 证据: `logs/failures/2026-10.jsonl` F-2026-10-0012（L14）。

## ERR-MEDIA-773 | 中转站 3 个模型全无视觉能力，image_tokens 恒为 0，图片被静默丢弃

- 症状: <name>完全无法理解图片，群里/私聊所有图片对她不可见；桥接能取到图片（192KB），模型收下后丢弃。
- 错误原文: `image_tokens = 0`（youyiyun 的中转站三个模型：deepseek-v4.1-flash 为 0，deepseek-v4-flash / deepseek-v4-pro 为空）
- 触发条件: 调用 qq_get_message_images 把图片交给 youyiyun 中转站模型时。
- 根因: 环境漂移：所选 provider 无视觉能力。此前两次误判为「模型支持视觉」，证据取自 DSH 自身视觉通道（read_image）而非她的链路（qq_get_message_images → 中转站）；正确判据是 usage.prompt_tokens_details.image_tokens。
- 解决: 已处置：方案 A 双模型——桥接侧调免费视觉端点转述（OVHcloud AI Endpoints https://oai.endpoints.kepler.ai.cloud.ovh.net/v1，Qwen2.5-VL-72B-Instruct，无需 API key，实测能读中英文字幕/弹幕/状态栏时间）；配置位置 config.json 的 socialV2.image.describe。
- 证据: `logs/failures/2026-10.jsonl` F-2026-10-0013（L15）；`docs/NOTES-<name>感知与记忆能力-20261024.md` §一.故障1（L16-L37）、§六（L225-L238）。
- 回滚点: `_backup\2026-10-23-vision-fallback\`。
- 关联: F-2026-10-0015

## ERR-MEDIA-777 | 视频端点只回帧数组、表情端点只回原图，视频与表情对 AI 不可理解

- 症状: 视频完全无法理解；表情只有 ID 没有含义，她无法据此判断该发哪个；40 个收藏表情的 desc/localNote/usage 全为空。
- 错误原文: `MCP qq_get_message_video 仍推 type:image 块会被 DSH 整条拒绝`
- 触发条件: AI 需要理解视频内容 / 表情含义时。
- 根因: 规则缺失：图片通道做完了，视频和表情这两条没跟上——/api/video/message 只返回 frames 数组、无视觉转述；/api/socialV2/sticker-image 只回原始图片。
- 解决: 待修：视频复用 describeAnimation；表情端点补转述；情绪模块让她自由探索。
- 证据: `logs/failures/2026-10.jsonl` F-2026-10-0019（L19）。
- 关联: F-2026-10-0015

## ERR-MEDIA-781 | 改了 stub 但没重启 python，ComfyUI 一直跑旧代码

- 症状: 改了代码错误照旧，像没生效；排查方向被误导。
- 错误原文: `无报文级错误（症状：改了代码错误照旧，像没生效）`
- 触发条件: 修改 comfy_kitchen stub（或自定义节点）后没有重启 ComfyUI 的 python 进程时。
- 根因: 进程残留：ComfyUI 一直用旧代码；改了文件不等于加载了新代码。
- 解决: 已处置：重启 python 进程后再验证。
- 证据: `docs/NOTES-本地视频生成-gfx1031-实测.md` §三.5（L43-L44）。

## ERR-MEDIA-782 | Wan2.2 VAE 解码在 gfx1031 上 HIP 崩溃：文生视频跑通、图生视频 13 分钟内崩

- 症状: 生成流程跑到 VAEDecode 节点就挂（node_id 10, node_type VAEDecode，execution_cached: ["9","6","7","8","3","4","5"]，KSampler 已跑完）；换 split/quad attention、--lowvram 结果相同；直接 load Wan2.2 VAE 到 GPU decode 则进程级 0xC0000005。
- 错误原文: `HIP error: unspecified launch failure`；`0xC0000005`（访问冲突）
- 触发条件: 在 gfx1031（12GB）上跑 Wan2.2 时空 VAE 解码时。
- 根因: Wan2.2 VAE 这条 kernel 路径在 gfx1031 上没有可用实现——MIOpen 日志明确写 `CK grouped conv library not found for device gfx1031`；基础算子（SDPA、2D/3D conv、matmul 19.5 TFLOP/s）都正常，不是驱动坏。图生视频另受 12GB 显存余量限制、legacy ModelPatcher 撑到最后内存回收时崩。
- 解决: 部分已处置：文生视频 2026-10-23 08:10 跑通并出片（640×360 / 17 帧 / 96 秒，必需参数 `--use-quad-cross-attention --disable-async-offload --lowvram --disable-smart-memory`，成片 <workspace>/_outputs\local-video\whale_1080p.mp4 再 ffmpeg 超分 1920×1080）；图生视频仍会跑但 13 分钟内崩，VAE 路径未彻底解决（候选：换 Wan 2.1 的 VAE / 退回 ComfyUI 0.23 / 启用 CK 回退）。
- 证据: `docs/NOTES-本地视频生成-gfx1031-实测.md` §四（L46-L60）、§六（L70-L93）、§七（L97-L123）。
- 防护: 不要重复提交同一个 workflow——每次都要跑满 20 步采样（约 2 分钟）才撞同一个错。
