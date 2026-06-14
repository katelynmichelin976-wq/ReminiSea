# 跨层命名规范

本文档汇总忆海拾光在四个存储/计算层的命名规范，作为新代码、refactor、code review 的依据。

详细 IDB 命名规范设计见 `docs/superpowers/specs/2026-06-13-idb-naming-convention-design.md`。

---

## 层次速查

| 层 | 风格 | 示例 |
|---|---|---|
| **Supabase 列名** | `snake_case` 复数表名 | `sync_trials.trial_id`, `deck_cards.card_id`, `easy_card_states.deck_key` |
| **IDB store 名** | `snake_case`，对齐 Supabase 表名 | `sync_trials`, `sync_card_states`, `easy_card_states`, `app_events`, `voice_slots`, `media_blobs` |
| **IDB record 字段** | `snake_case`，对齐 Supabase 列名 1:1 | `{ trial_id, card_id, due_ts, is_correct, ... }` |
| **localStorage key** | `yh:v1:{ns}:{...}` 前缀 + camelCase 段 | `yh:v1:user:lastEmail`, `yh:v1:deck:{deckKey}:cards` |
| **JS 内存变量/函数** | `camelCase` | `dueTs, cardId, lapsesTotal, getCurrentUserId()` |

---

## 1. Supabase（云端 schema）

- 表名：`snake_case` 复数（如 `decks`、`deck_cards`、`sync_trials`、`easy_card_states`、`app_events`、`feedback`）
- 列名：`snake_case`（如 `user_id`、`card_id`、`due_ts`、`session_mode`）
- 主键：表名去复数后加 `_id`（如 `card_id`、`trial_id`、`event_id`），或简单 `id`（bigint）
- JSONB 列：表名 + 用途（如 `media`、`ext`、`payload`）
- 时间戳：`{verb}_at`（`created_at`、`updated_at`、`synced_at`、`shared_at`）

## 2. IndexedDB（本地 schema）

- **数据库名**：`yihai_{ns}`（历史命名，已固化：`yihai_srs`、`yihai_media`）
- **store 名**：`snake_case`，对齐 Supabase 表名（如 `sync_trials` ↔ Supabase `sync_trials` 表）
- **store 内 record 字段**：`snake_case`，跟 Supabase 列名严格 1:1（让 IDB record 可直接 upsert 到 Supabase 行，sync 层零字段名转换）
- **keyPath**：`snake_case`（如 `trial_id`、`state_key`、`event_id`、`[deck_key, card_id]`）。例外：`voiceSlots.slotName`（本地表，无 Supabase 对应，沿用 camelCase）
- **本地补充字段**（不上传 Supabase）：`snake_case` 风格保持一致（如 `synced_at`、`suspended_reason`、`_blob`、`_dirty`）
- **使用约定**：业务代码通过 `IDB_STORES.xxx` 注册表引用 store 名（不写裸字符串），通过 helper `idbGet/Put/Delete/GetAll/Count/Clear/PutWithKey/GetByKey/GetAllKeys/Tx` 操作（不直接 `tx.objectStore(...)` — 除非用 cursor / secondary index 等 helper 不支持的 API，可在 `idbTx(...)` callback 内用原生 store）

完整 IDB 注册表见 `index.html` 中 `const IDB_STORES = { ... }` 的声明。

## 3. localStorage

- **key 格式**：`yh:v1:{namespace}:{path}`，namespace 用单数（`user`、`session`、`sync`、`decks`、`daily`、`config`、`srs`、`deck`），path 段间用 `:` 分隔
- **path 段**：`camelCase`（如 `lastEmail`、`globalTs`、`pendingFeedback`、`v5MigrationPending`）
- **聚合策略**：同生命周期字段聚合到一个 JSON blob（如 `yh:v1:config:voice`、`yh:v1:deck:{key}:sync`），减少 key 数量
- **使用约定**：所有 key 走 `LS_KEYS` 注册表 / 工厂（`LS_DECK(deckKey, field)` / `LS_SRS(configKey)`），helper `lsGet/Set/Remove/GetJSON/SetJSON` 操作
- **legacy key**：用 `yihai_` 旧前缀的 key 标 `// legacy only` 注释，only logout 时清理

完整 LS 注册表见 `index.html` 中 `const LS_KEYS = { ... }`。详细规范见 v5.13.2-5.13.4 三 phase 提交。

## 4. JS（内存变量、函数、类）

- 变量、函数、参数：`camelCase`（如 `dueTs`、`buildSessionQueue`、`isCorrect`）
- 常量：`UPPER_SNAKE`（如 `OPT_COUNT`、`APP_VERSION`、`SRS_CONFIG`）
- 全局对象：`UPPER_SNAKE` 的注册表（如 `IDB_STORES`、`LS_KEYS`、`PHRASE_VOICE_FIELDS`）
- 私有/内部：前缀 `_`（如 `_lastSrsWrite`、`_writeSrs`、`_sb`）
- DOM ID / CSS class：`kebab-case`（如 `screen-quiz`、`target-card`、`opt-btn`）
- HTML data-* 属性：`kebab-case`（如 `data-i18n`、`data-mode`）
- i18n key：`snake_case`（如 `settings_section_mode`、`rotate_to_portrait`）

## 5. 跨层映射

| Supabase 列 | IDB record 字段 | JS 内存对象（业务层）| 说明 |
|---|---|---|---|
| `trial_id` | `trial_id` | `entry.trial_id` 或局部 `trialId` | IDB 边界保持 snake；纯内存计算时可临时取 camelCase 变量 |
| `card_id` | `card_id` | `entry.card_id` 或 `cardId` | 同上 |
| `due_ts` | `due_ts` | `entry.due_ts` 或 `dueTs` | 同上 |
| `deck_key` | `deck_key` | `deckKey`（推荐）| sync_card_states/easy_card_states 都用此命名 |
| `user_id` | `user_id` | `cloudUserId`（特定场景）| 名字稍偏离，因业务语义差异 |

**约定**：IDB 与 Supabase 的字段名严格 snake_case 对齐；JS 内存对象使用这些 record 时**直接用 record 自身字段**（snake_case），不强制改名。需要计算/派生的纯 JS 变量用 camelCase。

## 6. 不在此规范的事

- 历史遗留命名（如 `yihai_srs`/`yihai_media` DB 名、`voiceSlots.slotName` camelCase keyPath、`SRS_DB_NAME` 等剩余常量）— 已固化，不强制改
- 字段名 deep transform（snake↔camel 自动转换）— 明确不引入，spec §3.1 论证
- DOM event 名 — 标准 Web API，沿用浏览器命名
- Service Worker 相关 — 暂未启用

## 关联文档

- IDB 设计 spec：`docs/superpowers/specs/2026-06-13-idb-naming-convention-design.md`
- IDB 实施 plans：`docs/superpowers/plans/2026-06-13-idb-naming-p1.md` / `2026-06-14-idb-naming-p2.md` / `2026-06-14-idb-naming-p3.md`
- 架构：`docs/architecture.md`
- SRS 设计：`docs/srs_design_v6.9.md`
