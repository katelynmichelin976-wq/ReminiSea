# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**忆海拾光 (Memory Glimmers)** — A cognitive training PWA for AD/MCI patients. Single-file app (`yihai_v{version}.html`) with inline CSS/JS. Custom SM-2 SRS implementation, IndexedDB persistence, and GitHub Pages deployment.

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
- **Training app** uploads ← **Supabase** (sync_trials + sync_card_states, fire-and-forget)
- **Training app** imports `.yhspack` directly (offline fallback)

## Key Files

| File | Purpose |
|------|---------|
| `yihai_v4.7.html` | Main training app (single HTML file — CSS + markup + JS all inline, Supabase cloud sync) |
| `yihai_v4.6.html` | v4.6 (previous version, kept for reference) |
| `deck_manager_v1.html` | Deck manager tool (upload → merge → organize → export, Supabase integrated) |
| `srs_test.js` | Node.js SRS unit tests (67 test cases, 59 pass + 8 pre-existing date-offset failures) |
| `yihai_v4.4_test.js` | Node.js unit tests for v4.4 additions: simpleHash, escAttr, data format, sync URL logic (55 tests) |
| `srs_design_v6.9.md` | Authoritative SRS design spec — all SRS implementation decisions derive from this |
| `supabase_schema.sql` | Supabase database schema (6 tables + indexes) |
| `supabase_storage_policies.sql` | Supabase Storage RLS policies for ReminiSea bucket |
| `忆海拾光_训练App_README.md` | Full version history, data formats, architecture docs |
| `忆海拾光_训练App发布检查清单.md` | Release checklist — execute before every release |
| `00_新会话入口.md` | Session context recovery document for resuming work across conversations |
| `yihai_开发问答.md` | Development Q&A — records of user questions and implementation decisions during development |
| `yihai_实现说明.md` | Implementation manual — cross-module design, sync timing, voice system, stats definitions |

## Development Commands

```bash
# Run SRS unit tests (required before/after modifying processAnswer or related logic)
node srs_test.js

# Run v4.4 utility tests (required before/after modifying simpleHash, escAttr, data format, sync logic)
node yihai_v4.4_test.js
```

All 67 SRS tests must pass — covers: new card learning path, review stage (with screenshot cross-validation), relearning, lapses protection, full lifecycle.

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

## Deployment

Rename `yihai_v{version}.html` → `index.html`, push to `gemi` repo `main` branch. GitHub Pages auto-deploys at https://katelynmichelin976-wq.github.io/gemi/

Card maker is a separate repo (`anki-maker`), not in this working directory.
