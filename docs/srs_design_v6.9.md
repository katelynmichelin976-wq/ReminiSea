# 忆海拾光 · SRS 系统设计文档

> 版本：v6.9
> 日期：2026-03-23
> 修订说明：lapses 拆为 lapses_streak（连续，触发保护）+ lapses_total（累计，统计用）；AD 建议 relearning_steps=[10,60,180]；hard_step_multiplier AD 建议值 1.5；明确 due_date/due_ts 使用约定；Phase 2 照护者统计补充 Retention 和 Forgetting Velocity

---

## 一、产品定位

> 算法只是外壳，陪伴才是内核。

**工具定位**：忆海拾光是一个通用卡片记忆训练工具，通过开放参数让不同认知水平的人群自适配：

- AD/MCI 患者的家庭认知训练（照护者陪同）
- 认知高风险人群的预防性自我锻炼
- 普通用户的记忆改善（含外语词汇、知识点等）

核心价值：
- 在患者熟悉的物品上**维持记忆可及性**，延缓语义节点断联速率
- 为照护者提供**可追踪的认知状态数据**，就医时作为参考
- 通过情感显著性内容让患者感受到**尊严与温暖**

训练效果的已知局限：训练只能提高特定物品的特定任务表现，不能迁移。应如实告知照护者。

---

## 二、目标人群认知特征

针对**阿尔茨海默病（AD）及轻度认知障碍（MCI）患者**：

- 前向干扰增强：同类别信息竞争性干扰强，新卡引入时控制同类别数量
- 遗忘速率加快：记忆痕迹不稳定，复习间隔需短于健康人
- 工作记忆容量有限：单次会话不宜引入过多新内容
- 内隐记忆和情感记忆相对保留：家庭成员照片、个人物件等情感显著性内容优先
- 场景记忆残余激活：建议拍摄物品在真实使用场景中的照片，而非孤立白底特写

**AD 适配参数建议**（可在设置中调整）：

| 参数 | Anki 默认 | AD 建议 | 原因 |
|------|----------|--------|------|
| `starting_ease` | 2.50 | 1.30 | 配合 ceil 计算，间隔增长保守但稳定 |
| `learning_steps` | 1m 10m | 1m 5m 10m | 更密集强化 |
| `relearning_steps` | 10m | 10m 60m 180m | 遗忘后当天内分3次强化，符合 AD 小时级遗忘曲线 |
| `hard_step_multiplier` | 1.0 | 1.5 | Hard 等待时间为 Good 的1.5倍，体现认知负担差异 |
| `maximum_interval` | 36500 天 | 7 天 | 超7天正确率跌至随机水平 |
| `new_interval` | 0.00 | 0.00 | 忘了就立刻补救，重置最合理 |
| `interval_modifier` | 1.00 | 0.80 | 整体缩短间隔20%，更频繁复习 |

**AD 参数下的间隔增长轨迹（starting_ease=1.3，maximum_interval=7，ceil 计算）：**

```
毕业       interval = 1 天
Review 1   ceil(1 × 1.3) = 2 天
Review 2   ceil(2 × 1.3) = 3 天
Review 3   ceil(3 × 1.3) = 4 天
Review 4   ceil(4 × 1.3) = 6 天
Review 5   ceil(6 × 1.3) = 7 天（触及上限，稳定）
```

约5次 review 后进入7天稳定周期，保守且可预期。

---

## 三、三种训练模式

```
模式    主要使用者    Phase    顺序              内容                 SRS更新
练习    患者          1        SM-2调度          T1选择题              是
浏览    照护者        1        随机或创建顺序    查看牌组全部内容       否
复习    患者          2        到期紧迫度        展示图片+名称，倒计时  否
```

**练习**：SM-2 驱动。新卡走学习步长直到毕业，已毕业卡按 review 间隔复出。Phase 1 仅实现 T1 选择题，T7 评分和 mix 阶段在 Phase 2 实现。答案展示后倒计时自动进下一题。

**浏览**：照护者管理工具。查看牌组全部卡片内容，相册式翻阅，用于核对卡片质量、管理牌组。与 SRS 完全解耦。现有 BDUR 倒计时保持不变，不引入新参数。

**复习**（Phase 2）：患者独立使用。按到期紧迫度展示所有已接触的卡片（srs_stage ≠ new），无题目无压力，不更新 SRS 状态。

### SRS 状态保护

浏览模式下严格不调用 `processAnswer`，不写 TrialLog 的 SRS 字段。时长控制仅适用于练习模式（Phase 1），复习模式时长控制在 Phase 2 实现。

---

## 四、题型体系

### Phase 1 题型

```
T1    看图选名称（选择题，系统自动判对错）    建立基础视觉命名能力（再认任务）
```

### Phase 2 题型（待实现）

```
T7    看图评价命名（照护者4档评分）          评估词汇自由提取能力（回忆任务）
mix   T1 答完追加 T7 观察                   低压环境接触自由命名，不驱动 SM-2
```

