# IndexedDB 命名规范统一设计

**日期：** 2026-06-13
**作者：** chenlian + Claude
**关联：** memory [naming-convention-todo](../../../memory/project-naming-convention-todo.md) IDB 部分；前置 [localstorage-naming](../../../memory/feedback-localstorage-naming.md)（v5.13.2-5.13.4 已完成 LS 三 phase）

---

## 1. 背景

### 1.1 现状扫描

IndexedDB 层在 `index.html` 里散落着两个 DB、六个 store、两套命名风格：

```js
// DB
const SRS_DB_NAME    = 'yihai_srs';
const IDB_NAME       = 'yihai_media';

// store 名（snake/camel 混用）
const TRIAL_STORE      = 'trials';         // snake-ish (单复数不一致)
const CS_STORE         = 'card_states';    // snake_case
const EVT_STORE        = 'app_events';     // snake_case
const EASY_STORE       = 'easyCardStates'; // camelCase
const VOICE_SLOT_STORE = 'voiceSlots';     // camelCase
const IDB_STORE        = 'blobs';          // 单词

// keyPath（snake/camel 混用）
sync_trials.trial_id        // snake_case
sync_card_states.state_key  // snake_case
voiceSlots.slotName         // camelCase
easyCardStates.[deck_key, card_id]  // snake_case 复合
```

50+ 处 `tx.objectStore(STORE_NAME).put(record)` 调用点散落全文，无注册表、无 helper、无字段名 ↔ DB 列名映射规范。

### 1.2 痛点

1. **新增 store 时拍脑袋决定命名风格**——没有标准，每次决策成本。
2. **改 store 名要 grep 全代码**——50+ 处字符串常量散落，漏改静默失败。
3. **跨层映射心智负担**——IDB record 字段名跟 Supabase 列名时而对齐（`trial_id`）时而不对齐（`slotName` vs Supabase 无对应），review 时反复确认。
4. **schema 演进散在 onupgradeneeded**——每次新增 store 手写 createObjectStore，version bump 顺序易错。
5. **样板代码重复**——每个 IDB 调用点自己包 Promise、做错误处理、处理事务。

### 1.3 已完成的对照

localStorage 已在 v5.13.2-5.13.4 通过三 Phase 完成统一化：`yh:v1:{ns}:{...}` 前缀 + LS_KEYS 注册表 + `lsGet/lsSet` helper + 聚合 JSON。IDB 层在风格上还停留在前规范化时代。

## 2. 目标与非目标

### 2.1 目标

- **一份命名规范**：DB 名、store 名、keyPath、record 字段都有明确风格规则
- **注册表 + helper**：IDB_DBS / IDB_STORES 集中声明；idbGet/Put/... helper 包装 Promise 与事务
- **store 名对齐 Supabase 表名**：grep / 调试时能直接关联到云端表
- **业务代码零认知转换**：record 字段跟 JS 内存对象一致（camelCase），无 case transform 层
- **可分 phase 实施**：每个 phase 独立可发布，无大爆炸式 PR

### 2.2 非目标

- ❌ **DB 名重命名**：保留 `yihai_srs` / `yihai_media`（用户不可见，改名意味着主动 deleteDatabase + 跨 DB 数据搬运，标准 onupgradeneeded 更稳）
- ❌ **record 字段 snake_case 对齐 Supabase 列名**：会引入 deep case transform helper，复杂度高且 bug 风险大；现有 sync 层显式 mapping 已稳定工作
- ❌ **JS 变量风格调整**：CLAUDE.md L141 已强制 camelCase，本设计完全遵守
- ❌ **lint / 工具引入**：项目无 lint 配置，依靠 PR review + grep 校验防绕过

## 3. 核心设计决策

### 3.1 为什么 record 字段用 camelCase 而非 snake_case

**辩论的核心**：IDB record 字段名应跟 JS 内存对象一致（camelCase），还是跟 Supabase 列名一致（snake_case）。

**采用 camelCase 的理由**：

1. **零转换层**：业务代码 → IDB → 业务代码 整条路径全 camelCase，无 deep transform，无字段名映射 bug 风险
2. **CLAUDE.md L141 已明确分层**：JS 用 camelCase，DB 列用 snake_case，**两套规范独立**。IDB 是 JS 调用的存储，按 JS 一侧走 camelCase 更自然
3. **deep transform helper 是真正复杂层**：通用 `deepSnakeKeys/deepCamelKeys` 遇到 `mp3_url`、复合 key、嵌套对象、Blob、null/undefined 都易翻车；散落的手动 mapping 反而在固定字段上更稳
4. **sync 层显式 mapping 是清晰边界**：现有 `runCardsPhase` / `runMediaPhase` 等已写好显式 `{ trial_id: r.trialId, due_ts: r.dueTs, ... }` mapping，约 5-10 处，稳定工作。继续使用比转为 helper 自动转换更可控
5. **行业实践不一致**：IndexedDB 没有"行业规范"，Firebase Firestore 默认 camelCase，Anki 用 snake_case（Python 习惯），Supabase 项目客户端有 camel 有 snake——不存在"对齐 Supabase = 正确"的硬规则

