# 忆海拾光 · 训练数据统计与 SRS 自适应设计方案

> v1.1 · 2026-05-03
> 修订说明：删除反应时自适应和反应时趋势图（噪声过大，AD 场景不适用）；新增首次正确率、连续练习天数、时段效应三项指标；`interval_modifier` 自适应加照护者确认门和异常值剔除；干扰项效力降级为 Phase 2；调整优先级排列。

---

## 一、当前已有数据全景

### 1.1 逐题记录（TrialLog）

| 字段 | 类型 | 来源 | 说明 |
|------|------|------|------|
| `trial_id` | string | IndexedDB + Supabase | 主键，`trial_{timestamp}_{random}` |
| `card_id` | string | 同上 | 所属卡片 |
| `deck_key` | string | 同上 | 所属牌组 |
| `session_id` | string | 同上 | 练习会话 ID |
| `rating` | enum | 同上 | `'again'` / `'hard'` / `'good'` / `'easy'` |
| `is_correct` | boolean | 同上 | 是否答对（最终结果） |
| `attempt_number` | int | 同上 | 第几次尝试（1=首次） |
| `response_time_ms` | int | 同上 | 反应时（ms，上限 60s）|
| `time_of_day` | enum | 同上 | `'morning'` / `'afternoon'` / `'evening'` |
| `options_shown` | string[] | 同上 | 本次展示的选项 card_id 列表 |
| `correct_option` | string | 同上 | 正确答案 card_id |
| `distractor_chosen` | string \| null | 同上 | 用户选中的干扰项（答对时为 null） |
| `distractor_same_cat` | null | 同上 | Phase 2 预留 |
| `srs_stage_before` | enum | 同上 | 答题前 SRS 阶段快照 |
| `interval_before` | int | 同上 | 答题前间隔（天） |
| `ease_before` | float | 同上 | 答题前 ease_factor |
| `lapses_streak_before` | int | 同上 | 答题前连续遗忘次数 |
| `lapses_total_before` | int | 同上 | 答题前总遗忘次数 |
| `review_mode_before` | enum | 同上 | 答题前 review_mode |
| `timestamp` | bigint | 同上 | 客户端毫秒时间戳 |
| `synced_at` | bigint \| null | 同上 | 云端同步时间（null=未同步） |

### 1.2 卡片状态（CardState）

| 字段 | 说明 |
|------|------|
| `state_key` | `{deckKey}::{cardId}` 复合主键 |
| `srs_stage` | `'new'` / `'learning'` / `'review'` / `'relearning'` |
| `interval` | 当前间隔（天） |
| `ease_factor` | 当前难度系数（1.30 ~ 3.00） |
| `due_date` | Review 阶段到期日（YYYY-MM-DD） |
| `due_ts` | Learning/Relearning 阶段到期毫秒时间戳 |
| `step_index` | 学习步骤中的当前步 |
| `lapses_streak` | 连续遗忘次数 |
| `lapses_total` | 累计遗忘次数 |
| `suspended` | 是否挂起 |
| `suspended_reason` | 挂起原因（`'auto'` / `'manual'`） |
| `updated_at` | 最后更新时间（冲突解决用） |

### 1.3 每日进度（DailyProgress）

| 字段 | 说明 |
|------|------|
| `date` | 日期（YYYY-MM-DD） |
| `reviewed_today` | 今日复习卡片数 |
| `daily_new_today` | 今日引入新卡数 |
| `active_duration_sec` | 今日活跃秒数 |

