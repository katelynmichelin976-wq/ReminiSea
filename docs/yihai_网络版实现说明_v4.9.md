# 忆海拾光 · 网络版实现说明 (v4.9.12)

> 版本：v1.0  
> 日期：2026-05-11  
> 对应代码：yihai_v4.9.html（v4.9.12）

---

## 一、架构概览

```
┌─────────────────────────────────────────────────┐
│                    浏览器 (PWA)                   │
│                                                  │
│  ┌──────────┐  ┌──────────┐  ┌───────────────┐  │
│  │ initUI() │  │initCloud│  │ doCloudLogin() │  │
│  │ 本地渲染  │  │ 会话恢复  │  │ 手动登录+全同步 │  │
│  └────┬─────┘  └────┬─────┘  └───────┬───────┘  │
│       │              │                │          │
│       ▼              ▼                ▼          │
│  ┌──────────────────────────────────────────┐   │
│  │             syncAll()                      │   │
│  │  上传脏数据 → 拉云端状态 → 合并配置         │   │
│  │  → 拉今日统计 → 下载牌组 → 拉牌组CardState │   │
│  └──────────────────┬───────────────────────┘   │
│                     │                            │
│  ┌──────────────────┼───────────────────────┐   │
│  │   localStorage   │     IndexedDB          │   │
│  │   - decks        │     - card_states      │   │
│  │   - settings     │     - trials           │   │
│  │   - sync_ts      │     - app_events       │   │
│  └──────────────────┴───────────────────────┘   │
└──────────────────────┬──────────────────────────┘
                       │ Supabase REST API
┌──────────────────────▼──────────────────────────┐
│                 Supabase 云端                     │
│                                                  │
│  ┌──────────┐ ┌────────────┐ ┌──────────────┐  │
│  │   Auth   │ │  Database   │ │   Storage    │  │
│  │ session  │ │ sync_trials │ │  ReminiSea   │  │
│  │ persist  │ │ sync_card_  │ │  (图片/音频)  │  │
│  │          │ │   states    │ │              │  │
│  └──────────┘ │ sync_config │ └──────────────┘  │
│               │ server_decks│                    │
│               │ server_deck │                    │
│               │   _cards    │                    │
│               │ cards_pool  │                    │
│               │ app_events  │                    │
│               │ device_reg  │                    │
│               └────────────┘                    │
└─────────────────────────────────────────────────┘
```

**核心设计原则**：
- 本地优先：UI 渲染不等待网络，IndexedDB + localStorage 本地存储
- 双向同步：上传脏数据 → 拉取云端更新 → 本地合并
- 增量同步：`checkSyncNeeded()` 判断是否需要同步，无变化零网络请求
- 写时上传：答题产生 TrialLog，`syncTrialLog` 逐条上传；DB trigger 自动维护 CardState
- 离线可用：`_syncEnabled` 门控所有云操作，未登录/断网降级为纯本地模式

---

## 二、会话生命周期

### 2.1 状态变量

```
_sb            Supabase 客户端实例
_syncEnabled   是否已登录且可同步
_cloudUserId   当前用户 UUID
_cloudUserEmail 当前用户邮箱
_deviceId      设备唯一标识（localStorage 持久化）
```

### 2.2 页面启动流程

```
页面加载
  │
  ├─ initUI() ──────────────────────────────── [同步，立即执行]
  │   restoreDecks()    ← localStorage → DECKS_META, DECKS
  │   renderDeckList()  ← 显示牌组（占位符 …）
  │   await updateDeckStats() ← IndexedDB → 真实到期/新卡数
  │
  └─ _tryInitCloud() ───────────────────────── [异步，轮询等待 SDK]
      每 200ms 检查 typeof supabase !== 'undefined'
      就绪后 →
        initCloud()
          restoreCloudSession()  ← Supabase getSession()
          ├─ 有 session → _syncEnabled=true
          │   checkSyncNeeded()
          │   ├─ true  → syncAll(currentDeck, false, true)  [noDecks=true，不下载牌组]
          │   └─ false → 跳过（initUI 已渲染）
          └─ 无 session → 静默跳过（离线模式）
```