**store 名仍 snake_case 对齐 Supabase**：

store 名是"表名级"标识符，类比 Postgres 表名。行业惯例 snake_case 复数，且对齐 Supabase 表名能让 grep `sync_trials` 同时命中本地 IDB 调用点和云端 SQL，调试友好。这是行内字段（record）跟容器（store/表）两个独立的命名层级。

### 3.2 为什么保留 DB 名 `yihai_xxx`

**改 DB 名（如 `yihai_srs → yh_srs`）的代价**：
- 需要主动 `indexedDB.deleteDatabase('yihai_srs')`，要等所有连接关闭，可能卡住
- 跨 DB 不能在同一事务搬数据——voice_slots 等需要保留的数据要走 JS 层 dump/restore，复杂且非原子
- DB 名用户不可见，对齐 LS 前缀（`yh:`）没有外显价值

**保留 DB 名的优势**：
- 标准 `onupgradeneeded` 流程，原子事务、可重入、自动回滚
- 未来若有需要保留的 store 数据，可在同一事务内直接 cursor 搬运（不必跨 DB）
- 用户透明升级，无感知

### 3.3 为什么分 4 个 phase

**单 PR 一次性改造的风险**：
- 50+ 调用点 + 注册表 + helper + 迁移函数 + 测试改造 ≈ 上千行 diff
- review 难、回归测试覆盖不全、回滚成本高
- 一个隐藏 bug 影响所有 IDB 路径

**分 phase 的优势**：
- 每个 phase 独立可发布、独立可回滚
- P1 几乎零风险（仅声明现状），先把"规范文档 + 注册表"上线
- P2 走 onupgradeneeded 标准流程，迁移代码集中
- P3 按模块（SRS / sync / voice / media）独立 PR 改造调用点，每 PR 小、可控
- 出问题时定位影响面清晰

## 4. 命名规范全表

### 4.1 数据库

| 用途 | DB 名 | schema version | 备注 |
|---|---|---|---|
| SRS 核心数据 | `yihai_srs` | 9 → **10** | 不改名，bump version 触发迁移 |
| 媒体 blob | `yihai_media` | 1 → **2** | 同上 |

### 4.2 Store

| 旧 store | 新 store | 对应 Supabase 表 | 迁移动作 |
|---|---|---|---|
| `trials` | `sync_trials` | `sync_trials` | 删除老 store，新建空 store；已登录用户 runSync 拉回（云端 append-only 历史可丢，本地不查询）|
| `card_states` | `sync_card_states` | `sync_card_states` | 同上（DB trigger 维护，从云端完整恢复）|
| `easyCardStates` | `easy_card_states` | `easy_card_states` | 同上（v5.11 云端 trigger 同步）|
| `app_events` | `app_events`（不变）| `app_events` | 删除重建（诊断日志可丢）|
| `voiceSlots` | `voice_slots` | (无，本地)| 删除重建（用户确认目前无录音数据）|
| `blobs` (yihai_media) | `media_blobs` | (无，对应 Storage bucket) | 删除重建（个人牌组媒体从云端重下）|

### 4.3 keyPath

| store | keyPath | 类型 | 备注 |
|---|---|---|---|
| `sync_trials` | `trialId` | 单字段 | 旧 `trial_id` 改 camelCase |
| `sync_card_states` | `stateKey` | 单字段 | 旧 `state_key`，衍生 `${deckKey}\|${cardId}` |
| `easy_card_states` | `[deckKey, cardId]` | 复合 | 旧 `[deck_key, card_id]` |
| `app_events` | `eventId` | 单字段 | 旧 `event_id` |
| `voice_slots` | `slotName` | 单字段 | 不变（已是 camelCase）|
| `media_blobs` | (无 keyPath) | 外部 key | 跟原 `blobs` 一致，put(blob, key) 二参形式 |

### 4.4 Record 字段

