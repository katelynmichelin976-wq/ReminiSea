# Findings：练习队列排列评估 + Bug 调查

## Bug #96: isRetrying ReferenceError (2026-05-20)

**根因**: v4.11.9 commit ab17f77 删除 `const isRetrying = false;`（#92 reviewed_today 修正的一部分），但 `_writeSrs` 第 4389 行 `_retrying: isRetrying` 仍引用该变量 → `ReferenceError: isRetrying is not defined`

**调用栈**:
```
revealAnswer() → _writeSrs(q, rating, attempt)
  → saveCardState ✓ (在崩溃前)
  → saveDailyProgress ✓ (在崩溃前)
  → TrialLog entry 构造 → ReferenceError ✗
  → writeTrialLog() 从未执行
```

**影响范围**:
- IndexedDB `trials` 表持续为空
- `card_states` 正常写入
- `daily_progress` 正常写入（统计页 KPI 显示正确）
- 记录/历史列表无数据（通过 getTrialLogs 读取）

**修复**: 第 4389 行 `_retrying: isRetrying` → `_retrying: false`

**验证**: Playwright 测试确认 trials 写入恢复 (1→2 entries)；SRS 85 ✓, v4.4 98 ✓, v4.8 46 ✓, v4.9 48 ✓

## 队列生成逻辑（buildSessionQueue，line 2856）

最终队列组装顺序：
```
queue = [...reviewDue, ...relearningDue, ...learningDue, ...newCards]
```

各组内部排序：
- reviewDue：按 due_date 升序（最旧的先出）
- relearningDue：按 due_ts 升序
- learningDue：按 due_ts 升序
- newCards：按卡片在 deck 中的原始顺序

## 难度相关字段（CardState）

| 字段 | 含义 | 难度方向 |
|------|------|---------|
| ease_factor (ef) | 复习间隔倍增系数 | 越低越难（min≈1.3, default 2.5） |
| lapses | 累计遗忘次数 | 越高越难 |
| srs_stage | new/learning/relearning/review | relearning > learning > new ≈ review |
| interval | 当前间隔天数 | 越短越难（相对） |

## "前易中难后易"算法设计

本质：在 buildSessionQueue 返回队列后，追加一个**纯展示排序**步骤。
不影响 SRS 调度逻辑，只改变卡片呈现顺序。

### 难度计分（综合指标）
```js
function difficultyScore(srsState) {
  // ef 越低越难 → 反转：2.5 - ef（范围约 0~1.2）
  const efScore = 2.5 - (srsState.ease_factor || 2.5);
  // lapses 归一化（假设上限 20）
  const lapseScore = Math.min(srsState.lapses || 0, 20) / 20;
  // stage bonus：relearning 最难
  const stageBonus = srsState.srs_stage === 'relearning' ? 0.5 : 0;
  return efScore + lapseScore + stageBonus;
}
```

### 穹顶曲线排列
```js
function applyEasyHardEasyCurve(queue) {
  if (queue.length < 4) return queue; // 太短无意义
  // 按难度升序（简单→困难）
  const sorted = [...queue].sort((a, b) =>
    difficultyScore(a._srsState) - difficultyScore(b._srsState)
  );
  // 交错填入：简单的放头尾，难的放中间
  const result = new Array(sorted.length);
  let lo = 0, hi = sorted.length - 1;
  for (let i = 0; i < sorted.length; i++) {
    if (i % 2 === 0) result[lo++] = sorted[i]; // 容易的放前段
    else result[hi--] = sorted[i];              // 稍难的放后段
  }
  return result;
}
// 最终效果：头部=最容易，尾部=次容易，中间=最难
```

## 参数设计

```js
SRS_CONFIG.session_order: "srs" | "easy_hard_easy" | "random"
// 默认 "srs"（现有行为）
```

改动位置：buildSessionQueue 末尾，queue 组装后、return 前插入约 10 行。

## 风险评估

| 风险 | 等级 | 说明 |
|------|------|------|
| 破坏 SRS 调度 | 无 | 仅改呈现顺序，调度逻辑不变 |
| 影响每日进度统计 | 无 | reviewed_today 按答题记录，与顺序无关 |
| 小队列效果差 | 低 | <4 张卡时直接跳过排序 |
| 新卡无 ef 数据 | 低 | ef 默认 2.5，归为"容易"，新卡偏向头部出现 |
| 与 relearning 混合时语义模糊 | 低 | relearning 加 stageBonus 后自然落入中间位置 |

## Bug：首页到期但练习队列为空（2026-05-20）

**现象**: 测试账号首页显示「蔬菜水果」牌组到期 2 张，点击开始练习弹窗"今日完成"。

**根因**: `copy_mom_cardstates_config` 迁移（2026-05-12）把妈妈账号的全部 `sync_card_states` 复制到测试账号，其中包含 `cloud_01edbdfd::b04` 和 `cloud_01edbdfd::b06`。但这两个卡片（b04/b06）不在蔬菜水果牌组中（属于 `__builtin_test__`）。`getDeckStatsSrs` 遍历 CardState 不做牌组成员校验 → 虚高到期 2；`applyNormalMode` 遍历 DECKS 卡片 → 队列为空。

**核心问题**: `getDeckStatsSrs` 和队列构造器（`applyNormalMode`/`buildSessionQueue`）使用了不同的数据源和过滤逻辑：

| 位置 | 遍历对象 | 到期条件 |
|------|---------|---------|
| `getDeckStatsSrs` | CardState（含孤儿） | `!s.due_date \|\| s.due_date <= today` |
| `applyNormalMode` | DECKS 卡片 | `s.due_date && s.due_date <= today` |

