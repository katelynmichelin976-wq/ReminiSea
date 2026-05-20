# 忆海拾光 变更记录（CLAUDE 参考）

v4.9.1–v4.10.0 详细变更，供 AI 理解版本演进的上下文。用户面向的版本历史见 `docs/忆海拾光_训练App_README.md`。

## v4.11.14 Key Changes

- **session backup**: Supabase SDK 检测到 refresh token 过期（`refresh_token_not_found` / 400）后会自动清除 localStorage 的 sb-xxx-auth-token，导致下次页面加载时 `restoreCloudSession` 三级恢复全部跳过。新增自有备份 key `yihai_session_backup`，在 `restoreCloudSession`（Level 1/2/3 成功）、`doCloudLogin`、`onAuthStateChange TOKEN_REFRESHED` 各成功路径写入；`restoreCloudSession` 先读 SDK key，找不到时读自有备份；`doCloudLogout` 同时清除备份。

## v4.11.13 Key Changes

- **session restore 诊断日志**: 在 restoreCloudSession 每级失败/成功路径写入 app_events（session_restore_l1_ok/fail、l2_ok/offline/real_logout、l3_ok/fail、offline_fallback、catch、sdk_signout、token_refreshed），记录错误码、status、localStorage token 状态，便于下次出现问题时直接定位根因。
- **SIGNED_OUT 保护**: onAuthStateChange 的 SIGNED_OUT 处理加 `!_sessionOffline` 条件，避免 restoreCloudSession Level 2 已判为网络问题并设 offline 模式后，被 SDK 随后触发的 SIGNED_OUT 事件覆盖为硬登出。

## v4.11.12 Key Changes

- **刷新退出登录修复**: 提取 `_createSupabaseClient()` 工厂函数，统一三处 `createClient` 调用（`restoreCloudSession`/catch块/`doCloudLogin`），显式配置 `auth.storage=localStorage` + `autoRefreshToken=true` + `persistSession=true` + `detectSessionInUrl=false`。修复 v4.9.5 曾添加但在后续重构中丢失的 session 存储配置，确保 PWA 环境下 session 始终持久化到 localStorage。
- **全级失败兜底**: Level 1/2/3 全失败但 localStorage 有 token → `_sessionOffline=true` + `_scheduleSessionRetry()` 等待 `online` 事件自动重试。
- **onAuthStateChange**: 注册 SDK 监听器处理 `TOKEN_REFRESHED`（自动续签后更新 UI）和 `SIGNED_OUT`（区分主动登出 vs SDK 检测 token 无法续签），减少对手动恢复的完全依赖。

## v4.11.11 Key Changes

- **主页到期数虚高修复**: `getDeckStatsSrs()` 未按牌组实际卡片过滤。孤儿CardState（b04/b06 误入 `deck_key=cloud_01edbdfd`，learning 阶段因 `due_ts` 过期被计为到期）导致首页显示"2 到期"但 `buildSessionQueue` 队列为空 → "今日完成"。修复加 `deckCardIds` 集合过滤，只统计 `DECKS[deckKey]` 中存在的卡片。
- **getDeckStatsSrs 优化**: 新增 `deckCardIds` 过滤层，与 `buildSessionQueue` 的筛选逻辑保持一致。

## v4.11.9 Key Changes

- **reviewed_today 计数修正**: 移入 `firstRatingKey` 首次判断块，learning 重出不消耗日复习槽位。影响 `buildSessionQueue` 的 `reviewSlots` 计算和首页 `dueCap`，AD模式（max=20）尤为关键。
- **backfillAfterPractice 自动上传事件**: 加入 `syncAppEvents()`，练习结束后自动上传 app_events；此前 app_events 仅 runSync 手动同步时才上传（options.events:true）。
- **difficultyScore 字段名修正**: `s.lapses` → `s.lapses_total`；字段名错误导致 lapseScore 始终为 0，难度曲线中 lapses 权重失效。
- **⚠️ isRetrying 回归**: 删除 `const isRetrying = false` 时漏改引用 `_retrying: isRetrying` → ReferenceError，TrialLog 写入崩溃（#96）。`saveCardState` + `saveDailyProgress` 在崩溃前执行不受影响；统计页 KPI 正常但记录列表为空。修复：`_retrying: false`。

