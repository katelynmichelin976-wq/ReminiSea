# 管理看板 v2 全新设计

**日期**：2026-06-14
**作者**：zyhacl@gmail.com
**状态**：spec
**主题**：废弃 v1 admin（医生/家属监控定位），重设计为单人运营驾驶舱

---

## 1. 背景

v1 admin（`yihai_admin_v1.html`，5.x 多次迭代）定位为「医生 / 家属监控平台」，三大顶层 tab（概览 / 患者 / 卡片）+ 用户详情 5 子 tab（概览 / 月历 / 卡牌状态 / 参数配置 / 日志）。

主 app 已在 v5.x 系列清理医疗术语；admin 仍保留旧定位。同时实际使用中，三大顶层 tab "都不怎么看，不是运营要的"——v1 信息架构对当前运营场景失配。

本次重设计目的：把 admin 从「临床监控工具」转为「单人产品/运营驾驶舱」。

## 2. 目标用户与场景

**唯一用户**：你（产品 / 运营 owner，zyhacl@gmail.com）

**核心场景**：
- 打开看板，一眼掌握四要素：增长活跃 / 系统健康 / 用户反馈 / 内容运营
- 不查个人用户数据（隐私）
- 不在看板里改任何数据（纯只读，所有 mutate 走 SQL / GitHub）

**非目标**：
- 多管理员 / 多角色 / 客服工单流程
- 家属或医生远程监护单个用户
- 实时大屏（不需要持续轮询）

## 3. 信息架构

单页 Bento Grid 全览，无导航分页。

```
┌─────────────────────────────────────────────────┐
│ 忆海拾光 · 运营  [24h|7d|30d]  🔄  zyhacl  退出 │
├──────────────────────┬──────────────────────────┤
│   ① 增长 / 活跃      │   ② 系统健康              │
│   KPI strip (4)      │   KPI strip (4)           │
│   迷你折线           │   错误列表 top5            │
│   [展开 →]            │   [展开 →]                │
├──────────────────────┼──────────────────────────┤
│   ③ 反馈收件箱        │   ④ 内容运营              │
│   KPI strip (4)      │   KPI strip (4)           │
│   最近 5 条           │   精选 top5 + 个人 top5    │
│   [展开 →]            │   [展开 →]                │
└─────────────────────────────────────────────────┘
```

- 桌面 ≥1024px：2×2 网格
- 移动 <768px：四象限纵向 stack；时间窗收为下拉
- 点 `[展开 →]` 弹右侧 60vw 抽屉，懒加载该象限趋势图

**刷新策略**：默认不自动刷新；顶栏 🔄 手动；时间窗切换触发刷新。理由：自用、非值班场景，不浪费带宽。

## 4. 四象限内容定义

### 4.1 象限 ① 增长 / 活跃

**KPI strip**
- DAU（窗口内日均活跃用户）
- 新增用户数
- 累计答题数
- 留存率（7d 窗口显示 D7，30d 窗口显示 D30；24h 窗口该 KPI 显示「—」并附 tooltip "需 ≥7d 窗口"）

**迷你图**：DAU 单线折线（逐日）

**抽屉**
- DAU / WAU / MAU 三线叠加
- 新增注册日柱状
- 留存 cohort 热力网格（按注册周分桶，D1 / D7 / D30）
- 答题量按小时段堆叠（识别高峰时段）
- 版本分布饼图（`app_events.app_version` 去重计数）

**数据源**
- `sync_trials`：DAU/WAU/MAU 按 ts 分桶 + distinct uid；留存自连接
- `auth.users.created_at`：新增注册
- `app_events.app_version`：版本分布

**口径**
- 活跃 = 当日有 ≥1 条 `sync_trials`
- 时间窗 = 最近 N 天，含今天
- 测试账号（chenlian@263.net / zyhaff@gmail.com / zyhacl@gmail.com）默认包含

### 4.2 象限 ② 系统健康

**KPI strip**
- JS 错误数（event_type='js_error'）
- 影响用户数（去重 uid）
- session 异常次数（event_type ∈ {`session_restore_l1_fail`, `session_restore_l3_fail`, `session_restore_l1_timeout`, `session_restore_sdk_signout`, `session_restore_l2_real_logout`}）
- 错误率‰（js_error 事件 / 总事件 × 1000）

**迷你图**：错误聚合 top5 列表（message 前 60 字 + 出现次数 + 受影响 uid 数）