T7 和 mix 阶段依赖照护者实时在场评分，属于进阶功能，Phase 1 不实现。CardState 结构中 `review_mode` 和 `review_mode_count` 字段**现在就预留**，Phase 2 直接启用，不需要迁移。

### 单一 CardState，题型由 review_mode 决定

每张卡只有**一条 CardState**。Phase 1 中 `review_mode` 始终为 `'T1'`，Phase 2 启用 mix 和 T7 后按以下规则流转：

```
T1 毕业后   →  review_mode = 'T1'（纯选择题巩固）
N次后       →  review_mode = 'mix'（T1 答完追加 T7 观察）
M次后       →  review_mode = 'T7'（照护者评分驱动 SM-2）
```

### T1 选择题（Phase 1）

展示图片，给出 N 个选项（可配置2–4个），自动映射 SM-2 评分：

```
第1次作答正确  →  Good
第2次作答正确  →  Hard
两次均答错     →  展示答案，Again
（Easy 在 T1 不触发）
```

答错第1次：错误选项消失，保留重试机会。每次答 Again 计入 `lapses_streak` 和 `lapses_total`。

### T7 评分题（Phase 2，结构预留）

T7 需要照护者实时在场评分，Phase 1 不实现。Phase 2 启用时，照护者在患者回答后从4档评分中选择：

```
重来（Again）   完全不认识，无任何反应
困难（Hard）    需要较多提示，反应慢
良好（Good）    有提示下确认，或独立说出但不流利
容易（Easy）    无需任何提示，自主流利命名
```

T7 阶段的 Again 计入 `lapses_streak` 和 `lapses_total`，其余评分正常推进 SM-2。

### 新卡引入的类别控制

新卡引入的类别控制移入 Phase 2 实现。Phase 1 按牌组顺序引入新卡，不限制类别分布。

---

## 五、SM-2 算法

### 5.1 算法选型

采用标准 Anki SM-2 实现，全部参数开放给用户调整。**interval 计算统一使用 `ceil`（向上取整）**，解决 `starting_ease` 较小时 `round` 导致间隔无法增长的问题：

```javascript
interval = Math.max(minimum_interval, Math.ceil(interval * factor * interval_modifier))
```

### 5.2 CardState 数据结构

每张卡**一条** CardState，key 格式：`deckKey::cardId`

```javascript
CardState {
  card_id        : string
  deck_key       : string

  // SM-2 核心字段
  srs_stage      : 'new' | 'learning' | 'review' | 'relearning'
  interval       : int      // 复习间隔天数，review 阶段使用
  ease_factor    : float    // 易度因子，初始值 = starting_ease
  due_date       : string   // "2026-03-22"，review 阶段调度
  due_ts         : int      // 毫秒时间戳，learning/relearning 阶段调度

  // 学习步长进度
  step_index     : int      // 当前步在 learning_steps / relearning_steps 中的位置

  // T1→T7 过渡进度（srs_stage='review' 时有意义）
  review_mode       : 'T1' | 'mix' | 'T7'  // 默认 'T1'
  review_mode_count : int                    // 当前阶段已完成的 review 次数

  // 保护机制计数器（不参与 SM-2 计算）
  lapses_streak  : int   // 连续失败次数（答对一次清零）
                         // 用途：触发当日移出 + 自动挂起
  lapses_total   : int   // 累计失败次数（永不清零）
                         // 用途：统计分析，Phase 3 失败模式研究

  // 保护标记
  suspended        : bool
  suspended_reason : string  // 'auto' | 'manual'

  updated_at     : timestamp
}
```

**关键字段说明：**

| 字段 | 语义 |
|---|---|
| `srs_stage` | SM-2 学习阶段，避免与 question_type（题型）混淆 |
| `due_date` | 日期字符串，**review 阶段专用** |
| `due_ts` | 毫秒时间戳，**learning / relearning 阶段专用** |
| `lapses_streak` | 连续失败次数，答对一次清零，用于触发保护规则 |
| `lapses_total` | 累计失败次数，永不清零，用于统计分析 |
| `review_mode` | T1→T7 过渡阶段，只在 srs_stage='review' 时有意义 |

**due_date / due_ts 使用约定（严格区分，不混用）：**

```
review 阶段     → 只用 due_date（"2026-03-22"）
                  取题判断：due_date <= todayStr()

learning 阶段   → 只用 due_ts（毫秒时间戳）
relearning 阶段   取题判断：due_ts <= Date.now()

统一工具函数（所有日期/时间操作必须通过这些函数）：
  todayStr()           → "2026-03-22"（当天日期字符串）
  addDays(str, n)      → 日期字符串加 n 天
  minsToTs(mins)       → mins × 60 × 1000（分钟转毫秒时间戳增量）
```



```javascript
// rating: 'again' | 'hard' | 'good' | 'easy'
function processAnswer(state, rating, today) → CardState
```

**Learning 阶段（srs_stage = 'new' 或 'learning'）：**

