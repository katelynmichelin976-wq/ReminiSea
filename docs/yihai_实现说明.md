# 忆海拾光 · 实现说明

> 实现流程文档，按场景组织。与 `srs_design_v6.9.md`（SRS 算法细节）、`yihai_开发问答.md`（开发 Q&A）互补。

---

## 一、练习流程

### 启动链条

```
用户点击「开始练习」
  → startQuiz()
    → warmupSpeech()          — 必须在手势内执行（iOS 解锁 TTS + Audio）
    → _launch('quiz')
      → 初始化 session 变量
      → buildSessionQueue()   — 异步读取 IndexedDB，构建 SRS 队列
        → 空队列 → showFinish()
        → 有卡 → showScreen('quiz') + requestWakeLock() + render()
```

**v4.7 变更**：原来 `showScreen('quiz')` 和 `requestWakeLock()` 在异步队列构建前执行，导致空队列时闪屏。v4.7 将其移到 `buildSessionQueue` 的 `.then()` 非空分支内。

### 答题链条

```
用户在选项上点击
  → onOptionClick(qId, cardId)
    → 显示下一题按钮 → 其它选择禁用
    → 用户确认 → revealAnswer()
      → recordCardTime()       — 记录活跃时长
      → processAnswer()        — SM-2 状态机
      → saveCardState()        — 写入 IndexedDB + 可选实时上传
      → 更新 dailyProgress     — reviewed_today++ / daily_new_today++
      → _sessionFirstRatings   — 按卡·首次评级记录
      → writeTrialLog()        — 写入 IndexedDB + 可选实时上传
      → 继续下一张 render()
```

---

## 二、活跃时长算法

`recordCardTime()` 在每张卡答题后触发：

1. 测量 `now - _lastCardTs`（相邻两张卡的时间差）
2. 若差值 ≤ `idle_threshold_sec`（默认 120s），累加差值到活跃时长
3. 设 `_lastCardTs = now`
4. `visibilitychange → hidden` 时强制 `_lastCardTs = null`，切回后不补计
5. `render()` 中若 `_lastCardTs` 为 null（session 首卡 / 切回后首卡），
   将其设为 `_cardStartTs`，确保首卡时长计入

活跃时长 ≈ 有效练习时间（排除发呆/切后台）。
注意：v4.9 之前 session 首卡时长被遗漏，v4.9 修复后已计入。

---

## 三、同步机制

### 触发时机总表

| 时机 | 调用 | Toast | 同步范围 |
|------|------|-------|---------|
| 页面加载（会话恢复后） | `syncAll(deckKey)` | 否 | 轻量（无牌组） |
| 前台切回 | `syncAll(deckKey)` | 否 | 轻量（无牌组） |
| 学习中（实时） | `syncCardState` + `syncTrialLog` 在 tx.oncomplete | 受 `_realtimeUpload` 控制 | 仅单条 |
| 练习完成 | `backfillAfterPractice()` → `syncAll(deckKey, false, true)` | 否 | 轻量（无牌组） |
| 手动同步按钮 | `syncAll(deckKey, true)` | 是 | 全量（含牌组） |
| 登录后 | `syncAll(deckKey, false)` | 否 | 全量（含牌组） |

### v4.8 变更

- `syncAll` 增加 `noDecks` 参数，全量同步含牌组下载/增量，轻量同步仅上传答题+同步状态+配置
- 新增 `showSyncProg(curr, total, text)` / `hideSyncProg()` 进度条显示
- 手动/登录后同步显示步骤：1/5 上传答题记录 → 2/5 同步练习状态 → 3/5 同步今日统计 → 4/5 同步配置 → 5/5 同步牌组
- `syncAll` step 3 新增跨设备统计同步：拉取云端今日所有 trial，更新本地 `daily_new_today`、`reviewed_today`、`active_duration_sec`
- TrialLog 新增 `active_gap_ms` 字段记录每题活跃间隔，供跨设备时长汇总使用
- 移除了云端 tab 的「刷新列表」按钮和各牌组的「同步」/「下载」按钮，统一由「🔄 同步」管理
- `downloadDeckFromCloud` / `syncDeckFromCloud` 新增 `noToast` 参数，被 syncAll 调用时不显示 toast 和逐卡进度（避免覆盖 syncAll 步骤指示）
- 服务端已删除的卡本地同步时直接移除（不再保留）

### 数据流方向

```
本地 → 云端（上传）：
  TrialLog（sync_trials） — 答题记录，逐条 upsert
  CardState（sync_card_states） — SRS 状态，全量 upsert

云端 → 本地（下载）：
  CardState — 基于 updated_at > 本地 updated_at 合并
```

---

## 四、统计系统

### v4.7 统计重定义

**按卡·首次评级**：每张卡在当日的首次答题评级决定其分类。

