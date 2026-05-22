# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**忆海拾光 (Memory Glimmers)** — A cognitive training PWA for AD/MCI patients. Single-file app (`yihai_v{version}.html`) with inline CSS/JS. Custom SM-2 SRS implementation, IndexedDB persistence, Supabase cloud sync, and GitHub Pages deployment.

## System Architecture

```
                         ┌──────────────────────────────────┐
                         │        Supabase Cloud            │
                         │                                  │
                         │  ┌──────────┐  ┌──────────────┐  │
                         │  │   Auth   │  │   Database   │  │
                         │  │ (session │  │ cards_pool   │  │
                         │  │  persist)│  │ server_decks │  │
                         │  └──────────┘  │ srv_deck_crd │  │
                         │                │ sync_trials  │  │
                         │  ┌──────────┐  │ sync_card_st │  │
                         │  │ Storage  │  └──────────────┘  │
                         │  │ ReminiSea│                    │
                         │  │ (images, │                    │
                         │  │  audio)  │                    │
                         │  └──────────┘                    │
                         └──────┬───────────┬───────────────┘
                                │           │
                   upload /     │           │ download /
                   sync cards   │           │ sync progress
                                │           │
              ┌─────────────────┘           └─────────────────┐
              ▼                                               ▼
   ┌─────────────────────┐                     ┌─────────────────────┐
   │  deck_manager_v1    │                     │  yihai_v4.x         │
   │  (牌组管理工具)       │                     │  (训练 App)          │
   │                     │                     │                     │
   │  上传 .yhspack       │                     │  每日 SRS 练习       │
   │  合并 → 卡池         │                     │  浏览 / 测验模式      │
   │  整理 → 牌组         │                     │  设置面板             │
   │  导出 .yhspack       │                     │  云端 Tab (v4.4+)    │
   └─────────────────────┘                     │                     │
                                               │  ┌───────────────┐  │
   ┌─────────────────────┐                     │  │  Local Store  │  │
   │  index_v49          │                     │  │               │  │
   │  (制卡工具 · 暂停)    │                     │  │ localStorage  │  │
   │                     │                     │  │  - decks      │  │
   │  编辑卡片内容        │                     │  │  - settings   │  │
   │  导出 .yhspack ─────┼─── 文件导入 ────────▶│  │  - SRS config │  │
   └─────────────────────┘                     │  │               │  │
                                               │  │ IndexedDB     │  │
                                               │  │  - media blob │  │
                                               │  │  - CardState  │  │
                                               │  │  - TrialLog   │  │
                                               │  └───────────────┘  │
                                               └─────────────────────┘
```

**Data flow:**
- **Card maker** (`index_v49`) → exports `.yhspack` → **Deck manager** uploads → **Supabase** (cards_pool + Storage)
- **Deck manager** organizes cards → **Supabase** (server_decks + server_deck_cards)
- **Training app** downloads ← **Supabase** (server_decks → cards_pool → Storage media)
- **Training app** uploads ← **Supabase** (sync_trials 承载完整状态快照 + sync_config)
- **DB trigger** `fn_trial_to_card_state()` — sync_trials INSERT → 自动 UPSERT sync_card_states
- **Training app** imports `.yhspack` directly (offline fallback)

## Key Files

### 当前版本
| File | Purpose |
|------|---------|
| `yihai_v4.11.html` | Main training app (v4.11.15, single HTML file — CSS + markup + JS all inline, Supabase cloud sync) |
| `yihai_admin_v1.html` | Admin dashboard (doctor/caregiver monitoring panel, Supabase Edge Functions) |
| `deck_manager_v1.html` | Deck manager tool (upload → merge → organize → export, Supabase integrated) — 已决定归入训练 App |
| `index_v49.html` | Card maker tool (paused) — 后续手机端制卡替代 |

