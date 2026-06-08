# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**忆海拾光 (Memory Glimmers)** — 家庭记忆与学习卡片 PWA。单文件 app（`yihai_v{version}.html`），内联 CSS/JS，自定义 SM-2 SRS，IndexedDB 本地存储，Supabase 云同步，GitHub Pages 部署。

技术架构见 `docs/architecture.md`（数据表、存储层、关键数据流）。

## Key Files

### 当前版本
| File | Purpose |
|------|---------|
| `index.html` | 主训练 App（v5.9.0，单 HTML 文件，Supabase 云同步） |
| `yihai_admin_v1.html` | 管理看板（监控面板，Supabase Edge Functions） |
| `index_v49.html` | 制卡工具（暂停）|

### 测试
| File | Purpose |
|------|---------|
| `tests/srs_test.js` | SRS 单元测试（85 cases） |
| `tests/yihai_v4.4_test.js` | v4.4 工具函数测试（98 cases） |
| `tests/yihai_v4.8_test.js` | v4.8 工具函数测试（46 cases） |
| `tests/yihai_v4.9_test.js` | v4.9 配置合并测试（48 cases） |
| `tests/yihai_v5.0_i18n_test.js` | i18n 纯函数单测（31 cases） |
| `tests/yihai_v5.2_voice_test.js` | 语音辅助迁移逻辑单测（17 cases） |
| `tests/yihai_v5.8_sync_test.js` | 个人牌组同步纯函数单测（mod/diff/syncState/水位迁移，24 cases） |
| `tests/run_all.js` | 单元测试统一入口（7 套件，389 断言） |
| `tests/_pw_ui_smoke.js` | UI 冒烟（导航/账户屏/设置/i18n/函数存在性/语言选择器/语音/openSrsDb/练习模式，64 断言，无需登录） |
| `tests/_pw_srs_e2e.js` | SRS 端到端（导入/.yhspack/5天练习/IDB验证/统计/session_mode/队列顺序，14 断言，无需登录） |
| `tests/_pw_cloud_sync.js` | 云端流程（登录/decks下载/同步/session restore/user_id隔离/登出/重登/双客户端防护/feedback E2E，32 断言） |
| `tests/_pw_cross_device.js` | 跨设备同步（设备A练习→同步→设备B接收/review不被覆写/DP不跨设备/增量上传/暂停续传/水位迁移，26 断言） |
| `tests/_pw_session_restore.js` | 会话恢复流程（SDK失败/无backup/token失效/backup损坏/pathD/登录超时，13 断言，无需登录） |
| `tests/_pw_sync_guard.js` | runSync 30s watchdog（REST挂起/IDB blocked 时 modal 自动关闭+toast，7 断言，无需登录） |
| `tests/_pw_feedback.js` | 意见反馈模块（函数存在性/sheet 开关/表单校验，11 断言，无需登录） |
| `tests/_pw_config_sync.js` | 语音辅助参数云同步（push→pull 一致性/废弃 key 清理/跨设备传播，~23 断言，需登录） |
| `tests/_playwright_helper.js` | Playwright 公共工具（cloudLogin/cloudLogout/navigateTo 等） |

### 文档
| File | Purpose |
|------|---------|
| `docs/architecture.md` | 技术架构（数据表/存储层/数据流） |
| `docs/srs_design_v6.9.md` | SRS 算法权威设计文档 |
| `docs/忆海拾光_训练App_README.md` | 训练 App 版本历史 |
| `docs/忆海拾光_训练App发布检查清单.md` | 发布检查清单 |
| `docs/yihai_实现说明.md` | 实现说明（场景组织） |
| `docs/yihai_变更记录_CLAUDE参考.md` | 完整变更历史（AI 参考） |

### 基础设施
| File | Purpose |
|------|---------|
| `sql/supabase_schema.sql` | 数据库 schema |
| `sql/supabase_storage_policies.sql` | Storage RLS 策略 |
| `supabase/functions/` | Edge Functions（管理 API） |
| `archive/` | 历史版本（v4.3–v4.8） |

## Recent Changes

**当前版本：v5.10.0**（`index.html`，线上版）。完整历史见 `docs/yihai_变更记录_CLAUDE参考.md`。

