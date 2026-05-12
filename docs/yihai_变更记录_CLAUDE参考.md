# 忆海拾光 变更记录（CLAUDE 参考）

v4.9.1–v4.9.15 详细变更，供 AI 理解版本演进的上下文。用户面向的版本历史见 `docs/忆海拾光_训练App_README.md`。

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