### 测试
| File | Purpose |
|------|---------|
| `tests/srs_test.js` | Node.js SRS unit tests (83 cases) |
| `tests/yihai_v4.4_test.js` | v4.4 utility tests (98 cases) |
| `tests/yihai_v4.8_test.js` | v4.8 utility tests (46 cases) |
| `tests/yihai_v4.9_test.js` | v4.9 config merge tests (48 cases) |
| `tests/_playwright_test.js` | Playwright 单机版回归测试（12 断言） |
| `tests/_playwright_cloud_test.js` | Playwright 网络版回归测试（21 断言，已合并 session_restore） |
| `tests/_playwright_cross_device_sync_test.js` | Playwright 跨设备同步回归测试（18 断言） |
| `tests/_playwright_session_restore_test.js` | Playwright 登录恢复测试（8 断言，已合并入 cloud_test PHASE 5） |
| `tests/_playwright_user_switch_test.js` | Playwright 用户切换数据隔离测试（8 断言，已合并入 v4.10_regression PHASE 11） |
| `tests/_playwright_v4.9.1_regression_test.js` | v4.9.1 回归测试（21 断言） |
| `tests/_playwright_v4.10_regression_test.js` | v4.10 回归测试（39 断言，含多设备/离线/双开/重新登录验证） |
| `tests/_playwright_helper.js` | Playwright 测试公共工具（cloudLogin/cloudLogout/断言等） |
| `tests/_playwright_multi_user_sync_test.js` | Playwright 多用户数据隔离测试 |
| `tests/_dump_idb.js` | F12 控制台诊断：IndexedDB CardState + localStorage 配置 |
| `tests/_bookmarklet_diagnose.html` | 书签按钮版诊断工具 |
| `tests/_diag_sync_state.js` | Playwright 云端 vs 本地数据对比 |
| `tests/_check_due_count.js` | Node.js Supabase 直接查询到期数 |
| `tests/_playwright_session_mode_test.js` | Playwright 游戏模式设置 UI + 持久化测试（13 断言） |
| `tests/_playwright_session_mode_queue_test.js` | Playwright 队列难度曲线验证（14 断言，ef 首尾>中间） |
| `tests/_check_session_mode_order.js` | Node.js 查询妈妈账号当日卡片，输出三种模式出牌顺序 |
| `tests/yihai_v5.0_i18n_test.js` | 阶段 0 i18n 纯函数单测（detectLocale/t/detectScript/scriptToLang/resolveFieldLang/normalizeField） |
| `tests/_playwright_stage0_test.js` | 阶段 0 浏览器行为（locale 持久化、TTS 语言、.yhspack 导入字段语言） |
| `tests/_playwright_nav_verify.js` | Wave 1 dev.1 导航骨架验证（17 断言：Tab Bar/我的屏/设置入口） |
| `tests/_playwright_dev2_verify.js` | Wave 1 dev.2 点牌组进浏览验证（6 断言） |
| `tests/_playwright_browse_verify.js` | Wave 1 dev.4 浏览屏新设计验证（16 断言：DOM/进入/内容/翻页/返回） |
| `tests/_playwright_account_verify.js` | Wave 1 dev.5 账户屏验证（20 断言：入口/三态/导航/同步） |
| `tests/_playwright_settings_verify.js` | Wave 1 dev.6 设置屏验证（14 断言：Tab 结构/每日目标/代码） |
| `tests/test_data/` | Test .yhspack files |

### 文档
| File | Purpose |
|------|---------|
| `docs/srs_design_v6.9.md` | Authoritative SRS design spec |
| `docs/忆海拾光_训练App_README.md` | Training app version history |
| `docs/忆海拾光_管理看板_README.md` | Admin dashboard version history |
| `docs/忆海拾光_训练App发布检查清单.md` | Release checklist |
| `docs/yihai_开发问答.md` | Development Q&A |
| `docs/yihai_实现说明.md` | Implementation manual |
| `docs/忆海拾光_网络版实现说明_v4.9.md` | Cloud sync architecture doc (v4.9.12) |
| `docs/忆海拾光_v5.0_腾讯云迁移设计方案.md` | v5.0 migration plan |

