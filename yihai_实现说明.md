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

活跃时长 ≈ 有效练习时间（排除发呆/切后台）。

---

## 三、同步机制

### 触发时机总表

| 时机 | 调用 | Toast |
|------|------|-------|
| 页面加载（会话恢复后） | `syncAll(deckKey)` | 否 |
| 前台切回 | `syncAll(deckKey)` | 否 |
| 学习中（实时） | `syncCardState` + `syncTrialLog` 在 tx.oncomplete | 受 `_realtimeUpload` 控制 |
| 练习完成 | `backfillAfterPractice()` → `syncAll()` | 否 |
| 手动同步按钮 | `syncAll(deckKey, true)` | 是 |
| 登录后 | `syncPendingData()` 补传离线数据 | 否 |

### v4.7 变更

- `syncAll` 增加 `showToast` 参数，手动同步时显示「上传答题 N · 下载更新 M」
- 各调用点静默同步时不弹 toast

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