- **业务字段**：camelCase（如 `trialId, cardId, dueTs, isCorrect, lapsesTotal`）
- **本地补充字段（不上传 Supabase）**：camelCase，可选 `_` 前缀表达"内部"（如 `_dirty, _syncedAt, _blob`）
- **跟 Supabase 同步的字段命名**：JS 侧用 camelCase，sync 上传时由 sync 层显式 map 成 snake_case（保留现状）

## 5. 注册表

### 5.1 IDB_DBS

```js
const IDB_DBS = {
  srs:   { name: 'yihai_srs',   version: 10 },
  media: { name: 'yihai_media', version: 2  },
};
```

### 5.2 IDB_STORES

```js
const IDB_STORES = {
  syncTrials:     { db: 'srs',   name: 'sync_trials',      keyPath: 'trialId'  },
  syncCardStates: { db: 'srs',   name: 'sync_card_states', keyPath: 'stateKey' },
  easyCardStates: { db: 'srs',   name: 'easy_card_states', keyPath: ['deckKey', 'cardId'] },
  appEvents:      { db: 'srs',   name: 'app_events',       keyPath: 'eventId'  },
  voiceSlots:     { db: 'srs',   name: 'voice_slots',      keyPath: 'slotName' },
  mediaBlobs:     { db: 'media', name: 'media_blobs',      keyPath: null /* external key */ },
};
```

**使用约定**：
- 业务代码引用 `IDB_STORES.syncTrials`（不写裸字符串 `'sync_trials'`）
- helper 通过 `storeKey` 字符串参数（如 `'syncTrials'`）查注册表
- IDE 拼写错误时立刻报错（属性不存在）

## 6. Helper API

### 6.1 基础 API（纯 Promise 包装，无 case transform）

```js
/**
 * 读单条 record。
 * @param {string} storeKey  IDB_STORES 的 key（如 'syncTrials'）
 * @param {*} key            keyPath 值（单字段或复合 key 数组）
 * @returns {Promise<object|null>}
 */
async function idbGet(storeKey, key) { ... }

/**
 * 写入单条 record。
 * @param {string} storeKey
 * @param {object} record  必须含 keyPath 字段（除非 store 的 keyPath=null 用外部 key）
 */
async function idbPut(storeKey, record) { ... }

async function idbDelete(storeKey, key) { ... }
async function idbGetAll(storeKey) { ... }   // → object[]
async function idbCount(storeKey) { ... }     // → number
async function idbClear(storeKey) { ... }
```

### 6.2 外部 key 形式（mediaBlobs 用）

```js
/**
 * 媒体 store 的 put/get 不走 keyPath，用外部 key 参数。
 */
async function idbPutWithKey(storeKey, key, value) { ... }
async function idbGetByKey(storeKey, key) { ... }
```

### 6.3 批量事务（sync 上下行用）

```js
/**
 * 多 store 原子读写。callback 内可同步 put/get 多个 store 的数据。
 * @param {string[]} storeKeys
 * @param {'readonly'|'readwrite'} mode
 * @param {(tx) => Promise<void>} callback
 */
async function idbTx(storeKeys, mode, callback) { ... }
```

**示例**（runCardsPhase 内一次写入 trials + card_states）：

```js
await idbTx(['syncTrials', 'syncCardStates'], 'readwrite', async (tx) => {
  for (const trial of trials) tx.objectStore('sync_trials').put(trial);
  for (const state of states) tx.objectStore('sync_card_states').put(state);
});
```

### 6.4 实现要点

- 内部维护 `_dbCache = { srs: <IDBDatabase>, media: <IDBDatabase> }`，首次访问时 `indexedDB.open` 并 cache
- onupgradeneeded handler 内调用统一的 migration 函数（见 §7）
- 所有事务包 Promise，成功 resolve / 失败 reject
- 错误统一 `log.warn('idb', msg, { storeKey, err })`

## 7. 数据迁移

### 7.1 onupgradeneeded（yihai_srs: 9 → 10）

```js
indexedDB.open('yihai_srs', 10).onupgradeneeded = (e) => {
  const db = e.target.result;

  // 删除所有老 store（数据可丢，用户已确认）
  ['trials', 'card_states', 'easyCardStates', 'app_events', 'voiceSlots', 'yh_logs']
    .forEach(name => {
      if (db.objectStoreNames.contains(name)) db.deleteObjectStore(name);
    });

  // 按注册表新建所有 srs store
  Object.values(IDB_STORES)
    .filter(s => s.db === 'srs')
    .forEach(s => db.createObjectStore(s.name, { keyPath: s.keyPath }));
};
```

### 7.2 onupgradeneeded（yihai_media: 1 → 2）

