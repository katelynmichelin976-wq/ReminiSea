# 忆海拾光 · 开发问答

> 开发过程中用户提出疑问或困惑的记录。默认用户已知的规则不在此记录。
> 每次迭代结束时与 `yihai_实现说明.md` 一起更新。

---

## v4.8 迭代（2026-05-05）

### Q1：并发下载的提速效果如何？稳定性怎样？

实测 16 张卡（约 11.4MB 媒体）从 Supabase 新加坡区下载：
- 串联：~82s（每次 await 一个文件，TLS 握手 ~350ms/文件）
- 3 路并发 + 卡内图音并行：**32.6s**，提速 ~2.5 倍

稳定性：每张卡内图音用 `.catch()` 包裹单个失败，不影响整体。`parallelMapLimit` 共享迭代器模式，不会出现竞争条件或超量并发。

### Q2：BOOL_KEYS 未定义的原因是什么？

`_loadSrsConfig()` 是 IIFE，内部 `const BOOL_KEYS` / `STR_KEYS` 作用域仅在 IIFE 内。v4.8 新增的 `cloudPushConfig()` 中引用了 `BOOL_KEYS` 和 `STR_KEYS`，运行时抛出 `ReferenceError`。

修复：在 `cloudPushConfig()` 内局部定义这两个数组（与其引用 IIFE 的 const，不如在各函数内局部定义更清晰——因为列表短且稳定）。

### Q3：为什么 settings 改成 bottom sheet 而不用独立页面？

保持单文件架构一致。bottom sheet (`#settings-overlay`) 是 CSS overlay，DOM 始终存在。5 个 Tab 通过 `switchTab(n)` 切换 `.sheet-panel` 的 display。关闭时自动触发 `cloudPushConfig()`。

### Q4：参数同步的防抖策略？

`debouncePushConfig()` — 每次设置变更清空旧定时器，500ms 后才 push。关设置面板时立即强制 push 一次（跳过防抖）。避免频繁操作时过多写入 sync_config。

## v4.7 迭代（2026-05-04）

### Q1：活跃时长算法是怎样的？

`recordCardTime()` 在每张卡答题后触发：
- 测量相邻两张卡的时间差（`now - _lastCardTs`）
- 若差值 ≤ `idle_threshold_sec`（默认 120s），累加到活跃时长
- 切后台（`visibilitychange → hidden`）时 `_lastCardTs = null`，切回来后不补计长间隔
- `render()` 中若 `_lastCardTs` 为 null（session 首卡 / 切回后首卡），初始化为 `_cardStartTs`，确保首卡时长计入（v4.9 修复）
- 活跃时长 ≈ 有效练习时间（排除发呆/切后台）

### Q2：今日统计的数据源是本地还是云端？时间范围？同步到设备上的记录是否有必要纳入？

- 数据源：纯本地（localStorage dailyProgress + IndexedDB TrialLog）
- 时间范围：当日 `YYYY-MM-DD`
- 不拉云端，统计是设备级的概念，混入其他设备的数据反而困惑
- 如需多设备汇总，应在云端独立做报表

### Q3：牌组首页显示的新卡数为什么不受 new_cards_per_day 参数限制？

**根因**：`getDeckStatsSrs()` 返回 `srs_stage === 'new'` 的全部基数（牌组剩余新卡总量），而 `new_cards_per_day` 只在 `buildSessionQueue` 中限制每日入队数。

**修复**：首页新卡数 = `min(总新卡数, new_cards_per_day - 今日已引入)`，即今日剩余可用新卡槽位。

关联代码：`getDeckStatsSrs()`，`buildSessionQueue()` 中 `newSlots` 计算逻辑。

### Q4：同步时机有哪些？同步如何看到进度？

同步触发时机：

| 时机 | 行为 | 显示 toast |
|------|------|-----------|
| 页面加载（会话恢复后） | 上传未同步 TrialLog + CardState，下载云端 CardState 合并 | 否 |
| 前台切回 | 同上 | 否 |
| 实时上传（学习中） | 每题答完立即上传，受 `_realtimeUpload` 开关控制 | 否 |
| 练习完成 | `backfillAfterPractice()` → `syncAll()` | 否 |
| 手动点击同步按钮 | `syncAll(deckKey, true)` | 是（"已是最新"或"上传 X · 下载 Y"） |
| 登录后 | `syncPendingData()` 补传 | 否 |