**关键时序**：Supabase SDK 通过 `<script defer>` 加载。`initCloud()` 不能直接调用（SDK 可能未就绪），改为 `_tryInitCloud()` 轮询 `typeof supabase`，最多等 10 秒。

### 2.3 手动登录

```
用户输入邮箱密码 → doCloudLogin()
  _sb = supabase.createClient(url, key)
  signInWithPassword(email, pwd)
  → _syncEnabled = true
  → syncAll(currentDeck, false)  [noDecks=false，下载所有云牌组]
```

**注意**：`doCloudLogin` 的 `syncAll` 第三参数是 `undefined`（等价 `false`），会触发步骤 7 下载全部云端牌组。`initCloud` 调 `syncAll(deckKey, false, true)` 明确跳过牌组下载。

### 2.4 退出登录

```
doCloudLogout()
  logAppEvent('logout')
  signOut()
  → _syncEnabled = false, _cloudUserId = '', _sb = null
  → 清除 localStorage: yihai_global_sync_ts
  → 移除 DECKS_META 中的云牌组（source='cloud'）
  → IndexedDB.clear() card_states + trials（全部清空）
  → renderDeckList() + updateDeckStats()
```

**设计决策**：退出时清空全部 IndexedDB（不区分云/本地牌组）。理由是：本地 .yhspack 导入牌组使用率极低，且用户重新导入成本小。如果将来需要保留本地数据，可改为按 deck_key 筛选删除。

---

## 三、同步算法

### 3.1 checkSyncNeeded() — 判断是否需要同步

```
checkSyncNeeded():
  1. 本地脏检查：IndexedDB 中是否有 !synced_at 的 TrialLog → 有则 true
  2. 首同步检查：yihai_global_sync_ts === 0 → true
  3. 服务器增量：sync_card_states WHERE updated_at > lastSyncTs → count > 0 → true
  4. 配置更新：sync_config.updated_at > lastSyncTs → true
  5. 以上均否 → false（无需同步）
  异常：网络/数据库错误 → true（保守策略）
```

**用途**：`initCloud` 启动时、`visibilitychange` 切前台时判断是否需要完整同步。

### 3.2 syncAll() — 完整双向同步

```
syncAll(deckKey, showToast, noDecks):
  ┌─ Step 1: 上传答题记录
  │   读 IndexedDB trials → 筛选 !synced_at → syncTrialLog() 逐条上传
  │   （服务端 DB trigger: INSERT sync_trials → UPSERT sync_card_states）
  │
  ├─ Step 1.5: 上传应用事件日志
  │   syncAppEvents() → app_events 表
  │
  ├─ Step 1.6: 上传 CardState 变更日志
  │   syncCardStateLogs() → card_state_log 表（已废弃，保留兼容）
  │
  ├─ Step 2: 拉取云端 CardState（仅当前 deckKey）
  │   syncCardStatesFromCloud(deckKey) → 按 updated_at 合并到本地
  │
  ├─ Step 5: 跨设备今日统计
  │   从 sync_trials 拉取今日全部记录 → 合并 daily_new_today/reviewed_today/评级分布
  │
  ├─ Step 6: 配置双向同步
  │   cloudPullConfig() → merge（本地优先 SRS，云端补充 UI）
  │   cloudPushConfig() → 上传本地覆盖项
  │
  └─ Step 7: 牌组同步（仅 noDecks=false）
      列出 server_decks → 遍历下载/同步每个牌组
        ├─ 已存在 → syncDeckFromCloud()（增量：只更新变化的卡）
        └─ 不存在 → downloadDeckFromCloud()（全量：下载卡片+媒体）
      遍历每个云牌组 → syncCardStatesFromCloud(meta.key)
      → renderDeckList() + updateDeckStats()
  → localStorage.setItem('yihai_global_sync_ts', Date.now())
```

**参数说明**：
- `deckKey`：Step 2 仅同步此牌组的状态；Step 7 不受影响（遍历全部云牌组）
- `noDecks=true`：练习后自动同步，跳过牌组下载（减少网络开销）
- `noDecks=false/undefined`：登录后全量同步，下载全部云牌组

### 3.3 同步触发时机

