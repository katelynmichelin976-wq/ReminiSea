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
| `yihai_v4.9.html` | Main training app (v4.9.15, single HTML file — CSS + markup + JS all inline, Supabase cloud sync) |
| `yihai_admin_v1.html` | Admin dashboard (doctor/caregiver monitoring panel, Supabase Edge Functions) |
| `deck_manager_v1.html` | Deck manager tool (upload → merge → organize → export, Supabase integrated) — 已决定归入训练 App |
| `index_v49.html` | Card maker tool (paused) — 后续手机端制卡替代 |

### 测试
| File | Purpose |
|------|---------|
| `tests/srs_test.js` | Node.js SRS unit tests (67 cases) |
| `tests/yihai_v4.4_test.js` | v4.4 utility tests (98 cases) |
| `tests/yihai_v4.8_test.js` | v4.8 utility tests (46 cases) |
| `tests/yihai_v4.9_test.js` | v4.9 config merge tests (48 cases) |
| `tests/_playwright_test.js` | Playwright 单机版回归测试（22 断言） |
| `tests/_playwright_cloud_test.js` | Playwright 网络版回归测试（17 断言） |
| `tests/_playwright_cross_device_sync_test.js` | Playwright 跨设备同步回归测试（21 断言） |
| `tests/_playwright_session_restore_test.js` | Playwright 登录恢复测试（8 断言） |
| `tests/_playwright_user_switch_test.js` | Playwright 用户切换数据隔离测试（8 断言） |
| `tests/_playwright_v4.9.1_regression_test.js` | v4.9.1 回归测试（21 断言） |
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

## v5.0 Plan（2026-05-10 更新）

**从 PWA → uni-app + 腾讯云 CloudBase 迁移。** 一套代码出微信小程序 + H5。预估总工时 12-17 天，SRS 纯逻辑直接复用。完整方案见 `docs/忆海拾光_v5.0_腾讯云迁移设计方案.md`。

## Recent Changes

v4.9.1 引入智能同步（`checkSyncNeeded`）、DB trigger（`fn_trial_to_card_state`）、TrialLog 承载完整状态快照。v4.9.2–v4.9.15 累计修复 14 项（登录恢复、IndexedDB 竞态、跨设备状态缺失、时区偏移等）。详见 `docs/yihai_变更记录_CLAUDE参考.md`。

### 关键行为变更（当前版本）

- **initCloud 调用时机**：`_tryInitCloud()` 每 200ms 轮询 `typeof supabase`，就绪后执行，最多等 10s
- **initUI 中 updateDeckStats 加 await**：避免异步结果被后续渲染覆盖
- **needsSync=false 路径**：不产生任何网络请求，信任本地数据 + initUI 已渲染
- **syncAll step 7 拉全部云牌组 CardState**：不影响练习自动同步（noDecks=true），仅登录/手动同步时生效
- **练习天数 = 缓存值 + 本地未同步新增**：不再查云端 90 天，统计页零延迟且始终准确
- **服务端**：user_deck_stats 表 + trg_update_practice_days trigger 自动维护练习天数

## Development Commands

```bash
# Run SRS unit tests (required before/after modifying processAnswer or related logic)
node tests/srs_test.js

# Run v4.4 utility tests (required before/after modifying simpleHash, escAttr, data format, sync logic)
node tests/yihai_v4.4_test.js

# Run v4.8 utility tests (required before/after modifying cdnMediaUrl, secsToLabel, parallelMapLimit, setObjURL)
node tests/yihai_v4.8_test.js

# Run v4.9 config merge tests (required before/after modifying cloudPushConfig/cloudPullConfig merge logic)
node tests/yihai_v4.9_test.js

# Run Playwright 回归测试（可视化浏览器，需先启动 HTTP 服务）
# python -m http.server 8080 --directory /c/code
node tests/_playwright_test.js
node tests/_playwright_cloud_test.js
TEST_PASSWORD=xxx node tests/_playwright_cross_device_sync_test.js
TEST_PASSWORD=xxx node tests/_playwright_session_restore_test.js
TEST_PASSWORD=xxx node tests/_playwright_user_switch_test.js
```

All tests must pass before commit. Current counts: SRS 67, v4.4 98, v4.8 46, v4.9 48, Playwright 22/17/21/8/8 (单机/网络/跨设备/登录恢复/用户切换).

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