```
Again  →  step_index = 0
           due_ts = now + learning_steps[0] 分钟（转毫秒）
           lapses_streak++；lapses_total++

Hard   →  step_index 不变
           due_ts = now + learning_steps[step_index] × hard_step_multiplier 分钟
           // Anki 实际行为：第一步 Hard = 前两步平均值；其他步重复当前步
           // 我们用 hard_step_multiplier 近似，默认1.0

Good   →  step_index++
           lapses_streak = 0（答对清零）
           若 step_index >= learning_steps.length → _graduate(isEasy=false)
           否则 due_ts = now + learning_steps[step_index] 分钟

Easy   →  _graduate(isEasy=true)
```

**Review 阶段（srs_stage = 'review'）：**

```
Again  →  lapses_streak++；lapses_total++
           ease_factor = max(ease_min, ease_factor - 0.20)
           interval = max(minimum_interval, ceil(interval × new_interval × interval_modifier))
           srs_stage = 'relearning'，step_index = 0
           due_ts = now + relearning_steps[0] 分钟
           review_mode / review_mode_count 保留（重学完成后恢复）

Hard   →  ease_factor = max(ease_min, ease_factor - 0.15)
           interval = max(minimum_interval, ceil(interval × hard_interval × interval_modifier))
           due_date = addDays(today, min(interval, maximum_interval))
           _advanceReviewMode(state)

Good   →  interval = max(minimum_interval, ceil(interval × ease_factor × interval_modifier))
           due_date = addDays(today, min(interval, maximum_interval))
           lapses_streak = 0（答对清零）
           _advanceReviewMode(state)

Easy   →  ease_factor = min(3.0, ease_factor + 0.15)
           interval = max(minimum_interval, ceil(interval × ease_factor × easy_bonus × interval_modifier))
           due_date = addDays(today, min(interval, maximum_interval))
           _advanceReviewMode(state)
```

**Relearning 阶段（srs_stage = 'relearning'）：**

```
Again  →  step_index = 0
           due_ts = now + relearning_steps[0] 分钟
           lapses_streak++；lapses_total++

Hard   →  step_index 不变
           due_ts = now + relearning_steps[step_index] × hard_step_multiplier 分钟

Good/Easy → step_index++
             lapses_streak = 0（答对清零）
             若 step_index >= relearning_steps.length → 重新毕业
               srs_stage = 'review'
               interval = max(minimum_interval, interval)（保持 lapse 后缩减的值）
               due_date = addDays(today, min(interval, maximum_interval))
               review_mode / review_mode_count 恢复
```

**毕业逻辑（_graduate）：**

```javascript
function _graduate(state, isEasy, today) {
  state.srs_stage       = 'review'
  state.interval        = isEasy ? SRS_CONFIG.easy_interval
                                 : SRS_CONFIG.graduating_interval
  state.due_date        = addDays(today, state.interval)
  state.step_index      = 0
  state.review_mode     = 'T1'
  state.review_mode_count = 0
  // ease_factor 保持 starting_ease，learning 阶段挣扎不影响毕业初始值
}
```

### 5.4 间隔计算说明

**ceil 的必要性：**

```
starting_ease = 1.3，interval = 1：
  round(1 × 1.3) = 1  → 间隔不增长
  ceil(1 × 1.3)  = 2  → 间隔正常推进
```

**interval_modifier 的作用位置：**

```javascript
// 作用在 ceil 内部，和 ease_factor 一起参与计算
interval = max(minimum_interval, ceil(raw_interval × ease_factor × interval_modifier))

// 示例：interval=4，ease_factor=2.2，interval_modifier=0.8
// = max(1, ceil(4 × 2.2 × 0.8)) = max(1, ceil(7.04)) = 7 天
// 而非 interval_modifier=1.0 时的 ceil(4 × 2.2) = 9 天
```

### 5.5 下次复习时间的计算

卡片详情面板展示两部分（见十一章）：
- **答题历史**：从 TrialLog 读取，展示每次答题的阶段、评分、结果，追溯当前 interval 的来源
- **下一步推导**：从 CardState 当前字段实时计算今天不同评分的结果

### 5.6 参数配置（SRS_CONFIG）

参数命名与 Anki 官方对齐，我们特有的参数单独注明。