**v5.10.0 post（#402）：** 触发器自洽维护 `sync_card_states` — `_writeSrs` trial entry 补 `lapses_streak_after`/`lapses_total_after`/`review_mode_after`/`step_index_after`（来自 `processAnswer` 算出的 `newState`）；`syncTrialLog`/`uploadTrialBatch` 显式字段列表同步补充；DB Migration 011 加 4 列并重建触发器 `fn_trial_to_card_state`（改用 `_after` 值，COALESCE 兼容旧 trial）；`syncPendingData` 删除全量 card state backfill；`unsuspendCard` reset/resume 后即时调用 `syncCardState()`。

**v5.10.0：** 牌组管理页 — 新增独立 `screen-decks`（三段：本地/云端/精选）；Tab Bar 扩展为 5 项（首页/牌组/练习/统计/我的）；`saveCard` 移除自动上传，本地操作与云端完全解耦；首页黄点可点击跳转云端 Tab；`renderCloudDecksTab` 迁移自 `showCloudDecks`；5 个 locale 补充 7 个 i18n key；`_pw_deck_mgmt.js` 新增 15 断言冒烟测试。

**v5.9.0：** 个人牌组同步 v2 — media slot 模型（`media.{slot}.{url,v,_blob}`）替代旧 `_imgUrl`/`img` 字段；新增纯函数 `hasMedia`/`mediaLoaded`/`serializeMedia`/`mergeCard`/`buildPath`/`mimeToExt`；`deck_cards` 加 `media JSONB` 列并迁移存量 `image_url`/`audio_url` 数据；`saveDeckCards`/`restoreDecks` 序列化层全面迁移（兼容旧格式）；`computeDeckDiff` 字段名规范化（`.ts`）；`computeDeckSyncState` 改用 `deckMediaComplete` 判断媒体缺失；`upsertCardsBatch` 写 `media` JSONB、新增 `upsertSingleCard`；`runCardsPhase` pull 改用 `media` + `mergeCard`；`runMediaPhase` 重写为 slot 模型 + await + checkpoint/20（根治 fire-and-forget）；GC 补全（`deleteDeck` 清 4 个孤儿 key、`deleteCardStatesForDeck`、`gcOrphanSyncKeys`、`purgeOldLogs` 加 TRIAL_STORE）；修复 media slot 迁移后 `card.img`/`audioUrl` 渲染层字段丢失导致图片不显示；`yh_diag.js` 媒体统计对齐新格式；新增 `tests/yihai_v5.9_sync_test.js`（32 断言）+ `_pw_cross_device.js` PHASE 10/11（共 39 断言）。

**v5.8.2：** 云端牌组下载流程三项修复 — ①`downloadPersonalDeckFromCloud` 暂停前调用 `saveDeckCards` 持久化已下载卡片，防止刷新/登出后数据丢失；②`doAccountLogout` 登出时 resolve 所有暂停 promise 并清空 `_downloading`，避免下载线程永久 blocked；③`computeDeckSyncState` 检测 `_imgUrl` 有值但 blob 未加载（`img` 为空）时返回 `mediaIncomplete` 标志，云端牌组页显示「媒体缺失」徽章并提供「补全媒体」按钮（走下载路径复用 IDB 缓存）；移除 Supabase CDN SRI `integrity` 属性（jsdelivr 节点不一致导致时好时坏）。

**v5.8.1：** 修 v5.8.0 上线后老设备升级首次同步卡在「双向 +100」+ 媒体缺失 — ①`runStructurePhase` 拉 `decks.updated_at` 并把 `meta._remoteUpdatedAt` / `pulledAt` 同步推到该值（消除 `decks.updated_at` 比 `max(deck_cards.updated_at)` 新时的 remoteAhead 假象）；②`runCardsPhase` 末尾 `pushedAt = max(pushedAt, pulledAt)`（pulled 的卡 mod 已等于云端 updated_at，等价"已推送"，避免 +100）；③pull merge 时若本地 in-memory `img`/`audioUrl` 空但 IDB 有 blob，从 IDB 复活生成 blob URL。`_pw_cross_device.js` 加 PHASE 9 老设备升级回归（+2 断言，共 34）。