| 触发场景 | 调用路径 | noDecks |
|---|---|---|
| 页面启动（有 session） | initCloud → checkSyncNeeded → syncAll | true |
| 手动登录 | doCloudLogin → syncAll | false |
| 手动点同步按钮 | 设置页同步按钮 → syncAll | false |
| 切前台 | visibilitychange → checkSyncNeeded → syncAll | true |
| 练习完成 | backfillAfterPractice → syncAll | true |
| 逐卡答题 | _writeSrs → syncTrialLog（单条） | — |

---

## 四、CardState 合并逻辑

### 4.1 syncCardStatesFromCloud(deckKey)

```
从 sync_card_states 拉取当前用户 + 指定牌组的所有记录
  → 按 state_key 去重（取 updated_at 最大）
  → 与本地 IndexedDB 逐条比较：
      本地不存在 OR 云端 updated_at > 本地 updated_at → 覆盖本地
      本地 updated_at >= 云端 updated_at → 保留本地
```

**设计意图**：这是跨设备同步的核心。设备 A 练习后上传 CardState → DB trigger 写入 updated_at → 设备 B `syncCardStatesFromCloud` 拉取并覆盖本地。

**注意**：合并策略是基于 `updated_at` 的时间戳比较，不合并具体字段。如果云端和本地对同一张卡都有更新（如双设备同时练习），以云端为准（云端 updated_at 更新）。

### 4.2 逐卡上传（syncTrialLog）

```
_writeSrs → writeTrialLog(entry) → syncTrialLog(entry)
  entry 包含完整状态快照：
    srs_stage_before/after, interval_before/after, ease_before/after
    due_ts, due_date, suspended, suspended_reason
    active_gap_ms, response_time_ms
```

**服务端行为**：`sync_trials` INSERT → DB trigger `fn_trial_to_card_state()` 自动 UPSERT `sync_card_states`。前端不再直接写 `sync_card_states`。

### 4.3 数据一致性保证

```
答题 → writeTrialLog (IndexedDB) → syncTrialLog (云端)
                                    ↓
                          DB trigger → sync_card_states.upsert
                                    ↓
另一设备 → syncCardStatesFromCloud → IndexedDB merge
```

**关键约束**：
- TrialLog 是不可变日志（只增不删不改）
- CardState 是当前快照（每次答题 UPSERT）
- 跨设备合并以 `updated_at` 时间戳为准

---

## 五、配置同步

### 5.1 数据结构

```json
{
  "srs": { "learning_steps": [1,10], "starting_ease": 2.5, ... },
  "ui":  { "theme": "dark", "readHint": "1", "ttsRate": "1.0", ... }
}
```

### 5.2 push/pull 策略

```
cloudPushConfig():
  收集 localStorage 中的 SRS 覆盖值 + UI 设置
  → upsert sync_config (user_id, config_json, updated_at)

cloudPullConfig():
  从 sync_config 拉取 config_json
  → merge: 本地 SRS 优先，云端 UI 补充
  → 写回 localStorage + 刷新 UI
```

**合并规则**：SRS 参数以本地为准（尊重用户调参），UI 设置以云端为准（同步深色模式、字号等偏好）。新增的未知参数自动保留。

---

## 六、已知问题与优化建议

### 6.1 已修复问题（v4.9.2–v4.9.12）

| 版本 | 问题 | 根因 |
|---|---|---|
| v4.9.2 | TrialLog 云端缺字段 | syncTrialLog INSERT 漏传 due_ts/due_date 等 |
| v4.9.3 | 统计总卡片数不一致 | 使用 CardState 条数而非牌组实际大小 |
| v4.9.4–v4.9.6 | 刷新后登录丢失 | SDK defer 晚于 initCloud 调用（经三次试错后正确修复） |
| v4.9.7 | 统计占位符不更新 | IndexedDB 首次打开返回 undefined |
| v4.9.8 | 刷新后冗余网络请求 | checkSyncNeeded=false 仍拉 CardState |
| v4.9.10 | 退出登录 IndexedDB 未清 | clear() 事务未 await |
| v4.9.11 | 登录同步 409 错误 | logAppEvent 立即上传与 syncAppEvents 竞态 |
| v4.9.12 | 登录后云牌组统计为零 | syncAll step 2 仅同步当前牌组状态 |