```javascript
const SRS_CONFIG = {

  // ══════════════════════════════════════
  // 新卡学习（对应 Anki "New Cards"）
  // ══════════════════════════════════════

  learning_steps : [1, 10],
  // 对应 Anki "Learning Steps"（分钟）
  // 每次答 Good 推进一步，答 Again 退回第一步
  // AD 建议：[1, 5, 10, 30]

  graduating_interval : 1,
  // 对应 Anki "Graduating Interval"（天）
  // 最后一步答 Good 后毕业，多少天后第一次 review

  easy_interval : 2,
  // 对应 Anki "Easy Interval"（天）
  // 任意阶段答 Easy 直接毕业，多少天后 review
  // Anki 默认值：2

  // ══════════════════════════════════════
  // 遗忘重学（对应 Anki "Lapses"）
  // ══════════════════════════════════════

  relearning_steps : [10],
  // 对应 Anki "Relearning Steps"（分钟）
  // review 阶段答 Again 后的重学步骤

  minimum_interval : 1,
  // 对应 Anki "Minimum Interval"（天）
  // 重学完成后的最小间隔，所有 interval 计算结果不低于此值

  new_interval : 0.0,
  // 对应 Anki "New Interval"（即「重来」复习间隔乘数）
  // review 阶段答 Again 后：interval = max(minimum_interval, ceil(interval × new_interval))
  // 0.0 = 间隔重置为 minimum_interval（忘了立刻补救）
  // 0.5 = 保留一半间隔

  // ══════════════════════════════════════
  // 每日上限（对应 Anki "Daily Limits"）
  // ══════════════════════════════════════

  new_cards_per_day : 5,
  // 对应 Anki "New Cards/Day"
  // 每天最多引入几张新卡

  maximum_reviews_per_day : 50,
  // 对应 Anki "Maximum Reviews/Day"
  // 每天最多复习几张已有卡（review + relearning + learning 合计）
  // Anki 默认值：50（我们之前设20偏低）

  new_cards_ignore_review_limit : false,
  // 对应 Anki "New Cards Ignore Review Limit"
  // false（默认）：新卡受槽位约束，债务期自动停止引入新卡
  // true：新卡独立计算，只受 new_cards_per_day 约束

  // ══════════════════════════════════════
  // 高级间隔控制（对应 Anki "Advanced"）
  // ══════════════════════════════════════

  maximum_interval : 36500,
  // 对应 Anki "Maximum Interval"（天）
  // AD 建议：7

  starting_ease : 2.50,
  // 对应 Anki "Starting Ease"
  // 新卡毕业时的初始易度因子
  // AD 建议：1.30（配合 ceil 计算）

  easy_bonus : 1.30,
  // 对应 Anki "Easy Bonus"（「简单」复习间隔乘数）
  // review 阶段答 Easy：interval × ease_factor × easy_bonus

  interval_modifier : 1.00,
  // 对应 Anki "Interval Modifier"（全局间隔乘数）
  // 作用于所有 review 间隔计算，在 ceil 内部生效
  // AD 建议：0.80（整体缩短20%）
  // 1.00 = 不修改；< 1.00 = 缩短间隔；> 1.00 = 延长间隔

  hard_interval : 1.20,
  // 对应 Anki "Hard Interval"（「困难」复习间隔乘数）
  // review 阶段答 Hard：interval × hard_interval

  // ══════════════════════════════════════
  // 以下为我们特有参数（Anki 无对应）
  // ══════════════════════════════════════

  ease_min : 1.30,
  // ease_factor 的最低下限（Anki 内部写死，我们开放）
  // 避免连续答 Hard/Again 后易度因子跌至无法增长

  hard_step_multiplier : 1.0,
  // learning/relearning 阶段答 Hard 时的步长倍数
  // 1.0 = 等待时间与 Good 相同，但步长不推进
  // 注：Anki 实际行为是前两步的平均值，我们用此参数近似

  // ── T1→T7 过渡
  t1_review_before_mix : 2,
  // T1 毕业后先用 T1 review 几次再进入 mix 阶段（Phase 2 启用）

  t1_mix_before_t7 : 2,
  // mix 阶段经历几次后切换为纯 T7（Phase 2 启用）

  // ── 连续失败保护（对应 Anki "Leeches"）
  daily_remove_lapses : 3,
  // 同一张卡 lapses_streak（连续失败）达到此值 → 当日移出队列
  // 类似 Anki Leech，但作用于当日

  auto_suspend_lapses : 8,
  // lapses_total（累计失败）达到此值 → suspended
  // 对应 Anki "Leech Threshold"（Anki 默认8次）

  // ── 节奏（Phase 2）
  // warmup_cards / cooldown_cards 在 Phase 2 实现热身/收尾卡节奏

  // ── 自动前进（练习模式）
  practice_advance_sec : 6,
  // 练习模式：答案展示后等 N 秒自动进下一题（SRS 正常更新）
  // 对应现有 NDUR 变量，0 = 手动点击
  // 浏览模式倒计时保持现有 BDUR 变量，不在此配置

  // ── 统计记录
  maximum_answer_seconds : 60,
  // 类似 Anki "Maximum Answer Seconds"（内部计时器上限）
  // 单题最长记录时间，超过则 response_time_ms 截断为此值
  // 仅影响 TrialLog 统计，不影响 SRS 调度

  // ── 时长保护（仅练习模式，Phase 1）
  idle_threshold_sec : 120,
  // 两题间隔超过此值不计入活跃时长（不暴露 UI）

  warn_duration_sec : 1200,
  // 本次活跃累计达到后触发（默认20分钟）

  warn_repeat_sec : 600,
  // 触发后冷却时间

  warn_mode : 'warn',
  // 'warn'  = 提醒后用户可继续
  // 'limit' = 当前卡答完后强制停止
}
```

---

## 六、每日槽位规则

### 两个独立上限

```
new_cards_per_day        每天最多引入几张新卡（对应 Anki New Cards/Day）
maximum_reviews_per_day  每天最多复习几张已有卡（对应 Anki Maximum Reviews/Day）
```

**new_cards_ignore_review_limit = false（默认）：**

