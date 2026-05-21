# Admin 日志查询功能设计

**日期：** 2026-05-22  
**文件：** `yihai_admin_v1.html`  
**状态：** 已批准，待实现

---

## 背景

管理看板目前可在「患者详情 → 月历」Tab 查看某患者某天的答题流水，但无法跨天查询，也无法查看 `app_events`（登录、同步、错误诊断日志）。需要新增一个集中的日志查询 Tab。

---

## 范围

- 仅支持**指定单个患者**查询（在患者详情面板内）
- 时段：快捷按钮（今天 / 近 7 天 / 近 30 天）
- 两类日志：答题记录（`sync_trials`）和应用事件（`app_events`），Tab 内切换开关
- 每次返回最多 200 条，倒序排列

---

## 架构

```
管理员点患者 → 详情面板 → 切「日志」子 Tab
  切「答题记录」→ callEdgeFunction('get-patient-calendar', { userId, days })
  切「应用事件」→ callEdgeFunction('get-patient-events', { userId, days })
```

### 组件清单

| 组件 | 类型 | 说明 |
|------|------|------|
| `get-patient-calendar/index.ts` | 扩展 | 新增 `days` 查询路径，返回跨天答题流水 |
| `get-patient-events/index.ts` | 新建 | 查询 `app_events` 表 |
| `yihai_admin_v1.html` | 修改 | 新增「日志」子 Tab + 渲染函数 |

---

## Edge Function 接口

### 扩展：`get-patient-calendar`

新增分支：当请求体包含 `days`（且不含 `year`/`month`/`date`）时走新路径：

```ts
// 请求：{ userId: string, days: 1 | 7 | 30 }
// 响应：{ trials: TrialRecord[] }
// 查询：sync_trials WHERE user_id=? AND trial_date >= today-N days
//        ORDER BY timestamp DESC LIMIT 200
```

复用现有 `TrialRecord` 接口（`trialId, cardId, cardName, deckKey, rating, isCorrect, responseTimeMs, srsStageBefore, srsStageAfter, timestamp`）。

### 新建：`get-patient-events`

```ts
// 请求：{ userId: string, days: 1 | 7 | 30 }
// 响应：{ events: EventRecord[] }
// 查询：app_events WHERE user_id=? AND timestamp >= epoch(today-N days)
//        ORDER BY timestamp DESC LIMIT 200
```

`EventRecord` 字段：
```ts
{
  eventId: string;
  eventType: string;
  deckKey: string;
  payload: Record<string, unknown>;
  deviceId: string;
  timestamp: number;
}
```

两个函数均复用 `requireAdmin()` 鉴权（与其他 8 个函数保持一致）。

---

## UI 布局

### 子 Tab 入口

```
[概览] [月历] [卡牌状态] [参数配置] [日志]
```

### 「日志」Tab 内结构

```
┌────────────────────────────────────────────┐
│ [答题记录]  [应用事件]    ← 切换按钮         │
│ [今天] [近7天] [近30天]  ← 时段快捷按钮      │
├────────────────────────────────────────────┤
│ 共 N 条                                     │
│                                            │
│ 答题记录表格：                               │
│ 时间 | 卡片名称 | 评分 | 响应时间 | 阶段变化  │
│ ...                                        │
│                                            │
│ 应用事件表格（切换后显示）：                  │
│ 时间 | 事件类型 | 牌组 | payload 摘要(≤80字符) │
│ ...                                        │
└────────────────────────────────────────────┘
```

### 应用事件 badge 颜色规则

| 事件类型前缀 | badge 样式 |
|------------|-----------|
| `login` / `logout` | `badge-primary`（蓝） |
| `sync_*` | `badge-success`（绿） |
| `log:warn` | `badge-warning`（黄） |
| `log:error` | `badge-danger`（红） |
| 其他 | 默认灰色 |

---

## 前端状态变量

```js
let _logSubType = 'trials';   // 'trials' | 'events'
let _logDays = 7;             // 1 | 7 | 30
```

切换 `_logSubType` 或 `_logDays` 时重新调接口并渲染。

---

## 错误处理

- 接口失败：显示 `errorState()` + 重试按钮（与其他 Tab 一致）
- 0 条结果：显示 `emptyState('该时段无日志')`

---

## 不在范围内

- 跨患者日志查询
- 自定义日期区间
- 日志导出（CSV/JSON）
- `card_state_log` 表（已废弃）