### Q5：为何今日已完成时，卡牌朗读仍被触发？

**调用链**：
```
startQuiz()
  → warmupSpeech()             ← 必须在用户手势内执行（iOS 解锁 TTS + Audio）
  → _launch('quiz')
    → buildSessionQueue() (async)
      → queue.length === 0
        → showFinish()
```

**根因**：`warmupSpeech()` 在异步队列构建前就执行了。虽然设 volume=0，部分 iOS 版本上 `SpeechSynthesis.speak()` 仍可能有短暂声响。

**修复**：将 `showScreen('screen-quiz')` 和 `requestWakeLock()` 移到非空队列分支，避免闪屏。`warmupSpeech()` 无法完全后移，因为 iOS 要求音频解锁必须在用户手势内。

### Q6：练习记录的信息是否足够服务端验证 SRS 算法？

TrialLog 记录了答前状态（`stage_before`、`interval_before`、`ease_before`）和 rating，服务端可重放 `processAnswer` 推算预期结果。但缺**答后状态**的记录。

**修复**：补充 `srs_stage_after`、`interval_after`、`ease_after`。

### Q7：统计页面「本次练习」和「今日引入新卡」的定位？

- 「本次练习」在完成页展示有意义（练习完看这一轮的成绩），统计页是冗余，去掉
- 「今日引入新卡」保留，归入今日统计区作为附属指标
- 统计核心改为以**今日统计**为主

### Q1（第二次）：统计分类：「一次过/困难/错误」按卡还是按记录？

**问题**：现在一次答错会减少选项，最终蒙对的正确率虚高（如"今日卡片 20, 答对 41, 答错 1, 98%"）。

**方案**：按卡粒度，取每张卡**当日首次评级**：
- **一次过**：首次答 good/easy
- **困难**：首次答 hard
- **错误**：首次答 again

为什么不是"最终状态"：learning/relearning 步长内会反复出现，取最终结果几乎所有卡都滑到一次过或困难，错误永远为 0，失去区分度。

### Q8：学习阶段为什么 hard 和 again 都会在同 session 重现？

**数据确认**（查询 sync_trials）：全部 cards 的 `srs_stage_before` 为 `new` 或 `learning`，属于学习阶段。

`processAnswer` 对 learning 阶段：
- again → step 归零，`due_ts = now + 1min`
- hard → 原地重复，`due_ts = now + 当前步 × 1.5`

两者都会在数分钟后重现。区别在内部状态：again 增加 lapses、step 归零；hard 不影响 lapses、step 不变。

如果硬要"hard 不再重现"，需要修改学习阶段算法，但与 Anki 标准行为不一致。确认保持当前行为，不修改。

### Q9：七天下图正确率无意义后改什么？

改为显示每天的练习卡片数。正确率属于旧按 trial 统计的产物，按卡首次评级后该指标不再有对应意义。

### Q10：统计文案改良好/重来？

确认：
- 一次过 → 良好
- 错误 → 重来
- 今日卡片 → 练习

### Q11：应用免费版策略规划

当前架构对免费/登录分层策略的支持度：

| 需求 | 当前支持 | 差距 |
|------|---------|------|
| 内置牌组离线练习 | builtin 标记已存在 | 需生成内置 Emoji 牌组 |
| 练习上传 + 分析 | sync 层就绪 | 缺云端分析界面 |
| 制卡 + 导入导出 | index_v49 独立 HTML | 需整合进主 App（暂不启动） |
| 多设备同步 | device_id 已设计 | CardState 合并策略需加固 |
| AI 训练建议 | 无 | 需基于 sync_trials 的分析层 |
| 未来卡牌类型 | question_type: T1 硬编码 | 需卡牌类型系统 |
| 卡牌数据管理 | deck_manager_v1 已实现 | — |

核心策略：媒体数据是成本大头，免费版不存媒体到云端。.yhspack 社区传播模式避开了服务器存储成本。**制卡和练习 App UI 差距较大**，先各自迭代功能再考虑合并。