## v4.11.8 Key Changes

- **difficultyScore learning 修正**: `srs_stage === 'learning'` 加 0.5 stagBonus（与 relearning 一致）。learning 阶段难度未知，应落入 applyCurve 中间段而非首尾。
- **hard 比例降低**: `applyNormalMode` HARD_RATIO 0.35→0.25，SESSION_SIZE=20 时 hardCap 7→5 张。

## v4.11.7 Key Changes

- **session_mode 练习模式**: `SRS_CONFIG.session_mode`（'normal'|'hard'|'survival'），buildSessionQueue 末尾按模式分支。`applyNormalMode`：固定20张，hard≤35%（difficultyScore≥0.4），选卡后过穹顶曲线。`applyHardMode`：现有队列 slice(0,30) 过曲线。生存：全量过曲线。`difficultyScore(s)`：ef反转+lapses归一化+relearning加权。设置面板通用Tab新增三行单选，`setSrsMode`写localStorage，`syncSrsSettingsUI`同步勾选状态。

## v4.11.6 Key Changes

- **SRI integrity hash**: Supabase SDK 锁定 `@2.105.4/dist/umd/supabase.min.js` + `integrity` 属性；JSZip 动态加载（`ldScript()`）在 URL 匹配时注入 `integrity + crossOrigin`。CDN 投毒防护。
- **learning_hard_counts_lapse 面板化**: SRS 设置「失败保护」区域新增 toggle，`onchange` 直接调 `saveSrsConfigKey`，`syncSrsSettingsUI` 同步 checkbox 状态；AD 预设保持 `true`，默认 `false`。
- **Playwright 无头化**: 全部 13 个测试文件改为 `headless: !process.env.HEADED`；单机版去掉冗余 PHASE 2（SRS 算法断言，已由 srs_test.js 覆盖），10 天→5 天，耗时 ~3min→33s。

## v4.9.1 Key Changes

- **白屏修复**: Supabase CDN 改为 JS 动态加载（`loadSupabaseSDK()`），UI 初始化不再等待 CDN
- **智能同步**: 新增 `checkSyncNeeded()` — 先检查本地脏数据 + 服务器时间戳，不需要同步时零网络等待
- **减少逐卡上传**: 去掉 `logCardStateChange`（`card_state_log` 表废弃）；`saveCardState` 不再逐卡实时上传；TrialLog 新增 `due_ts/due_date/suspended/suspended_reason` 字段承载完整状态
- **SRS 写入保护**: `showFinish()` 前 `await _lastSrsWrite`，避免最后一张卡 daily progress 计数偏少
- **主页到期数虚高**: `getDeckStatsSrs()` 的 `due` 受 `max(0, max_reviews - reviewed_today)` 上限约束
- **统计页日期过滤**: `renderStatsToday()` 按日历日过滤 TrialLog，不再混入昨日数据
- **埋点增强**: `build_queue` payload 增加 `used_review/review_slots/new_slots`；新增 `show_finish` 事件
- **DB trigger**: `fn_trial_to_card_state()` — sync_trials INSERT 自动 UPSERT sync_card_states；前端不再直接写 CardState
- **每日评级计数**: `_writeSrs` 更新 `first_pass/hard/fail_today`，单设备用户统计页评级不再永远是 0
- **Code review 修复**: `openSrsDb` promise 缓存防并发；`syncCardStatesFromCloud` 去掉 device_id 过滤兼容双 Tab；`cloudPushConfig` 用 `_cloudUserId` 替代 getSession

## v4.9.2–v4.9.15 修复