**v5.8.0：** 个人牌组同步重做 — 卡片级 `mod` 时间戳 + 删除墓碑 + `SyncJob` 三阶段（结构 → 卡片 → 媒体）增量同步 + 暂停续传 + 云端牌组页状态徽章；`deck_cards` 加 `unique(deck_id, card_id)` 约束（v5.8 migration via MCP）；`yihaiSyncAt:{key}` 拆为 `yihaiPushedAt` + `yihaiPulledAt` 双水位（带迁移）；新增 `tests/yihai_v5.8_sync_test.js`（24 断言）与 `_pw_cross_device.js` 增量/暂停/迁移/Fix 1/Fix 2 场景（+21 断言，合计 32）。**发布前修两个手工实测发现的 bug**：① `runCardsPhase` pull merge 整卡替换导致 blob URL 丢失 → 沿 `_imgUrl`/`_audUrl` 路径一致时保留本地 `img`/`audioUrl`；② `upsertDeckRow` 写 `decks.updated_at` 后不推水位 → 媒体重传后云端牌组页常驻「待下载」+ meta 单独修改永久 `localDirty` → 同步推进 `pushedAt`/`pulledAt` 并刷新 `meta._remoteUpdatedAt`。spec: `docs/superpowers/specs/2026-06-05-personal-deck-sync-design.md`；plan: `docs/superpowers/plans/2026-06-05-personal-deck-sync.md`。

**v5.7.2：** 云端牌组下载支持暂停/继续（`toggleDownloadPause`，`_downloading` 加 `pausePromise`，每张卡完成后检查暂停状态）；诊断面板 Tab 0 新增媒体统计（图片/音频已下载数、待下载数、逐牌组明细、`navigator.storage.estimate` 本地总占用）

**v5.7.1：** 修复下载个人牌组时图片不显示 — 删除 `deckCards` 中间变量，改为 `DECKS[deckId][i]` 直接 in-place 更新，blob URL 写入后立即反映到渲染；修复下载中途返回再进入云端牌组页误显「已下载」— 新增 `_downloading` Map 跟踪进行中的下载，`showCloudDecks` 优先渲染进度状态

**v5.7.0：** 个人牌组云端管理 — 修复本地有云端无时同步不上传（新增 `uploadMissingPersonalDecks`）；新增「云端牌组」管理页（账户页入口，下载/同步）；`downloadPersonalDeckFromCloud` 两阶段渲染（拉到卡片列表立即显示首页）；IDB miss 回退远端补下；断点续传（每 100 张 `saveDeckCards`）；进度显示（按钮实时 `done/total`）

**v5.6.4：** 修复个人牌组每次同步全量上传导致 30s watchdog timeout — `uploadPersonalDeckMedia` 只在本次实际上传了新媒体（`uploaded > 0`）时才调用 `uploadDeckToCloud`，消除 3600+ 张牌组每次同步触发全量 DELETE+INSERT 的性能问题；修复诊断面板 `yh_diag.js` 读取 localStorage key 仍用 snake_case 旧格式（v5.5.0 迁移遗漏），`doAccountLogout` 补清旧 `yihai_session_backup` 僵尸 key

**v5.6.3：** 修复个人牌组同步黄点误报 — `uploadDeckToCloud` 上传成功后同步写入本地 `yihaiSyncAt`，消除上传后立即显示未同步黄点的问题

**v5.6.2：** 修复 `deck_cards` 下载截断 — 新增 `fetchAllDeckCards(deckId, select)` 分页 helper（每页 1000 行循环直到拉完），替换 `downloadDeckFromCloud`/`checkPersonalDeckUpdates`/`downloadPersonalDeckFromCloud` 三处无分页查询；修复超过 1000 张卡片的牌组同步到其他设备时被 Supabase PostgREST 默认行数上限截断的问题

**v5.6.0：** 个人牌组媒体云同步 — ①`importYhspack` 导入时写入 `deck_type:'personal'`，立即上传结构到 Supabase；②新增 `uploadPersonalDeckMedia(deckId)`，点「同步」后逐卡上传图片/音频 blob 到 Storage（路径 `personal/{userId}/{deckId}/{cardId}_{type}.{ext}`），支持中断续传（`_imgUrl`/`_audUrl` 非空跳过）；③`doAccountLogin`/`doAccountSync` 在 `runSync()` 完成后串联触发媒体上传；④音频 MIME 完整映射（mp3/ogg/webm/aac/m4a）