```
优先级：到期 review/relearning 卡 → learning 中的卡 → 新卡
新卡配额 = max(0, maximum_reviews_per_day - 已用review数)
         且不超过 new_cards_per_day
债务期（到期卡多）→ 新卡自动停止引入
```

**new_cards_ignore_review_limit = true：**

```
review 类和新卡各自独立计算
新卡始终有保障，只受 new_cards_per_day 约束
```

### 槽位计数

计数单位：**卡片数**（不同的卡），与出题次数无关。同一张卡步长内多次出现只占一个槽位。步长内重现（`_retrying`）不计。

### 债务收敛

到期卡数 >= `maximum_reviews_per_day` 时，新卡配额自动归零，每天消化固定数量到期卡，有限天数内债务清零。前提：用户每天打开练习。

---

## 七、连续失败保护机制

### 两个计数器，职责分离

```
lapses_streak : 连续失败次数（答对一次清零）
                用途：触发当日移出 + 自动挂起
                对应 Anki "Leeches" 的触发逻辑

lapses_total  : 累计失败次数（永不清零）
                用途：统计分析，Phase 3 失败模式研究
                不用于触发任何保护规则
```

**为什么要拆分：**

用单一累计计数器（`lapses_total`）触发挂起，会随着使用时间增长误伤正常用户——长期使用的用户偶尔失败几次属于正常波动，不应该被挂起。`lapses_streak` 连续失败才是真正需要干预的信号。

### 当日保护

```
同一张卡当日 lapses_streak >= daily_remove_lapses（默认3）：
  → 当日移出队列，今天不再出现
  → lapses_streak 和 lapses_total 继续累计
  → 明天重新进入队列，lapses_streak 不重置（跨日保留）
```

### 长期保护与挂起

```
lapses_total >= auto_suspend_lapses（默认8）：
  → suspended = true，suspended_reason = 'auto'
  → 统计页显示「待确认」，照护者处理
  → 照护者选择：
    ① 重置重学：srs_stage = 'new'，lapses_streak = 0，lapses_total = 0
    ② 长期暂停：维持 suspended
    ③ 忽略继续：suspended = false，计数器不清零
```

### suspended 卡片

`suspended = true` 的卡片在所有队列生成时跳过，包括练习和浏览。

`suspended_reason` 取值：`'auto'`（触发阈值）或 `'manual'`（照护者手动挂起）。

---

## 八、练习节奏设计（Phase 2 完整实现）

### Phase 1 队列结构

```
session 队列 = 主队列

主队列：
  到期 review 卡（oldest due_date first）
  ↕ learning/relearning 卡（due_ts 到期时实时插入）
  新卡（daily 配额内）
```

### 主队列走完后

主队列消费完，检查是否有 `due_ts` 未到期的 learning/relearning 卡：

```
有未到期的 learning 卡：
  按 due_ts 升序追加到队列末尾，直接继续出题
  （不等待，不显示等待界面，步长时间被压缩是可接受的近似）

无任何卡片：
  session 结束，显示完成界面
```

与 Anki 处理一致——没有等待界面，卡片自然流出到结束。

### Phase 2 节奏设计

基于序列位置效应（易—难—易），Phase 2 在主队列前后加入：

```
热身卡（warmup_cards，默认2张）：
  来源：ease_factor 最高的 review 卡，随机抽取，和到期无关
  形式：T1 选择题，不计入 maximum_reviews_per_day，不更新 SRS

收尾卡（cooldown_cards，默认1张）：
  同上，排在队列末尾
```

---

## 九、练习时长控制

**仅适用于练习和复习模式，浏览模式不计时。**

锁屏或切换 app 时（`visibilitychange` 事件），停止自动前进计时器，重置 idle 计时。

```javascript
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    clearTimeout(_autoAdvanceTimer)
    _lastCardTs = null
  }
})
```

### 活跃时间计算

```javascript
function recordCardTime() {
  const now = Date.now()
  const dp  = getDailyProgress()
  if (dp.last_card_ts) {
    const gap = (now - dp.last_card_ts) / 1000
    if (gap <= SRS_CONFIG.idle_threshold_sec) {
      dp.active_duration_sec += gap
      _sessionActiveSec      += gap
    }
  }
  dp.last_card_ts = now
  saveDailyProgress(dp)
  _checkDurationWarning()
}
```

### 触发逻辑

```javascript
function _checkDurationWarning() {
  if (!SRS_CONFIG.warn_duration_sec) return
  if (_sessionActiveSec < SRS_CONFIG.warn_duration_sec) return
  if (_warnedThisSession) return
  SRS_CONFIG.warn_mode === 'warn' ? showRestToast() : (_pendingStop = true)
  _warnedThisSession = true
  setTimeout(() => { _warnedThisSession = false }, SRS_CONFIG.warn_repeat_sec * 1000)
}
```

---

## 十、数据结构

### 10.1 存储分配

