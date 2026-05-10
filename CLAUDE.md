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
- **Training app** uploads ← **Supabase** (sync_trials + sync_card_states + sync_config, fire-and-forget)
- **Training app** imports `.yhspack` directly (offline fallback)

## Key Files

### 当前版本
| File | Purpose |
|------|---------|
| `yihai_v4.9.html` | Main training app (single HTML file — CSS + markup + JS all inline, Supabase cloud sync) |
| `yihai_admin_v1.html` | Admin dashboard (doctor/caregiver monitoring panel, Supabase Edge Functions) |
| `deck_manager_v1.html` | Deck manager tool (upload → merge → organize → export, Supabase integrated) |
| `index_v49.html` | Card maker tool (paused) |

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
```

All tests must pass before commit. Current counts: SRS 67, v4.4 98, v4.8 46, v4.9 48, Playwright 22/17/21 (单机/网络/跨设备).

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
8. **Release prep** — remove test toolbar (`🗑 重置牌组`, `⏭ +1天`) and debug lines (`iv=X ef=X...`) before release.
9. **Supabase cloud sync** — all Supabase calls wrapped in try/catch, fire-and-forget. `_syncEnabled` gates all sync; false = offline mode.
10. **Cloud login** — Supabase SDK persists session in localStorage. `restoreCloudSession()` on startup, `updateCloudTabUI()` toggles login/deck-list UI.
11. **Incremental sync** — `syncDeckFromCloud` uses `cards_pool.updated_at > lastSyncAt` + `_imgUrl/_audUrl` URL comparison to skip unchanged media.

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