**v5.5.0：** 练习模式重设计 + 翻转卡 + 导入导出 loading 提示 — ①删除困难/生存模式，新增「普通」（完整 SRS，due_ts 升序）和「轻松」（全牌组，答错不降级，20 张，首尾熟悉卡）；②flip card renderer（翻转卡，自评 SRS）；③`CARD_RENDERERS` 分派架构；④localStorage key 全面 camelCase；⑤importYhspack/deleteDeck/exportDeck 加 loading toast（`showLoadingToast`）；⑥修复 `processAnswer` review 分支 `daysLate` TDZ 名称冲突（SRS 写入静默失败）；⑦修复 normal 模式遗留 `applyCurve` 排序，改为 Anki 到期顺序

**v5.4.20：** UI 整合与性能优化 — ①`syncAppEvents` 批量上传（10条/批，`upsert+ignoreDuplicates`，174条从29分钟降至秒级）②修复「我的」Tab 切换时 profile card 残留「点击登录」（`showScreen` 补 `updateMineProfile`）③语音辅助页：宽度对齐、取消折叠、固定节点并入情绪触发（答错/答对/连对/完成）、浏览引导移至功能提示末位 ④「我的」页高级模式加⚡图标、间距对齐 ⑤界面语言从设置内移至「我的」顶层菜单（地球图标），语言页标题/顺序调整（EN→繁→简→日→ES）

**v5.4.17：** 修复日文界面选项朗读中日混播 — ①`・`加入暂停正则（停顿而非朗读）②`startIdleQuizTimer` TTS播放中re-schedule延迟触发 ③`stopAllPromptTimers`清除`_idleQuizTimer`防止答题后idle播放；移除诊断日志

**v5.4.10：** 修复英语/西语界面音色「自动」选项文案及实际行为 — `en` 界面显示「Auto (English preferred)」、`es` 显示「Auto (español preferido)」；`pickVoice` `want` 默认值按界面语言选择（en→`en`、es→`es`，而非始终 `zh-CN`）

**v5.4.9：** 简化 TTS 音色逻辑 — `pickVoice` 已选声音无语言限制（始终跟随 Voice 设置）；zh-Hant 自动选声音链加入 `zh-HK`、`yue-HK`/`yue-*`（iOS 粤语声音 lang 为 yue-HK）

**v5.4.8：** 修复繁體中文界面粵語 TTS 提示音仍為普通話 — `pickVoice` 兩處 `lang === 'zh-CN'` 改為 `lang.startsWith('zh')`；`speak`/`speakDirect` 找到 voice 後 `utt.lang = v.lang` 對齊真實 speech locale

**v5.4.7：** 回滚 v5.4.1–v5.4.6 全部 TTS 音色修复代码，恢复 v5.4.0 原始状态，等待定位真正根因

**v5.4.6：** 修复声音设置被云同步覆盖 — `ttsVoiceName` 改为设备本地，不参与云同步；`cloudPullConfig` 跳过 `ttsVoiceName`；`ttsVoiceLang` 继续云同步作为跨设备语种偏好

**v5.4.5：** 修复跨设备声音选择失效 — 新增 `TTS_VOICE_LANG` 记录所选声音的 lang（如 zh-HK），PC 选粤语同步到 iPhone 后按 lang 找本机同语种声音（善逸），移除诊断日志

**v5.4.4：** 诊断日志 — `pickVoice()` 新增无条件 `[pickVoice]` console.log，定位声音选择失效时 `TTS_VOICE_NAME` 实际值

**v5.4.3：** 修复 zh-Hant 下浏览器忽略显式 voice — `utt.lang` 改为取所选 voice 的 `lang` 字段（而非界面语言），确保 TTS utterance 语种与所选声音对齐

**v5.4.2：** 修复 `pickVoice` 所选声音未按语种前缀匹配 — 改为 `namedPrefix === wantPrefix`，所选声音只在语种前缀匹配时生效，否则降级自动；覆盖英文/西文界面下中文声音不生效、及英文声音可控制英文提示等场景

**v5.4.1：** 修复繁體中文介面下粤语 TTS 失效 — `pickVoice` 条件由 `lang === 'zh-CN'` 改为 `lang.startsWith('zh')`，覆盖 zh-Hant/zh-TW/zh-HK 等所有中文变体

**v5.4.0：** 繁體中文（zh-Hant）支援 — 新增 `zh-Hant` locale（363 個 key），`detectLocale` 繁體變體顯式映射（zh-TW/zh-HK/zh-MO），語言選擇頁新增「中文（繁體）」行並移除所有語言旗幟 emoji，`pickVoice` 優先選取 zh-TW voice，i18n 單元測試新增 4 個 case（共 31 個）