### 1.4 SRS 可调参数（SRS_CONFIG, localStorage）

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `learning_steps` | `[1, 10]` | 学习步长（分钟） |
| `relearning_steps` | `[10]` | 重学步长（分钟） |
| `graduating_interval` | 1 | 毕业间隔（天） |
| `easy_interval` | 2 | Easy 毕业间隔 |
| `starting_ease` | 2.50 | 初始 ease |
| `easy_bonus` | 1.30 | Easy 额外乘数 |
| `hard_interval` | 1.20 | Hard 间隔乘数 |
| `interval_modifier` | 1.00 | 全局间隔修正乘数 |
| `new_interval` | 0.00 | Again 后新间隔乘数 |
| `minimum_interval` | 1 | 最小间隔（天） |
| `maximum_interval` | 36500 | 最大间隔（天） |
| `ease_min` | 1.30 | Ease 下限 |
| `hard_step_multiplier` | 1.0 | 学习中 Hard 步长乘数 |
| `daily_remove_lapses` | 3 | 当日移除阈值 |
| `auto_suspend_lapses` | 8 | 自动挂起阈值 |
| `new_cards_per_day` | 5 | 每日新卡上限 |
| `maximum_reviews_per_day` | 50 | 每日复习上限 |

---

## 二、统计数据结构

现有 TrialLog 已能支撑绝大部分统计，只需补充两个轻量存储：

### 2.1 统计数据缓存（localStorage: `yihai_stats_cache`）

按天聚合，避免每次全量扫描 TrialLog。每次练习结束时增量更新当天条目。

```typescript
interface StatsCache {
  cardStats: Record<string, CardStats>;      // key = card_id
  dailyStats: Record<string, DayStats>;      // key = 'YYYY-MM-DD'
  lastUpdated: number;                       // 缓存时间戳，毫秒
}

interface CardStats {
  // 首次正确率（核心指标，区别于最终正确率）
  firstAttemptTotal: number;    // attempt_number=1 的 trial 总数
  firstAttemptCorrect: number;  // attempt_number=1 且 is_correct=true 的次数

  // 辅助指标
  totalTrials: number;
  lapseCount: number;           // rating='again' 的次数（= lapses_total_before 增量）
  distractorHits: Record<string, number>; // distractor card_id → 被选次数（混淆统计）
  lastReviewDate: string;       // YYYY-MM-DD
}

interface DayStats {
  date: string;                 // YYYY-MM-DD
  reviewed: number;             // 练习卡片数（unique card_id）
  firstAttemptCorrect: number;  // 首次答对数
  firstAttemptTotal: number;    // 首次作答总数
  byTimeOfDay: {                // 时段细分
    morning:   { correct: number; total: number };
    afternoon: { correct: number; total: number };
    evening:   { correct: number; total: number };
  };
  activeDurationSec: number;
  hadSession: boolean;          // 当天是否练习了（streak 计算用）
}
```

### 2.2 自适应参数历史（localStorage: `yihai_auto_params`）

记录每次自适应建议的快照，供照护者查阅和回滚。

```typescript
interface AutoParamSnapshot {
  id: number;                   // 自增 ID，回滚时使用
  timestamp: number;
  status: 'pending' | 'applied' | 'dismissed';  // 照护者操作结果
  reason: string;               // 触发原因（展示给照护者的文案）
  before: Partial<SRS_CONFIG>;
  after: Partial<SRS_CONFIG>;
  evidence: {
    windowDays: number;
    reviewAccuracy: number;     // 窗口内首次正确率
    sampleSize: number;
    outlierDaysExcluded: number; // 被剔除的异常天数
  };
}
```

---

## 三、统计指标定义

### 3.1 首次正确率（First-Attempt Accuracy）⭐ 主指标

> 比最终正确率更能反映真实记忆强度。第二次答对可能只是靠排除法，不代表真正记住了。

```
分母: attempt_number = 1 的 trial 数
分子: 上述 trial 中 is_correct = true 的次数

first_attempt_accuracy = 分子 / 分母
```

- 全局（所有卡）：反映整体训练效果
- 单卡：反映该卡的掌握程度
- 按时段拆分（见 3.4）：反映最佳训练时间

> **与最终正确率的区别**：最终正确率（`is_correct`）包含了第二次答对的情形，可能虚高 10–20%，不适合作为认知能力的代理指标。首次正确率是更诚实的衡量。

### 3.2 核心保留率（Review Stage Retention）

> 衡量 SRS 长期效果的指标，仅统计 review 阶段，反映长期记忆可及性。

