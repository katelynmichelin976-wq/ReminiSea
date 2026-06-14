# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**忆海拾光 (Memory Glimmers)** — 家庭记忆与学习卡片 PWA。单文件 app（`index.html`），内联 CSS/JS，自定义 SM-2 SRS，IndexedDB 本地存储，Supabase 云同步，GitHub Pages 部署。

技术架构见 `docs/architecture.md`（数据表、存储层、关键数据流）。

## Key Files

### 当前版本

| File | Purpose |
|------|---------|
| `index.html` | 主训练 App（v5.13.5，单 HTML 文件，Supabase 云同步） |
| `yihai_admin_v1.html` | 管理看板（监控面板，Supabase Edge Functions） |
| `index_v49.html` | 制卡工具（暂停）|

### 测试

| File | Purpose |
|------|---------|
| `tests/srs_test.js` | SRS 单元测试（85 cases） |
| `tests/yihai_v4.4_test.js` | v4.4 工具函数测试（98 cases） |
| `tests/yihai_v4.8_test.js` | v4.8 工具函数测试（46 cases） |
| `tests/yihai_v4.9_test.js` | v4.9 配置合并测试（48 cases） |
| `tests/yihai_v5.0_i18n_test.js` | i18n 纯函数单测（71 cases） |
| `tests/yihai_v5.2_voice_test.js` | 语音辅助迁移逻辑单测（17 cases） |
| `tests/yihai_v5.8_sync_test.js` | 个人牌组同步纯函数单测（24 cases） |
| `tests/yihai_v5.9_sync_test.js` | v5.9 media slot 序列化单测（32 cases） |
| `tests/yihai_v5.11_easy_test.js` | Easy 模式纯函数单测（结构公式/分类/排序/槽位/queue，38 cases） |
| `tests/yihai_v5.12_media_recovery_test.js` | 媒体 upsert 失败回滚 + crash 恢复 + mergeCard confirmed 传播纯函数单测（22 cases） |
| `tests/yihai_v5.14_ls_test.js` | LS_KEYS 注册表 + helper + 工厂 + 聚合迁移 + yh:v1: prefix rename 单测（109 cases） |
| `tests/yihai_v5.15_log_test.js` | 本地日志 ring buffer 单测（12 cases） |
| `tests/yihai_v5.13.10_idb_p1_test.js` | IDB_DBS / IDB_STORES 注册表静态校验（33 断言） |
| `tests/run_all.js` | 单元测试统一入口（14 套件，667 断言） |
| `tests/_pw_ui_smoke.js` | UI 冒烟（导航/账户/设置/i18n/语言/语音/IDB/练习模式，65 断言，无需登录） |
| `tests/_pw_srs_e2e.js` | SRS 端到端 + Easy 模式 EasyState IDB（21 断言，无需登录） |
| `tests/_pw_easy.js` | Easy 模式综合（设置 UI/单局/retry/多局 confident 池/诊断面板，28 断言，无需登录） |
| `tests/_pw_easy_sync.js` | Easy 跨设备同步（A→B EasyState 传播/last_warmup 仅本地/双向 seen 累加，18 断言，需登录） |
| `tests/_pw_cloud_sync.js` | 云端流程（登录/牌组下载/同步/session restore/用户隔离/feedback E2E，32 断言） |
| `tests/_pw_cross_device.js` | 跨设备同步（练习→同步→接收/review 不被覆写/DP 仅本地/增量/暂停续传/水位迁移/Fix1-3 回归/runMediaPhase await，39 断言） |
| `tests/_pw_session_restore.js` | 会话恢复（SDK 失败/无 backup/token 失效/backup 损坏/超时，13 断言） |
| `tests/_pw_idb_helpers.js` | IDB helper round-trip（IDB_STORES 注册表 + 9 个 helper 函数，~23 断言，无需登录） |
| `tests/_pw_idb_migration.js` | IDB schema 迁移（v9→v10 srs / v1→v2 media，老 store 删除新建，~17 断言，无需登录） |
| `tests/_pw_idb_resilience.js` | IDB 写入容错（hijack idbPut 抛错，验证 5 个写入函数不掐断答题流，~9 断言，无需登录） |
| `tests/_pw_js_error_report.js` | JS 异常自动上报（window.error + unhandledrejection 写 appEvents + session 去重，10 断言，无需登录） |
| `tests/_pw_sync_guard.js` | runSync 30s watchdog（7 断言） |
| `tests/_pw_feedback.js` | 意见反馈模块（11 断言） |
| `tests/_pw_config_sync.js` | 语音参数云同步（~23 断言，需登录） |
| `tests/_pw_deck_mgmt.js` | 牌组管理页冒烟（Tab Bar/导航/段选/列表，15 断言） |
| `tests/_pw_flip_card.js` | 翻转卡练习流（自评 SRS） |
| `tests/_pw_media_upload.js` | 个人牌组媒体上传 |
| `tests/_playwright_helper.js` | Playwright 公共工具（cloudLogin/cloudLogout/navigateTo） |