```
localStorage
  ├── device_id
  ├── yihai_daily_progress         DailyProgress（每天重置）
  └── srs_{key}                    SRS_CONFIG 各参数的持久化覆盖值

IndexedDB（yihai_srs，version 3）
  ├── card_states                  CardState（每张卡一条）
  ├── trials                       TrialLog（keyPath: trial_id）
  └── [card_type_states / pool]    废弃，保留供迁移检测

IndexedDB（yihai_media，version 1）
  └── blobs                        图片/录音 Blob
```

### 10.2 DailyProgress

```javascript
DailyProgress {
  date                 : string  // "2026-03-23"，每天重置
  reviewed_today       : int     // 今日已用 review 类槽位数
  daily_new_today      : int     // 今日已引入新卡数
  preview_cards_viewed : int     // 复习模式浏览数
  active_duration_sec  : int     // 今天累计活跃时长（秒，仅练习和复习）
  last_card_ts         : int     // 上一张卡答完的时间戳
}
```

### 10.3 TrialLog

```javascript
TrialLog {
  trial_id             : string    // 主键（keyPath）
  card_id              : string
  deck_key             : string
  session_id           : string    // 'sess_' + Date.now()，每次 _launch 生成

  question_type        : string    // 'T1' | 'T7'
  rating               : string    // 'again' | 'hard' | 'good' | 'easy'
  is_correct           : bool      // T1: 系统判断；T7: good/easy = true

  // T1 专有
  attempt_number       : int       // 1 or 2
  options_shown        : string[]  // 当次展示的所有选项 card_id（含正确答案，共 opt_count 个）
  correct_option       : string    // 正确答案 card_id
  distractor_chosen    : string    // 误选项 card_id，答对则 null
  distractor_same_cat  : bool      // 误选项是否同类别，答对则 null

  // SM-2 快照（答题前）
  srs_stage_before     : string
  interval_before      : int
  ease_before          : float
  lapses_streak_before : int
  lapses_total_before  : int
  review_mode_before   : string

  // 时长
  response_time_ms     : int       // 超过 maximum_answer_seconds 则截断
  active_gap_ms        : int       // 距上一张的活跃间隔，超阈值记为 null

  // 上下文
  session_mode         : string    // 'practice' | 'review' | 'browse'
  time_of_day          : string    // 'morning' | 'afternoon' | 'evening'
  timestamp            : int

  // 标记（不计入统计）
  _retrying            : bool      // 步长内重现（Phase 1）
  _warmup              : bool      // 热身/收尾卡（Phase 2，预留字段）
  _mix_observe         : bool      // mix 阶段 T7 观察（Phase 2，预留字段）
}
```

---

## 十一、数据统计功能

### 数据分层原则

```
App 端（本地，Phase 1 实现）：
  数据来源：本地 TrialLog（保留近7天）+ CardState（永久保留）
  服务对象：患者日常练习反馈、照护者简单监督
  特点：即时可用，无需网络，数据量小

照护者端（云端，Phase 2 实现）：
  数据来源：云端全量 TrialLog（长期积累）
  服务对象：照护者深度分析、就医参考、月度报告
  特点：需要足够历史数据才有意义，周/月趋势比单日更有价值
```

**CardState 本地永久保留**（调度必须），**TrialLog 本地保留7天**（超过7天上传云端后可清理）。

---

### 11.1 今日概况（App 端，Phase 1）

| 指标 | 数据来源 | 说明 |
|------|---------|------|
| 已练习 | DailyProgress.reviewed_today | 不含重现卡 |
| 答对 | TrialLog 当天，is_correct=true，非_retrying | |
| 答错 | TrialLog 当天，is_correct=false，非_retrying | |
| 正确率 | 答对 / (答对+答错) | 0条时显示「—」|
| 今日进度 | reviewed_today / maximum_reviews_per_day | 进度条 |
| 本次时长 | _sessionActiveSec | 实时，进练习屏时重置 |
| 今日时长 | DailyProgress.active_duration_sec | 跨 session 累计 |
| 近7天 | TrialLog 按日期聚合，每天：唯一卡片数（柱）+ 正确率（折线）| 双轴图 |
| 待确认 | suspended=true 的卡数 | 点击跳转卡片状态 |

### 11.2 牌组概况（App 端，Phase 1）

| 指标 | 数据来源 | 说明 |
|------|---------|------|
| 总卡片数 | DECKS 卡片总数 | |
| 已掌握 | srs_stage='review' 且 interval>=2 | 来自 CardState，永久准确 |
| 学习中 | srs_stage='learning' 或 'relearning' | |
| 待开始 | srs_stage='new' | |
| 暂停 | suspended=true | |
| 连续练习天数 | DailyProgress 历史，统计连续有 reviewed_today>0 的天数 | streak |
| 未来7天预测 | 所有 review 卡的 due_date 按日期统计 | 来自 CardState，每天预计到期卡数 |

### 11.3 卡片状态（App 端，Phase 1）

筛选：**全部 / 待确认 / 学习中 / 已掌握 / 待开始**