| 版本 | 修复项 | 说明 |
|------|--------|------|
| v4.9.2 | syncTrialLog 漏字段 | INSERT 补 due_ts/due_date/suspended/suspended_reason |
| v4.9.3 | 统计总卡片数 | total 改用 DECKS[deckKey].length，跨设备一致 |
| v4.9.4 | 刷新后登录恢复 | SDK defer 晚于 inline → 轮询就绪后再 initCloud |
| v4.9.5 | 登录恢复 + 统计刷新 | SDK 就绪轮询 + checkSyncNeeded=false 也刷新统计 |
| v4.9.6 | updateDeckStats 占用符覆盖 | initUI await updateDeckStats；轻量同步不调 renderDeckList |
| v4.9.7 | IndexedDB 首次打开空 | getAllCardStates 空值保护 + updateDeckStats catch 写0 |
| v4.9.8 | 去除冗余网络请求 | checkSyncNeeded=false 不再拉 syncCardStatesFromCloud |
| v4.9.9 | 退出登录清除本地数据 | doCloudLogout 清 _cloudUserId + 云牌组 + IndexedDB，防切换用户混淆 |
| v4.9.10 | IndexedDB clear() 未 await | 事务异步提交，数据实际未删除，改为 Promise 包裹 |
| v4.9.11 | 消除 logAppEvent 409 竞态 | Network 面板追踪：logAppEvent 立即上传后 markEventSynced 异步，syncAppEvents 读到未同步标记重复上传 |
| v4.9.12 | 登录后云牌组 CardState 缺失 | syncAll step 2 只用旧 currentDeck，云牌组下载后没拉状态。step 7 补拉所有云牌组 CardState |
| v4.9.13 | 卡片列表无 CardState 的卡不可见 | _statsAllStates 补充无 CardState 卡（视为待开始），全部/待开始筛选均可见 |
| v4.9.14 | 练习天数改用 DB trigger | user_deck_stats 表 + trigger 自动计数，syncAll step 5.5 拉取，统计页零延迟 |
| v4.9.15 | 早间"今日完成"误报 + 合并不自愈 + learning 卡 due_ts=0 | syncAll step 5 UTC偏移 + max合并不能自愈 + learning卡due_ts=0时被队列跳过。改本地时间戳+直接赋值+兜底(!due_ts\|\|due_ts<=now)；回填6张已损坏learning卡 |

### 服务端变更（v4.9.14）

- **user_deck_stats**：新建表，`(user_id, deck_key)` 唯一，记录 practice_days + last_practice_date
- **trg_update_practice_days**：sync_trials INSERT → 同天不重复计数，自动维护统计

---

## v4.10.0 Key Changes

### 同步机制重构

- **runSync()** — 统一同步入口，替代旧 `syncAll()`。新增 `#sync-modal` 模态弹窗，同步过程显示进度条 + 语音播报
- **syncAll 废弃**：全部调用点改为 `runSync(options)`，options 支持 `{ modal, decks, deckKey, voice, title }`
- **`doCloudLogin` 调 `runSync`**：登录后执行 `runSync({ modal:true, decks:true })`
- **checkSyncNeeded → runSync**：`initCloud` / `visibilitychange` 触发时调用 `runSync({ modal:false, decks:false })`
- **练习完成 → runSync**：`backfillAfterPractice` 调 `runSync({ modal:false, decks:false })`
- **runSync 步骤**：
  1. 上传 trials（!synced_at 过滤）
  2. pull 配置 + push 本地配置（合并，不冲掉其他设备）
  3. 下载云端 CardState（增量合并，同 deckKey 的云端更新 > 本地才覆盖）
  4. 拉取 user_deck_stats（练习天数）
  5. 牌组同步（仅 options.decks=true 时）
  6. 刷新首页统计

### 登出行为变更

- `doCloudLogout` 不再清空 IndexedDB card_states/trials
- `_cloudUserId` 登出后保留（离线数据归属用）
- 云牌组保留在 DECKS_META/DECKS 中（离线可用）
- 仅 `_syncEnabled=false`、清 `_sb`、移除 `yihai_global_sync_ts`