### 文档

| File | Purpose |
|------|---------|
| `docs/architecture.md` | 技术架构（数据表/存储层/数据流） |
| `docs/srs_design_v6.9.md` | SRS 算法权威设计文档 |
| `docs/忆海拾光_训练App_README.md` | 训练 App 版本历史 |
| `docs/yihai_变更记录_CLAUDE参考.md` | 完整变更历史（AI 参考） |

### 基础设施

| File | Purpose |
|------|---------|
| `sql/supabase_schema.sql` | 数据库 schema |
| `sql/supabase_storage_policies.sql` | Storage RLS 策略 |
| `supabase/functions/` | Edge Functions（管理 API） |
| `archive/` | 历史版本（v4.3–v4.8） |

## Current Version & Navigation

**当前版本：v5.13.10**（`index.html`，线上版）。**完整变更日志见 `docs/yihai_变更记录_CLAUDE参考.md`——本文件不再记录版本变更**。

**导航结构（v5.10+）：**
- `screen-home`：首页（默认），底部 `.home-tabbar`
- `screen-decks`：牌组管理（本地/云端/精选三段），底部 `.home-tabbar`
- `screen-stats`：统计（无 Tab Bar，`closeStats()` 回 `_statsOrigin`）
- `screen-mine`：我的，底部 `.home-tabbar`
- `screen-quiz`：练习/浏览（无 Tab Bar）
- `screen-finish`：完成（无 Tab Bar）
- `screen-voice-assist`：语音辅助管理（全屏，11 个语音槽录制/编辑）
- `screen-account`：账户登录/状态
- Settings：底部 Sheet overlay

**Tab Bar 模式分流：** standard 模式显示「首页/练习/我的」3 项；advanced 模式显示「首页/牌组/练习/统计/我的」5 项（CSS L269 `[data-mode="standard"] .advanced-only { display: none !important; }`）。

## Environment

**Windows 11 + PowerShell 5.1。** 所有 shell 命令用 PowerShell 工具，不用 Bash。路径分隔符 `\`，环境变量 `$env:VAR`，无 `&&`/`||` 管道链（改用 `; if ($?) {}`）。

## First-time Setup

```powershell
git config core.hooksPath .githooks
```

## Development Commands

```powershell
# 单元测试（全量，11 套件 596 断言）
node tests/run_all.js

# Playwright（需先启动 HTTP 服务器，必须用 PowerShell）
python -m http.server 8080 --directory C:\code

# 无需登录
node tests/_pw_ui_smoke.js
node tests/_pw_srs_e2e.js
node tests/_pw_easy.js