| 列 | 显示内容 | 说明 |
|---|---|---|
| 图片/名称 | | |
| 状态 | 待开始/学习中/已掌握/重新学习 | srs_stage 映射 |
| 题型阶段 | Phase 1 固定为 T1 | Phase 2 显示 review_mode |
| 连续失败 | lapses_streak | >0 标黄，>=阈值标红 |
| 累计失败 | lapses_total | 仅展示，不触发警告 |
| 下次复习 | review：日期（3月25日）/ learning：剩余时间（12分钟后）/ 已到期：今日待练 | |
| 易度因子 | ease_factor | <=1.5 标黄（接近下限）|
| 复习间隔 | interval 天数 | learning 阶段显示「—」|
| 待确认原因 | 自动挂起 / 照护者暂停 | suspended_reason 映射 |

### 11.4 卡片详情面板（App 端，Phase 1）

点击卡片状态列表任意一张卡展开，分两部分：

**第一部分：答题历史**（TrialLog，按 timestamp 升序，近7天内）

```
时间          阶段      评分    结果
3/20 09:12   学习中    良好  → 1分钟后
3/20 09:13   学习中    良好  → 毕业，明天复习
3/21 10:05   复习      困难  → 间隔 1天
3/22 08:30   复习      良好  → 间隔 2天
3/24 11:15   复习      良好  → 间隔 4天  ← 当前
```

**第二部分：当前参数与下一步推导**（CardState 实时计算）

```
当前间隔    4 天
易度因子    2.20
全局乘数    1.00

如果今天答题：
  良好  →  ceil(4 × 2.20 × 1.00) =  9天  →  3月31日
  困难  →  ceil(4 × 1.20 × 1.00) =  5天  →  3月27日
  重来  →  退回重学，10分钟后出现，间隔重置为 1天
```

### 11.5 练习记录（App 端，Phase 1）

**最近20条**（不含 `_retrying`），按 `timestamp` 倒序，近7天内。

每条展示：卡片名称、评分（颜色编码）、误选项（答错时）、答题时间（「3/22 14:32」）。

支持按卡片筛选（点击卡片名跳转详情面板）。

**常见混淆**（Phase 2）：需要 `options_shown` 的完整历史数据才能准确计算分母，移入 Phase 2 云端统计。Phase 1 仅记录 `options_shown` 和 `distractor_chosen` 字段，数据已埋点。

### 11.6 照护者统计面板（云端，Phase 2）

依赖云端全量 TrialLog，以下指标在本地7天数据下无统计意义，移入 Phase 2：

```
正确率趋势（周/月曲线）
lapses 热点卡片（哪几张卡反复遗忘）
时段效应（早上 vs 下午表现差异）
答题分布（Again/Hard/Good/Easy 占比，需足够样本）
混淆统计（基于 options_shown 聚合）
月度就医参考报告
```

**两个关键临床指标（Phase 2 必须实现）：**

**① Retention（记忆保持率）**

```
定义：过去7天内，所有到期 review 卡中 Good/Easy 的占比
公式：Good/Easy 次数 / 全部 review 答题次数（含 Again/Hard）
意义：比正确率更有医学意义，反映长期记忆的可及性
     持续下降 → 认知退化信号
     保持稳定 → 训练有效
数据来源：TrialLog，rating + srs_stage_before='review'
```

**② Forgetting Velocity（遗忘速度）**

```
定义：review 卡平均 interval 的周趋势变化
公式：本周平均 interval - 上周平均 interval
意义：越来越短 → 记忆痕迹在减弱，遗忘在加速
     持续缩短 → 可能是病情进展信号，建议就医
数据来源：CardState.interval（当前值）+ TrialLog.interval_before（历史快照）
```

两个指标的数据在 Phase 1 已完整埋点，Phase 2 直接计算即可。

### 11.7 首页牌组数据

| 列 | 数据来源 | 说明 |
|---|---|---|
| 到期 | srs_stage='review' 且 due_date<=today，加 srs_stage='learning'/'relearning' 且 due_ts<=now | |
| 今日完成 | DailyProgress.reviewed_today | |
| 新卡 | srs_stage='new' 且 !suspended | |

---

## 十二、云端同步预埋（Phase 1 实施，Phase 2 激活）

Phase 1 离线实现，但在数据层预埋三个钩子，确保 Phase 2 接入云端时无需数据迁移。

### 12.1 device_id

```javascript
// app 启动时调用，生成并持久化设备唯一标识
function getOrCreateDeviceId() {
  let id = localStorage.getItem('yihai_device_id')
  if (!id) {
    id = 'dev_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8)
    localStorage.setItem('yihai_device_id', id)
  }
  return id
}
```

Phase 2 用户注册后，后端将 `device_id` 绑定到 `user_id`，历史数据批量迁移，无需客户端改动。

### 12.2 TrialLog 的 synced_at 字段

```javascript
TrialLog {
  // 其他字段不变...
  synced_at : int | null   // null = 未同步；timestamp = 已同步时间
}
```

trials store 创建时加索引：

```javascript
const ts = db.createObjectStore(TRIAL_STORE, { keyPath: 'trial_id' })
ts.createIndex('synced_at', 'synced_at')
```

Phase 2 同步时只查 `synced_at IS NULL` 的记录做增量上传，不需要全量比对。