```js
indexedDB.open('yihai_media', 2).onupgradeneeded = (e) => {
  const db = e.target.result;
  if (db.objectStoreNames.contains('blobs')) db.deleteObjectStore('blobs');
  Object.values(IDB_STORES)
    .filter(s => s.db === 'media')
    .forEach(s => {
      const opts = s.keyPath ? { keyPath: s.keyPath } : {};
      db.createObjectStore(s.name, opts);
    });
};
```

### 7.3 迁移后用户体验

| 用户类型 | 升级后表现 |
|---|---|
| 已登录 | 启动后 runSync 自动从云端拉回 sync_card_states + easy_card_states，SRS 状态恢复（trial 历史不还原，但本地不查询此历史，无感知）|
| 未登录 | 本地 SRS 状态、daily_progress 等丢失，从 0 开始；个人牌组媒体重新从云端下载 |
| voice_slots | 全部用户重置（已确认目前无数据，未来录音重新录）|

### 7.4 不做的事

- ❌ **跨 DB 数据搬运**：用户已确认数据可丢，不引入 JS 层 dump/restore
- ❌ **schema 演进的复杂 migration**：本设计是规范化建立，未来 schema 演进按标准 IDB 流程（version bump + onupgradeneeded）

## 8. 分 Phase 实施计划

每个 Phase 是独立 PR，独立可发布、独立可回滚。

### Phase 1：注册表 + helper + 文档（小 PR）

**改动**：
- 在 index.html 加 `IDB_DBS` / `IDB_STORES` 常量（**声明当前现状的 store 名**，不是新规范）
- 加 helper 函数 `idbGet/Put/Delete/GetAll/Count/Clear/Tx`
- 写本设计文档 + commit
- 老代码继续用现有 store 名和裸 `tx.objectStore(...)` 调用，不动

**风险**：极低（只加代码，不改运行路径）

**测试**：
- 单测 helper 基础路径（约 8 cases）
- 现有所有回归测试不变

### Phase 2：store rename + schema 迁移（中 PR）

**改动**：
- 更新 `IDB_DBS` version：srs 9→10, media 1→2
- 更新 `IDB_STORES` 中 store 名 / keyPath 到新规范（snake_case store 名 + camelCase keyPath）
- onupgradeneeded handler 走 §7 的迁移函数
- 现有 50+ 处 `tx.objectStore('trials')` 等裸字符串调用点暂时保留，但**通过 IDB_STORES 引用**（如 `tx.objectStore(IDB_STORES.syncTrials.name)`），避免手写新 store 名
- record 写入字段名同步改成 camelCase（如 `{ trialId, cardId, ... }`）

**风险**：中（onupgradeneeded 触发 + 字段名变更）

**测试**：
- 新增 `_pw_idb_migration.js`：模拟老版本 IDB → 升级 → 验证 store 列表 + record 字段
- 跑 _pw_cloud_sync / _pw_cross_device / _pw_easy_sync 验证 sync 路径
- 跑 _pw_srs_e2e 验证 SRS 数据写入
- 全 run_all 单测

### Phase 3：调用点改用 helper（按模块多 PR）

按模块分 4 个独立 PR，每 PR 改一个模块：

| PR | 模块 | 涉及调用点 | 风险点 |
|---|---|---|---|
| 3a | SRS（processAnswer / `_writeSrs` / queue build）| ~20 处 | SRS 是核心，需 SRS unit + e2e 全跑 |
| 3b | Sync（runCardsPhase / runMediaPhase / runSync）| ~15 处 | 同步路径，需 cloud_sync + cross_device |
| 3c | Voice slot（录音保存 / 读取）| ~5 处 | 本地路径，需 voice 相关测试 |
| 3d | Media blob（saveMedia / loadMedia）| ~10 处 | 媒体下载，需 media_upload + ui smoke |

**风险**：中（每 PR 控制在单模块）

**测试**：每 PR 跑对应模块测试套 + 全 run_all + smoke

### Phase 4：规范定型 + 文档同步（小 PR）

**改动**：
- 更新 `docs/naming_convention.md`（跨层命名规范汇总：DB / LS / IDB / JS）
- CLAUDE.md 引用规范文档
- memory 更新：`naming-convention-todo` 标 IDB 完成

**风险**：极低（仅文档）

## 9. 测试策略

### 9.1 单元测试新增

`tests/yihai_v5.YY_idb_test.js`（YY = 实施 Phase 时对应版本号，参考现有 yihai_vX.Y_test.js 风格）：

