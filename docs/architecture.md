# 忆海拾光 · 技术架构

## 数据层

### Supabase Cloud

| 表 | 用途 |
|----|------|
| `decks` | 牌组元数据（id, user_id, name, deck_type, updated_at） |
| `deck_cards` | 牌组卡片（deck_id FK, card_id, name, image_url, audio_url, sort_order） |
| `sync_trials` | 练习日志上传（含完整 CardState 快照） |
| `sync_card_states` | 云端 CardState（由 DB trigger 自动维护，不直接写入） |

**Storage：** `ReminiSea` 桶，存图片/音频。preset/shared 类型公开读；personal 类型 owner 私有。

**RLS：** `decks` preset/shared 全员可读，personal 仅 owner 读写。

**DB trigger：** `fn_trial_to_card_state()` — `sync_trials` INSERT 后自动 UPSERT `sync_card_states`，无需客户端直接写状态表。

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
saveDeck() / deleteDeck()
  → uploadDeckToCloud()          // decks + deck_cards UPSERT / delete
checkPersonalDeckUpdates()       // session 就绪后比对 updated_at，拉取更新
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
