# 个人牌组同步重设计（方案 B+）

**日期：** 2026-06-05
**状态：** 设计定稿，待实现
**作者：** 与 Claude 协作设计
**关联：** `2026-06-05-deck-management-design.md`（UI 层）、memory `[[personal-deck-sync-bug]]`、`[[publish-deck-todo]]`

---

## 1. 背景与动机

现有 `uploadMissingPersonalDecks` 仅判断牌组 ID 是否存在于云端，存在即跳过，导致本地新增/修改的卡片永远同步不上去（`[[personal-deck-sync-bug]]` Bug 2）。同时 `uploadDeckToCloud` 全量 `delete + insert deck_cards`，4000 单词牌组每次同步触发整表重写（v5.6.4 已加 `uploaded > 0` 门槛规避，但性能问题仍在）。

本设计重做个人牌组的双向同步机制，使其支持：

1. **真正的增量同步**——只传变化的牌组和卡片
2. **三阶段流程**——结构 → 卡片 → 媒体，媒体阶段异步、可暂停
3. **断点续传**——同步中断后从指针位置续传，不重传已传部分
4. **状态可视化**——牌组管理页每行显示同步状态与差异计数

## 2. 总体用例

1. 用户通过独立牌组管理页管理牌组：新建空牌组、下载官方/社区共享牌组、导入/导出 `.yhspack`、重命名、在任意本地牌组（除 preset）内增删改卡牌
2. 牌组能展示「云端有更新」或「本地有变更」，同步时显示进度，可暂停，可断点续传
3. 媒体文件较大，结构同步后异步进行，支持断点续传
4. 只同步发生变化的牌组和卡牌

## 3. 范围

**在本设计范围内：**
- `personal` 类型牌组的双向同步重做
- 卡片级 `mod` 时间戳追踪
- 删除墓碑机制
- 三阶段 SyncJob 抽象
- 牌组管理页状态展示对接

**不在本次范围：**
- `shared` 类型牌组实现（接口占位即可，见 `[[publish-deck-todo]]`）
- 字段级冲突合并（采用整卡 last-write-wins）
- 暂停状态持久化（仅内存，刷新后从断点续传）
- 多设备实时协同 / 操作日志驱动的 sync

## 4. 已确认的设计决策

| 维度 | 决策 |
|------|------|
| 冲突策略 | 整卡 last-write-wins（mod 大者胜） |
| 删除追踪 | 本地墓碑 `yihaiDeletedCards:{key}`，上传后清空（不改云端 schema） |
| 「云端有更新」检测时机 | 进牌组管理页时拉取（不在首页轮询） |
| 共享牌组 | 占位接口，本次不实现 |
| 暂停持久化 | 仅内存；刷新页面后从断点指针续传 |

## 5. 数据模型

### 5.1 客户端

**Card（新增 `mod`）：**
```js
{
  id, name, nameLang, cardType, ext,
  img, audioUrl, _imgUrl, _audUrl,
  mod   // number, 上次本地修改时间戳
}
```

**DeckMeta（新增 `mod` 与 `_remoteUpdatedAt`）：**
```js
{
  key, name, deck_type, nameLang,
  mod,                  // 牌组元数据最后修改时间
  _remoteUpdatedAt      // 上次拉云端时记下的 decks.updated_at
}
```

**localStorage 水位与墓碑：**

| Key | 含义 |
|-----|------|
| `yihaiPushedAt:{deckKey}` | 上次成功推送到云的 mod 上限（ISO 字符串） |
| `yihaiPulledAt:{deckKey}` | 上次从云拉取的 `updated_at` 上限（ISO 字符串） |
| `yihaiDeletedCards:{deckKey}` | `[cardId, ...]` 待推送的删除墓碑 |
| `yihaiPushedMediaAt:{deckKey}` | 上次媒体同步完成时间 |

**迁移：** 旧的 `yihaiSyncAt:{key}` 在首次加载时同时复制到 `yihaiPushedAt` 与 `yihaiPulledAt`，然后保留兼容一个版本后删除。

### 5.2 云端

**不改 schema。** 复用现有：
- `decks.updated_at` — 牌组级时间戳
- `deck_cards.updated_at` — 卡片级时间戳（即云端 `mod`）
- 删除走客户端墓碑硬 DELETE

## 6. 同步状态模型

**Per-deck 状态：**

| 状态 | 含义 |
|------|------|
| `clean` | 本地无变更 + 云端无更新 |
| `localDirty` | 本地有 N 张卡 / meta 待推送 |
| `remoteAhead` | 云端有 M 张卡 / meta 待拉取 |
| `bothChanged` | 双向都有；按 mod 逐卡 last-write-wins |
| `syncing` | 进行中（含 phase: `structure` \| `cards` \| `media`、进度计数） |
| `paused` | 用户暂停 |
| `error` | 失败，可重试 |

**牌组管理页每行：** 状态徽章 + 差异计数（如「+3 待推 / 5 待拉」）+ 右侧操作按钮（同步 / 已同步 / 进度条+暂停 / 重试）。