| 分类 | 定义 | 展示颜色 |
|------|------|---------|
| 良好 | 首次评级为 good/easy | 绿色（kpi-c） |
| 困难 | 首次评级为 hard | 橙色（kpi-w） |
| 重来 | 首次评级为 again | 红色（kpi-e） |

**统计页今日概况布局**（两行 KPI）：

```
第一行：练习 | 良好 | 困难 | 重来
第二行：时长 | 新卡 | 待确认 | （预留）
```

**完成页**：本次练习也使用按卡·首次评级统计。

**为什么不用"最终状态"**：learning/relearning 步长内会反复出现，取最终结果几乎所有卡都滑到一次过或困难，重来永远为 0，失去区分度。

### v4.9 变更 — 跨设备统计显示

`renderStatsToday()` 优先使用 `dp.reviewed_today`、`dp.first_pass_today`、`dp.first_hard_today`、`dp.first_fail_today`（syncAll step 3 写入的跨设备汇总值）。当 `reviewed_today > 0` 时直接显示同步后数据；否则回退到本地 TrialLog 计算。

**设计原则**：统计页不主动拉取云端。数据在同步时机（练习完成、手动同步、切前台、登录）通过 syncAll step 3 写入 dp，统计页只读 dp。

---

## 五、语音系统

### warmupSpeech 规则

- 必须在用户手势内调用（iOS 限制）
- 执行内容：空 utterance（volume=0）、AudioContext 振荡器（gain=0.001）、HTMLAudioElement（volume=0）
- `speechReady` 标记确保只执行一次
- v4.7 前：在 `startQuiz()` 中同步执行，早于异步队列构建
- v4.7 后：仍在 `startQuiz()` 中执行（iOS 手势要求），但确认空队列后 `showFinish()` 会立即 `speechSynthesis.cancel()`

---

## 六、SRS 队列构建

`buildSessionQueue(deckKey)` 的卡片排序：

1. 到期 review 卡（due_date ≤ today），按 due_date 升序
2. 到期 relearning 卡（due_ts ≤ now），按 due_ts 升序
3. 到期 learning 卡（due_ts ≤ now），按 due_ts 升序
4. 新卡（受 new_cards_per_day - daily_new_today 限制）

三阶段学习步长（learning_steps 默认 [1, 10]）：
- again → step 0，due_ts = now + 1min
- hard → 当前步 × hard_step_multiplier（1.5），步不变
- good → 下一步，最后一步毕业到 review
- easy → 直接毕业到 review（easy_interval = 4）

---

## 七、IndexedDB 存储

### yihai_srs v3

| 对象存储 | 主键 | 用途 |
|---------|------|------|
| card_states | state_key (`deckKey::cardId`) | SRS 状态 |
| trials | trial_id (`trial_时间戳_随机`) | 答题记录 |

索引：trials 上有 deck_key、timestamp、synced_at 索引。

### yihai_media

| 对象存储 | 用途 |
|---------|------|
| blobs | 图片/音频 base64 数据 |

---

## 八、关键变量

| 变量 | 类型 | 说明 |
|------|------|------|
| `_sessionFirstRatings` | `{}` | state_key → 首次 rating，完成页用 |
| `_realtimeUpload` | boolean | 学习中是否实时上传，localStorage 持久化 |
| `_syncEnabled` | boolean | 全局同步开关，false = 纯离线 |
| `_dailyRemovedToday` | `{}` | state_key → true，当日保护移出的卡 |
| `_lastSrsWrite` | Promise | 最新 SRS 写入 Promise，用于读取前等待 |
| `_pushConfigTimer` | number | cloudPushConfig 防抖定时器 |
| `_deviceId` | string | 设备唯一标识（localStorage deviceId） |

---

## 九、并发下载

### v4.8 新增

`parallelMapLimit(arr, limit, fn)` — 通用并发限制辅助函数：

```js
async function parallelMapLimit(arr, limit, fn) {
  const entries = arr.entries();
  const workers = Array.from({ length: limit }, async () => {
    for (const [i, item] of entries) await fn(item, i);
  });
  await Promise.all(workers);
}
```

原理：共享迭代器 + 固定数量 Worker，每个 Worker 从迭代器中取下一个元素处理。

### 应用场景

| 场景 | 位置 | 并发数 | 说明 |
|------|------|--------|------|
| downloadDeckFromCloud | 首次云端下载 | 3 路 + 卡内图音并行 | 每张卡内 image/audio 用 Promise.all |
| syncDeckFromCloud downloadMedia | 增量同步媒体 | 卡内图音 Promise.all | 图片和录音同时下载 |
| syncDeckFromCloud 新增卡片 | 增量新增 | 3 路 parallelMapLimit | 新卡片媒体下载 |

### 性能实测

- 串联（v4.7 估算）：~82s（16 张卡，~11.4MB）
- 3 路并发 + 卡内并行（v4.8）：**32.6s**，提速约 2.5 倍
- 服务端：Supabase ap-southeast-1（新加坡）

---

## 十、参数云端同步

### v4.8 新增