**抽屉**
- 错误时间序列按小时柱状（js_error + session 异常 双线）
- 错误聚合表：error_message · 首次 · 最后 · 次数 · 影响用户数 · 涉及版本（可排序）
- session 异常事件类型分布饼图（按 event_type 拆分上述五种）
- 版本健康度对比：每个 app_version 错误率排名

**数据源**
- `app_events` 表（v5.13.11 已落 JS error 上报；30 天内 js_error 暂为 0 条，KPI 显示 0 即可）
- event_type='js_error' 含 message / stack / url / line（在 `payload` jsonb 中）
- session 异常：上述 5 类 event_type 并集

**口径**
- 错误去重：`payload->>'message'` 前 200 字符算同一类
- 影响用户：去重 `app_events.user_id`
- 版本聚合：取 `payload->>'app_version'`（**app_events 顶层无 app_version 列**）

### 4.3 象限 ③ 反馈收件箱

**KPI strip**
- 未读反馈数（时间窗内）
- 总反馈数
- 含诊断数据数（diagnostics 非空）
- 不同设备数（去重 `device_id`）

**迷你图**：最近 5 条列表（时间 · device_id 前 8 位 · feedback_type · 正文前 60 字 · 版本）

**抽屉**
- 全量列表：分页 20 条/页，按 `created_at` 倒序
- 行展开：完整 `user_desc` + `diagnostics` jsonb 美化展示（含 sync_enabled / last_sync_ts / events / logs 等）
- 简单文本搜索（前端 filter 正文）
- 关键词频率 top 20（中文 2-gram，简单频率统计）

**数据源**
- `feedback` 表
- 字段：`id` / `created_at` / `app_version` / `feedback_type` / `user_desc` / `device_id` / `locale` / `device_info` / `diagnostics`
- ⚠️ feedback 表**无 `user_id` 顶层列**，因此用 `device_id` 做"用户"维度
- ⚠️ feedback 表**无截图字段**，本象限不需要 `sign-private-url`

**只读约束**
- 不提供 "标记已读 / 已处理" 按钮（用户已明确纯只读）
- "未读" = 你上次打开 admin 之后的；用本地 `localStorage.lastSeenFeedbackTs` 记录

### 4.4 象限 ④ 内容运营（牌组使用热度）

> 注：云端 schema 不存在「精选」标记和「订阅」表，订阅概念仅在客户端 IDB。本象限改用「云端可见的牌组使用热度」作为内容运营的数据视角。

**KPI strip**
- 牌组总数（preset + personal）
- 活跃 deck 数（窗口内有 trials 的不同 `deck_key`）
- personal owner 数（去重 `decks.user_id` 且 `deck_type='personal'`）
- 窗口内新建 personal 牌组数（`decks.created_at` ≥ 窗口起点）

**迷你图**：窗口内 trials 量 top5（每行：deck 名称 · trials · 不同用户数）
- 牌组名按 `deck_key` 关联 `decks.name`；找不到关联（如 `__builtin_test__`）显示原 key

**抽屉**
- 全量牌组使用排行表（按 trials 降序）：deck_key · name · type(preset/personal/unknown) · trials · users · 当前 owner（personal 时显示）· created_at
- personal owner 牌组数分布直方图（每个 owner 拥有几个 personal 牌组）
- personal 牌组卡片数分布直方图（0 / 1-4 / 5-19 / 20-49 / 50+）

**数据源**
- `decks`：`id` / `user_id` / `name` / `deck_type` / `card_count` / `created_at`
- `deck_cards`：用于卡片数核对（按需）
- `sync_trials`：`deck_key` + `user_id` + `trial_date` 聚合热度
- ⚠️ `decks.name` 字段名是 `name` 不是 `title`
- ⚠️ `deck_type` 实际值仅 `'preset'` / `'personal'`；无 featured 概念

**口径**
- 活跃 deck = 窗口内 sync_trials 至少 1 条
- 测试 deck_key（如 `__builtin_test__`）不剔除，与测试用户一致策略

## 5. 数据层 / Edge Functions

### 5.1 新增