### 基础设施
| File | Purpose |
|------|---------|
| `sql/supabase_schema.sql` | Database schema (8 tables) |
| `sql/supabase_storage_policies.sql` | Storage RLS policies |
| `sql/supabase_migration_002_sync_trials_after_state.sql` | Migration scripts |
| `sql/supabase_migration_003_admin.sql` | Admin dashboard migration (admin_users + indexes + RPCs) |
| `supabase/functions/` | Edge Functions (8 functions for admin API) |
| `archive/` | Previous versions (v4.3–v4.8) |

## v5.0 Plan（2026-05-19 更新）

**技术架构不迁移，主线继续 PWA + Capacitor 打包。** 放弃 uni-app + 腾讯云方案。

- 技术栈：单文件 HTML + Supabase + IndexedDB，保持不变
- 分发：PWA（主屏幕）+ Capacitor 打包 → App Store / Google Play
- 微信小程序方向暂不推进
- 旧方案文档保留备查：`docs/忆海拾光_v5.0_腾讯云迁移设计方案.md`

## Recent Changes

**当前版本：v4.11.18**（worktree `v5-stage0-i18n` 含阶段 0 + Wave 1，尚未发布）。完整变更历史见 `docs/yihai_变更记录_CLAUDE参考.md`。

**worktree 进度（2026-05-22）：**
- 阶段 0 i18n 地基：`detectLocale/t/getLocale/setLocale/detectScript/resolveFieldLang/normalizeField`，TTS `lang` 参数，`.yhspack` 字段语言迁移
- 医疗术语清理：删除 AD 建议值功能，meta 改「记忆练习」
- Wave 1 dev.1：Tab Bar（首页/FAB/我的）+ `screen-mine`（统计/设置/导入/账号卡）
- Wave 1 dev.2：点牌组行直接进浏览，`startBrowse` 加 `_launchBusy` 保护
- Wave 1 dev.3：`_statsOrigin` 记录来源屏，统计返回回原屏
- Wave 1 dev.4：新浏览屏 `screen-browse`（大图+名称+TTS+描述+翻页），脱离 screen-quiz
- Wave 1 dev.5：账户屏 `screen-account`（三态：登录/恢复中/已登录 + 同步按钮 + 实时上传开关）
- Wave 1 dev.6：设置屏改革——移除文字 Tab（4→3 Tab），通用 Tab 新增每日学习目标滑块

**导航结构（Wave 1 后）：**
- `screen-home`：首页（默认），底部 `.home-tabbar`（首页激活）
- `screen-mine`：我的，底部 `.home-tabbar`（我的激活）
- `screen-quiz`：练习/浏览（进入时无 Tab Bar）
- `screen-stats`：统计（无 Tab Bar，返回用 `closeStats()` 回 `_statsOrigin`）
- `screen-finish`：完成（无 Tab Bar）
- Settings：底部 Sheet overlay（不是独立 screen）

## Environment

**Windows 11 + PowerShell 5.1。** 所有 shell 命令用 PowerShell 工具，不用 Bash。路径分隔符 `\`，环境变量 `$env:VAR`，无 `&&`/`||` 管道链（改用 `; if ($?) {}`）。

## First-time Setup

```powershell
# Enable git hooks (issue-auto-create on commit)
git config core.hooksPath .githooks
```

## Development Commands

```powershell
# Run SRS unit tests (required before/after modifying processAnswer or related logic)
node tests/srs_test.js

# Run v4.4 utility tests (required before/after modifying simpleHash, escAttr, data format, sync logic)
node tests/yihai_v4.4_test.js

# Run v4.8 utility tests (required before/after modifying cdnMediaUrl, secsToLabel, parallelMapLimit, setObjURL)
node tests/yihai_v4.8_test.js

# Run v4.9 config merge tests (required before/after modifying cloudPushConfig/cloudPullConfig merge logic)
node tests/yihai_v4.9_test.js