## 7. 同步流程

### 7.1 三阶段（per-deck SyncJob）

| 阶段 | 内容 | 进度粒度 | 是否阻塞下一阶段 |
|------|------|---------|--------------|
| **1. 结构** | 若 `meta.mod > pushedAt`，upsert `decks` 行；拉云端 `deck_cards` 的 `(card_id, updated_at)` 列表与本地 diff，输出 `toPush[]`、`toPull[]`、`toDelete[]` | 1 次轻请求 | 是 |
| **2. 卡片** | toPush 分批 upsert（每批 100）；toPull 分批 SELECT；toDelete 一次 DELETE（by `card_id` IN (...)） | 每批后推进 `pushedAt` / `pulledAt` | 是（结构同步完成后立即触发完成 toast） |
| **3. 媒体** | 沿用现有 `parallelMapLimit(3)` + `_imgUrl/_audUrl` 跳过 + 暂停 | 单卡 | 否（异步后台） |

### 7.2 Diff 算法（Phase 1 输出）

```
local: cards 数组（含 mod）+ yihaiDeletedCards
remote: [{card_id, updated_at}]

cloudMap = remote 转 Map(card_id → updated_at)

toPush = local.filter(c =>
  c.mod > pushedAt &&                                       // 本地确实修改过
  (!cloudMap.has(c.id) || c.mod > cloudMap.get(c.id))       // 云端没有或本地更新
)
toPull = remote.filter(r =>
  r.updated_at > pulledAt &&
  (!localMap.has(r.card_id) || cloudMap.get(r.card_id) > localMap.get(r.card_id).mod)
)
toDelete = yihaiDeletedCards.filter(id => cloudMap.has(id))
```

### 7.3 冲突处理

整卡 `mod` 比较：
- `local.mod > remote.updated_at` → 进 toPush（本地赢）
- `remote.updated_at > local.mod` → 进 toPull（云端赢）
- 相等 → 跳过

### 7.4 SyncJob 类（暂停 / 进度）

```js
class SyncJob {
  constructor(deckKey, onProgress) { ... }
  run()            // 串行跑三阶段，返回 Promise
  pause()          // 当前批结束后停在断点
  resume()
  cancel()
  get phase()      // 'structure' | 'cards' | 'media' | 'done'
  get progress()   // { done, total }
}
```

`pause()` 通过 `pausePromise` 在批与批之间挂起（沿用现有 `_downloading.get(deckId).pausePromise` 模式，抽成通用工具）。

**断点续传：** `pushedAt` / `pulledAt` 指针只在批成功后推进；中断后下次进入从指针位置重新计算 diff，已成功的批不再重传。

## 8. 用户编辑路径打 mod

**所有写入路径需调用 `setDeckLocalDirty(deckKey, cardId?)`：**

| 操作 | 触发位置 | mod 写入 |
|------|---------|---------|
| 新建空牌组 | `createEmptyDeck` | `meta.mod = now` |
| 重命名牌组 | `renameDeck` | `meta.mod = now` |
| 导入 `.yhspack` | `importYhspack` | 所有 `cards[i].mod = now` + `meta.mod = now` |
| 添加卡片 | `addCard` | `card.mod = now` |
| 修改卡片字段 | 编辑入口 | `card.mod = now` |
| 删除卡片 | `deleteCard` | 入 `yihaiDeletedCards`，从 `DECKS[key]` 移除 |
| 替换媒体 blob | 媒体上传成功 | `card.mod = now` |
| 下载 preset/shared | `downloadDeckFromCloud` | 不打 dirty（mod 取云端 `updated_at`） |

**辅助：** `setDeckLocalDirty` 内部统一调用 `saveDeckIndex()` + `saveDeckCards(key)` 持久化。

## 9. 单调时间戳

`mod` 通过 `nextMod()` 辅助函数生成：
```js
function nextMod() {
  const now = Date.now();
  _lastMod = Math.max(now, _lastMod + 1);
  return _lastMod;
}
```
防止系统时钟回拨导致 mod 失序。

## 10. 函数清单

### 10.1 新增

| 函数 | 职责 |
|------|------|
| `nextMod()` | 单调递增时间戳 |
| `setDeckLocalDirty(deckKey, cardId?)` | 打 dirty + 持久化 |
| `markCardDeleted(deckKey, cardId)` | 入墓碑 |
| `computeDeckSyncState(deckKey)` → `{status, pushCount, pullCount}` | 状态计算（不发请求，仅本地 + 缓存） |
| `class SyncJob` | 三阶段执行器 |
| `syncDeck(deckKey, opts)` | 主入口，触发 SyncJob |
| `refreshAllDecksSyncState()` | 进牌组管理页时调，背景拉云端 `(id, updated_at, card_count)` 一次，刷新所有行状态 |

### 10.2 重构 / 拆分