### 多用户隔离

- `getAllCardStates(deckKey)` 增加 `user_id` 过滤：`s.user_id === uid`
- `syncTrialLog` / `syncCardState` 统一用 `getCurrentUserId()`（返回 `_cloudUserId || 'offline'`）
- 离线记录 `user_id='offline'`，登录后 `migrateDeviceRecordsToUser()` 批量迁移

### DP 不再跨设备同步

- `syncAll` step 5（跨设备今日统计合并）完全移除
- `daily_progress` 仅由 `writeTrialLog` 在答题时本地更新
- 新设备打开已练习牌组时，队列由云端 CardState 驱动（review 卡从云拉回），无需 DP 同步

### 统计页 CardState 渲染

- `renderStatsCards(filter)`：补充 DECKS 中无 CardState 的卡（视为 `srs_stage='new'`，待开始）
- `renderStatsDeck()`：基于本地 `getAllCardStates` 统计
- Orphaned CardState 处理：`_statsAllStates` 收集所有卡状态，筛选器 `filterNew` 排除 DECKS 中不存在的 `card_id`
- `statsPend` 计算解耦：deckOverview 用 `total - validNonNew`, filter 用 `total - nonNewActive`

### 修复

- `getDeckStatsSrs` 兼容 `due_ts=0`（learning 卡不被队列永久跳过）
- `_pushConfigTimer` 防重复推送配置
- `cloudPushConfig` SRS 参数改用 `localStorage` 读取，而非 `SRS_CONFIG` 运行时值（避免内存状态与持久化不一致）
- `updateCloudTabUI` 退出后用 `✅` 前缀显示邮箱

## v4.10.1 Key Changes

### Session 恢复增强

- `restoreCloudSession()` 三级兜底：
  1. `_sb.auth.getSession()` — 正常路径
  2. 读 localStorage `sb-{url}-auth-token` → `setSession()` — SDK 异步竞态时绕过
  3. 300ms 后重试 `getSession()` — Chrome 硬刷新后 CDN 延迟
- 修复：硬刷新后页面空白/不显示已连接状态

### 诊断工具集

| 文件 | 方式 | 功能 |
|------|------|------|
| `_dump_idb.js` | F12 → `fetch(...).then(eval)` | CardState 分牌组统计 + user_id 归属 + localStorage 配置 |
| `_bookmarklet_diagnose.html` | 书签按钮（页面点击） | 同 `_dump_idb.js`，弹窗显示 + 自动复制到剪贴板 |
| `_diag_sync_state.js` | `node` + Playwright | 云端 Supabase 数据 vs 本地 IndexedDB 对比 |
| `_check_due_count.js` | `node` + Supabase SDK | 直接查云端到期数，双账号对比 |

### Known Issue

- **#26 离线练习后 user_id 不更新**：`saveCardStateLocal` 在离线下设 `user_id=deviceId`，登录后 `syncCardStatesFromCloud` 增量合并因本地 `updated_at > cloud.updated_at` 跳过覆盖，`getAllCardStates` 按 `_cloudUserId` 过滤后这些记录不可见。修复方向：云端记录优先覆盖本地（即使本地时间戳更新）。

---

## v4.11.0 Key Changes

**iPad/平板响应式适配**
- 宽屏（≥600px）练习/浏览屏启用双列 flex 布局：左图右选项
- 图片区 `max-height:50vh`，防大图遮挡选项

## v4.11.1 修复

- `answer-panel` 隐藏时去掉 padding，修复平板图片遮挡选项区（根因：`display:none` 元素仍占 padding 高度）
- `visualViewport.height` 动态计算可用空间，防键盘/地址栏弹出遮挡
- 选项按钮高度 `min(8vh, 52px)` 动态缩放
- `manifest.json` 加 `orientation:"portrait"` 锁定 PWA 竖屏

