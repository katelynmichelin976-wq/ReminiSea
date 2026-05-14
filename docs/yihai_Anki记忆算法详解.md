# Anki 记忆算法详解

从 [ankitects/anki](https://github.com/ankitects/anki) v25.09.2 源码逐函数分析，覆盖 SM-2 变体、FSRS、模糊化、负载均衡、队列构建和计时模型。

---

## 目录

1. [算法全景](#1-算法全景)
2. [SM-2 变体：状态机](#2-sm-2-变体状态机)
3. [SM-2 变体：学习步进](#3-sm-2-变体学习步进)
4. [SM-2 变体：复习间隔公式](#4-sm-2-变体复习间隔公式)
5. [Ease Factor 调整](#5-ease-factor-调整)
6. [模糊化 (Fuzz)](#6-模糊化-fuzz)
7. [负载均衡 (Load Balancer)](#7-负载均衡-load-balancer)
8. [Leech 检测](#8-leech-检测)
9. [FSRS：自由间隔重复调度器](#9-fsrs自由间隔重复调度器)
10. [计时模型](#10-计时模型)
11. [队列构建](#11-队列构建)
12. [配置参数速查](#12-配置参数速查)
13. [对忆海拾光的借鉴](#13-对忆海拾光的借鉴)

---

## 1. 算法全景

Anki 实际有 **两套可切换的算法**：

```
                    ┌─────────────────────────┐
                    │     DeckConfig           │
                    │  (每个牌组独立配置)        │
                    └──────────┬──────────────┘
                               │
              ┌────────────────┼────────────────┐
              ▼                                 ▼
   ┌──────────────────┐              ┌──────────────────┐
   │  SM-2 变体        │              │  FSRS            │
   │  (默认/经典算法)   │              │  (可选, 需启用)   │
   │                  │              │                  │
   │  • 学习步进       │              │  • 记忆状态三元组  │
   │  • Ease Factor    │              │  • 稳定性/难度/   │
   │  • 固定间隔公式    │              │    可提取性       │
   │  • Fuzz + LB     │              │  • 可训练参数     │
   └──────────────────┘              └──────────────────┘
```

两种算法共享同一个 **状态机框架**：New → Learning → Review → Relearning，只是间隔计算方式不同。

---

## 2. SM-2 变体：状态机

### 2.1 状态定义

```rust
// states/normal.rs
pub enum NormalState {
    New(NewState),              // position: u32
    Learning(LearnState),       // remaining_steps, scheduled_secs, elapsed_secs
    Review(ReviewState),        // scheduled_days, elapsed_days, ease_factor, lapses
    Relearning(RelearnState),   // { learning: LearnState, review: ReviewState }
}
```

### 2.2 状态转换图

```
New ──── Any answer ──────► Learning ── Good (no steps left) ──► Review
                               │  │
                   Again ──────┘  │ Hard ──► same/delay
                                  │ Easy ──► Review (early graduate)

Review ── Again ──────► Relearning ── Good (no steps left) ──► Review
   │                       │  │
   │─ Hard ──► Review       │─ Hard ──► same/delay
   │─ Good ──► Review       │─ Easy ──► Review
   │─ Easy ──► Review       │─ Again ──► step 0
   │                        │
   ▼                        ▼
  (stay Review)       (back to Learning or Review)
```

### 2.3 逐状态详解

**NewState**（新卡片）：
```rust
pub struct NewState { pub position: u32; }
```
- 唯一字段是 `position`（排序位置）
- 没有间隔概念——新卡片尚未被学习
- 任何按钮按下 → 进入 Learning

**LearnState**（学习中）：
```rust
pub struct LearnState {
    pub remaining_steps: u32,  // 剩余步数
    pub scheduled_secs: u32,   // 计划秒数
    pub elapsed_secs: u32,     // 实际经过秒数
    pub memory_state: Option<FsrsMemoryState>,
}
```
- `remaining_steps` = steps.len()（初始）→ 每按 Good 减 1 → 0 时毕业
- `scheduled_secs` = 当前步骤的延迟秒数

**ReviewState**（复习中）：
```rust
pub struct ReviewState {
    pub scheduled_days: u32,    // 计划间隔天数
    pub elapsed_days: u32,      // 实际经过天数
    pub ease_factor: f32,       // ease 因子 (默认 2.5)
    pub lapses: u32,            // 遗忘次数
    pub leeched: bool,          // 是否标记为 leech
    pub memory_state: Option<FsrsMemoryState>,
}
```
- `days_late() = elapsed_days - scheduled_days`（可为负 = 提前复习）

**RelearnState**（重新学习 = 遗忘后复习）：
```rust
pub struct RelearnState {
    pub learning: LearnState,   // 使用 relearn_steps
    pub review: ReviewState,    // 保留原始复习状态
}
```
- 同时维护学习步进状态和复习状态
- 学习步进结束后回到 ReviewState

---

## 3. SM-2 变体：学习步进

### 3.1 步进数组

学习步进配置为 **分钟数组**，如 `[1.0, 10.0, 30.0]`：

```rust
// steps.rs
pub(crate) struct LearningSteps<'a> {
    steps: &'a [f32],  // 分钟
}

fn to_secs(v: f32) -> u32 {
    (v * 60.0) as u32  // 转换为秒
}
```

### 3.2 索引计算

```rust
fn get_index(self, remaining: u32) -> usize {
    let total = self.steps.len();
    // remaining 代表"还剩几步"
    // 当前索引 = total - remaining（从 0 开始）
    total.saturating_sub((remaining % 1000) as usize)
         .min(total.saturating_sub(1))
}
```

举例（steps = [1min, 10min, 30min]）：
- `remaining = 3` → index = 0 → 在第 1 步
- `remaining = 2` → index = 1 → 在第 2 步
- `remaining = 1` → index = 2 → 在第 3 步

### 3.3 各按钮的步进逻辑

| 按钮 | 学习步进行为 | remaining_steps 变化 |
|------|------------|---------------------|
| **Again** | 回到 steps[0] | 重置为 steps.len() |
| **Hard** | 留在当前步骤（第一步取均值） | 不变 |
| **Good** | 前进到下一步 | 减 1 |
| **Easy** | 跳过所有步骤 → 毕业 | 直接进入 Review |

### 3.4 Again 的延迟

```rust
fn again_delay_secs_learn(&self) -> Option<u32> {
    self.secs_at_index(0)  // 总是 steps[0]
}
```

### 3.5 Hard 的延迟

```rust
fn hard_delay_secs(self, remaining: u32) -> Option<u32> {
    let idx = self.get_index(remaining);
    if idx == 0 {
        // 第一步：取第一和第二步的平均值（或 1.5× 第一步）
        self.hard_delay_secs_for_first_step(again_secs)
    } else {
        // 后续步骤：等于当前步骤的延迟
        current_secs
    }
}
```

**第一步的 Hard 计算**：
```rust
fn hard_delay_secs_for_first_step(self, again_secs: u32) -> u32 {
    if let Some(next) = self.secs_at_index(1) {
        maybe_round_in_days(again_secs + next) / 2  // 平均值
    } else {
        (again_secs * 3 / 2).min(again_secs + 86400)  // 1.5×，不超过 +1 天
    }
}
```

### 3.6 Good 的延迟

```rust
fn good_delay_secs(self, remaining: u32) -> Option<u32> {
    let idx = self.get_index(remaining);
    self.secs_at_index(idx + 1)  // 下一步的延迟；None 表示不再有步骤 → 毕业
}
```

### 3.7 跨日舍入

```rust
fn maybe_round_in_days(secs: u32) -> u32 {
    if secs > 86400 {
        ((secs as f32 / 86400.0).round() as u32) * 86400  // 舍入到整天
    } else {
        secs
    }
}
```

当学习步骤超过 1 天时，舍入到整天数。这避免了"上午 9 点学的新卡第二天下午 3 点才到期"这种时间漂移。

---

## 4. SM-2 变体：复习间隔公式

### 4.1 核心公式

Anki 的间隔计算 **并非** 标准 SM-2。标准 SM-2：
```
EF' = EF + (0.1 - (5-q)*(0.08+(5-q)*0.02))
I(1) = 1, I(2) = 6, I(n) = I(n-1) * EF
```

Anki 的实际公式（`review.rs — passing_nonearly_review_intervals`）：

```rust
let current_interval = self.scheduled_days.max(1) as f32;
let days_late = self.days_late().max(0) as f32;

// Hard: 当前间隔 × hard_multiplier
let hard_interval = current_interval * hard_multiplier;  // 默认 1.2

// Good: (当前间隔 + 迟到天数/2) × ease_factor
let good_interval = (current_interval + days_late / 2.0) * self.ease_factor;

// Easy: (当前间隔 + 迟到天数) × ease_factor × easy_multiplier
let easy_interval = (current_interval + days_late) * self.ease_factor * easy_multiplier;
```

### 4.2 三个间隔的约束

```rust
fn constrain_passing_interval(ctx, interval, minimum, fuzz) -> u32 {
    let interval = interval * ctx.interval_multiplier;  // 全局间隔乘数
    let (minimum, maximum) = ctx.min_and_max_review_intervals(minimum);
    if fuzz {
        ctx.with_review_fuzz(interval, minimum, maximum)
    } else {
        (interval.round() as u32).clamp(minimum, maximum)
    }
}
```

**Hard/Good/Easy 的 minimum 约束**：
- `hard_minimum` = `scheduled_days + 1`（hard_multiplier > 1 时）或 0
- `good_minimum` = `hard_interval + 1`（hard_multiplier > 1 时）或 `scheduled_days + 1`
- `easy_minimum` = `good_interval + 1`

这保证了 **Hard < Good < Easy** 的间隔始终单调递增。

### 4.3 提前复习（Early Review）

当 `days_late() < 0`（未到到期日就提前复习），使用特殊公式（`passing_early_review_intervals`）：

```rust
let scheduled = self.scheduled_days.max(1) as f32;
let elapsed = self.elapsed_days as f32;  // < scheduled

// Hard: max(elapsed × hard_multiplier, scheduled × hard_multiplier/2)
// Good: max(elapsed × ease_factor, scheduled)
// Easy: max(elapsed × ease_factor, scheduled) × (easy_multiplier - (easy_multiplier-1)/2)
```

关键点：提前复习最多只能增加 `elapsed_days` 那么多天数，不会按完整间隔增长。这是一种惩罚机制。

### 4.4 遗忘后的间隔（Lapse）

```rust
fn failing_review_interval(self, ctx) -> (f32, Option<FsrsMemoryState>) {
    let interval = (self.scheduled_days.max(1) as f32) * ctx.lapse_multiplier;
    // lapse_multiplier 默认 0.0 → 间隔 = 0 → 使用 minimum_lapse_interval（默认 1 天）
    ctx.with_review_fuzz(interval, minimum_lapse_interval, maximum_review_interval)
}
```

---

## 5. Ease Factor 调整

### 5.1 固定增量

```rust
pub const INITIAL_EASE_FACTOR: f32 = 2.5;
pub const MINIMUM_EASE_FACTOR: f32 = 1.3;
pub const EASE_FACTOR_AGAIN_DELTA: f32 = -0.20;
pub const EASE_FACTOR_HARD_DELTA: f32 = -0.15;
pub const EASE_FACTOR_EASY_DELTA: f32 = 0.15;
```

| 按钮 | ease 变化 | 下限 |
|------|----------|------|
| Again | -0.20 | 1.3 |
| Hard | -0.15 | 1.3 |
| Good | 不变 | — |
| Easy | +0.15 | 无上限 |

### 5.2 与标准 SM-2 的对比

标准 SM-2 的 ease 更新是二次公式，与评分 q 有关：
```
EF' = EF + (0.1 - (5-q)*(0.08+(5-q)*0.02))
```
- q=5 (perfect): EF' = EF + 0.1
- q=4 (correct): EF' = EF
- q=3 (correct with difficulty): EF' = EF - 0.14
- q=2 (incorrect, but remembered): EF' = EF - 0.32
- q=1 (complete blackout): EF' = EF - 0.80

Anki 用固定增量替代，**更简单、更可预测**。不会出现"连续按 Good 导致 ease 持续下降"的问题。

---

## 6. 模糊化 (Fuzz)

### 6.1 目的

防止多张卡片在同一天到期造成"波峰"。

### 6.2 确定性种子

```rust
// answering/mod.rs
fn get_fuzz_seed(card: &Card, for_reschedule: bool) -> Option<u64> {
    let reps = if for_reschedule { card.reps.saturating_sub(1) } else { card.reps };
    Some((card.id.0 as u64).wrapping_add(reps as u64))
}

fn get_fuzz_factor(seed: Option<u64>) -> Option<f32> {
    seed.map(|s| StdRng::seed_from_u64(s).random_range(0.0..1.0))
}
```

- 种子 = `card_id + reps` → 确定性 → undo/redo 不会改变间隔
- 测试环境下禁用 fuzz（`fuzz_factor = None`）

### 6.3 Fuzz 范围

```rust
// fuzz.rs
static FUZZ_RANGES: [FuzzRange; 3] = [
    { start: 2.5,  end: 7.0,         factor: 0.15 },
    { start: 7.0,  end: 20.0,        factor: 0.10 },
    { start: 20.0, end: f32::MAX,    factor: 0.05 },
];
```

fuzz 增量计算：
```
fuzz_delta = 1.0
    + 0.15 × max(0, min(interval, 7.0)  - 2.5)
    + 0.10 × max(0, min(interval, 20.0) - 7.0)
    + 0.05 × max(0, interval             - 20.0)
```

举例：

| 间隔 | fuzz_delta | fuzz 范围 |
|------|-----------|-----------|
| 1 天 | 0.0 | 1 (无 fuzz) |
| 2.5 天 | 1.0 | 2–4 天 |
| 7 天 | 1.675 | 5–9 天 |
| 20 天 | 3.275 | 17–23 天 |
| 100 天 | 7.275 | 93–107 天 |

### 6.4 实际 Fuzz 应用

```rust
fn with_review_fuzz(fuzz_factor: Option<f32>, interval: f32, minimum: u32, maximum: u32) -> u32 {
    if let Some(fuzz_factor) = fuzz_factor {
        let (lower, upper) = constrained_fuzz_bounds(interval, minimum, maximum);
        (lower as f32 + fuzz_factor * (1 + upper - lower) as f32).floor() as u32
    } else {
        (interval.round() as u32).clamp(minimum, maximum)
    }
}
```

fuzz_factor 在 `[0, 1)` 区间内均匀分布 → 间隔在 fuzz 范围内均匀分布 → 卡片均匀分散。

---

## 7. 负载均衡 (Load Balancer)

### 7.1 与传统 Fuzz 的区别

Load Balancer 是比纯 fuzz 更高级的替代方案（`load_balancer.rs`），考虑：

1. **每天已有卡片数**：避免选中重负载日
2. **"轻松日"配置**：某些工作日可以是减负日
3. **同笔记卡片分散**：兄弟姐妹卡片不会同一天到期
4. **偏向较早日**：在 fuzz 范围内偏向较早的日期

```rust
// StateContext 优先使用 LoadBalancer，回退到纯 Fuzz
pub(crate) fn with_review_fuzz(&self, interval: f32, minimum: u32, maximum: u32) -> u32 {
    self.load_balancer_ctx
        .as_ref()
        .and_then(|ctx| ctx.find_interval(interval, minimum, maximum))
        .unwrap_or_else(|| with_review_fuzz(self.fuzz_factor, interval, minimum, maximum))
}
```

### 7.2 调度时机

Load Balancer 在卡片被回答时更新（`answer_card_inner`）：
```rust
if card.queue == CardQueue::Review {
    if let Some(load_balancer) = ... {
        load_balancer.add_card(card.id, card.note_id, deckconfig_id, card.interval);
    }
}
```

---

## 8. Leech 检测

### 8.1 触发条件

```rust
fn leech_threshold_met(lapses: u32, threshold: u32) -> bool {
    if threshold > 0 {
        let half_threshold = (threshold / 2.0).ceil().max(1.0) as u32;
        lapses >= threshold && (lapses - threshold) % half_threshold == 0
    } else {
        false
    }
}
```

以 `threshold = 8` 为例：
- lapses = 0–7：不触发
- lapses = 8：触发（首次达到阈值）
- lapses = 12：触发（8 + half(8)）
- lapses = 16：触发（8 + half(8) × 2）

### 8.2 Leech 动作

```rust
pub enum LeechAction {
    Suspend,   // 暂停卡片
    TagOnly,   // 仅标记 "leech" 标签
}
```

```rust
if next.leeched() && config.inner.leech_action() == LeechAction::Suspend {
    self.card.queue = CardQueue::Suspended;
}
// 同时打标签
if answer.new_state.leeched() {
    self.add_leech_tag(card.note_id)?;
}
```

---

## 9. FSRS：自由间隔重复调度器

### 9.1 核心概念

FSRS 替代 SM-2 的 ease factor + 固定公式，使用三个核心参数建模记忆：

```
R = f(S, D, t)
  其中: S = 稳定性 (stability) — 记忆有多牢固
       D = 困难度 (difficulty) — 卡片有多难
       t = 经过的天数

可提取性 (retrievability) = exp(-t/S)
```

**卡片状态**：
```protobuf
message FsrsMemoryState {
    float stability = 1;   // 稳定性（天）
    float difficulty = 2;  // 困难度 [1, 10]
}
```

### 9.2 切换机制

```rust
// answering/mod.rs — card_state_updater()
let fsrs_next_states = if fsrs_enabled {
    let params = config.fsrs_params();     // 17-21 个可训练参数
    let fsrs = FSRS::new(Some(params))?;
    Some(fsrs.next_states(
        card.memory_state.map(Into::into), // 当前记忆状态
        desired_retention,                  // 期望保持率 (0.8-0.95)
        days_elapsed,                       // 上次复习经过的天数
    )?)
} else {
    None  // 使用 SM-2
};
```

### 9.3 FSRS 下的间隔公式

```rust
// review.rs — passing_fsrs_review_intervals()
fn passing_fsrs_review_intervals(self, ctx, states: &NextStates) -> (u32, u32, u32) {
    let hard = states.hard.interval;  // FSRS 直接输出天数（浮点）
    let good = states.good.interval;
    let easy = states.easy.interval;

    // FSRS 中 fuzz 仍然应用
    let hard_interval = constrain_passing_interval(ctx, hard, greater_than_last(hard), true);
    let good_interval = constrain_passing_interval(ctx, good, max(hard+1, greater_than_last(good)), true);
    let easy_interval = constrain_passing_interval(ctx, easy, max(good+1, greater_than_last(easy)), true);
}
```

### 9.4 FSRS 参数

FSRS 使用 17-21 个浮点参数，通过用户的历史复习数据进行训练：

```
params = [w0, w1, ..., w16, decay]  (FSRS-5: 17个)
params = [w0, w1, ..., w18, decay]  (FSRS-6: 19个+)
```

`w` 参数控制记忆的三阶段模型：
- 初始稳定性（初次学习后的记忆强度）
- 困难度映射
- 复习后的稳定性增长
- 遗忘后的稳定性衰减

### 9.5 SM-2 → FSRS 迁移

当卡片从 SM-2 迁移到 FSRS 时，系统自动推断初始记忆状态：

```rust
fn set_memory_state(&mut self, fsrs: &FSRS, item, historical_retention) -> Result<()> {
    let memory_state = if let Some(i) = item {
        Some(fsrs.memory_state(i.item, i.starting_state)?)
    } else if self.ctype == CardType::New || self.interval == 0 {
        None  // 新卡片没有记忆状态
    } else {
        // 从 SM-2 的 ease_factor 和 interval 推断 FSRS 状态
        Some(fsrs.memory_state_from_sm2(
            self.ease_factor(),
            self.interval as f32,
            historical_retention,
        )?)
    };
    self.memory_state = memory_state.map(Into::into);
}
```

### 9.6 短期记忆处理

FSRS 主要通过长期记忆模型工作。对于 <1 天内的短期复习，有特殊处理：

```rust
// 如果 FSRS 允许短期记忆 + 间隔 < 0.5 天
if ctx.fsrs_allow_short_term
    && (ctx.fsrs_short_term_with_steps_enabled || ctx.relearn_steps.is_empty())
    && scheduled_days < 0.5
{
    // 保持在学习/重新学习状态而非毕业
    again_relearn.into()
} else {
    // 正常毕业到复习状态
    again_review.into()
}
```

---

## 10. 计时模型

### 10.1 日界线

```rust
// timing.rs
pub struct SchedTimingToday {
    pub now: TimestampSecs,
    pub days_elapsed: u32,      // 从 collection 创建起经过了多少"学习日"
    pub next_day_at: TimestampSecs,  // 下一个日界线的 UTC 时间戳
}
```

日界线计算（默认凌晨 4:00）：
```
rollover_today = today@04:00 (用户时区)
if now >= rollover_today:
    next_day_at = rollover_today + 24h
else:
    next_day_at = rollover_today
```

`days_elapsed` 不是简单的 `(now - created) / 86400`，而是考虑时区和日界线后的**学习日计数**。

### 10.2 日内 vs 跨日学习

```rust
// interval_kind.rs
pub enum IntervalKind {
    InSecs(u32),   // 秒级调度（当天内）
    InDays(u32),   // 天级调度（跨天）
}

fn maybe_as_days(self, secs_until_rollover: u32) -> Self {
    match self {
        IntervalKind::InSecs(secs) => {
            if secs >= secs_until_rollover {
                // 延迟超过日界线 → 转为天级
                IntervalKind::InDays(((secs - secs_until_rollover) / 86400) + 1)
            } else {
                IntervalKind::InSecs(secs)  // 还在今天内
            }
        }
        other => other,
    }
}
```

举例：现在是 20:00，日界线是明天 04:00（8 小时后）
- 学习步骤延迟 10 分钟 → `InSecs(600)`（今天内）
- 学习步骤延迟 12 小时 → `InDays(1)`（跨天了）

---

## 11. 队列构建

### 11.1 卡片收集顺序

队列构建器（`queue/builder/`）按以下顺序收集卡片：

```
1. Intraday learning 卡片（当前该看的）
     ↓
2. Intraday learning 卡片（提前学习，learn_ahead 窗口内）
     ↓
3. Day learning 卡片（跨日学习的）
     ↓
4. Review 卡片（到期的复习卡片）
     ↓
5. New 卡片（新卡片）
```

### 11.2 交替混合

收集后按配置混合：

```
Day Learning + Review → merge_day_learning()
  ├── BeforeReviews：先 Day Learning 后 Review
  ├── AfterReviews：先 Review 后 Day Learning
  └── MixWithReviews：均匀穿插

结果 + New → merge_new()
  ├── BeforeReviews：先 New 后结果
  ├── AfterReviews：先结果后 New
  └── MixWithReviews：均匀穿插
```

### 11.3 限制与优先级

```
get_queued_cards(limit=1, new_limit, review_limit)
  └── 遍历队列，跳过不在当前牌组的卡片
      ├── New:     检查 new_limit （牌组级 + 根级）
      ├── Review:   检查 review_limit
      ├── Learning: 不限制（总是显示）
      └── 取到 1 张后返回
```

---

## 12. 配置参数速查

```rust
// 来自 StateContext::defaults_for_testing() 和相关常量

// === 学习步进 ===
learn_steps:              [1.0, 10.0]        // 分钟
relearn_steps:            [10.0]              // 分钟（遗忘后重新学习）
graduating_interval_good: 1                   // 天（Good 毕业间隔）
graduating_interval_easy: 4                   // 天（Easy 毕业间隔）

// === Ease Factor ===
initial_ease_factor:      2.5
minimum_ease_factor:      1.3
ease_again_delta:        -0.20
ease_hard_delta:         -0.15
ease_easy_delta:         +0.15

// === 间隔乘数 ===
hard_multiplier:          1.2
easy_multiplier:          1.3
interval_multiplier:      1.0                 // 全局间隔乘数
lapse_multiplier:         0.0                 // 遗忘后新间隔 = 旧 × this（0=用 minimum）
minimum_lapse_interval:   1                   // 天

// === 限制 ===
maximum_review_interval:  36500               // 天（≈100 年）
leech_threshold:          8                   // 次（0 = 禁用）
learn_ahead_limit:        1200                // 秒（20 分钟）

// === 每日限额 ===
reviews_per_day:          200                 // 每日最大复习数
new_cards_per_day:        20                  // 每日最大新卡数

// === 日界线 ===
rollover_hour:            4                   // 凌晨 4 点

// === FSRS ===
desired_retention:        0.90                // 期望保持率 (80%-95%)
historical_retention:     0.90                // 历史保持率
fsrs_params:              &[]                 // 17-21 个可训练参数
```

---

## 13. 对忆海拾光的借鉴

### 13.1 当前已对齐的部分（无需改动）

忆海拾光的 `processAnswer` 实现已经非常接近 Anki SM-2：

| 已有功能 | 具体实现 |
|----------|---------|
| 四状态机 | new → learning → review → relearning |
| 多步学习 | `learning_steps: [1, 10]` 分钟，`step_index` 递增直到毕业 |
| 多步重学 | `relearning_steps: [10]` 分钟 |
| 四按钮 | again / hard / good / easy，每种状态对四个按钮分别处理 |
| 固定 ease 增量 | Again -0.20, Hard -0.15, Easy +0.15（与 Anki 完全一致） |
| Leech 检测 | `daily_remove_lapses=3`, `auto_suspend_lapses=8` |
| Hard 步进规则 | Anki 平均规则：第一步取(steps[0]+steps[1])/2，仅一步 ×1.5，后续不变（v4.10.1 废弃 hard_step_multiplier） |
| 间隔乘数 | `interval_modifier`, `easy_bonus`, `hard_interval` |
| 日卡片限额 | `new_cards_per_day`, `maximum_reviews_per_day` |

### 13.2 实际差异（仅有 3 项）

| # | 差异 | 影响 | 优先级 | 复杂度 |
|---|------|------|--------|--------|
| 1 | **迟到天数加成** | `interval × ease` → `(interval + days_late/2) × ease` | 高 | 低 |
| 2 | **提前复习惩罚** | 当前提前复习也正常增长间隔 | 中 | 低 |
| 3 | **确定性 fuzz** | 无防聚集机制 | 中 | 低 |

### 13.3 差异详解

**① 迟到天数加成**

当前公式：`Good = interval × ease_factor × interval_modifier`
Anki 公式：`Good = (interval + days_late/2) × ease_factor × interval_modifier`

问题：用户间断几天后回来，积压卡片答对后仍按原间隔增长 → 新间隔偏短 → 很快再次到期 → 积累更多积压。对 AD/MCI 患者场景尤其关键，看护者可能几天才打开一次 App。

改动：在 `processAnswer` 的 `review → good/hard/easy` 分支中，计算间隔时加入 `Math.floor(daysLate / 2)` 项。

**② 提前复习惩罚**

当前行为：卡片 3 天后到期，今天提前看 → Good 按 `3 × ease` 增长间隔（反直觉地增加了）。

Anki 行为：提前复习时 `days_late < 0`，切换到 `passing_early_review_intervals` 公式，最多维持原间隔不增长。

问题：AD 患者可能焦虑地反复看同一张卡。没有惩罚意味着可以靠"突击"刷高间隔，但实际记忆没有强化。

改动：在 `review → good` 分支中，如果 `daysLate < 0`（到期日未到），将 `interval` 替换为 `Math.max(interval, elapsed)` 再计算。

**③ 确定性 fuzz**

当前行为：所有卡片按精确间隔到期，同天毕业的卡永远同时到期。

Anki 行为：用 `card_id + reps` 做种子，在 ±15% 范围内随机偏移间隔，将卡片分散到不同日期。

改动：在 `_graduate()` 和 `review → good/hard/easy` 分支设置 `due_date` 时，对 `interval` 施加 fuzz：

```javascript
function fuzzInterval(interval, cardId, reps) {
    // 间隔 < 2.5 天不 fuzz
    if (interval < 2.5) return interval;
    // 确定性种子：card_id + reps
    const seed = (hashCode(cardId) + reps);
    const factor = ((seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    const fuzzDelta = 1.0 + 0.15 * Math.max(0, interval - 2.5);
    const offset = (factor - 0.5) * 2 * fuzzDelta;
    return Math.round(interval + offset);
}
```

### 13.4 不应采用的

| 模式 | 原因 |
|------|------|
| FSRS 完整实现 | 需要大量历史数据训练 17-21 个参数，认知训练患者群体数据量不足 |
| 负载均衡 | 复杂度高，老年用户卡片量通常不大（几十到几百张） |
| 过滤牌组 | 认知训练场景不需要动态搜索牌组 |
| 日界线偏移（凌晨 4:00） | 当前 `todayStr()` 午夜切换对老年用户足够，增加时区复杂度得不偿失 |
| protobuf 序列化 | 无需跨语言，JSON + TypeScript 类型足够 |