```
分母: srs_stage_before = 'review' 且 attempt_number = 1 的 trial 数
分子: 上述 trial 中 is_correct = true 的次数

retention = 分子 / 分母
```

- 统计窗口：默认 7 天；最少需要 30 个样本才输出（AD 用户样本量小，门槛降低）
- 目标区间：`[80%, 90%]`
- 低于 80% → 间隔可能偏长，或卡片本身太难
- 高于 90% → 间隔可能偏短，训练冗余

### 3.3 连续练习天数（Streak）⭐ 依从性指标

> 照护者最直观的激励指标，无需解释。

```
从今天往前，连续 dailyStats[date].hadSession = true 的天数
```

- 展示：「已连续练习 X 天 🔥」
- 昨天断了：「上次练习是 N 天前」
- 不作为自适应触发器，只用于展示和激励

### 3.4 时段效应（Time-of-Day Effect）

> AD 患者上午认知表现通常优于下午和晚上。量化时段差异，帮助照护者找到最佳训练时间。

```
对每个时段（morning / afternoon / evening）:
  time_accuracy[tod] = 该时段 firstAttemptCorrect / firstAttemptTotal

时段差异 = max(time_accuracy) - min(time_accuracy)

差异 > 15% → 提示: "上午训练的正确率比下午高 X%，建议优先安排上午练习"
```

- 需要每个时段各至少 10 个样本才输出（避免小样本误导）
- 不自动调整参数，只提示照护者

### 3.5 间隔增长率趋势（Interval Growth Trend）

> 趋势下降是潜在的临床信号，但单凭训练数据无法确诊，界面措辞需保守。

```
从 TrialLog 中取 srs_stage_before = 'review' 的记录:

对每次答题，记录 interval_change = 答题后 interval - interval_before
（答题后 interval 从对应 CardState.interval 取，或从 TrialLog 下一条同卡记录推算）

按月汇总平均 interval_change：
  > 0 → 间隔在增长（记忆稳固）
  ≈ 0 → 间隔停滞（维持阶段，对 AD 患者属正常）
  < 0 → 间隔在收缩（遗忘加速）
```

- 需要至少 4 周数据才展示趋势图
- 展示措辞保守：「间隔趋势」而非「病情信号」
- 趋势连续 2 周下降才触发提示

### 3.6 卡片难度分（简化版）

```
diff_score =
  0.6 × (1 - first_attempt_accuracy) +   // 首次正确率权重最高
  0.4 × min(lapseCount / auto_suspend_lapses, 1)

范围: 0 ~ 1（越大越难）
```

反应时从难度分计算中移除（AD 场景噪声过大）。

---

## 四、自适应调整策略

### 4.1 `interval_modifier` 自适应（核心反馈环）

**触发条件**（同时满足）：

- 最近 7 天内 review 阶段首次作答样本数 ≥ 30
- 距上次调整（含被驳回的）已超过 7 天

**异常值剔除**：计算前先过滤掉准确率偏离均值超过 2 个标准差的天，避免老人生病或疲劳的特殊日影响整体判断。

```
取过去 7 天的 dailyStats，剔除异常天后计算 R = 窗口内平均保留率（3.2）

if R > 0.90:
    建议将 interval_modifier 上调 0.05（最高 1.50）
    原因文案: "近7天复习正确率达 {R}%，间隔可以稍微拉长"

elif R < 0.80:
    建议将 interval_modifier 下调 0.05（最低 0.50）
    原因文案: "近7天复习正确率为 {R}%，建议缩短复习间隔"

else:
    不触发建议
```

**关键：不自动应用，以通知形式展示给照护者**。照护者点「应用」后才生效，可以点「忽略」跳过。快照记录 `status: 'pending'` → 操作后更新为 `'applied'` 或 `'dismissed'`。

**影响范围**：所有 review 卡片的间隔计算。是最广的杠杆，必须有人工确认。

### 4.2 每日上限建议