# Run Playwright 回归测试（可视化浏览器，需先启动 HTTP 服务）
# python -m http.server 8080 --directory C:\code
node tests/_playwright_test.js
$env:TEST_PASSWORD="xxx"; node tests/_playwright_v4.10_regression_test.js  # 文件名保留 v4.10，仍适用 v4.11
$env:TEST_PASSWORD="xxx"; node tests/_playwright_cloud_test.js
$env:TEST_PASSWORD="xxx"; node tests/_playwright_cross_device_sync_test.js
# session_restore 和 user_switch 已分别合并入 cloud_test 和 v4.10_regression
node tests/_playwright_session_mode_test.js        # 游戏模式 UI + 持久化
node tests/_playwright_session_mode_queue_test.js  # 队列难度曲线（需先启动 HTTP 服务）
```

**测试范围规则：**
- **Bug 修复** → 只跑单元测试（srs + v4.4 + v4.8 + v4.9）
- **发布** → 单元测试 + 最小回归（`_playwright_test.js` 单机版）
- **全量回归** → 仅用户明确要求时跑
- **智能匹配** → 修复涉及哪个模块，优先跑对应模块测试（如 session 改动跑 cloud_test）
- 确认改动无问题即可，不需要每次都跑全部 8 套 Playwright。

Current counts: SRS 85, v4.4 98, v4.8 46, v4.9 48, i18n 27, Playwright 12/39/21/18/13/14/6/17/6/16/20/14（单机/v4.10回归/网络/跨设备/session_mode/session_mode_queue/stage0/nav_verify/dev2_verify/browse_verify/account_verify/settings_verify）.

## SRS Architecture

The `processAnswer` function implements an SM-2 variant with three stages: `learning`, `review`, `relearning`. See `srs_design_v6.9.md` for the complete state machine.

**State flow:**
```
new → learning → review (graduated)
           ↑ good (regraduate)
      relearning