## v4.11.2 修复

| Issue | 修复项 | 说明 |
|-------|--------|------|
| #45 | `runSync` 并发锁 | 新增 `_syncRunning` flag，防 visibilitychange / 多次点击并发触发同步 |
| #46 | XSS 转义 | `showConfirmDialog` 消息用 `escHtml()` 转义 |
| #48 | `alert()` 替换 | 全部改为 `showConfirmDialog()`，修复 iOS PWA 无响应 |
| #49 | 孤儿统计 | `statsPend` 排除 CardState 中 DECKS 已不存在的孤儿记录 |
| #50 | `goHome` 竞态 | `_launchBusy=false` + `showScreen` 移入 `_lastSrsWrite.finally()` 内 |
| #65 | `online` 重复监听 | `window.addEventListener('online',...)` 改为全局注册一次，修复断网恢复后不自动重连 |

## v4.11.5 修复

**SRS bug + 离线登录进度丢失**

- `processAnswer` review `easy` 分支加 `lapses_streak = 0`（之前只有 `good` 清零，`easy` 漏掉，极端情况答 easy 后仍可触发 daily_remove_lapses）；`srs_test.js` 同步修复 + 新增 4-G 断言
- 离线练习后登录进度丢失（#26）：
  - 根因：`doCloudLogin` 中 `migrateDeviceRecordsToUser` 是 fire-and-forget，`runSync` 并发读 `getAllCardStates` 时按 `cloudUserId` 过滤，迁移未完成 → 离线 CardState 不可见
  - 修复：改为 `await migrateDeviceRecordsToUser` 后再启动 `runSync`
  - `restoreCloudSession` Level 1/2/3 三个成功路径均补调 `migrateDeviceRecordsToUser`（页面重载自动恢复 session 时同样触发迁移）
- 删除 `checkSyncNeeded()` 死代码（从未接入 runSync，且含 epoch 毫秒与 ISO 字符串字典序比较 bug，永远返回 true）
- 删除 `utcTodayStr()` 死代码（零调用点）
- 新增 `tests/_playwright_offline_login_test.js`（10 断言）

## v4.11.4 清理

**card_state_log 死代码全部删除（#43）**

- 删除 `CSL_STORE` 常量（原 `'card_state_log'`）
- 删除 IDB 建库语句（`openSrsDb` 中的 CSL_STORE objectStore 创建块）
- 删除 `logCardStateChange()` — 写本地 CSL_STORE + 调 `uploadCardStateLog`，从未被外部调用
- 删除 `uploadCardStateLog()` — 上传到 `card_state_log` 表，已由 sync_trials trigger 替代
- 删除 `markCslSynced()` — 标记 CSL 同步状态
- 删除 `syncCardStateLogs()` — 批量补传 CSL，从未被调用
- 简化 `purgeOldLogs()` — 移除 CSL 7天清理段，只保留 app_events 30天清理

## v4.11.3 修复

**Session 恢复失败根因 + 邮箱预填**

- `restoreCloudSession()` Level 2 sbKey 错误：
  - 旧：`'sb-' + SUPABASE_URL.replace(/^https?:\/\//, '') + '-auth-token'`（含完整域名）
  - 新：`'sb-' + new URL(SUPABASE_URL).hostname.split('.')[0] + '-auth-token'`（只取 projectRef）
  - Supabase SDK 实际使用 `sb-juzkonrzfyvchqxzmlpr-auth-token`，旧 key 读不到 token，Level 2 是死代码
  - 修复后：Level 1 `getSession()` 因网络波动失败时，Level 2 `setSession()` 可真正接手
- 移除 HTML 硬编码 `value="zyhacl@gmail.com"`（开发调试遗留）
- 登录成功（doCloudLogin + Level 1/3 session restore）均写 `yihai_last_cloud_email`
- `updateCloudTabUI()` 显示登录框时从 `yihai_last_cloud_email` 预填邮箱