**v5.3.3：** 修复废弃 snake_case key 常驻云端 — `cloudPushConfig` 合并后 delete `phrase_quiz_prompt`/`phrase_quiz_prompt_recognize`/`phrase_opt_hint`/`phraseSelect`，防止旧 key 通过 merge spread 永久留存

**v5.3.2：** 语音文案 key 统一 camelCase — `phraseQuizPrompt`/`phraseQuizPromptRecognize`/`phraseOptHint` 替代 v5.2 引入的 snake_case key，云同步/读写/重置路径全部对齐，删除废弃 key 迁移代码；修复多实例 `autoRefreshToken` 竞态（`restoreSession` 创建新客户端前调用 `stopAutoRefresh` 防止旧实例旋转令牌后新实例用失效令牌报 `refresh_token_not_found`）

**v5.3.1：** 修复语音答题提示云同步 — `phrase_quiz_prompt` 统一为唯一 key（替代废弃 `phraseSelect`），补入 `cloudPushConfig` 推送列表，`onSlotRowTap` 保存后触发 `debouncePushConfig`，清理迁移兼容代码

**v5.3.0：** 意见反馈模块 — `意见反馈` 入口（screen-mine）、底部 sheet（textarea 必填 200 字/字数计数/空提交红框校验）、`collectDiagnostics()`（IDB 2s 超时读取日志/事件，不采集 JWT/邮箱）、`submitFeedback()`（Supabase 5s 超时 + 剪贴板降级 + localStorage 暂存）、`runSync` 补传、zh/en/es 三语言、Supabase feedback 表（anon INSERT only RLS）

**v5.2.0 bug fixes：** 会话恢复 UI 卡死修复 — 新增 `_sessionRestoring` 标志替代 backup-proxy 逻辑（修复缺陷1/2/3/5）；`openSrsDb` onblocked 8s 超时防挂死 + 修复 `return _srsDbPromise` 缺失；`doAccountLogin` 15s 超时；`if (!_sb)` 双客户端防护；`runSync` catch 块 modal 失败时显示 toast

**v5.2.0：** 语音辅助系统 — 家属录音+TTS 双轨、11 个语音槽（固定节点/情绪触发/功能提示）、IDB voiceSlots store（DB v7）、screen-voice-assist 管理界面、idle 计时器、连对连击鼓励、card_type/ext 字段扩展

**v5.1.8：** 修复语言选择页宽度、勾选抖动；移除设置深色模式开关（统一用主题）；设置 sheet 加关闭按钮

**v5.1.7：** 新增界面语言选择功能 — `screen-lang` 全屏选择页（中/英/西）+ 设置抽屉入口

**v5.1.6：** 术语统一 — 「我的相册」→「我的牌组」，My Albums → My Decks，Mis Álbumes → Mis Mazos

**v5.1.5：** 移除 `publishDeck`（preset/shared 权限边界未定）；修复 `migrateMediaKeys` race condition（改 await 顺序执行，修复 v5.1.3 升级图片丢失）

**v5.1.4：** migration 010 — 新建 `decks`/`deck_cards` 替代旧三表；本地 deck key 去 `cloud_` 前缀；个人牌组云端同步（`uploadDeckToCloud`/`checkPersonalDeckUpdates`）

**v5.1.3：** `updateMineProfile`/`renderAccount` 增加 `_syncEnabled` 门禁，session 恢复失败时不误显在线 UI

**导航结构（v5.2.x）：**
- `screen-home`：首页（默认），底部 `.home-tabbar`
- `screen-mine`：我的，底部 `.home-tabbar`
- `screen-quiz`：练习/浏览（无 Tab Bar）
- `screen-stats`：统计（无 Tab Bar，`closeStats()` 回 `_statsOrigin`）
- `screen-finish`：完成（无 Tab Bar）
- `screen-voice-assist`：语音辅助管理（全屏，11 个语音槽录制/编辑）
- Settings：底部 Sheet overlay

## Environment