### 6.2 待优化项

**P0 — 影响用户体验**：

1. **牌组下载阻塞 UI**  
   `downloadDeckFromCloud` 同步下载全部卡片 + 媒体，33 张卡约需 10-15 秒，期间牌组不出现。
   → 建议：元数据先展示 → 媒体后台逐张下载 → 下载完刷新。

2. **退出时清空全部本地练习记录**  
   `doCloudLogout` 中 `store.clear()` 删除了所有 IndexedDB 数据，本地 .yhspack 导入牌组的练习记录一并丢失。
   → 建议：按 deck_key 筛选，仅删除云牌组数据。

3. **退出前未上传未同步数据**  
   用户离线练习后退出，未同步的 TrialLog 直接丢失。
   → 建议：退出前调 `syncPendingData(null)` 上传余量。

**P1 — 优化性能/健壮性**：

4. **Supabase 客户端重复创建**  
   `restoreCloudSession`（try 和 catch 各一次）和 `doCloudLogin` 各创建客户端实例。浏览器控制台显示 "Multiple GoTrueClient instances" 警告。
   → 建议：统一为单例 `_sb`，避免重复 createClient。

5. **跨设备测试时序不稳定**  
   牌组下载阻塞导致测试 poll 超时。
   → 建议：配合 P0-1 修复后，测试改为等元数据出现即可。

6. **checkSyncNeeded 不检测新增牌组**  
   服务器新增牌组时，`checkSyncNeeded` 返回 false（只检查 card_states 和 config）。
   → 建议：增加 `server_decks` 的 `updated_at > lastSyncTs` 检查。

**P2 — 长期优化**：

7. **无冲突检测的多设备同步**  
   两台设备同时对同一张卡答题 → 后上传的覆盖先上传的。当前无 CRDT 或版本向量保护。
   → 建议：短期接受（概率低），长期引入 `updated_at` 微秒精度 + 设备时钟同步。

8. **IndexedDB 事务未统一封装**  
   多处手动 `new Promise` 包裹 IndexedDB 操作，重复代码多。
   → 建议：抽取 `idbPromise(tx)` 工具函数。

9. **日志系统膨胀**  
   `app_events` 和 `card_state_log` 持续增长，无自动清理策略。
   → 建议：30 天 TTL，按月归档或删除。

---

## 七、数据库表结构（服务端 Supabase）

| 表 | 用途 | 主键 | RLS |
|---|---|---|---|
| `cards_pool` | 卡片池（跨用户共享） | id | authenticated |
| `server_decks` | 牌组索引 | id (text) | authenticated |
| `server_deck_cards` | 牌组-卡片关联 | id | authenticated |
| `sync_trials` | 答题记录（不可变日志） | trial_id (unique) | user_id |
| `sync_card_states` | SRS 状态快照 | (user_id, state_key) | user_id |
| `sync_config` | 用户配置 | user_id (unique) | user_id |
| `app_events` | 应用事件日志 | event_id | user_id |
| `card_state_log` | 状态变更日志（已废弃） | log_id | user_id |
| `device_registry` | 设备注册 | (user_id, device_id) | user_id |
| `upload_log` | 上传日志 | id | authenticated |

**DB Trigger**: `fn_trial_to_card_state()` — sync_trials INSERT → 自动 UPSERT sync_card_states，前端不再直写 CardState。

---

## 八、Playwright 回归测试

| 测试文件 | 断言数 | 覆盖范围 |
|---|---|---|
| `_playwright_test.js` | 22 | 单机：导入、SRS 算法、10 天练习、统计 |
| `_playwright_cloud_test.js` | 17 | 云端：登录、下载、练习同步、配置同步、退出 |
| `_playwright_cross_device_sync_test.js` | 21 | 跨设备：A 练习 → B 登录 → 状态同步 |
| `_playwright_session_restore_test.js` | 8 | 登录恢复：刷新后自动恢复 + 牌组显示 |
| `_playwright_user_switch_test.js` | 8 | 用户切换：退出 → 数据清除 → 重新登录 |

**总断言数：335**（含 Node.js 单测 259 项）
