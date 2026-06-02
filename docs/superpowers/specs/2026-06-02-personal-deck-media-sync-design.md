# 个人牌组媒体同步设计

**日期：** 2026-06-02
**版本：** v5.5.x
**范围：** 本地导入的个人牌组（.yhspack）结构 + 媒体上传至 Supabase，跨设备可下载使用。备份/恢复功能不在本期范围内。

---

## 背景与现状

### 已有基础

| 组件 | 现状 |
|------|------|
| `deck_cards.image_url` / `audio_url` | 字段已存在，personal 牌组目前为 null |
| `ReminiSea` Storage bucket | 已存在，preset 媒体已在使用 |
| `uploadDeckToCloud()` | 上传结构（decks + deck_cards），不含媒体 |
| `downloadPersonalDeckFromCloud()` | 从 `image_url`/`audio_url` 下载媒体，已实现 |
| `checkPersonalDeckUpdates()` | 对比 `updated_at` 判断是否需要拉取，已实现 |
| `card._imgUrl` / `card._audUrl` | 内存 + localStorage 中存 Storage 路径，空字符串表示未上传 |

### 缺口

1. `importYhspack` 写 meta 时缺少 `deck_type: 'personal'`，导致 `uploadDeckToCloud` 跳过
2. 无函数将 IDB 中的 blob 上传到 Storage
3. `doAccountSync` / `doAccountLogin` 未触发媒体上传

---

## 数据流

### 上传流（设备 A，导入方）

```
importYhspack()
  → meta 写入 deck_type:'personal', nameLang
  → uploadDeckToCloud()        ← 上传结构，image_url/audio_url 暂为 null

用户点「同步」→ doAccountSync()
  → runSync()                  ← 现有逻辑不变（结构/SRS/config）
  → .then() 串联：
      for each personal deck:
        uploadDeckToCloud()    ← 幂等 upsert，确保结构在云端
        uploadPersonalDeckMedia()
          → 逐卡读取 IDB blob
          → 跳过 _imgUrl/_audUrl 已有值的卡片（续传机制）
          → parallelMapLimit(3) 并发上传到 Storage
          → 成功：card._imgUrl / card._audUrl = 路径
          → saveDeckCards()   ← 持久化进度
          → uploadDeckToCloud() ← 把 image_url/audio_url 写入 deck_cards
          → toast 通知完成
```

### 下载流（设备 B，接收方）

```
登录 / 点「同步」→ runSync({ decks:true })
  → checkPersonalDeckUpdates()
      → 对比 updated_at，有更新则：
          downloadPersonalDeckFromCloud()  ← 现有逻辑，下载卡片 + Storage 媒体
```

下载流无需改动。

---

## Storage 路径规范

```
personal/{userId}/{deckId}/{cardId}_img.{ext}
personal/{userId}/{deckId}/{cardId}_aud.{ext}
```

- `ext` 从 `blob.type` 推断：`image/png` → `png`，`image/webp` → `webp`，其余 → `jpg`；音频 `audio/mpeg` → `mp3`，其余 → `m4a`
- 路径含 `userId`，逻辑隔离各用户（现有 RLS 为 `authenticated` 全桶可读写，路径是唯一隔离手段）

---

## 新函数：`uploadPersonalDeckMedia(deckId)`

```
前置检查：
  _syncEnabled && _sb && _cloudUserId
  meta.deck_type === 'personal'
  cards 非空

主流程：
  parallelMapLimit(cards, 3, async card => {
    if (!card._imgUrl):
      blob = await loadMedia(`${deckId}_${card.id}_img`)
      if blob:
        path = `personal/${userId}/${deckId}/${card.id}_img.${ext}`
        { error } = await _sb.storage.from('ReminiSea').upload(path, blob, { upsert: true })
        if !error: card._imgUrl = path

    if (!card._audUrl):
      同上，路径后缀 _aud
  })

收尾（有任何更新时）：
  saveDeckCards(deckId)
  await uploadDeckToCloud(deckId)
  showCloudToast(t('toast_media_synced', { n: uploaded }))

错误处理：
  单张失败 → console.warn，不中断整体
  下次同步自动重试（_imgUrl 仍为空）
```

---

## 改动清单

| 文件 | 位置 | 改动内容 |
|------|------|---------|
| `yihai_v5.5.html` | `importYhspack` | meta 加 `deck_type:'personal'`、`nameLang`；导入后调 `uploadDeckToCloud` |
| `yihai_v5.5.html` | 新增函数 | `uploadPersonalDeckMedia(deckId)` |
| `yihai_v5.5.html` | `doAccountSync` | `.then()` 串联 `uploadPersonalDeckMedia` |
| `yihai_v5.5.html` | `doAccountLogin` | `.then()` 串联 `uploadPersonalDeckMedia` |
| `yihai_v5.5.html` | i18n（5 处） | 新增 `toast_media_synced` |

### i18n：`toast_media_synced`

| locale | 文案 |
|--------|------|
| zh | `✓ 媒体已同步（{n} 个文件）` |
| zh-Hant | `✓ 媒體已同步（{n} 個文件）` |
| en | `✓ Media synced ({n} files)` |
| es | `✓ Medios sincronizados ({n} archivos)` |
| ja | `✓ メディアを同步しました（{n} 件）` |

---

## 续传机制

`_imgUrl` / `_audUrl` 是唯一上传状态标志，持久化在 localStorage（通过 `saveDeckCards`）：

- 空字符串 → 未上传，本次处理
- 非空路径 → 已上传，跳过

中断后重新点同步，自动从断点继续，无需额外状态表或数据库字段。

---

## 不在本期范围

- 图片压缩（导入时不处理分辨率）
- 云端备份/恢复（删除后重新下载）
- Storage 用量提示
- 删除牌组时清理 Storage 文件（孤儿文件暂时保留）