```
每 3 天检查（需至少 3 天有练习记录）:

avg_completed = 近 3 天 reviewed_today 均值

if avg_completed < maximum_reviews_per_day × 0.6:
    提示: "最近每天平均练习 {avg} 张，
           当前上限 {max} 张可能偏高，是否下调至 {avg × 1.2} 张？"

if avg_completed > maximum_reviews_per_day × 0.95:
    提示: "最近每天都接近上限，
           是否将上限从 {max} 张上调至 {max × 1.3} 张？"
```

同样需要照护者确认，不自动修改。

### 4.3 异常检测与提示

**场景 1：持续遗忘**

```
判断: 最近 3 天中，每天都有卡片触发 daily_remove（lapses_streak >= daily_remove_lapses）
提示: "连续三天出现多次遗忘，建议检查学习步长设置，或休息后再练习"
```

**场景 2：单卡频繁遗忘**

```
判断: 某张卡 7 天内 lapses_total 增加 ≥ 3 次
提示: "卡片「{name}」近期反复遗忘，建议重置学习或暂时移除"
```

~~场景 3（反应时趋势）已删除，理由见修订说明~~

### 4.4 干扰项效力检测（Phase 2）

数据埋点（`options_shown` + `distractor_chosen`）在 Phase 1 已有，但 AD 用户牌组通常 20–30 张卡，需要每张卡 10+ 次出题才有统计意义，积累周期较长。Phase 1 只记录数据，Phase 2 再实现检测和提示逻辑。

---

## 五、接口设计

### 5.1 统计引擎 API

```javascript
// 核心入口——从 TrialLog + CardState 聚合，更新 stats_cache
async function computeStats(deckKey)  // → StatsResult

// 子查询（均从 stats_cache 读，不扫 IndexedDB）
function getFirstAttemptAccuracy(deckKey, days)    // → number (0~1)
function getRetention(deckKey, days)               // → number | null（样本不足返回 null）
function getStreak()                               // → { current: number, lastDate: string }
function getTimeOfDayEffect(deckKey)               // → { morning, afternoon, evening } | null
function getIntervalTrend(deckKey, weeks)          // → 'growing' | 'stable' | 'shrinking' | null
function getCardDifficulty(cardId)                 // → number (0~1)
function getCardMixupTarget(cardId)                // → { cardId, name, count } | null（最常混淆的卡）
```

### 5.2 自适应引擎 API

```javascript
// 核心入口——计算是否需要建议，写入 auto_params（status='pending'）
async function checkAutoTune(deckKey)              // → AutoTuneResult | null

// 照护者操作
function applyAutoTune(snapshotId)                 // 应用建议，更新 SRS_CONFIG + status='applied'
function dismissAutoTune(snapshotId)               // 忽略建议，status='dismissed'

// 历史记录
function getAutoTuneHistory()                      // → AutoParamSnapshot[]
function rollbackAutoTune(snapshotId)              // 回滚到该次调整前的参数值
```

---

## 六、界面扩展

### 6.1 统计 Tab（现有 Tab 0「今日」扩展）

现有 Tab 0 扩展，不新增 Tab，避免界面过于复杂：

| 区块 | 内容 | 数据来源 |
|------|------|---------|
| 连续练习天数 | 「已连续练习 X 天 🔥」大字显示 | `getStreak()` |
| 首次正确率 | 本周 / 本月两个数字 | `getFirstAttemptAccuracy()` |
| 保留率趋势 | 近 7 天折线图（仅 review 阶段，样本不足时显示「数据积累中」）| `getRetention()` |
| 时段效应 | 上午 / 下午 / 晚上三格对比，差异 >15% 时标注 ⭐ | `getTimeOfDayEffect()` |
| 自适应建议 | 有待处理建议时展示卡片，照护者点「应用」或「忽略」| `checkAutoTune()` |

### 6.2 卡片详情面板扩展

在现有「当前参数」区块后新增：

| 新增行 | 展示内容 | 数据来源 |
|--------|---------|---------|
| 首次正确率 | `X%（N 次首答 / M 次出题）` | `cardStats` |
| 最常混淆 | `与「{name}」混淆 {N} 次`（N≥2 才显示）| `getCardMixupTarget()` |
| 难度评分 | 进度条 + 数字（0–1）| `getCardDifficulty()` |