### 12.3 CardState 的冲突策略

`updated_at` 字段在每次 `saveCardState` 时更新，Phase 2 双向同步时采用 **last-write-wins**：`updated_at` 更新的版本覆盖旧版本。

### 12.4 数据保留策略

```
CardState   本地永久保留（SRS 调度必须，数据量小）
TrialLog    本地保留近7天；超过7天的在 Phase 2 上传云端后可清理
            Phase 1 先全量保留，不清理（等 Phase 2 上传机制就绪）
DailyProgress  本地保留，每天重置 date 字段，历史通过 TrialLog 重建
```

### 12.5 key 设计

CardState key 格式：`deckKey::cardId`，不含 `user_id` 或 `device_id`。

云端通过 `user_id`（由 `device_id` 注册后绑定）关联所有数据，不需要改 key 结构，迁移成本最低。

---

## 十三、实现路径

```
Phase 1（当前，离线核心）

  迭代 v4.0：SRS 数据层
    ├── IndexedDB yihai_srs（version 1）
    │   ├── card_states store
    │   └── trials store（含 synced_at 索引，云端同步预埋）
    ├── SRS_CONFIG（全部参数，Anki 命名对齐）
    ├── CardState CRUD + processAnswer 状态机（ceil 计算）
    ├── buildSessionQueue（daily 槽位规则）
    ├── DailyProgress 新结构
    └── getOrCreateDeviceId()（云端同步预埋）

  迭代 v4.1：练习流程接入 SRS（纯 T1）
    ├── _launch('practice') 使用 buildSessionQueue
    ├── revealAnswer 接入 _writeSrs（T1 评分映射，options_shown 写入 TrialLog）
    ├── onNext 接入 due_ts 实时检查 + 主队列空时追加未到期 learning 卡
    ├── 练习时长控制（recordCardTime / warn_mode，仅练习模式）
    ├── 保护机制（daily_remove_lapses / auto_suspend_lapses）
    └── 首页3列数字改为读 CardState 真实数据

  迭代 v4.2：浏览模式保持现状
    └── 无需改动，现有 BDUR 倒计时和浏览逻辑保持不变

  迭代 v4.3：轻量统计页 + 设置页 SRS 参数
    ├── 统计屏：今日概况 / 牌组概况 / 卡片状态 / 卡片详情 / 练习记录
    ├── 数据来源：本地 TrialLog（7天）+ CardState（永久）
    ├── TrialLog 7天清理机制
    └── 设置页新增 SRS 参数分组（全部参数可调，持久化）

Phase 2（联网 + 数据收集）
  ├── 用户注册 + 云端同步
  ├── TrialLog 批量上传（查 synced_at IS NULL）
  ├── CardState 双向同步（last-write-wins by updated_at）
  ├── 复习模式（buildPreviewQueue + 时长控制）
  ├── T7 照护者4档评分（review 阶段 T7 触发）
  ├── mix 阶段（T1 答完追加 T7 观察）
  ├── 练习节奏（热身卡 + 收尾卡 + 类别控制）
  ├── 混淆统计（基于 options_shown 云端聚合）
  └── 照护者统计面板（云端全量数据）

Phase 3（数据驱动参数验证）
  ├── 实验1：starting_ease=1.3 配合 ceil 的实际效果验证
  ├── 实验2：t1_review_before_mix / t1_mix_before_t7 最优值
  ├── 实验3：time_of_day × rating 时段效应
  ├── 实验4：lapses_streak / lapses_total 阈值最优值
  └── 月度就医参考报告

Phase 4（数据验证后）
  ├── 用户级参数个性化
  └── AI 辅助 T7 评分解读
```

---

## 十四、待决策项（Phase 1 内）

1. **TrialLog 7天清理时机**：Phase 1 先全量保留，Phase 2 上传机制就绪后再启用清理逻辑，避免数据丢失。

---

## 十五、已知局限

**Hard 按钮在 learning 阶段的行为差异**：Anki 实际行为是前两步的平均值（如步长 1m 10m，Hard 显示6m），我们用 `hard_step_multiplier` 近似，默认1.0（等待时间与 Good 相同，但步长不推进）。行为有差异，影响较小。

**训练迁移性有限**：只能提高特定物品的特定任务表现，不能迁移。应如实告知照护者。

**学习步长的压缩**：主队列空时 learning 卡按 due_ts 升序直接追加出题，步长时间被压缩。这是为了避免等待界面而主动接受的近似，对 AD 场景影响可接受。

**lapses 阈值的冷启动**：`auto_suspend_lapses`（默认8次）和 `daily_remove_lapses`（默认3次）都是经验值，需通过 Phase 3 实验数据验证最优阈值。Phase 3 也将分析 `lapses_total` 数据，确认是否需要进一步区分失败模式。

**债务收敛的前提**：依赖用户每天打开练习。连续多天不使用，积压持续增长。

**7天本地数据的局限**：App 端统计仅反映近期状态，不适合趋势分析。需要照护者使用 Phase 2 的云端统计面板获取有意义的长期数据。
