# Anki 开发模式参考

从 [ankitects/anki](https://github.com/ankitects/anki) v25.09.2 源码分析提炼，供忆海拾光 v5.0 及后续版本参考借鉴。

---

## 1. 调度器设计

### 1.1 显式状态机

Anki 将卡片状态建模为代数类型（Rust enum），而非散落的 if-else：

```
NewState → LearnState → ReviewState (graduated)
                ↑ good (regraduate)
           RelearnState
ReviewState → again → RelearnState
```

每种状态都有 `next_states()` 方法，根据按钮（Again/Hard/Good/Easy）返回下一状态。**没有巨型 switch 语句**，每个状态自己知道如何转换。

**对忆海拾光的启示**：当前 `processAnswer` 已经是一个 ~300 行的纯函数，内部有清晰的状态分支。v5.0 可以将其重构为显式的状态类/模块，每种状态自包含转换逻辑，便于单元测试。

### 1.2 学习步进管道

Anki 的学习步进是一个数组（如 `[1min, 10min, 30min]`），用 `remaining_steps` 计数器追踪位置：

- **Again**：回到 `steps[0]`，重置 `remaining_steps = steps.len()`
- **Good**：前进到 `steps[len - remaining_steps + 1]`，`remaining_steps--`
- **Hard**：停留在当前步骤（首次用平均值，后续不变）
- 当所有步骤消耗完毕 → **毕业**进入 Review

忆海拾光当前的实现与 Anki 完全一致：`learning_steps: [1, 10]` 分钟，`step_index` 递增直到全部消耗完毕 → 毕业。四个按钮（again/hard/good/easy）也均已支持。

### 1.3 间隔公式（与标准 SM-2 的关键差异）

Anki 和忆海拾光**都不是**标准 SM-2。标准 SM-2：
```
EF' = EF + (0.1 - (5-q)*(0.08+(5-q)*0.02))
I(n) = I(n-1) * EF
```

Anki 的公式：
```rust
// Hard:  当前间隔 * 1.2
// Good:  (当前间隔 + 迟到天数/2) * ease_factor
// Easy:  (当前间隔 + 迟到天数) * ease_factor * 1.3
```

两个项目**都已对齐**：
- **Ease factor 用固定增量调整**（Again -0.20, Hard -0.15, Easy +0.15），而非二次公式
- **最低 ease 限制**：1.3

**仍有的差异**：
- **迟到天数加成**：Anki 有 `days_late / 2` 加成，忆海拾光当前缺少此项
- **提前复习惩罚**：Anki 区分 `passing_nonearly_review_intervals` 和 `passing_early_review_intervals`，忆海拾光未区分

### 1.4 防聚集机制

Anki 有两层防聚集：

1. **Fuzz（模糊化）**：用 `card_id + reps` 作为确定性种子生成 ±15% 随机偏移。确定性意味着 undo/redo 不会产生不同结果。
2. **Load Balancer（负载均衡）**：更高级的替代方案，考虑每天已有卡片数 + "轻松日"配置 + 同笔记卡片分散。

忆海拾光当前没有 fuzz。所有同天毕业的卡片会在同一天到期，造成"波峰"。建议 v5.0 加入确定性 fuzz。

### 1.5 日内 vs 跨日学习

Anki 将学习卡片分为两种：
- **日内学习**（intraday）：due 是秒级时间戳，在 `Learn` 队列
- **跨日学习**（interday）：due 是天数偏移，在 `DayLearn` 队列

当学习步骤超过日界线时，自动从秒级转换为天级。这避免了"凌晨 3 点提醒复习"的问题。

**日界线可配置**（默认凌晨 4:00），晚睡用户的复习仍算当天。

---

## 2. 同步协议

### 2.1 三层同步管道

Anki 的 `normal_sync()` 流程：

```
1. 交换删除记录（graves）      → 先删后增，避免复活已删数据
2. 交换元数据（牌组/配置/标签） → 结构先于内容
3. 分块交换卡片/笔记数据       → 大数据量时避免单次请求超时
4. 完整性校验                  → 比对计数，不一致则回退到全量同步
5. 提交                        → 更新时间戳和 USN
```

**对忆海拾光的启示**：当前 syncAll 是一次性拉取全部数据。如果未来卡片量增长（>1000），应引入分页/游标同步。

### 2.2 冲突解决：Last-Writer-Wins

Anki 的冲突解决极其简单有效：

```rust
// 每条记录比较 mtime_secs，新的覆盖旧的
if server_record.mtime >= local_record.mtime {
    接受服务端版本
} else {
    保留本地版本
}
```

没有 CRDT，没有向量时钟，没有三方合并。原因：同一张卡同时在两台设备上被修改的概率极低。

忆海拾光当前也是类似逻辑（`updated_at` 时间戳比较），方向正确。

### 2.3 全量同步作为逃生舱

当正常同步无法进行（schema 不匹配、校验失败、数据损坏）时，Anki 回退到：
- **上传模式**：本地 → 服务端（禁止空库覆盖非空库）
- **下载模式**：服务端 → 本地（禁止空库覆盖非空库）

忆海拾光当前没有全量同步逃生舱。v5.0 可考虑在"数据不一致"时提供"以本地为准"或"以云端为准"的选项。

### 2.4 同步版本协商

Anki 客户端声明支持的协议版本（v8-v11），服务端验证后选择兼容版本。这允许服务端逐步升级协议而不破坏旧客户端。

---

## 3. 架构模式

### 3.1 三层分离：薄封装 + 厚核心

```
Svelte/TS (前端) → Python (薄封装) → Rust (核心逻辑)
```

- **Rust 从不向上调用** Python 或 Web
- **Python 是透传层**，不做业务逻辑
- **所有跨层契约由 protobuf 定义**，自动生成类型绑定

对忆海拾光的启示（v5.0 uni-app）：
- **CloudBase 云函数** = 权威业务逻辑层（相当于 Rust）
- **uni-app 客户端** = 展示层（相当于 Svelte）
- **共享类型定义**（TypeScript interface）= 契约层（相当于 protobuf）

关键原则：**客户端不应包含可被绕过的业务逻辑**。所有数据校验和 SRS 计算都应在云函数中有一份权威实现。

### 3.2 牌组树：扁平存储 + 即时构建

Anki 存储牌组为 `(id, name)` 平铺列表，`::` 作为层级分隔符。树结构在读取时动态构建：

```
存储: ["语文", "语文::古诗", "语文::古诗::唐诗", "数学"]
构建: 语文/
       ├── 古诗/
       │   └── 唐诗/
       数学/
```

重命名父牌组时，自动更新所有子牌组名称（替换前缀）。

忆海拾光当前是扁平牌组（`DECKS[deckKey]` 数组），不涉及层级。v5.0 如需牌组分类，此模式可用。

---

## 4. 测试策略

### 4.1 分层测试

| 层级 | Anki 做法 | 忆海拾光当前 |
|------|----------|-------------|
| 纯逻辑（SRS/解析器） | Rust inline `#[cfg(test)]` | Node.js 单测（`srs_test.js` 等） |
| 集成（DB/API） | Python pytest 连接真实 SQLite | Playwright 浏览器测试 |
| UI 交互 | 极少，无 Playwright/Cypress | Playwright 回归测试（22+ 断言） |

Anki 的哲学：**在合适的层测试**。不写 UI 测试测业务逻辑，不用重量级集成测试测纯函数。

忆海拾光当前做法已对齐此原则。v5.0 建议保持：SRS 纯逻辑 → vitest/jest 单测，云函数 → 集成测试，uni-app 页面 → 手动 + 截图对比。

### 4.2 测试基础设施

Anki 的 Rust 测试使用 **Builder 模式** 创建测试数据：

```rust
NoteAdder::basic(&mut col)
    .fields(&["front", "back"])
    .deck(deck_id)
    .add(&mut col);
```

Python 测试使用 **母版快照** 技术——创建一次完整 collection，`shutil.copy` 给每个测试。创建开销只在第一次产生。

忆海拾光当前测试使用固定的 `.yhspack` 文件 + 固定的 Supabase 测试账号。v5.0 可考虑 Builder 模式简化测试数据构造。

### 4.3 统一测试入口

Anki 用 `./ninja check` 运行所有测试（Rust + Python + TypeScript + lint）。开发者不需要知道每个框架的具体命令。

对忆海拾光的启示：当前 `npm test` 或手动逐个运行。可考虑一个统一的 `npm test` 脚本串联所有测试文件。

### 4.4 时间敏感的测试处理

Anki 的 Python 测试在凌晨 2-4 点之间会**偏移时钟**，避免日界线附近的测试不稳定。同时使用 `@errorsAfterMidnight` 装饰器标记已知在该时段会失败的测试。

---

## 5. AI 辅助开发策略

### 5.1 Anki 的 AI 政策

来自 `docs/contributing.md`：

> AI 辅助贡献**允许但严格有条件**：贡献者必须理解每一处改动并能解释它。未经人工审核的 PR（重复逻辑、无关代码、注释不匹配）将被直接关闭。

核心原则：**问责在人，不在禁止工具**。

### 5.2 Anki 的 CLAUDE.md 风格

87 行，极其紧凑。只包含：
- 项目拓扑（多层架构一句话）
- 构建命令（`./check`）
- 关键约定（protobuf、翻译、错误处理）
- 忽略目录

**不包含**：版本历史、测试用例数、架构教程、代码风格大全。

忆海拾光当前的 CLAUDE.md（~220 行）已往这个方向精简过，但仍有优化空间。

---

## 6. 可直接借鉴的具体改进

| 优先级 | 改进项 | 来源 | 说明 |
|--------|--------|------|------|
| 高 | 迟到天数加成 | §1.3 | Good = (interval + days_late/2) × ease；解决间断用户积压循环 |
| 中 | 提前复习惩罚 | §1.3 | 到期日前复习不增加间隔，防止突击刷间隔 |
| 中 | 确定性 fuzz | §1.4 | 避免卡片聚集，种子用 card_id + reps |
| 中 | 分页同步 | §2.1 | 卡片量 >500 时避免单次请求过大 |
| 中 | 全量同步逃生舱 | §2.3 | 数据不一致时提供手动修复选项 |
| 低 | 牌组层级 | §3.2 | `::` 分隔符 + 扁平存储 + 即时构建树 |
| 低 | 统一测试入口 | §4.3 | 单命令 `npm test` 串联所有测试 |
| — | ~~Ease factor 固定增量~~ | — | **已实现**（Again -0.20, Hard -0.15, Easy +0.15） |
| — | ~~多步学习管道~~ | — | **已实现**（learning_steps + relearning_steps） |
| — | ~~四按钮评级~~ | — | **已实现**（again/hard/good/easy） |
| — | ~~Leech 检测~~ | — | **已实现**（daily_remove_lapses=3, auto_suspend_lapses=8） |

---

## 7. 不应照搬的部分

| 模式 | 原因 |
|------|------|
| Rust 后端 | 忆海拾光 v5.0 用 CloudBase 云函数（Node.js），不需要 Rust |
| Protobuf 契约 | 过度工程。TypeScript 共享类型足够，除非多语言 |
| Ninja 构建系统 | 单文件 PWA / uni-app 不需要自定义构建系统 |
| PyQt GUI | 不相关。v5.0 是 uni-app（Vue）|
| 多语言 Fluent 翻译 | 当前只需中文，未来需要时再引入 |
| FSRS（自由间隔重复调度器） | 需要用户提供 retention rate，不适合认知训练患者群体 |