**`get-admin-overview(timeWindow)`**
- 入参：`timeWindow ∈ {'24h', '7d', '30d'}`
- 一次返回四象限 KPI strip + 卡片内迷你图所需数据
- 内部按 `(timeWindow, asOfMinute)` memoize 60s
- 返回结构：
  ```json
  {
    "ok": true,
    "asOf": "2026-06-14T08:00:00Z",
    "timeWindow": "7d",
    "growth": { "kpi": {...}, "miniChart": [...] },
    "health": { "kpi": {...}, "topErrors": [...] },
    "feedback": { "kpi": {...}, "recent": [...] },
    "content": { "kpi": {...}, "topDecks": [...] }
  }
  ```
- 错误处理：单象限 SQL 失败时，该象限 `{ ok: false, error: "..." }`，其他象限照常返回

**`get-admin-trend(quadrant, timeWindow)`**
- 入参：`quadrant ∈ {'growth', 'health', 'feedback', 'content'}`
- 懒加载抽屉趋势数据

### 5.2 保留

- `admin-auth-check`：v2 沿用，不改

### 5.3 废弃（v2 上线 1–2 周确认后删除）

9 个：`get-dashboard-summary` · `get-patients-list` · `get-patient-detail` · `get-patient-calendar` · `get-patient-card-states` · `get-patient-config` · `get-patient-events` · `get-card-difficulty` · `sign-private-url`（feedback 无截图字段，v2 不再需要）

## 6. 前端实现要点

- 新文件 `yihai_admin_v2.html`，单 HTML 内联 CSS/JS，沿用 v1 风格
- `ADMIN_VERSION='2.0.0'` 独立常量，与主 app `APP_VERSION` 解耦
- 图表库：Chart.js CDN（v1 已用，复用）
- 时间窗用 URL hash 持久化（`#tw=7d`），刷新页面不丢
- 抽屉：单一 panel 容器，按 `quadrant` 切换内容；同一时刻只有一个抽屉打开
- 无数据空态：每象限独立空态卡 + 红色错误条降级
- 命名遵循 `docs/naming_convention.md`：JS camelCase，DB snake_case

## 7. 测试策略

**Edge Function 自检**
- 用 Supabase MCP 在 prod 跑 `get-admin-overview` 各 timeWindow，肉眼校验四象限数字与已知用户数 / 反馈数一致

**Playwright 冒烟** `tests/_pw_admin_v2.js`（新增）
- 登录 → 四象限 KPI strip 渲染
- 时间窗切换触发 fetch + 数字变化
- 反馈抽屉打开 → 列表渲染（不再测截图签名链接）
- 非 admin 账号被 admin-auth-check 拦
- ~15 断言，需登录（zyhacl@gmail.com）

**v1 回归**：不跑（v1 不再维护）

## 8. 迁移与发布

**阶段 1：并行**
- v2 文件 + 2 个新 Edge Functions 上线
- v1 保留作回滚兜底
- 复用 admin-auth-check 不动

**阶段 2：自用验证（1–2 周）**
- 你日常用 v2
- 遇坑回滚 v1

**阶段 3：清理**
- 删 `yihai_admin_v1.html`
- `supabase functions delete` 删 9 个废弃 Function
- 更新 `CLAUDE.md` admin 文件名引用

**版本控制**：v2 独立 `ADMIN_VERSION` 常量，与 `APP_VERSION` 解耦。v2 自身的迭代不需要随主 app 发布。

## 9. 范围外（明确不做）

- 多角色权限 / 客服工单
- 写操作（标记反馈已读、发布精选牌组、推送公告等）
- 实时推送 / WebSocket
- 个人用户钻入查询
- 用户搜索 / 用户列表
- 月历热力图（删除 v1 的 calendar）
- 卡牌状态远程查询（删除 v1 的 cardstates / config）

## 10. 风险与开放问题

**已知风险**
- `app_events` 表数据量（9927 行 / 已积累）：随用户增长，错误聚合查询可能变慢。监控查询时长，必要时加 `event_type + timestamp` 复合索引
- `js_error` 事件目前 30 天内为 0 条（v5.13.11 刚发布）：KPI 显示 0 是正确状态，但要注意区分"上报失败"和"真无错误"

**Phase 0 已确认**（不再是开放问题）
- 反馈表无 `user_id` 列，用 `device_id`；无截图字段，砍 sign-private-url
- 牌组表无 `is_featured`，无 `deck_subscriptions` 表，象限 ④ 改为「牌组使用热度」
- `app_events.app_version` 在 `payload` jsonb 内
- session 异常事件类型并集已枚举（5 个）
- `decks.name`（不是 `title`）
