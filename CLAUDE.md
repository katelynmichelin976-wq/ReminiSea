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
| `yihai_v4.9.html` | Main training app (v4.9.1, single HTML file — CSS + markup + JS all inline, Supabase cloud sync) |
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
| `tests/_playwright_v4.9.1_regression_test.js` | v4.9.1 回归测试（21 断言：白屏/到期上限/finish计数/TrialLog字段/统计页） |
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

**从 PWA → uni-app + 腾讯云 CloudBase 迁移。** 一套代码出微信小程序 + H5。

| 决策 | 结论 | 理由 |
|------|------|------|
| 框架 | uni-app (Vue) | AI 开发效率高，与现有 HTML/CSS 思维一致，多端编译 |
| 后端 | 腾讯云 CloudBase | 国内节点合规，原生 SDK 直连数据库，微信生态打通 |
| 登录 | 微信 `wx.login` | 免密一键登录，个人主体可用，免费 |
| 小程序主体 | 个人 | 无支付/web-view 需求，类目选"教育-在线教育" |
| 独立 App | 暂缓 | 需 ICP 备案 + 医疗器械资质风险，待小程序验证后评估 |

**预估总工时：12-17 天。** 现有 SRS 纯逻辑（processAnswer 等 ~300 行）直接复用。完整方案见 `docs/忆海拾光_v5.0_腾讯云迁移设计方案.md`。

### Key Changes (planning)

- **Storage 层**：IndexedDB → 微信文件系统 + CloudBase 文档数据库
- **TTS**：speechSynthesis → 微信 TTS 插件（语速/音调控制受限，需评估）
- **Audio**：Audio + AudioContext → InnerAudioContext（tone 改预录制文件）
- **Supabase SDK** → CloudBase 原生 SDK（网络请求无需适配层）
- **用户标识**：邮箱 → openid（微信 `wx.login` 自动获取）
- **牌组管理**：deck_manager_v1 废弃，功能内化到训练 App
- **H5 保留**：uni-app 编译到 H5，现有 PWA 用户无缝过渡

## v4.9.1 Key Changes

- **白屏修复**: Supabase CDN 改为 JS 动态加载（`loadSupabaseSDK()`），UI 初始化不再等待 CDN
- **智能同步**: 新增 `checkSyncNeeded()` — 先检查本地脏数据 + 服务器时间戳，不需要同步时零网络等待
- **减少逐卡上传**: 去掉 `logCardStateChange`（`card_state_log` 表废弃）；`saveCardState` 不再逐卡实时上传；TrialLog 新增 `due_ts/due_date/suspended/suspended_reason` 字段承载完整状态
- **SRS 写入保护**: `showFinish()` 前 `await _lastSrsWrite`，避免最后一张卡 daily progress 计数偏少
- **主页到期数虚高**: `getDeckStatsSrs()` 的 `due` 受 `max(0, max_reviews - reviewed_today)` 上限约束
- **统计页日期过滤**: `renderStatsToday()` 按日历日过滤 TrialLog，不再混入昨日数据
- **埋点增强**: `build_queue` payload 增加 `used_review/review_slots/new_slots`；新增 `show_finish` 事件
- **DB trigger**: `fn_trial_to_card_state()` — sync_trials INSERT 自动 UPSERT sync_card_states；前端不再直接写 CardState
- **每日评级计数**: `_writeSrs` 更新 `first_pass/hard/fail_today`，单设备用户统计页评级不再永远是 0
- **Code review 修复**: `openSrsDb` promise 缓存防并发；`syncCardStatesFromCloud` 去掉 device_id 过滤兼容双 Tab；`cloudPushConfig` 用 `_cloudUserId` 替代 getSession

## v4.9.2–v4.9.8 修复（2026-05-11）