review → again → relearning
```

**Key protection mechanisms:**
- `daily_remove_lapses` (3): card removed from queue for the day after N consecutive failures
- `auto_suspend_lapses` (8): card auto-suspended after N total failures
- `learn_ahead_limit` (1200s): prevents learning steps from being bypassed
- `learning_hard_counts_lapse` (false): AD 模式下 learning/relearning 阶段 hard 也计入连失

**Learning hard 延迟规则（废弃 hard_step_multiplier）：**
- 第一步：`(steps[0] + steps[1]) / 2`（如 `[1,10]` → 5.5min）
- 仅一步时：`steps[0] × 1.5`
- 第二步起：不变（与 Anki 一致）

**Storage layers:**
- `localStorage`: deck index, card metadata, settings, SRS config overrides, daily progress
- `IndexedDB yihai_media`: image/audio blobs
- `IndexedDB yihai_srs v5`: CardState (`card_states` store) + TrialLog (`trials` store) + app_events

**Parameter naming rule:** All SRS parameters align with Anki names — no suffixes. E.g. `learn_ahead_limit` not `learn_ahead_secs`.

**游戏难度模式（v4.11.7+）：**
- `SRS_CONFIG.session_mode`（`'normal'|'hard'|'survival'`，默认 `'normal'`，持久化到 `srs_session_mode`）
- 三种模式影响 `buildSessionQueue` 的选牌和排序，不影响答题后的 SM-2 算法
- `difficultyScore(s)` — ef 反转 + lapses 归一 + learning/relearning 阶段 +0.5 bonus（难度未知视同难）
- `applyCurve(queue)` — 双指针交错排列，产生"首尾易、中间难"的 U 形曲线
- 普通模式：20 张，hard≤25%（≤5 张），其余填 easy 和 new；困难模式：≤30 张 + curve；生存模式：全量积压 + curve
- 剧情模式 = 复用现有浏览模式，不走 buildSessionQueue

## Development Rules

1. **Single-file app** — all code lives in `yihai_v{version}.html`. No separate CSS/JS files.
2. **Version in filename** — output file must be `yihai_v{version}.html` with version displayed in the app UI.
3. **One version per iteration** — patch bump for fixes (v4.10.3 → v4.10.4), minor bump for features (v4.10 → v4.11), major for platform migration (v4 → v5).
4. **No confirm()** — iOS PWA blocks it. Use `showConfirmDialog()` custom dialog instead.
5. **SRS write race guard** — `_lastSrsWrite` promise chain; `goHome()`/`openStats()` must `await _lastSrsWrite` before reading.
6. **sessionId** — increments on each `_launch`/`goHome` to break cross-page async speech chains.
7. **warmupSpeech()** — must be called within user gesture on iOS (unlocks TTS + Audio simultaneously).
8. **浏览器端改动必须先写 Playwright 测试复现再改代码** — 历史教训：Node.js 单测覆盖不到浏览器时序（DOM 渲染、SDK 异步加载、Service Worker）。直接改代码 → 测试全绿 → 用户一用就崩。流程：写测试复现 bug（预期失败）→ 改代码 → 测试通过 → 跑全部回归 → 提交。
9. **Release prep** — remove test toolbar (`🗑 重置牌组`, `⏭ +1天`) and debug lines (`iv=X ef=X...`) before release.
10. **Supabase cloud sync** — all Supabase calls wrapped in try/catch, fire-and-forget. `_syncEnabled` gates all sync; false = offline mode.
11. **Cloud login** — Supabase SDK persists session in localStorage. `restoreCloudSession()` on startup, `updateCloudTabUI()` toggles login/deck-list UI. 三个 session 状态 flag：`_syncEnabled`（已验证在线）、`_sessionRestoring`（SDK 加载中或 session 恢复中，显示"正在恢复登录…"）、`_sessionOffline`（有凭证但网络失败，显示"📵 邮箱（网络不稳定）"并等 `online` 事件自动重连）。曾登录过的用户页面加载时同步设 `_sessionRestoring=true`，`initCloud()` 完成后清除并调 `updateCloudTabUI()`。
12. **Incremental sync** — `syncDeckFromCloud` uses `cards_pool.updated_at > lastSyncAt` + `_imgUrl/_audUrl` URL comparison to skip unchanged media.
13. **No smart sync skip** — `checkSyncNeeded()` 已在 v4.11.5 删除（含 epoch/ISO 比较 bug，且从未接入 `runSync`）。当前所有同步路径直接调 `runSync`，无跳过逻辑。
14. **Per-card upload: TrialLog only** — 逐卡仅上传 `sync_trials`（含完整状态快照）；`sync_card_states` 由 DB trigger `fn_trial_to_card_state()` 自动维护；`card_state_log` 已废弃。
15. **Supabase SDK defer load** — `<script src="supabase" defer>` 不阻塞 DOM 解析和渲染；`initCloud()` 在 SDK 就绪后自动执行。离线下 SDK 加载失败 → `restoreCloudSession()` 静默跳过 → 离线模式。
16. **runSync 统一同步入口** — 所有同步操作必须通过 `runSync(options)`，不支持直接调旧 `syncAll`。`options.modal` 控制是否显示模态弹窗；`options.decks` 控制是否同步牌组。
17. **DP 仅本地维护** — `daily_progress`（reviewed_today/daily_new_today）不跨设备同步。跨设备仅同步 CardState 和 TrialLog。DP 由答题时 `writeTrialLog` 写入，只读本地。
18. **_writeSrs 改动后必须跑 Playwright** — `_writeSrs` 中的运行时错误（如 ReferenceError）会导致 TrialLog 静默丢失，Node.js 单测覆盖不到（单测只测 `processAnswer` 纯函数，不测 IndexedDB 写入路径）。改动 `_writeSrs` 或 TrialLog 构造逻辑后，至少跑 `_playwright_test.js`（单机版，33s，断言 `trials >= 20`）。教训：v4.11.9 删除 `const isRetrying = false` 漏改引用，`_retrying: isRetrying` → ReferenceError，所有 TrialLog 写入崩溃；SRS/v4.4/v4.8/v4.9 单测全绿未拦住。

## Coding & Editing Rules

1. **Simplicity first** — 用最少代码解决问题。不添加未要求的功能，不为单次使用创建抽象，不处理不可能发生的错误场景。200 行能写成 50 行就重写。
2. **Surgical changes** — 只改必须改的。不"改进"相邻代码/注释/格式，不重构没坏的东西，匹配现有风格即使你不喜欢。只清理你自己的改动造成的孤儿引用/变量/导入。不相关的死代码只提不删。
3. **Goal-driven** — 把任务转化为可验证目标。"修 bug"→ 先写复现测试；"加功能"→ 先定义验收标准。多步骤任务先列计划+验证点。Dev Rule 8（浏览器端 Playwright 先行）是这一原则的具体化。

## Workflow Rules

1. **Bug fix** — 你报告现象后，我先查数据/代码定位根因，把分析摆出来。等你确认定位无误，再动手改。
2. **Feature/enhancement** — 先列举可选路径和利弊，等你决定方向后，再进入实现。
3. **文档先行** — `git add` 之前检查相关文档（README、docs/、CLAUDE.md 等）是否需要同步更新。功能新增或行为变更，先改文档再提交代码。
4. **本地提交** — commit 可随时做，但提交前必须跑对应单元测试并全部通过。
5. **发布需指令** — `git push` / 部署到 GitHub Pages 必须等你明确说「正式发布」或「推送」后才执行。
6. **版本号仅在发布时 bump** — 开发过程中代码里版本号不变（保留上一发布版本）。发布时一个 commit 完成：bump 版本号（HTML 中 3 处：`<title>`、`.home-version`、`APP_VERSION` 常量）+ 复制 `yihai_v{version}.html` → `index.html` + 打 tag。版本号在 HTML 中的目的是运行时识别——本地缓存、远程部署、测试环境可能跑着不同版本。
7. **Commit message** — 遵循 `type: v{version}: description (#issue)` 格式：
   - `fix: v4.9.15: 迟到天数加成 (#8)` — 版本号是发现问题的已发布版本
   - `feat: 牌组层级管理 (#13)` — 新功能不绑定版本号
   - `docs: CLAUDE.md 同步` — 文档不绑定版本号
   - `release: v4.9.16` — 发布 commit，包含 bump 版本号 + index.html + 文档同步

## Deployment

发布流程：
1. 所有测试通过（SRS + v4.4 + v4.8 + v4.9 + Playwright）
2. **文档同步检查**（必须在 release commit 之前完成，与代码一起提交）：
   - `CLAUDE.md`：更新 `当前版本` 表格里的版本号 + `Recent Changes` 版本号
   - `docs/忆海拾光_训练App_README.md`：在「版本历史」顶部插入新版本条目
   - `docs/yihai_变更记录_CLAUDE参考.md`：补充本版本的关键技术变更
3. 修改 `yihai_v4.11.html` 中 **3 处**版本号：`<title>`、`.home-version`、`APP_VERSION` 常量
4. 复制 `yihai_v4.11.html` → `index.html`
5. 将上述所有改动（HTML + index.html + 文档）一起放入 `release: v4.x.x` commit
6. `git tag v4.x.x`
7. `git push; git push --tags`（PowerShell 不支持 `&&`）
8. `$env:HTTPS_PROXY="http://127.0.0.1:10808"; gh release create v4.x.x --title "v4.x.x" --notes "..."`
9. GitHub Pages 自动部署到 https://katelynmichelin976-wq.github.io/gemi/

**代理说明：** git 代理已全局配置（http.proxy + https.proxy = 127.0.0.1:10808）；`gh` 命令（包括 `gh issue create/close/comment`）依赖 `$env:HTTPS_PROXY` 环境变量，每次新 PowerShell 会话需重新设置。

Card maker is a separate repo (`anki-maker`), not in this working directory.