**Storage layers:**
- `localStorage`: deck index, card metadata, settings, SRS config overrides, daily progress
- `IndexedDB yihai_media`: image/audio blobs
- `IndexedDB yihai_srs v3`: CardState (`card_states` store) + TrialLog (`trials` store)

**Parameter naming rule:** All SRS parameters align with Anki names — no suffixes. E.g. `learn_ahead_limit` not `learn_ahead_secs`.

## Development Rules

1. **Single-file app** — all code lives in `yihai_v{version}.html`. No separate CSS/JS files.
2. **Version in filename** — output file must be `yihai_v{version}.html` with version displayed in the app UI.
3. **One version per iteration** — semver minor increments (v4.3 → v4.4 → v5.0).
4. **No confirm()** — iOS PWA blocks it. Use `showConfirmDialog()` custom dialog instead.
5. **SRS write race guard** — `_lastSrsWrite` promise chain; `goHome()`/`openStats()` must `await _lastSrsWrite` before reading.
6. **sessionId** — increments on each `_launch`/`goHome` to break cross-page async speech chains.
7. **warmupSpeech()** — must be called within user gesture on iOS (unlocks TTS + Audio simultaneously).
8. **浏览器端改动必须先写 Playwright 测试复现再改代码** — 历史教训：Node.js 单测覆盖不到浏览器时序（DOM 渲染、SDK 异步加载、Service Worker）。直接改代码 → 测试全绿 → 用户一用就崩。流程：写测试复现 bug（预期失败）→ 改代码 → 测试通过 → 跑全部回归 → 提交。
9. **Release prep** — remove test toolbar (`🗑 重置牌组`, `⏭ +1天`) and debug lines (`iv=X ef=X...`) before release.
10. **Supabase cloud sync** — all Supabase calls wrapped in try/catch, fire-and-forget. `_syncEnabled` gates all sync; false = offline mode.
11. **Cloud login** — Supabase SDK persists session in localStorage. `restoreCloudSession()` on startup, `updateCloudTabUI()` toggles login/deck-list UI.
12. **Incremental sync** — `syncDeckFromCloud` uses `cards_pool.updated_at > lastSyncAt` + `_imgUrl/_audUrl` URL comparison to skip unchanged media.
13. **Smart sync** — `checkSyncNeeded()` checks local dirty data + server `updated_at > yihai_global_sync_ts` before running full `syncAll`. Skipped if nothing changed.
14. **Per-card upload: TrialLog only** — 逐卡仅上传 `sync_trials`（含完整状态快照）；`sync_card_states` 由 DB trigger `fn_trial_to_card_state()` 自动维护；`card_state_log` 已废弃。
15. **Supabase SDK defer load** — `<script src="supabase" defer>` 不阻塞 DOM 解析和渲染；`initCloud()` 在 SDK 就绪后自动执行。离线下 SDK 加载失败 → `restoreCloudSession()` 静默跳过 → 离线模式。

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
6. **版本号仅在发布时 bump** — 开发过程中代码里版本号不变（保留上一发布版本）。发布时一个 commit 完成：bump 版本号（HTML 中 2 处 `<title>` + `.home-version`）+ 复制 `yihai_v{version}.html` → `index.html` + 打 tag。版本号在 HTML 中的目的是运行时识别——本地缓存、远程部署、测试环境可能跑着不同版本。
7. **Commit message** — 遵循 `type: v{version}: description (#issue)` 格式：
   - `fix: v4.9.15: 迟到天数加成 (#8)` — 版本号是发现问题的已发布版本
   - `feat: 牌组层级管理 (#13)` — 新功能不绑定版本号
   - `docs: CLAUDE.md 同步` — 文档不绑定版本号
   - `release: v4.9.16` — 发布 commit，包含 bump 版本号 + index.html

## Deployment

发布流程：
1. 所有测试通过（SRS + v4.4 + v4.8 + v4.9 + Playwright）
2. 修改 `yihai_v4.9.html` 中 2 处版本号（`<title>` 和 `.home-version`）
3. 复制 `yihai_v4.9.html` → `index.html`
4. 提交 `release: v4.9.16`
5. `git tag v4.9.16`
6. `git push && git push --tags`
7. GitHub Pages 自动部署到 https://katelynmichelin976-wq.github.io/gemi/

Card maker is a separate repo (`anki-maker`), not in this working directory.
