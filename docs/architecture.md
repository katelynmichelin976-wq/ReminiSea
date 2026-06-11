# 忆海拾光 · 技术架构

## 数据层

### Supabase Cloud

#### 客户端写入表（App 直接 INSERT / UPSERT）

| 表 | 用途 |
|----|------|
| `sync_trials` | 练习日志（答题流水，含 before/after 字段供算法验证） |
| `sync_config` | 用户配置跨设备同步 |
| `decks` | 牌组元数据（id, user_id, name, deck_type, updated_at） |
| `deck_cards` | 牌组卡片（deck_id FK, card_id, fields, media JSONB） |
| `device_registry` | 设备登录记录（first_seen / last_seen） |
| `feedback` | 用户反馈（anon INSERT only） |

#### Trigger 派生表（由 DB 自动维护，客户端只读）

| 表 | 派生来源 | 维护 trigger |
|----|---------|-------------|
| `sync_card_states` | `sync_trials` INSERT | `fn_trial_to_card_state` — 用 `_after` 字段 UPSERT 最新卡片状态；客户端仅在无 trial 操作（手动挂起/解除/重置）时直接写入 |
| `user_deck_stats` | `sync_trials` INSERT | `trg_update_practice_days` — 按天去重累加 `practice_days` / `last_practice_date` |

> **维护原则：** 派生表的数据以 trigger 为真相源，不应绕过 trigger 直接批量写入；客户端直写仅限 trigger 无法覆盖的状态变更（如手动操作不产生 trial 的场景）。

**Storage：** `ReminiSea` 桶，存图片/音频。preset/shared 类型公开读；personal 类型 owner 私有。

**RLS：** `decks` preset/shared 全员可读，personal 仅 owner 读写。

### 本地存储

| 层 | 存储内容 |
|----|---------|
| `localStorage` | 牌组索引（DECKS_META）、设置、SRS config、daily_progress |
| `IndexedDB yihai_srs` | `card_states`（CardState）、`trials`（TrialLog）、`app_events` |
| `IndexedDB yihai_media` | 图片/音频 blob（key = `{deck_key}_{card_id}_img/aud`） |

## 关键数据流

### 登录 → 初始化
```
登录成功 → onAuthStateChange(SIGNED_IN)
  → runSync({ decks: true })
    → downloadDeckFromCloud()    // decks + deck_cards → localStorage + IDB media
    → pullCardStates()           // sync_card_states → IDB card_states
```

### 答题 → 云端同步
```
用户答题 → processAnswer() → CardState
  → _writeSrs()
    → IDB card_states.put()
    → uploadTrialLog()           // sync_trials INSERT
      → DB trigger fn_trial_to_card_state()
        → sync_card_states UPSERT（自动）
```

### 个人牌组同步
```
saveCard() / deleteCard()        // 仅写本地 IDB，标 localDirty
手动「同步」按钮 / runSync({decks:true})
  → syncAllDirtyDecks()
    → syncDeck(key)
      → SyncJob.run()
        ① runStructurePhase: decks + 卡片元数据 diff（toPush/toPull/toDelete/localDelete）
        ② runCardsPhase: 卡片正文批量 upsert/pull/delete
        ③ runMediaPhase: 媒体 slot upload/download + checkpoint 批量 upsertCardsMediaBatch
refreshDeckUpdateBadges()        // session 就绪后比对 decks.updated_at，给本地牌组打黄点
```

### 跨设备同步
- CardState / TrialLog 通过云端同步
- `daily_progress`（reviewed_today / daily_new_today）**仅本地维护，不跨设备**

## deck_type 说明

| 类型 | 来源 | 可见性 |
|------|------|--------|
| `preset` | 管理员预置 | 全员可读 |
| `shared` | 用户发布（待设计） | 全员可读 |
| `personal` | 用户本地创建并上传 | 仅 owner |