| 版本 | 修复项 | 说明 |
|------|--------|------|
| v4.9.2 | syncTrialLog 漏字段 | INSERT 补 due_ts/due_date/suspended/suspended_reason |
| v4.9.3 | 统计总卡片数 | total 改用 DECKS[deckKey].length，跨设备一致 |
| v4.9.4 | 刷新后登录恢复 | SDK defer 晚于 inline → 轮询就绪后再 initCloud |
| v4.9.5 | 登录恢复 + 统计刷新 | SDK 就绪轮询 + checkSyncNeeded=false 也刷新统计 |
| v4.9.6 | updateDeckStats 占用符覆盖 | initUI await updateDeckStats；轻量同步不调 renderDeckList |
| v4.9.7 | IndexedDB 首次打开空 | getAllCardStates 空值保护 + updateDeckStats catch 写0 |
| v4.9.8 | 去除冗余网络请求 | checkSyncNeeded=false 不再拉 syncCardStatesFromCloud |
| v4.9.9 | 退出登录清除本地数据 | doCloudLogout 清 _cloudUserId + 云牌组 + IndexedDB，防切换用户混淆 |

### 关键行为变更

- **initCloud 调用时机**：`_tryInitCloud()` 每 200ms 轮询 `typeof supabase`，就绪后执行，最多等 10s
- **initUI 中 updateDeckStats 加 await**：避免异步结果被后续渲染覆盖
- **needsSync=false 路径**：不产生任何网络请求，信任本地数据 + initUI 已渲染
- **syncAll 仍从 doCloudLogin 触发**：登录后走完整同步（含牌组下载）

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
8. **Release prep** — remove test toolbar (`🗑 重置牌组`, `⏭ +1天`) and debug lines (`iv=X ef=X...`) before release.
9. **Supabase cloud sync** — all Supabase calls wrapped in try/catch, fire-and-forget. `_syncEnabled` gates all sync; false = offline mode.
10. **Cloud login** — Supabase SDK persists session in localStorage. `restoreCloudSession()` on startup, `updateCloudTabUI()` toggles login/deck-list UI.
11. **Incremental sync** — `syncDeckFromCloud` uses `cards_pool.updated_at > lastSyncAt` + `_imgUrl/_audUrl` URL comparison to skip unchanged media.
12. **Smart sync** — `checkSyncNeeded()` checks local dirty data + server `updated_at > yihai_global_sync_ts` before running full `syncAll`. Skipped if nothing changed.
13. **Per-card upload: TrialLog only** — 逐卡仅上传 `sync_trials`（含完整状态快照）；`sync_card_states` 由 DB trigger `fn_trial_to_card_state()` 自动维护；`card_state_log` 已废弃。
14. **Supabase SDK defer load** — `<script src="supabase" defer>` 不阻塞 DOM 解析和渲染；`initCloud()` 在 SDK 就绪后自动执行。离线下 SDK 加载失败 → `restoreCloudSession()` 静默跳过 → 离线模式。

## Workflow Rules

1. **Bug fix** — 你报告现象后，我先查数据/代码定位根因，把分析摆出来。等你确认定位无误，再动手改。
2. **Feature/enhancement** — 先列举可选路径和利弊，等你决定方向后，再进入实现。
3. **文档先行** — `git add` 之前检查相关文档（README、docs/、CLAUDE.md 等）是否需要同步更新。功能新增或行为变更，先改文档再提交代码。
4. **本地提交** — commit 可随时做，但提交前必须跑对应单元测试并全部通过。
5. **发布需指令** — `git push` / 部署到 GitHub Pages 必须等你明确说「正式发布」或「推送」后才执行。
6. **Commit message** — 遵循 repo 既有风格（fix:/feat:/docs:/release:），说明「为什么」而非「改了什么」。

## Deployment

我复制 `yihai_v{version}.html` → `index.html` → 提交 → 等你确认 → 推送。GitHub Pages 自动部署到 https://katelynmichelin976-wq.github.io/gemi/

Card maker is a separate repo (`anki-maker`), not in this working directory.