| 旧函数 | 改动 |
|------|------|
| `uploadDeckToCloud(key)` | 拆为 `upsertDeckRow` / `upsertCardsBatch` / `deleteCardsBatch`；不再 delete+insert 全表 |
| `uploadMissingPersonalDecks` | 替换为 `syncAllDirtyDecks`（遍历调 `syncDeck`） |
| `checkPersonalDeckUpdates` | 整牌组重下 → 被 Phase 2 增量替代 |
| `downloadPersonalDeckFromCloud` | 首次下载仍走全量路径，但落地时打齐 `mod = remote.updated_at`、`pushedAt = pulledAt = now`，后续走增量 |

### 10.3 入口接线

- `runSync({decks:true})` 中三个串行 promise 替换为 `await syncAllDirtyDecks()`
- 牌组管理页 `showDeckMgmt`（见 `2026-06-05-deck-management-design.md`）进入时调 `refreshAllDecksSyncState()`，每行接 `syncDeck(key)` 按钮
- 媒体阶段沿用 `uploadPersonalDeckMedia` + `downloadPersonalDeckFromCloud` 的暂停机制

## 11. UI 状态展示

| 状态 | 徽章 | 计数 | 右侧按钮 |
|------|------|------|---------|
| `clean` | 灰点 · 已同步 | — | 无 |
| `localDirty` | 黄点 · 待上传 | +N | `同步` |
| `remoteAhead` | 蓝点 · 待下载 | -M | `同步` |
| `bothChanged` | 紫点 · 双向 | +N / -M | `同步` |
| `syncing` | 旋转 · 同步中 | `done/total` | 进度 + `暂停` |
| `paused` | 灰点 · 已暂停 | `done/total` | `继续` |
| `error` | 红点 · 失败 | — | `重试` |

牌组管理页 UI 布局沿用 `2026-06-05-deck-management-design.md`，仅在右侧操作区接入上述状态。

## 12. 风险与缓解

| 风险 | 缓解 |
|------|------|
| 系统时钟乱跳 → mod 失序 | `nextMod()` 单调递增 |
| 存量卡片无 `mod` 字段 | 加载时 `c.mod ??= 0`；diff 时 mod=0 视为"未知/不传"，下次编辑触发 |
| 墓碑无限积累 | 上传成功后立即清空，不持久积累 |
| 增量上传期间断网 | `pushedAt` 指针只在批成功后推进，下次从断点续 |
| 大牌组 Phase 1 拉 `(card_id, updated_at)` 性能 | 沿用 `fetchAllDeckCards` 分页逻辑（每页 1000） |
| 旧 `yihaiSyncAt:{key}` 迁移漏 | 首次加载若 `pushedAt`/`pulledAt` 缺失且 `yihaiSyncAt` 存在 → 同时复制；保留一版本后删 |

## 13. 测试策略

**单元（Node.js）：**
- `nextMod` 单调性
- `computeDeckSyncState` 各分支（clean / localDirty / remoteAhead / bothChanged）
- Diff 算法（toPush / toPull / toDelete）含冲突优先级

**Playwright 端到端（需登录）：**
- 设备 A 编辑卡片 → 同步 → 设备 B 拉取一致
- 设备 A 删除卡片 → 同步 → 设备 B 该卡消失
- 同步中暂停 → 续传 → 不重传已传部分
- 大牌组（≥1000 张）增量上传只传变化的少量卡片
- 旧 `yihaiSyncAt` 设备升级后首次同步不重复全传

**回归：** `_pw_cross_device.js`（已有，需扩展暂停/续传断言）、`_pw_cloud_sync.js`。

## 14. 验收标准

- 4000 单词牌组改一张卡，同步只传该卡 + meta（< 2s 完成结构 + 卡片阶段）
- 删除一张卡，同步后云端确实少一行
- 大牌组同步中暂停 → 关页面 → 重开 → 续传不重传已传卡片
- 牌组管理页进入时正确显示每行状态徽章
- 旧版用户升级后首次同步不触发全量重传

## 15. 跨计划顺序

与 `docs/superpowers/plans/2026-06-05-deck-management.md`（牌组管理页 UI 计划）的关系：

**采用「先同步后 UI」**：

1. 本同步重设计先实现，状态徽章先接入现有 `showCloudDecks` 页面
2. UI 计划暂停；待同步层稳定后回头修订 UI 计划，在 `renderDeckMgmtList` 调 `computeDeckSyncState(key)` 接入状态

理由：本重设计要重构 `uploadDeckToCloud` 等同步入口函数；先把数据层稳定下来，UI 计划再消费稳定接口。

## 16. 实现顺序建议

1. 数据模型与水位迁移（`nextMod`、`setDeckLocalDirty`、localStorage key 迁移）
2. `SyncJob` 类骨架 + Phase 1 结构同步
3. Phase 2 卡片增量（toPush / toPull / toDelete）
4. Phase 3 媒体接入（复用现有暂停机制）
5. UI 状态接线（`computeDeckSyncState` + 牌组管理页徽章）
6. 测试用例补全 + 回归
7. 旧函数清理（保留兼容 wrapper 一个版本）
