# Anki 同步协议详细分析

从 [ankitects/anki](https://github.com/ankitects/anki) v25.09.2 源码逐文件分析，涵盖完整的同步流程、数据结构、冲突解决和错误处理。

---

## 目录

1. [架构概览](#1-架构概览)
2. [协议版本演进](#2-协议版本演进)
3. [核心数据结构](#3-核心数据结构)
4. [同步流程详解](#4-同步流程详解)
5. [冲突解决机制](#5-冲突解决机制)
6. [分块传输](#6-分块传输)
7. [完整性校验](#7-完整性校验)
8. [全量同步](#8-全量同步)
9. [错误处理与恢复](#9-错误处理与恢复)
10. [HTTP 传输层](#10-http-传输层)
11. [对忆海拾光的借鉴](#11-对忆海拾光的借鉴)

---

## 1. 架构概览

### 1.1 整体模型

```
客户端 (桌面/移动)                    服务端 (AnkiWeb)
┌─────────────────┐                ┌─────────────────┐
│ 本地 SQLite DB  │◄── HTTP/REST ─►│  服务端 SQLite   │
│  (collection)   │   JSON body    │  (per user)     │
└─────────────────┘                └─────────────────┘
```

- **传输协议**: HTTP POST，JSON 序列化
- **压缩**: v11 用 zstd + headers，v8-v10 用 gzip + multipart
- **会话模型**: **有状态**。服务端在 `start` 时初始化 `ServerSyncState`，后续请求共享状态
- **事务模型**: 整个同步在一个 DB 事务中，任何失败都回滚

### 1.2 API 端点

所有端点挂载在 `{base_url}/sync/{methodName}` 下:

| 方法 | 端点 | 方向 | 说明 |
|------|------|------|------|
| `hostKey` | `/sync/hostKey` | 请求 | 获取 session key |
| `meta` | `/sync/meta` | 请求 | 获取服务端元数据 |
| `start` | `/sync/start` | 双向 | 开始同步，交换删除记录 |
| `applyGraves` | `/sync/applyGraves` | 上传 | 客户端上传删除记录 |
| `applyChanges` | `/sync/applyChanges` | 双向 | 交换元数据变更 |
| `chunk` | `/sync/chunk` | 下载 | 客户端拉取服务端数据块 |
| `applyChunk` | `/sync/applyChunk` | 上传 | 客户端推送数据块 |
| `sanityCheck2` | `/sync/sanityCheck2` | 双向 | 完整性校验 |
| `finish` | `/sync/finish` | 请求 | 提交同步 |
| `abort` | `/sync/abort` | 请求 | 中止同步 |
| `upload` | `/sync/upload` | 上传 | 全量上传 collection 文件 |
| `download` | `/sync/download` | 下载 | 全量下载 collection 文件 |

### 1.3 关键模块

```
rslib/src/sync/
├── collection/
│   ├── mod.rs          — 模块索引
│   ├── protocol.rs     — SyncProtocol trait + SyncMethod 枚举
│   ├── meta.rs         — 元数据交换与比较
│   ├── status.rs       — 离线/在线状态检查
│   ├── start.rs        — 开始同步 + 交换 graves
│   ├── changes.rs      — 元数据双向交换（牌组/配置/标签/笔记类型）
│   ├── chunks.rs       — 大数据分块交换（卡片/笔记/复习日志）
│   ├── graves.rs       — 删除记录（Graves）数据结构
│   ├── normal.rs       — 正常同步主流程
│   ├── sanity.rs       — 完整性校验
│   ├── finish.rs       — 提交同步
│   ├── upload.rs       — 全量上传
│   ├── download.rs     — 全量下载
│   └── progress.rs     — 进度报告
├── http_client/        — HTTP 客户端实现
├── http_server/        — HTTP 服务端（基于 axum）
├── request/mod.rs      — SyncRequest 请求包装
├── response.rs         — SyncResponse 响应包装
├── version.rs          — 协议版本定义
├── error.rs            — 错误类型
└── login.rs            — 登录认证
```

---

## 2. 协议版本演进

```rust
// version.rs
pub const SYNC_VERSION_08_SESSIONKEY: u8    = 8;   // 2013: session key
pub const SYNC_VERSION_09_V2_SCHEDULER: u8  = 9;   // 2018: V2 调度器
pub const SYNC_VERSION_10_V2_TIMEZONE: u8   = 10;  // 2020: V2 时区
pub const SYNC_VERSION_11_DIRECT_POST: u8   = 11;  // 2023: zstd + headers

pub const SYNC_VERSION_MIN: u8 = 8;
pub const SYNC_VERSION_MAX: u8 = 11;
```

各版本的关键差异：

| 版本 | 传输格式 | 编码 | 关键特性 |
|------|----------|------|----------|
| v8 | multipart/form-data | gzip | session key 机制 |
| v9 | multipart/form-data | gzip | 标记 V2 调度器支持；可选的 chunked graves |
| v10 | multipart/form-data | gzip | 标记 V2 时区支持 |
| v11 | HTTP headers + stream | zstd | 直接 POST body，不再用 multipart；session key 废弃 |

版本协商在 `meta` 阶段：客户端声明 `sync_version`，服务端验证范围 `[8, 11]`，不兼容返回 `501 NOT_IMPLEMENTED`。

**Collection schema 版本跟随协议版本**：v8-v10 用 `SchemaVersion::V11`，v11 用 `SchemaVersion::V18`。

---

## 3. 核心数据结构

### 3.1 SyncMeta（同步元数据）

```rust
// meta.rs
pub struct SyncMeta {
    pub modified: TimestampMillis,    // "mod": collection 最后修改时间
    pub schema: TimestampMillis,      // "scm": schema 最后变更时间
    pub usn: Usn,                     // Update Sequence Number
    pub current_time: TimestampSecs,  // "ts": 服务端当前时间
    pub server_message: String,       // "msg": 服务端消息（可为错误提示）
    pub should_continue: bool,        // "cont": 是否允许继续同步
    pub host_number: u32,             // "hostNum": v11 已废弃
    pub empty: bool,                  // collection 是否为空（无卡片）
    pub media_usn: Usn,               // 媒体文件 USN（独立字段）
}
```

### 3.2 ClientSyncState（客户端同步状态）

```rust
// normal.rs
pub struct ClientSyncState {
    pub required: SyncActionRequired,  // 需要什么类型的同步
    pub server_message: String,        // 服务端消息
    pub host_number: u32,
    pub new_endpoint: Option<String>,  // 重定向端点

    local_is_newer: bool,              // 本地是否比远程新
    usn_at_last_sync: Usn,             // 上次同步时的 USN
    server_usn: Usn,                   // 服务端当前 USN
    pending_usn: Usn,                  // 待同步 USN 阈值（客户端=-1）
    server_media_usn: Usn,             // 服务端媒体 USN
}
```

### 3.3 SyncActionRequired（同步类型判定）

```rust
// normal.rs
pub enum SyncActionRequired {
    NoChanges,                          // 双方一致，无需同步
    FullSyncRequired {                  // schema 不同，需要全量同步
        upload_ok: bool,               // 允许上传（本地非空 OR 远程为空）
        download_ok: bool,             // 允许下载（远程非空 OR 本地为空）
    },
    NormalSyncRequired,                 // 正常增量同步
}
```

### 3.4 ServerSyncState（服务端会话状态）

```rust
// start.rs
pub struct ServerSyncState {
    pub skey: String,                          // session key
    pub server_usn: Usn,                       // 服务端 USN
    pub client_usn: Usn,                       // 客户端上次同步 USN
    pub client_is_newer: bool,                 // 客户端是否更新
    pub server_chunk_ids: Option<ChunkableIds>, // 待分块发送的 ID 集合
}
```

这是**有状态协议**的核心——服务端在 `start` 时初始化此状态，后续 `applyChanges`、`chunk`、`applyChunk`、`finish` 都依赖它。

### 3.5 USN（Update Sequence Number）

```rust
pub struct Usn(pub i32);
```

USN 是单调递增的序列号，是同步的核心机制：

- **服务端**: 每次成功同步后 +1
- **客户端**: 上次同步时的 USN 记为 `usn_at_last_sync`
- **pending_usn**: 客户端为 `-1`，表示所有 `usn >= -1` 的记录都是"脏"的
- **判断脏数据**: `usn.is_pending_sync(pending_usn)` → `usn >= pending_usn`
- 新记录写入时 `usn = -1`，同步后被服务端分配新的 USN

### 3.6 UnchunkedChanges（元数据变更集）

```rust
// changes.rs
pub struct UnchunkedChanges {
    notetypes: Vec<NotetypeSchema11>,          // "models": 笔记类型
    decks_and_config: DecksAndConfig,          // "decks": 牌组 + 配置
    tags: Vec<String>,                         // 标签
    config: Option<HashMap<String, Value>>,    // "conf": 全局配置（仅 local_is_newer 时）
    creation_stamp: Option<TimestampSecs>,     // "crt": 创建时间戳（仅 local_is_newer 时）
}
```

元数据（牌组、配置、标签、笔记类型）不走分块——在单次 `applyChanges` 请求中整体交换。设计前提是这些数据量小，但实际中部分用户的牌组树很大，Anki 团队计划未来也做分块。

### 3.7 Chunk（数据块）与 ChunkableIds

```rust
// chunks.rs
pub const CHUNK_SIZE: usize = 250;  // 每块 250 条

pub struct Chunk {
    pub done: bool,                  // 是否最后一块
    pub revlog: Vec<RevlogEntry>,   // 复习日志
    pub cards: Vec<CardEntry>,      // 卡片
    pub notes: Vec<NoteEntry>,      // 笔记
}

pub struct ChunkableIds {
    revlog: Vec<RevlogId>,
    cards: Vec<CardId>,
    notes: Vec<NoteId>,
}
```

### 3.8 Graves（删除墓碑）

```rust
// graves.rs
pub struct Graves {
    pub cards: Vec<CardId>,   // 已删除的卡片 ID
    pub decks: Vec<DeckId>,   // 已删除的牌组 ID
    pub notes: Vec<NoteId>,   // 已删除的笔记 ID
}
```

删除操作不直接物理删除——先标记为 grave，同步时交换 graves，双方确认后才真正清理。Graves 也分块传输（CHUNK_SIZE = 250）。

### 3.9 SanityCheckCounts（完整性校验计数）

```rust
// sanity.rs
pub struct SanityCheckCounts {
    pub counts: SanityCheckDueCounts,  // (new, learn, review)
    pub cards: u32,
    pub notes: u32,
    pub revlog: u32,
    pub graves: u32,
    pub notetypes: u32,                // "models"
    pub decks: u32,
    pub deck_config: u32,
}

pub struct SanityCheckDueCounts {
    pub new: u32,
    pub learn: u32,
    pub review: u32,
}
```

---

## 4. 同步流程详解

### 4.1 总体流程

```
normal_sync()
│
├─ 1. sync_meta()            生成本地 SyncMeta
├─ 2. server.meta()          获取远程 SyncMeta
├─ 3. compared_to_remote()   比较 → 决定同步类型
│
├─ NoChanges ───────────► 直接返回，不产生网络请求
├─ FullSyncRequired ────► 返回给上层，由用户选择上传/下载
│
└─ NormalSyncRequired ──► normal_sync_inner()
   │
   ├─ begin_trx()                    开启数据库事务
   │
   ├─ Step 1: start()                交换删除记录
   │   ├─ client → server: StartRequest { client_usn, local_is_newer }
   │   ├─ server → client: Graves (服务端已删除的记录)
   │   ├─ client.apply_graves()      应用服务端 graves 到本地
   │   └─ client.apply_graves()      将本地 graves 分块上传
   │
   ├─ Step 2: applyChanges()         交换元数据
   │   ├─ client → server: UnchunkedChanges (本地变更的牌组/配置/标签等)
   │   ├─ server → client: UnchunkedChanges (服务端变更的)
   │   └─ client.apply_changes()     合并服务端元数据
   │
   ├─ Step 3: chunk()                从服务端拉取数据块
   │   └─ loop {
   │       client ← server: Chunk { done, cards, notes, revlog }
   │       client.apply_chunk()
   │     } until chunk.done == true
   │
   ├─ Step 4: applyChunk()           向服务端推送数据块
   │   └─ loop {
   │       client → server: Chunk { done, cards, notes, revlog }
   │     } until chunk.done == true
   │
   ├─ Step 5: sanityCheck()          完整性校验
   │   ├─ client → server: SanityCheckCounts (本地计数)
   │   └─ server 比较双方计数 → Ok / Bad
   │
   └─ Step 6: finish()               提交
       ├─ client → server: EmptyInput
       ├─ server: 更新 last_sync, increment_usn, commit_trx
       └─ client: 更新 last_sync, usn, modified_time

成功 → commit_trx()
失败 → rollback_trx() + abort()
```

### 4.2 Step 1: Meta 交换

```rust
// meta.rs — SyncMeta::compared_to_remote()
let required = if remote.modified == local.modified {
    SyncActionRequired::NoChanges           // 双方 modified 相同
} else if remote.schema != local.schema {
    // schema 不同 → 全量同步
    let upload_ok = !local.empty || remote.empty;    // 本地有数据或远程为空
    let download_ok = !remote.empty || local.empty;  // 远程有数据或本地为空
    SyncActionRequired::FullSyncRequired { upload_ok, download_ok }
} else {
    SyncActionRequired::NormalSyncRequired   // schema 相同但 modified 不同
};
```

**额外检查**:

1. **时钟偏差**: `|server_time - client_time| > 300s` → `ClockIncorrect` 错误
2. **数据过大**: 服务端检查 `collection_bytes > MAX_SYNC_PAYLOAD_BYTES_UNCOMPRESSED`（默认 300MB），超过则强制 `schema = TimestampMillis::now()` → 触发全量同步
3. **版本能力**: v2 调度器需要 v9+，v2 时区需要 v10+
4. **服务端拒绝**: `should_continue = false` 时返回 `ServerMessage` 错误

### 4.3 Step 2: 交换删除记录（Start）

```
客户端                               服务端
  │                                    │
  │── StartRequest ──────────────────►│
  │   { client_usn, local_is_newer }  │ 初始化 ServerSyncState:
  │                                    │   server_usn = col.usn()
  │                                    │   client_usn = req.client_usn
  │                                    │   client_is_newer = req.local_is_newer
  │                                    │   begin_trx()
  │                                    │   server_graves = pending_graves(client_usn)
  │◄─── Graves (server_graves) ──────│
  │                                    │
  │ apply_graves(server_graves)        │
  │                                    │
  │ local_graves = pending_graves()    │
  │ update_pending_grave_usns()        │
  │                                    │
  │── for each grave_chunk ──────────►│
  │   applyGraves({ chunk })          │ apply_graves(chunk, server_usn)
  │                                    │
```

**关键设计**:
- Graves 先于新增数据交换 —— **先删后增，避免复活已删除的记录**
- 服务端在 `start` 阶段开启事务，后续所有操作都在同一事务中
- 服务端立即暂停（`discard_undo_and_study_queues()`），防止中途的 UI 操作干扰

### 4.4 Step 3: 交换元数据（ApplyChanges）

```
客户端                               服务端
  │                                    │
  │── ApplyChangesRequest ───────────►│
  │   { changes: UnchunkedChanges }   │ 同时做两件事:
  │                                    │   1. apply_changes(client_changes) 合并客户端数据
  │                                    │   2. local_unchunked_changes() 收集服务端变更
  │◄─── UnchunkedChanges ────────────│
  │                                    │
  │ apply_changes(remote_changes)      │
```

**客户端收集变更的逻辑** (`local_unchunked_changes`):

```rust
// 查询所有 usn >= pending_usn 的对象
let notetypes = objects_pending_sync("notetypes", pending_usn);
let decks = objects_pending_sync("decks", pending_usn);
let deck_config = objects_pending_sync("deck_config", pending_usn);
let tags = tags_pending_sync(pending_usn);

// 只有 local_is_newer 时才发送全局配置和创建时间戳
if local_is_newer {
    changes.config = Some(get_all_config());
    changes.creation_stamp = Some(creation_stamp());
}
```

### 4.5 Step 4-5: 分块交换数据

参见 [第 6 节 — 分块传输](#6-分块传输)。

### 4.6 Step 6: 完整性校验

参见 [第 7 节 — 完整性校验](#7-完整性校验)。

### 4.7 Step 7: 提交（Finish）

```
客户端                               服务端
  │                                    │
  │── EmptyInput ────────────────────►│
  │                                    │ now = TimestampMillis::now()
  │                                    │ set_last_sync(now)
  │                                    │ increment_usn()       // server_usn += 1
  │                                    │ commit_trx()
  │                                    │ set_modified_time(now)
  │◄─── TimestampMillis (now) ───────│
  │                                    │
  │ set_last_sync(new_mtime)           │
  │ set_usn(server_usn + 1)            │
  │ set_modified_time(new_mtime)       │
```

**服务端 finish 逻辑**:
```rust
// finish.rs — server_finish()
pub fn server_finish(col: &mut Collection) -> Result<TimestampMillis> {
    let now = TimestampMillis::now();
    col.storage.set_last_sync(now)?;
    col.storage.increment_usn()?;
    col.storage.commit_rust_trx()?;       // 提交事务
    col.storage.set_modified_time(now)?;
    Ok(now)
}
```

**客户端 finish 逻辑**:
```rust
// finish.rs — Collection::finalize_sync()
fn finalize_sync(&self, state: &ClientSyncState, new_server_mtime: TimestampMillis) -> Result<()> {
    self.storage.set_last_sync(new_server_mtime)?;
    let mut usn = state.server_usn;
    usn.0 += 1;
    self.storage.set_usn(usn)?;
    self.storage.set_modified_time(new_server_mtime)
}
```

---

## 5. 冲突解决机制

### 5.1 核心策略：Last-Writer-Wins

Anki 的冲突解决**极其简单**——逐记录比较 `mtime_secs`，新的覆盖旧的：

```rust
// changes.rs — merge_decks()
let proceed = if let Some(existing_deck) = self.storage.get_deck(deck.id())? {
    existing_deck.mtime_secs <= deck.common().mtime  // 服务端版本 ≥ 本地，则覆盖
} else {
    true  // 新记录，直接接受
};
```

没有任何 CRDT、向量时钟、三方合并。这种简化是合理的：**同一张卡同时在两台设备上被修改的概率极低**。

### 5.2 子规则

| 场景 | 处理方式 |
|------|----------|
| 双方都有修改 | 以 `mtime` 较新的为准 |
| 只有一方有修改 | 自动接受有修改的版本 |
| 新记录（另一端不存在） | 直接接受 |
| 笔记类型 schema 变更 | 字段数或模板数不同 → `ResyncRequired` 错误 |
| 牌组名称冲突 | 追加 `+` 后缀（`ensure_deck_name_unique()`） |
| 标签冲突 | `register_tag()` 合并，不冲突则直接添加 |

### 5.3 卡片的冲突判断

```rust
// chunks.rs — add_or_update_card_if_newer()
let proceed = if let Some(existing_card) = self.storage.get_card(entry.id)? {
    // 本地没改过（usn 不在 pending 范围）OR 服务端更新
    !existing_card.usn.is_pending_sync(pending_usn) || existing_card.mtime < entry.mtime
} else {
    true  // 新卡片
};
```

这里有一个微妙但关键的逻辑：
- **如果本地卡片 `usn` 处于 pending 范围**（即本地有修改），且本地 `mtime >= 服务端 mtime` → **拒绝服务端版本**，保留本地
- **如果本地卡片 `usn` 不处于 pending 范围**（即本地没改过）→ **直接接受服务端版本**

### 5.4 为什么不需要更复杂的冲突解决

1. **数据粒度小**: 卡片是独立的，修改彼此不影响
2. **使用模式**: 用户很少同时在两台设备上复习同一张卡
3. **LWW 够用**: 即使有冲突，"最后修改的版本"通常是用户想要的
4. **全量同步作为安全网**: 数据不一致时可以回退到全量同步

---

## 6. 分块传输

### 6.1 为什么需要分块

卡片、笔记、复习日志条目可能非常多（上万甚至数十万条）。单次 HTTP 请求传输全部数据会导致：
- 内存溢出
- 请求超时
- 无法汇报进度

因此 Anki 将这三类数据分块传输，每块最多 **250 条**。

### 6.2 分块流程

```
客户端（拉取服务端数据）              服务端
  │                                    │
  │── chunk(EmptyInput) ─────────────►│ 首次调用：初始化 server_chunk_ids
  │◄─── Chunk { done: false, ... } ──│ get_chunk(ids, None)  ← 取 250 条
  │ apply_chunk(chunk)                │
  │── chunk(EmptyInput) ─────────────►│
  │◄─── Chunk { done: false, ... } ──│
  │ apply_chunk(chunk)                │
  │── ... ───────────────────────────►│
  │◄─── Chunk { done: true, ... } ───│  ← 最后一块，done = true
  │ apply_chunk(chunk)                │ done → 退出循环


客户端（推送到服务端）                服务端
  │                                    │
  │ ids = get_chunkable_ids()          │
  │                                    │
  │── applyChunk({ chunk, done }) ───►│ apply_chunk(chunk, client_usn)
  │◄─── () ──────────────────────────│
  │── applyChunk({ chunk, done }) ───►│
  │── ... ───────────────────────────►│
  │── applyChunk({ chunk, done:true })│  ← done = true → 退出循环
```

### 6.3 客户端取块逻辑

```rust
// chunks.rs — get_chunk()
pub fn get_chunk(&self, ids: &mut ChunkableIds, server_usn_if_client: Option<Usn>) -> Result<Chunk> {
    let mut limit = CHUNK_SIZE as i32;  // 250
    // 从三个列表中轮流取 ID，直到凑够 250 条或全部取完
    while limit > 0 {
        if let Some(id) = ids.revlog.pop() { limit -= 1; }
        if let Some(id) = ids.notes.pop()  { limit -= 1; }
        if let Some(id) = ids.cards.pop()  { limit -= 1; }
        if limit == last_limit { break; }  // 全部取完
    }
    // done = true 如果还有剩余 limit（即所有队列已空）
    if limit > 0 { chunk.done = true; }

    // 标记为"非待同步"（防止同一批被重复发送）
    maybe_update_object_usns("revlog", &ids, server_usn_if_client);
    maybe_update_object_usns("cards", &ids, server_usn_if_client);
    maybe_update_object_usns("notes", &ids, server_usn_if_client);

    // 从 DB 取出完整对象
    chunk.revlog = revlog_ids.iter().map(|id| get_revlog_entry(id)).collect();
    chunk.cards = card_ids.iter().map(|id| get_card(id)).collect();
    chunk.notes = note_ids.iter().map(|id| get_note(id)).collect();
}
```

### 6.4 服务端首次调用

```rust
// chunks.rs — server_chunk()
pub fn server_chunk(col: &mut Collection, state: &mut ServerSyncState) -> Result<Chunk> {
    if state.server_chunk_ids.is_none() {
        // 首次调用：收集所有待同步 ID
        state.server_chunk_ids = Some(col.get_chunkable_ids(state.client_usn)?);
    }
    col.get_chunk(state.server_chunk_ids.as_mut().unwrap(), None)
}
```

### 6.5 Graves 也分块

Graves 虽然数量通常远小于卡片，但同样使用 `CHUNK_SIZE = 250` 分块：

```rust
// graves.rs — Graves::take_chunk()
pub fn take_chunk(&mut self) -> Option<Graves> {
    let mut limit = CHUNK_SIZE;
    // 优先取 cards，其次 notes，最后 decks
    while limit > 0 && !self.cards.is_empty() { ... limit -= 1; }
    while limit > 0 && !self.notes.is_empty() { ... limit -= 1; }
    while limit > 0 && !self.decks.is_empty() { ... limit -= 1; }
    if limit == CHUNK_SIZE { None } else { Some(out) }
}
```

---

## 7. 完整性校验

### 7.1 设计目的

同步的最后一道防线：确保双方在数据交换后状态一致。如果计数不匹配，意味着有数据在同步过程中丢失或重复。

### 7.2 校验流程

```rust
// sanity.rs
客户端:
  local_counts = storage.sanity_check_info()
  // → SanityCheckCounts { cards, notes, revlog, graves, notetypes, decks, deck_config, counts(new, learn, review) }

  server_response = server.sanity_check(SanityCheckRequest { client: local_counts })

  if server_response.status == Bad {
      return Err(SanityCheckFailed { client: response.client, server: response.server })
      // → 上层捕获此错误 → set_schema_modified() → 下次同步变为全量同步
  }
```

服务端校验逻辑：

```rust
// sanity.rs — server_sanity_check()
pub fn server_sanity_check(req: SanityCheckRequest, col: &mut Collection) -> Result<SanityCheckResponse> {
    let mut server = col.storage.sanity_check_info()?;
    let mut client = req.client;

    // 清零无法精确比较的字段
    client.counts = SanityCheckDueCounts::default();  // due counts 可能因定时计算差异
    client.graves = 0;   // 旧 schema 可能有重复删除标记
    server.graves = 0;

    if client == server {
        SanityCheckStatus::Ok
    } else {
        SanityCheckStatus::Bad
    }
}
```

### 7.3 校验失败的处理

```rust
// normal.rs — sync() 的 Err 分支
Err(e) => {
    self.col.storage.rollback_trx()?;
    let _ = self.server.abort(EmptyInput::request()).await;

    if let AnkiError::SyncError { kind: SyncErrorKind::SanityCheckFailed { .. } } = &e {
        // 强制修改 schema 时间戳 → 下次同步将是全量同步
        self.col.set_schema_modified()?;
    }
    Err(e)
}
```

**关键决策**: 校验失败 → 回滚事务 → 修改本地 schema → 下次同步自动走全量同步路径。

---

## 8. 全量同步

### 8.1 触发条件

1. `remote.schema != local.schema`（meta 比较阶段判定）
2. 用户手动触发（UI 中的 "全量同步" 按钮）
3. 上次正常同步校验失败后的自动恢复

### 8.2 上传流程

```rust
// upload.rs — Collection::full_upload_with_server()
async fn full_upload_with_server(mut self, server: HttpSyncClient) -> Result<()> {
    self.before_upload()?;               // 预处理（清理缓存等）
    let col_path = self.col_path.clone();
    self.close(Some(SchemaVersion::V18))?;  // 关闭数据库

    let col_data = fs::read(&col_path)?;    // 读取整个 SQLite 文件
    check_upload_limit(col_data.len(), MAX_SIZE)?;  // 检查大小限制

    match server.upload(col_data).await?.upload_response() {
        UploadResponse::Ok => Ok(()),
        UploadResponse::Err(msg) => Err(SyncError::ServerMessage(msg)),
    }
}
```

服务端接收：

```rust
// upload.rs — handle_received_upload()
pub fn handle_received_upload(col: &mut Option<Collection>, new_data: Vec<u8>) -> HttpResult<UploadResponse> {
    // 1. 检查大小
    if new_data.len() >= MAX_SIZE { return Err("exceeds size limit"); }

    // 2. 写入临时文件
    let temp_file = new_tempfile_in_parent_of(&path)?;
    write_file(temp_file.path(), &new_data)?;

    // 3. 验证完整性：尝试打开并检查
    if let Err(err) = CollectionBuilder::new(temp_file.path())
        .set_check_integrity(true).build()
    {
        return Ok(UploadResponse::Err("corrupt"));
    }

    // 4. 关闭当前 collection → 原子重命名
    col.take().close(None)?;
    atomic_rename(temp_file, &path, true)?;
    Ok(UploadResponse::Ok)
}
```

### 8.3 下载流程

```rust
// download.rs — Collection::full_download_with_server()
async fn full_download_with_server(self, server: HttpSyncClient) -> Result<()> {
    let col_path = self.col_path.clone();
    self.close(None)?;                       // 关闭本地数据库

    let out_data = server.download(EmptyInput::request()).await?.data;

    // 验证下载数据完整性
    let temp_file = new_tempfile_in_parent_of(&col_path)?;
    write_file(temp_file.path(), out_data)?;
    let col = CollectionBuilder::new(temp_file.path())
        .set_check_integrity(true).build()?;

    // 更新 last_sync 时间戳
    col.storage.db.execute_batch("update col set ls=mod")?;
    col.close(None)?;

    atomic_rename(temp_file, &col_path, true)?;
    Ok(())
}
```

### 8.4 安全保护

| 保护 | 说明 |
|------|------|
| 空库保护 | `upload_ok = !local.empty \|\| remote.empty` — 不能上传空库覆盖非空库 |
| 大小限制 | `check_upload_limit()` — 超过 300MB 拒绝上传 |
| 完整性验证 | `CollectionBuilder.set_check_integrity(true)` — 验证 SQLite 文件完整 |
| 原子重命名 | `atomic_rename()` — 防止写入中断导致数据损坏 |
| 备份提示 | 错误消息提示用户先 "Check Database" 或从备份恢复 |

---

## 9. 错误处理与恢复

### 9.1 错误类型

```rust
// error.rs — OrHttpErr trait 映射
.or_bad_request("msg")       // 400 — 客户端请求格式错误
.or_forbidden("msg")         // 403 — 认证失败
.or_not_found("msg")         // 404 — 资源不存在
.or_conflict("msg")          // 409 — 并发冲突
.or_internal_err("msg")      // 500 — 服务端内部错误
.or_permanent_redirect("url") // 308 — 永久重定向
```

### 9.2 同步级错误

```rust
pub enum SyncErrorKind {
    ClockIncorrect,           // 时钟偏差 > 5 分钟
    ServerMessage,            // 服务端返回的 should_continue=false
    SanityCheckFailed {       // 完整性校验失败
        client: Option<SanityCheckCounts>,
        server: Option<SanityCheckCounts>,
    },
    ResyncRequired,           // 笔记类型 schema 变更，需全量同步
    UploadTooLarge,           // collection 文件过大
}
```

### 9.3 事务保护

整个正常同步在一个数据库事务中运行，确保原子性：

```rust
// normal.rs — sync()
self.col.storage.begin_trx()?;
match self.normal_sync_inner(state).await {
    Ok(success) => {
        self.col.storage.commit_trx()?;   // 全部成功 → 提交
        Ok(success)
    }
    Err(e) => {
        self.col.storage.rollback_trx()?; // 任何失败 → 回滚
        let _ = self.server.abort(EmptyInput::request()).await; // 通知服务端也回滚
        // 如果是校验失败，设置 schema_modified 触发下次全量同步
        Err(e)
    }
}
```

### 9.4 恢复路径

```
正常同步失败
├── 校验失败 ──► set_schema_modified() ──► 下次同步 = 全量同步
├── 冲突 ──────► rollback + abort ──────► 手动重试
├── 网络错误 ──► rollback + abort ──────► 自动重试
└── 全量同步失败 ──► 提示用户检查数据库或从备份恢复
```

### 9.5 重定向处理

服务端可以通过 `301 PERMANENT_REDIRECT` 将客户端引导到新的端点：

```rust
// meta.rs — meta_with_redirect()
match self.meta(MetaRequest::request()).await {
    Err(HttpError { code: StatusCode::PERMANENT_REDIRECT, context, .. }) => {
        let url = Url::try_from(context.as_str())?;
        self.endpoint = url;  // 更新端点
        self.meta(MetaRequest::request()).await  // 重试
    }
    // ...
}
```

---

## 10. HTTP 传输层

### 10.1 请求格式（v11, 当前版本）

```
POST /sync/{method}
Headers:
  Anki-Sync-Version: 11
  Anki-Client-Version: 25.09.2
  Anki-Host-Key: {hkey}              # 每请求都带，认证用
  Anki-Sync-Key: {skey}             # 非 login 请求必须

Body: zstd-compressed JSON
  OR
  raw bytes (upload/download)
```

响应同样用 zstd 压缩，`Anki-Original-Size` header 指示解压后大小。

### 10.2 请求格式（v8-v10, 旧版）

```
POST /sync/{method}
Content-Type: multipart/form-data
Fields:
  data: gzip-compressed JSON
  skey: session key
  hostKey: authentication key
```

### 10.3 SyncRequest 反序列化

```rust
// request/mod.rs — FromRequest
async fn from_request(req: Request<Body>, state: &S) -> Result<Self, Self::Rejection> {
    // 1. 提取客户端 IP
    let ip = parts.extract::<ClientIp>().await?.0;

    // 2. 尝试提取 SyncHeader（v11）
    if let Some(TypedHeader(sync_header)) = sync_header {
        let stream = Body::into_data_stream();
        SyncRequest::from_header_and_stream(sync_header, stream, ip).await
    } else {
        // 3. 回退到 multipart（v8-v10）
        let multi = Multipart::from_request(req, state).await?;
        SyncRequest::from_multipart(multi, ip).await
    }
}
```

### 10.4 大小限制

```rust
// request/mod.rs
pub static MAXIMUM_SYNC_PAYLOAD_BYTES: LazyLock<usize> = LazyLock::new(|| {
    env::var("MAX_SYNC_PAYLOAD_MEGS")
        .map(|v| v.parse().expect("invalid upload limit"))
        .unwrap_or(100)       // 默认 100MB 原始文件
        * 1024 * 1024
});

// 解压后限制为原始文件的 3 倍（压缩比约为 3:1）
pub static MAXIMUM_SYNC_PAYLOAD_BYTES_UNCOMPRESSED: LazyLock<u64> =
    LazyLock::new(|| (*MAXIMUM_SYNC_PAYLOAD_BYTES * 3) as u64);
```

---

## 11. 对忆海拾光的借鉴

### 11.1 可采用的模式

| 模式 | 优先级 | 复杂度 | 说明 |
|------|--------|--------|------|
| **USN 脏标记** | 高 | 低 | 用递增序列号替代全量比对，只同步 `usn >= last_sync_usn` 的记录 |
| **Graves 先于数据** | 高 | 低 | 先交换删除记录再交换新增，避免复活已删数据 |
| **LWW 逐记录比较** | 高 | 低 | 每张卡独立比较 `updated_at`，无需复杂 CRDT |
| **sync_trials 模式** | 已有 | — | 当前 `sync_trials` INSERT → `fn_trial_to_card_state()` trigger 已实现类似效果 |
| **分页同步** | 中 | 中 | 卡片量 >500 时按游标分页，避免单次请求过大（参考 CHUNK_SIZE=250） |
| **完整性校验** | 中 | 中 | 同步后比对客户端和服务端的各表计数 |
| **全量同步逃生舱** | 中 | 低 | 给用户"以本地为准"/"以云端为准"的手动选项 |
| **同步版本协商** | 低 | 中 | 升级协议时保持向下兼容 |
| **时钟偏差检查** | 低 | 低 | 服务端时间和客户端时间偏差 >5min 时警告 |
| **原子性事务** | 已有 | — | 当前 Supabase RLS + trigger 已提供事务保证 |

### 11.2 不应采用的模式

| 模式 | 原因 |
|------|------|
| 有状态 HTTP 同步 | 需要服务端维护会话，与 Supabase REST 模型冲突。忆海拾光应用无状态请求 |
| SQLite 文件级全量同步 | Supabase PostgreSQL 不支持文件级操作 |
| protobuf 序列化 | 过度工程，JSON 对当前规模足够 |
| multipart + gzip 传输 | v11 的 zstd + headers 更优，但对于 PWA JSON 直传最简 |
| 分离的 media 同步 | 忆海拾光用 Supabase Storage 已有自己的 media 管理 |

### 11.3 具体改进建议

**1. 引入 USN 增量同步**

当前 `checkSyncNeeded()` 比较 `updated_at` 时间戳判断"是否需要同步"，但一旦需要同步，就拉取全部数据。引入 USN 后：

```sql
-- 每张卡记录 usn
ALTER TABLE sync_trials ADD COLUMN usn INTEGER DEFAULT 0;

-- 客户端记录上次同步的 usn
-- 同步时只拉 usn > last_sync_usn 的记录
SELECT * FROM sync_trials WHERE usn > {last_sync_usn};
```

**2. Graves 机制**

当前删除操作直接物理删除。引入 Graves：

```sql
CREATE TABLE sync_graves (
    id SERIAL PRIMARY KEY,
    card_id TEXT NOT NULL,
    deleted_at TIMESTAMPTZ DEFAULT NOW(),
    usn INTEGER
);
-- 同步时交换 graves，双方确认后再物理删除
```

**3. 完整性校验**

在 syncAll 末尾增加计数比对：

```javascript
// syncAll 最后一步
const localCounts = {
  cards: await countLocalCards(),
  trials: await countLocalTrials(),
};
const remoteCounts = await fetchRemoteCounts();
if (JSON.stringify(localCounts) !== JSON.stringify(remoteCounts)) {
  console.warn('Sync counts mismatch, suggesting full sync');
  suggestFullSync();
}
```

**4. 全量同步逃生舱**

在设置面板增加两个按钮（需确认对话框保护）：
- "以本地数据覆盖云端" — 上传所有本地数据
- "以云端数据覆盖本地" — 清空本地 + 重新下载

---

## 附录：完整请求/响应示例

### A. Meta 交换

```
POST /sync/meta
{
  "v": 11,
  "cv": "25.09.2"
}

Response:
{
  "mod": 1715472000000,
  "scm": 1715472000000,
  "usn": 1234,
  "ts": 1715472000,
  "msg": "",
  "cont": true,
  "hostNum": 0,
  "empty": false
}
```

### B. Start 请求

```
POST /sync/start
{
  "minUsn": 1200,
  "lnewer": true
}

Response:
{
  "cards": [],
  "notes": [],
  "decks": [1234567890123]
}
```

### C. ApplyChanges 请求

```
POST /sync/applyChanges
{
  "changes": {
    "models": [...],
    "decks": [[...], [...]],
    "tags": ["tag1", "tag2"]
  }
}

Response:
{
  "models": [...],
  "decks": [[...], [...]],
  "tags": [...]
}
```

### D. Chunk 请求

```
POST /sync/chunk
{}

Response:
{
  "done": false,
  "cards": [[1, 2, 3, 0, 1715472000, 1201, 2, 2, 0, 21, 2500, 5, 0, 3, 0, 0, 0, ""], ...],
  "notes": [[100, "guid-xxx", 5, 1715472000, 1201, "tag1 tag2", "field1\x1ffield2", "", "", 0, ""], ...],
  "revlog": [...]
}
```

（卡片和笔记用 tuple 格式以减小体积，而非 JSON object）