| 测试 | 覆盖 |
|---|---|
| IDB_STORES 注册表完整性 | 每个 entry 含 db / name / keyPath；db 引用 IDB_DBS 中存在的 key |
| store name 唯一性 | 无两个 store 同名（包括跨 DB）|
| helper 路径 | idbGet 缺失 key 返回 null；idbPut + idbGet round-trip 字段一致；idbDelete 后 idbGet 返回 null；idbGetAll 顺序 |
| Tx 原子性 | idbTx 内一处 throw 整体回滚 |
| 复合 keyPath | easyCardStates 用 `[deckKey, cardId]` 读写正确 |

### 9.2 Playwright 新增

`tests/_pw_idb_migration.js`：

- 模拟老版本 IDB 数据（手工 create `yihai_srs` v9 + 老 store 名 + 一条 record）
- 触发应用启动 → onupgradeneeded 跑迁移
- 验证：
  - 新 store 全部存在（按 IDB_STORES）
  - 老 store 全部消失
  - 升级后立刻写入读取 round-trip OK

### 9.3 回归测试范围（每 phase）

| Phase | 必跑 |
|---|---|
| P1 | run_all + _pw_ui_smoke + _pw_srs_e2e |
| P2 | run_all + _pw_ui_smoke + _pw_srs_e2e + _pw_idb_migration + _pw_cloud_sync + _pw_cross_device + _pw_easy_sync |
| P3a (SRS) | run_all + _pw_srs_e2e + _pw_easy + _pw_easy_sync |
| P3b (Sync) | run_all + _pw_cloud_sync + _pw_cross_device + _pw_config_sync |
| P3c (Voice) | run_all + _pw_ui_smoke |
| P3d (Media) | run_all + _pw_ui_smoke + _pw_media_upload + _pw_cross_device |
| P4 | run_all + _pw_ui_smoke + _pw_srs_e2e（文档变动需 minimal smoke）|

## 10. 风险与缓解

| 风险 | 等级 | 缓解 |
|---|---|---|
| onupgradeneeded 中断导致 DB 半升级状态 | 中 | IDB 事务原子；中断时 abort 整个升级，下次启动重试 |
| 已登录用户 runSync 失败 → SRS 状态空白 | 低 | runSync 已有重试 + 错误提示；失败时用户可见，可手动重试 |
| 未登录用户突然丢本地进度引发用户困惑 | 中 | 升级前弹窗提示"本次升级会重置本地未同步进度，建议先登录同步"（P2 PR 内实现）|
| Phase 间发布顺序错（P3 抢在 P2 前合入） | 低 | 文档记录依赖；PR 标题用 "Phase N" 前缀 |
| helper bug 在 P3 改造时放大 | 中 | P1 单测覆盖 helper 基础路径；P3 每模块 PR 独立验证 |
| 调用点漏改（grep 时遗漏）| 低 | P3 完成后再次 grep `objectStore\(` 校验无裸字符串调用 |
| Phase 跨越多版本发布期间用户混用 | 低 | 每 phase 内向后兼容（P1 不动行为，P2 含完整迁移，P3 仅 refactor 不改语义）|

## 11. 不在此设计内的事

- ❌ **DB 名重命名**（保留 `yihai_srs` / `yihai_media`）
- ❌ **deep case transform helper**（不引入 snake↔camel 通用转换）
- ❌ **JS 变量层 snake_case 改造**（CLAUDE.md L141 已定 camel）
- ❌ **sync 层 mapping 重构**（保留现有显式手动 mapping）
- ❌ **lint 工具引入**（项目无 lint 配置）
- ❌ **跨设备 IDB 同步层引入**（仍走云端 trigger + sync_card_states / easy_card_states）
- ❌ **schema 演进框架**（version bump + onupgradeneeded 是标准 IDB 流程，无需自建）

## 12. 后续扩展可能

- **若未来需要 case transform**：可在 helper 加 `transform: 'snake-to-camel'` 选项，按需启用
- **若新 store 频繁**：可引入 `defineStore({ name, keyPath, db })` 工厂自动注册
- **若需要 IDB 加密**（用户敏感数据）：可加 helper 中间层做加解密，业务代码无感
- **若 Capacitor 打包**：iOS 本地 sandbox 内 IndexedDB 行为跟 PWA 一致，本规范继承可用

## 13. 关联文档

- 前置：[memory localstorage-naming](../../../memory/feedback-localstorage-naming.md) — localStorage 命名规范（已完成）
- 前置：[memory naming-convention-todo](../../../memory/project-naming-convention-todo.md) — 跨层命名规范 TODO
- 当前规范的实施 PR 链：待 writing-plans skill 生成实施计划
- 后续：`docs/naming_convention.md`（Phase 4 输出，跨层规范文档汇总）