# 需登录
$env:TEST_PASSWORD="xxx"; node tests/_pw_cloud_sync.js
$env:TEST_PASSWORD="xxx"; node tests/_pw_cross_device.js
$env:TEST_PASSWORD="xxx"; node tests/_pw_easy_sync.js
```

**测试范围规则：**
- **Bug 修复** → `node tests/run_all.js`
- **发布** → 单元测试 + `_pw_ui_smoke.js` + `_pw_srs_e2e.js`（最小回归）
- **Easy 模式改动** → 加跑 `_pw_easy.js`（+ 同步路径改 `_pw_easy_sync.js`）
- **云端/登录改动** → 加跑 `_pw_cloud_sync.js`
- **语音参数 / config 同步改动** → 加跑 `_pw_config_sync.js`
- **跨设备/同步改动** → 加跑 `_pw_cross_device.js`
- **全量回归** → 仅用户明确要求时跑全部 Playwright

## SRS Architecture

`processAnswer` 实现 SM-2 变体，三阶段：`learning` → `review` ← `relearning`。完整状态机见 `docs/srs_design_v6.9.md`。

**关键保护机制：**
- `daily_remove_lapses` (3)：连续失败 N 次当天移出队列
- `auto_suspend_lapses` (8)：累计失败 N 次自动挂起
- `learn_ahead_limit` (1200s)：防止跳过 learning 步骤

**Learning hard 延迟：** 第一步 `(steps[0]+steps[1])/2`；仅一步时 `steps[0]×1.5`；第二步起不变。

**练习模式（`SRS_CONFIG.session_mode`）：**
- `normal`：完整 SRS 模式 — 全量到期积压，按 `due_ts` 升序出牌（Anki 默认顺序，无重排）
- `easy`：陪伴模式（v5.11 重设计）— 独立 EasyState 数据层（IDB `easyCardStates` v8 + 服务器 trigger 跨设备同步表 `easy_card_states`）；三级分类 confident/learning/unseen（`history === [1,1,1]` 才 confident）；session 结构 `[warmup CCC] + (L CCC)×k + tail r×C` 按 T 自适应（默认 19，预设 chip 15/19/23）；L 槽 unseen → learning「最弱」→ 远 confident，C 槽 confident → learning「最稳」伪 confident 兜底；首错以 `_pendingAttempt` 为唯一真相源记 0；**不写 `sync_card_states`**；配置 `easy_session_size`（15/19/23）、`easy_retry_on_wrong`（默认 true）。

**参数命名规则：** 所有 SRS 参数对齐 Anki 命名，不加后缀。

## Development Rules

1. **Single-file app** — 所有代码在 `index.html`，无单独 CSS/JS 文件（`yh_diag.js` 诊断面板例外，CDN 加载）。
2. **APP_VERSION 唯一入口** — `index.html` 中 `const APP_VERSION = 'x.y.z'`，`<title>` 和首页版本号由 JS 自动跟随，无需多处修改。
3. **One version per iteration** — patch bump 修复，minor bump 功能，major 平台迁移。
4. **No confirm()** — iOS PWA 会阻塞。用 `showConfirmDialog()` 自定义弹窗。
5. **SRS write race guard** — `_lastSrsWrite` promise chain；`goHome()`/`openStats()` 必须 `await _lastSrsWrite` 后再读。
6. **sessionId** — 每次 `_launch`/`goHome` 递增，打断跨页异步 TTS 链。
7. **warmupSpeech()** — 必须在用户手势内调用（iOS 解锁 TTS + Audio）。
8. **浏览器端改动必须先写 Playwright 测试** — Node.js 单测覆盖不到 DOM 渲染 / SDK 异步加载。流程：写测试复现（预期失败）→ 改代码 → 测试通过 → 跑回归 → 提交。
9. **Release prep** — 发布前移除测试工具栏（`🗑 重置牌组`、`⏭ +1天`）和调试行（`iv=X ef=X…`）。
10. **Supabase cloud sync** — 所有 Supabase 调用包 try/catch，fire-and-forget。`_syncEnabled` 门控所有同步。
11. **Cloud session** — SDK 自动持久化 session。启动时 `restoreCloudSession()`，状态：`_syncEnabled`（在线）、`_sessionRestoring`（恢复中）。
12. **Per-card upload: TrialLog only** — 逐卡只上传 `sync_trials`；`sync_card_states` 由 DB trigger 自动维护。`easy_card_states` 同模式（trigger 从 `sync_trials` 维护）。
13. **runSync 统一入口** — 所有同步通过 `runSync(options)`。`options.modal` 控制弹窗；`options.decks` 控制牌组同步。
14. **DP 仅本地** — `daily_progress` 不跨设备同步，只记本地；`last_warmup`（EasyState）同样仅本地。
15. **`_writeSrs` 改动后必须跑 Playwright** — 运行时错误会导致 TrialLog 静默丢失，单测覆盖不到 IDB 写入路径。
16. **Supabase 功能测试必须走真实 RLS 路径** — 测试不能 mock 掉网络层；anon 和已登录角色都要覆盖，上线前验证 RLS 策略覆盖所有预期角色。
17. **序列化层改动必须验证端到端渲染路径** — 改动 `saveDeckCards` / `restoreDecks` / `runCardsPhase` / `runMediaPhase` 任一处后，必须验证三条路径：① 本地导入 .yhspack 后 `<img>` 可见；② 刷新后图片仍显示（`restoreDecks` + IDB 恢复）；③ 跨设备 sync 后图片显示（`runMediaPhase` download）。不得仅凭 JS 内存 `c.img` 有值判断"正常"——必须验证 DOM 中真实 `<img src="blob:...">`。
18. **runMediaPhase 后台请求必须批量** — `upsertCardsMediaBatch` 替代每 slot 单行 upsert（v5.11 性能修复）。N 卡 × M slot 走 `pendingMediaUpsert` Set + checkpoint 批量提交，避免 N×M 次 PostgREST 往返。

## Coding & Editing Rules

1. **Simplicity first** — 最少代码解决问题。不添加未要求的功能，不为单次使用创建抽象。
2. **Surgical changes** — 只改必须改的。不"改进"相邻代码，匹配现有风格。只清理自己改动造成的孤儿引用。
3. **Goal-driven** — "修 bug" → 先写复现测试；"加功能" → 先定义验收标准。
4. **No comments** — 不写注释。变量/函数命名足够清晰时，注释是噪音。唯一例外：隐藏约束或反直觉的 workaround，一行以内。
5. **camelCase only** — 所有变量、函数、localStorage key 一律 camelCase。不用 snake_case、kebab-case（HTML id/class 除外）。**数据库列名用 snake_case**（与 JS 命名独立，不混用）。新增列/key 前先 grep 现有代码确认规范。修改内存中的 deck 元数据后必须调用 `saveDeckIndex()` 持久化。跨层命名规范完整版见 `docs/naming_convention.md`。

## Workflow Rules

1. **Bug fix** — 先查数据/代码定位根因，分析确认后再动手改。
2. **Feature/enhancement** — 先列路径和利弊，确定方向后再实现。
3. **文档先行** — `git add` 前检查 README / docs / CLAUDE.md 是否需同步。
4. **本地提交** — commit 前必须跑对应单元测试并全部通过。
5. **发布需指令** — `git push` / GitHub Pages 部署必须等明确「发布」指令。「提交」/「commit」只做本地 commit，不 push、不 merge、不打 tag。回滚代码改动前必须先确认。
6. **版本号仅在发布时 bump** — 发布 commit 同时完成：`APP_VERSION` 改字符串 + 打 tag。
7. **Commit message** — 简短前缀型：
   - `fix: 描述 (#N)` — bug 修复
   - `feat: 描述 (#N)` — 新功能
   - `perf: 描述 (#N)` — 性能
   - `refactor: 描述 (#N)` — 重构
   - `test: 描述 (#N)` — 测试
   - `docs: 描述 (#N)` — 文档
   - `release: v5.x.x` — 发布 commit（不带其他内容）

## Deployment

1. 所有测试通过（`run_all.js` + `_pw_ui_smoke` + `_pw_srs_e2e`，外加触及范围的加跑套件）
2. 文档同步：`CLAUDE.md` 当前版本行 + `docs/忆海拾光_训练App_README.md` + `docs/yihai_变更记录_CLAUDE参考.md`
3. 修改 `index.html` 的 `APP_VERSION` 常量（**唯一入口**，title 和首页版本号自动跟随）
4. 所有改动放入 `release: v5.x.x` commit
5. `git tag v5.x.x`
6. `git push; git push --tags`
7. `$env:HTTPS_PROXY="http://127.0.0.1:10808"; gh release create v5.x.x --title "v5.x.x" --notes "..."`
8. GitHub Pages 自动部署到 https://katelynmichelin976-wq.github.io/ReminiSea/

**代理说明：** git 代理已全局配置；`gh` 命令需每次新会话设置 `$env:HTTPS_PROXY=http://127.0.0.1:10808`。