**表结构**（sync_config）：

| 字段 | 类型 | 说明 |
|------|------|------|
| user_id | uuid PK | 关联 auth.users，唯一 |
| config_json | jsonb | { srs: {...}, ui: {...} } |
| updated_at | bigint | 时间戳 |

**流程**：

```
设置变更 → debouncePushConfig() (500ms 防抖)
         → cloudPushConfig()
           → 收集 localStorage 中 srs_* 参数 + UI 参数
           → upsert sync_config (onConflict: user_id)

页面加载/登录/手动同步 → cloudPullConfig()
                     → 读取 sync_config.config_json
                     → 写入 localStorage + SRS_CONFIG
```

**作用域注意**：`cloudPushConfig` 中需局部定义 `BOOL_KEYS` / `STR_KEYS`，不能引用 `_loadSrsConfig` IIFE 内的同名 const（作用域不达）。

---

## 七、测试策略

项目分三层测试，各司其职：

### 7.1 单元测试（Node.js）

| 文件 | 覆盖范围 | 修改时必跑 |
|------|----------|-----------|
| `tests/srs_test.js` | SRS 状态机（new/learning/review/relearning 各评级） | `processAnswer` / `newCardState` |
| `tests/yihai_v4.4_test.js` | 工具函数（simpleHash、escAttr、数据迁移、同步排重） | `simpleHash` / `escAttr` / sync 逻辑 |
| `tests/yihai_v4.8_test.js` | 工具函数（minsToTs、cdnMediaUrl、secsToLabel、parallelMapLimit、setObjURL） | 上述任一函数 |
| `tests/yihai_v4.9_test.js` | 配置合并（mergeConfig、collectLocalSrs/collectLocalUi） | `cloudPushConfig` / `cloudPullConfig` |

**特点**：
- 从 HTML 中**抽取纯函数**测试，不依赖浏览器/DOM/Supabase
- 运行毫秒级，随改随跑
- 断言框架极简：`check(label, actual, expected)` + `checkDeep(label, actual, expected)`（对象 JSON 比对）

**适用场景**：
- 新算法逻辑（SRS state machine、参数计算）
- 工具函数（字符串、时间、URL、并发控制）
- 数据格式转换（卡片迁移、slim 格式）
- 业务规则（配置合并、类型转换）

**不适用的场景**：
- 涉及 DOM 渲染、用户交互
- 依赖 IndexedDB / localStorage（需 mock 不如上 Playwright）
- 跨函数集成流程（队列构建 + SRS + 写入的完整链条）

### 7.2 Playwright 功能测试 — 单机版

| 文件 | 覆盖范围 |
|------|----------|
| `tests/_playwright_test.js` | SPD 完整流程、每日/普通浏览、导入 .yhspack18 断言 |

**特点**：
- 真实 Chromium 浏览器，加载 localhost HTTP 服务提供的 `yihai_v4.9.html`
- 纯离线，不依赖 Supabase 网络
- 验证 UI 渲染、交互流程、localStorage + IndexedDB 读写

**适用场景**：
- 完整用户流程回归（导入 → 练习 → 结果页）
- UI 变更（布局、按钮、弹窗）
- 本地存储逻辑（卡状态写入/读取是否一致）
- 发布前的**必跑回归**（与单元测试互补，单元测逻辑、Playwright 测流程）

**不适用的场景**：
- Supabase 云端同步（登录、上传、下载）
- 网络异常处理

### 7.3 Playwright 功能测试 — 网络版

| 文件 | 覆盖范围 |
|------|----------|
| `tests/_playwright_cloud_test.js` | 云端登录、sync_trials、sync_card_states17 断言 |

**特点**：
- 真实浏览器 + Supabase 项目
- 验证云同步写/读是否正确

**适用场景**：
- 云端同步逻辑变更（syncTrial、syncCardState、syncCardStatesFromCloud）
- 登录/恢复 session 流程
- 发布前确认同步不破坏数据

**⚠️ 注意**：网络版使用 `zyhacl@gmail.com` 测试账号，写入的是测试数据，不会影响妈妈的正式记录。

### 7.4 三层选择原则

```
改了什么？                    → 跑什么？
─────────────────────────────────────────────
修改纯函数（SRS / 工具函数）   → 对应单元测试
新增纯函数                    → 加单元测试
修改 UI / 流程                → 单机 Playwright
修改云端同步                  → 网络 Playwright
跨层改动（如参数设置→同步）    → 单元 + 单机 + 网络 全跑
发布前                        → 全跑（单元 + 单机 + 网络）
```

**经验法则**：
1. 能抽纯函数就先加单元测试 — 确定性、快、不依赖环境
2. 涉及多步流程（导入→练习→结果）用 Playwright 单机版
3. 涉及网络请求（Supabase CRUD）用 Playwright 网络版
4. 单元测试定位问题精确（直接告诉你是第几行断言失败），Playwright 验证集成正确性