反应时平均值从卡片详情中移除（单卡样本量小，AD 用户噪声大）。

### 6.3 自适应建议通知样式

建议卡片（位于统计页顶部，有待处理建议时出现）：

```
┌─────────────────────────────────────────┐
│ 💡 训练建议                              │
│                                         │
│ 近7天复习正确率达 92%，间隔可以稍微拉长。  │
│ 建议将全局间隔乘数从 0.80 → 0.85          │
│                                         │
│ 依据：7天 / 38条记录 / 剔除1天异常        │
│                                         │
│  [应用]          [本次忽略]              │
└─────────────────────────────────────────┘
```

---

## 七、实现优先级

| 优先级 | 功能 | 复杂度 | 数据基础 | 认知训练价值 |
|--------|------|--------|---------|------------|
| P0 | stats_cache 结构定义 + 基础聚合函数 | 中 | TrialLog | 基础设施 |
| P0 | 首次正确率（全局 + 单卡） | 低 | 已有 | ⭐⭐⭐ 最诚实的效果指标 |
| P0 | 连续练习天数 Streak | 低 | DailyProgress | ⭐⭐⭐ 依从性，照护者最需要 |
| P1 | 核心保留率（review 阶段） | 低 | 已有 | ⭐⭐⭐ 长期记忆可及性 |
| P1 | 时段效应分析 | 低 | 已有 `time_of_day` | ⭐⭐ 优化训练时间窗口 |
| P1 | 卡片难度分 + 混淆项（详情面板） | 低 | 已有 | ⭐⭐ 卡片质量诊断 |
| P2 | `interval_modifier` 自适应（照护者确认） | 中 | 需 stats_cache | ⭐⭐⭐ 核心反馈环 |
| P2 | 每日上限建议（照护者确认） | 低 | DailyProgress | ⭐⭐ 负荷管理 |
| P2 | 异常检测（持续遗忘 + 单卡频繁遗忘） | 中 | 需统计趋势 | ⭐⭐ 临床安全 |
| P3 | 间隔增长率趋势（需 4 周数据） | 中 | 需历史快照 | ⭐ 长期监测 |
| P3 | 自适应日志 + 回滚 | 低 | auto_params | ⭐ 可追溯 |
| Phase 2 | 干扰项效力检测 | 中 | 需积累数据 | ⭐⭐ 选项质量 |

**已删除**（v1.0 → v1.1）：

- 反应时辅助 `ease_factor` 微调：AD 患者反应时受非认知因素影响大，噪声超过信号
- 反应时趋势图：同上，单独展示易引发照护者误读
- 异常检测场景 3（反应时逐日增长）：同上

---

## 八、涉及文件

| 文件 | 改动说明 |
|------|---------|
| `yihai_v4.x.html` | 新增统计引擎、自适应引擎、统计页扩展、卡片详情扩展 |
| `srs_test.js` | 新增 `computeStats` 聚合函数、`checkAutoTune` 策略单元测试 |
| `srs_design_v6.9.md` | 补充自适应策略章节（本文档确定后同步） |

---

## 九、验证方式

1. **单元测试**：构造覆盖各边界的 TrialLog mock 数据，验证 `computeStats` 聚合正确（首次正确率、保留率、时段分组）
2. **单元测试**：模拟 retention < 0.80 / > 0.90 / 在区间内三种场景，验证 `checkAutoTune` 触发和不触发逻辑正确；验证异常值剔除逻辑
3. **单元测试**：验证 streak 计算在连续日期、中断日期、当天未练习各场景下的正确性
4. **集成测试**：用已有 IndexedDB 真实数据运行统计引擎，比对期望输出
5. **真机验证**：连续练习 7 天后查看首次正确率趋势和时段效应是否符合实际感受
6. **照护者验收**：自适应建议通知的文案是否易于理解，应用/忽略操作是否顺畅