**Windows 11 + PowerShell 5.1。** 所有 shell 命令用 PowerShell 工具，不用 Bash。路径分隔符 `\`，环境变量 `$env:VAR`，无 `&&`/`||` 管道链（改用 `; if ($?) {}`）。

## First-time Setup

```powershell
# Enable git hooks
git config core.hooksPath .githooks
```

## Development Commands

```powershell
# 单元测试（全量，325 断言）
node tests/run_all.js

# Playwright（需先用 PowerShell 启动，不能用 Bash：python -m http.server 8080 --directory C:\code）
node tests/_pw_ui_smoke.js
node tests/_pw_srs_e2e.js
$env:TEST_PASSWORD="xxx"; node tests/_pw_cloud_sync.js
$env:TEST_PASSWORD="xxx"; node tests/_pw_cross_device.js
```

**测试范围规则：**
- **Bug 修复** → `node tests/run_all.js`
- **发布** → 单元测试 + `_pw_ui_smoke.js` + `_pw_srs_e2e.js`
- **云端/登录改动** → 加跑 `_pw_cloud_sync.js`
- **语音参数/config 同步改动** → 加跑 `_pw_config_sync.js`
- **跨设备/同步改动** → 加跑 `_pw_cross_device.js`
- **全量回归** → 仅用户明确要求时跑全部 4 个 Playwright 文件

Current counts: SRS 85, v4.4 98, v4.8 46, v4.9 48, i18n 71, voice 17（run_all.js 合计 365）；Playwright ui_smoke 64 / srs_e2e 14 / cloud_sync 32 / cross_device 11 / session_restore 13 / sync_guard 7 / feedback 11。

## SRS Architecture

`processAnswer` 实现 SM-2 变体，三阶段：`learning` → `review` ← `relearning`。完整状态机见 `srs_design_v6.9.md`。

**关键保护机制：**
- `daily_remove_lapses` (3)：连续失败 N 次当天移出队列
- `auto_suspend_lapses` (8)：累计失败 N 次自动挂起
- `learn_ahead_limit` (1200s)：防止跳过 learning 步骤

**Learning hard 延迟：** 第一步 `(steps[0]+steps[1])/2`；仅一步时 `steps[0]×1.5`；第二步起不变。

**练习模式（`SRS_CONFIG.session_mode`）：**
- `normal`：完整 SRS 模式 — 全量到期积压，按 `due_ts` 升序出牌（Anki 默认顺序，无重排）
- `easy`：轻松陪伴模式 — 全牌组出 `easy_session_size`（默认 20）张，[热身 3 熟悉] + [3:1 熟/不熟穿插] + [收尾 2 熟悉]；答错强制写 Hard 不降级；每张只出一次（session 内不重入队列）

**参数命名规则：** 所有 SRS 参数对齐 Anki 命名，不加后缀。

## Development Rules

1. **Single-file app** — 所有代码在 `yihai_v{version}.html`，无单独 CSS/JS 文件。
2. **Version in filename** — 输出文件必须是 `yihai_v{version}.html`，UI 内显示版本号。
3. **One version per iteration** — patch bump 修复，minor bump 功能，major 平台迁移。
4. **No confirm()** — iOS PWA 会阻塞。用 `showConfirmDialog()` 自定义弹窗。
5. **SRS write race guard** — `_lastSrsWrite` promise chain；`goHome()`/`openStats()` 必须 `await _lastSrsWrite` 后再读。
6. **sessionId** — 每次 `_launch`/`goHome` 递增，打断跨页异步 TTS 链。
7. **warmupSpeech()** — 必须在用户手势内调用（iOS 解锁 TTS + Audio）。
8. **浏览器端改动必须先写 Playwright 测试** — Node.js 单测覆盖不到 DOM 渲染/SDK 异步加载。流程：写测试复现（预期失败）→ 改代码 → 测试通过 → 跑回归 → 提交。
9. **Release prep** — 发布前移除测试工具栏（`🗑 重置牌组`、`⏭ +1天`）和调试行（`iv=X ef=X...`）。
10. **Supabase cloud sync** — 所有 Supabase 调用包 try/catch，fire-and-forget。`_syncEnabled` 门控所有同步。
11. **Cloud session** — SDK 自动持久化 session。启动时 `restoreCloudSession()`，状态：`_syncEnabled`（在线）、`_sessionRestoring`（恢复中）。
12. **Per-card upload: TrialLog only** — 逐卡只上传 `sync_trials`；`sync_card_states` 由 DB trigger 自动维护。
13. **runSync 统一入口** — 所有同步通过 `runSync(options)`。`options.modal` 控制弹窗；`options.decks` 控制牌组同步。
14. **DP 仅本地** — `daily_progress` 不跨设备同步，只记本地。
15. **`_writeSrs` 改动后必须跑 Playwright** — 运行时错误会导致 TrialLog 静默丢失，单测覆盖不到 IDB 写入路径。
16. **Supabase 功能测试必须走真实 RLS 路径** — 测试不能 mock 掉网络层；anon 和已登录角色都要覆盖，上线前验证 RLS 策略覆盖所有预期角色。
17. **序列化层改动必须验证端到端渲染路径** — 改动 `saveDeckCards` / `restoreDecks` / `runCardsPhase` / `runMediaPhase` 任意一处后，必须手动或自动验证以下三条路径，缺一不可：
    - **路径 A（本地渲染）**：导入含图片的 `.yhspack` → 首页卡片列表出现 `<img>` 且可见
    - **路径 B（持久化）**：导入 → 触发 `saveDeckCards` → 刷新页面 → 图片仍然显示（走 `restoreDecks` + IDB 恢复路径）
    - **路径 C（跨设备）**：同步上传 → 另一设备登录/重登 → 图片显示（走 `runMediaPhase` download 路径）
    - 不得仅凭 JS 内存中 `c.img` 有值来判断"图片正常"——必须验证 DOM 中真实出现 `<img src="blob:...">`。

## Coding & Editing Rules

1. **Simplicity first** — 最少代码解决问题。不添加未要求的功能，不为单次使用创建抽象。
2. **Surgical changes** — 只改必须改的。不"改进"相邻代码，匹配现有风格。只清理自己改动造成的孤儿引用。
3. **Goal-driven** — "修 bug" → 先写复现测试；"加功能" → 先定义验收标准。
4. **No comments** — 不写注释。变量/函数命名足够清晰时，注释是噪音。唯一例外：隐藏约束或反直觉的 workaround，一行以内。
5. **camelCase only** — 所有变量、函数、localStorage key 一律 camelCase。不用 snake_case、kebab-case（HTML id/class 除外）。数据库列名用 snake_case（与 JS 命名独立，不混用）。新增列/key 前先 grep 现有代码确认规范。修改内存中的 deck 元数据后必须调用 `saveDeckIndex()` 持久化。

## Workflow Rules

1. **Bug fix** — 先查数据/代码定位根因，分析确认后再动手改。
2. **Feature/enhancement** — 先列路径和利弊，确定方向后再实现。
3. **文档先行** — `git add` 前检查 README/docs/CLAUDE.md 是否需同步。
4. **本地提交** — commit 前必须跑对应单元测试并全部通过。
5. **发布需指令** — `git push` / GitHub Pages 部署必须等明确「发布」指令。「提交」/「commit」只做本地 commit，不 push、不 merge、不打 tag。回滚代码改动前必须先确认。
6. **版本号仅在发布时 bump** — 发布 commit 同时完成：HTML 3 处版本号 + 复制为 `index.html` + 打 tag。
7. **Commit message** — 格式 `type: v{version}: description (#issue)`：
   - `fix: v5.1.6: 描述 (#N)` — 版本号为发现问题的已发布版本
   - `feat: 功能描述 (#N)` — 新功能不绑定版本号
   - `release: v5.1.7` — 发布 commit

## Deployment

1. 所有测试通过（run_all.js + _pw_ui_smoke + _pw_srs_e2e）
2. 文档同步：`CLAUDE.md` 版本号 + `docs/忆海拾光_训练App_README.md` + `docs/yihai_变更记录_CLAUDE参考.md`
3. 修改 `index.html` 中 `APP_VERSION` 常量（唯一入口，title 和首页版本号自动跟随）
4. 所有改动放入 `release: v5.x.x` commit
6. `git tag v5.x.x`
7. `git push; git push --tags`
8. `$env:HTTPS_PROXY="http://127.0.0.1:10808"; gh release create v5.x.x --title "v5.x.x" --notes "..."`
9. GitHub Pages 自动部署到 https://katelynmichelin976-wq.github.io/gemi/

**代理说明：** git 代理已全局配置；`gh` 命令需每次新会话设置 `$env:HTTPS_PROXY=http://127.0.0.1:10808`。