**简单修复** (已实施): `getDeckStatsSrs` 增加牌组成员校验 — 跳过 `card_id` 不在 `DECKS[deckKey]` 中的 CardState。

**复杂方案** (已存档): 提取共享 `isCardDue()` 函数，统一所有到期判断。见 `C:\Users\chenl\.claude\plans\hidden-herding-sparkle.md`。

## Bug：到期1但练习队列为空（生姜，2026-05-21）

**现象**: iPhone 上「蔬菜水果」牌组显示到期 1（生姜），点击开始进入「今日完成」（空队列）。手动同步后恢复正常（仍显示到期 1，可以练习）。

**已知云端状态**: `review`、`due_date = 2026-05-21`、`due_ts = 0`、`lapses_streak = 2`。最后一条 trial 是 2026-05-17（v4.11.1，learning→review，good）。2026-05-17 之后无 trial 上传。

**根因假设**: iPhone 本地在 2026-05-17 之后又答了生姜（again），进入 relearning 但 due_ts 写成 0（异常状态），trial 未上传。导致：
- `getDueCount`（line 3158）：`!s.due_ts` = true → 计入到期 ✓  
- `buildSessionQueue`（line 3053）：`s.due_ts && ...` → 0 是 falsy → 排除 ✗  
- 结果：主页到期 1，队列为空

**现有兜底**（line 3021）：`buildSessionQueue` 内有修复循环，对 learning/relearning 的 `due_ts=0` 设为 1。但此次未能生效，原因不明。

**同步修复原理**: 云端 review 状态覆盖了本地的坏 relearning 状态，恢复正常。

**下次复现时的排查步骤**:
1. Safari 远程调试 iPhone，打开 F12 控制台
2. 执行 `_dailyRemovedToday`（看生姜的 state_key 是否在里面）
3. 查 IndexedDB `yihai_srs v5` → `card_states` 表，找 `7584cdf5`，记录 `srs_stage`、`due_ts`、`lapses_streak`
4. 查看修复循环（line 3021）是否有执行到（加临时 console.log）
5. 确认本地 trial 是否有未上传的生姜记录（IndexedDB `trials` 表）

**相关卡片**: card_id `7584cdf5`，deck_key `cloud_01edbdfd`（蔬菜水果）

## 跨设备 CardState 冲突风险（2026-05-21）

**结论：单设备下数据一致，跨设备同时离线练习存在覆盖风险。**

### 单设备（正常）

答题时 `local.updated_at = Date.now()`（在 `saveCardState` 内赋值），比同一次答题的 `trial.timestamp` 稍晚。
同步时：触发器用 `trial.timestamp` 更新 `cloud.updated_at`，下载合并时 `cloud.updated_at < local.updated_at` → 本地赢，离线练习不被覆盖。✓

### 跨设备冲突（风险）

同一张卡在 iPhone（T1）和 PC（T2，T2 > T1）各有离线练习，PC 先同步：

1. PC 同步：`cloud.updated_at = T2`
2. iPhone 后同步：上传 trial（timestamp=T1）→ 触发器 WHERE T1 < T2 → 不更新云端
3. 下载合并：`cloud.updated_at`（T2）> `local.updated_at`（T1）→ 云端覆盖 iPhone 本地 → **iPhone 离线练习丢失**

### 根因

触发器和 App 合并逻辑都用**绝对时间戳**比较，无法感知"哪个是更晚的答题行为"。Anki 的正确做法是按 trial 时间线重放或取最大 interval。

### 当前影响

患者通常单设备（iPhone）使用，冲突概率极低，暂可接受。
若未来支持多设备并发使用同一账号，需设计合并策略（如：取最大 interval，或按 trial 时间线重放）。

**关联 issue**：无（暂不修复，记录在案）

## 刷新页面退出登录 — 历史修改汇总（2026-05-20）

**全部 27 个相关 commit**，跨度 20 天。核心时间线：

| 版本 | 修复内容 | 关键变更 |
|------|---------|---------|
| v4.9.3→v4.9.5 | SDK 就绪竞态 | 200ms 轮询 + DOMContentLoaded + 显式 `auth.storage=localStorage` |
| v4.9.9→v4.9.12 | 登出清理 | 先上传后清除 → 仅清云数据保留本地 → 异步 clear 修复 |
| v4.10.0 | 登出保留数据 | IDB v4→v5 + user_id 多用户隔离 |
| v4.10.1 | 多级兜底 | restoreCloudSession 3 级恢复 + 诊断工具集 |
| v4.11.2 | token 过期 | sbKey 修正 + 过期 token 测试 |
| v4.11.4 | 离线→登录 | 离线 CardState 迁移保留 |
| v4.11.9 | netFail 翻转 | 仅 400+ 凭证无效才登出 |

**当前 v4.11.11 残余问题**:

1. **`createClient` 缺少 `auth.storage` 显式配置** — v4.9.5 加的配置在后来的重构中丢失
2. **未使用 `onAuthStateChange`** — 完全依赖手动恢复，缺少 SDK 级事件监听
3. **Level 1 `getSession()` 不区分网络错误 vs 无 session**
4. **三个 `createClient` 调用不一致**（1763/1828/1880 行）

**测试覆盖**: 6 套 Playwright 测试覆盖了基础刷新恢复、过期 token、版本更新、离线→登录、登出数据保留等场景，全部通过。
