# 忆海拾光 · 训练 App

> 家庭记忆与学习卡片 PWA — 看图识字、睡前故事、方言传承，一人制作，家人使用  
> 妈妈的生日刻在每一张卡片里：MID `1948020901972`

---

## 项目结构

```
gemi 仓库（GitHub Pages）
├── index.html          # 训练 App 主文件（当前版本即此文件）
├── manifest.json       # PWA manifest
├── icon-192.png
├── icon-512.png
└── sw.js               # Service Worker（暂未启用，见下方说明）

anki-maker 仓库（GitHub Pages）
└── index_v49.html      # 制卡工具（重命名为 index.html 部署）
```

**工作文件：** `/home/claude/yihai_app.html`（固定文件名，输出为 `yihai_v{版本}.html`）

---

## 快速部署

1. 将当前版本文件重命名为 `index.html`
2. 推送到 `gemi` 仓库的 `main` 分支
3. GitHub Pages 自动发布

**Service Worker 说明：** 当前暂未注册 SW。GitHub Pages 的 App-Bound Domain 限制导致 SW 在 PWA standalone 模式下行为异常，待绑定独立域名后恢复。

---

## 数据格式

### .yhspack（制卡工具导出 / 训练 App 导入）

```
{deckName}.yhspack  （ZIP 格式）
├── deck.json
└── media/
    ├── {cardId}.jpg
    └── {cardId}.m4a
```

### deck.json 结构

```json
{
  "version": "1.0",
  "exportedAt": "ISO8601",
  "deck": {
    "id": "hash8",
    "name": "蔬菜",
    "cards": [
      {
        "id": "hash8",
        "name": "苹果",
        "image": "media/abc12345.jpg",
        "audio": "media/abc12345.m4a"
      }
    ]
  }
}
```

---

## 本地存储架构

| 存储 | 内容 | 键名 |
|------|------|------|
| localStorage | 牌组索引（id+name）| `yihai_decks_index` |
| localStorage | 卡片元数据（id+name，无媒体）| `yihai_deck_{key}` |
| localStorage | 所有设置参数 | 各参数独立键名 |
| localStorage | SRS 配置覆盖 | `srs_{paramName}` |
| localStorage | 每日进度 | `yihai_daily_progress` |
| IndexedDB `yihai_media` | 图片 blob | `{deckKey}_{cardId}_img` |
| IndexedDB `yihai_media` | 录音 blob | `{deckKey}_{cardId}_aud` |
| localStorage | 会员标记（是否曾登录）| `yihai_has_ever_logged_in` |
| IndexedDB `yihai_srs` v4 | CardState（SRS 状态）| `card_states` store，key=`{deckKey}::{cardId}` |
| IndexedDB `yihai_srs` v4 | TrialLog（答题记录）| `trials` store |
| IndexedDB `yihai_srs` v4 | 应用事件日志 | `app_events` store（会员完整记录/非会员限50条）|
| IndexedDB `yihai_srs` v4 | CardState 变更日志 | `card_state_log` store（仅会员）|

---

## SRS 系统说明

### 算法：AD 改良版 SM-2

| 参数 | Anki 默认 | AD 建议值 | 说明 |
|------|---------|---------|------|
| `learning_steps` | `[1, 10]` | `[1, 5, 10, 30]` | 分钟，支持 m/h/d 输入 |
| `relearning_steps` | `[10]` | `[10, 60, 180]` | 分钟，支持 m/h/d 输入 |
| `graduating_interval` | 1天 | 1天 | 毕业后首次间隔 |
| `maximum_interval` | 36500天 | 7天 | 超过此值视为「已掌握」|
| `starting_ease` | 2.50 | 1.30 | 初始易度 |
| `interval_modifier` | 1.00 | 0.80 | 全局间隔乘数 |
| `learn_ahead_limit` | 1200s | 1200s | 提前出题窗口，对应 Anki 同名参数 |
| `daily_remove_lapses` | - | 3次 | 连续失败当日移出阈值 |
| `auto_suspend_lapses` | - | 8次 | 累计失败自动挂起阈值 |
| `learning_hard_counts_lapse` | false | true | learning/relearning 阶段 Hard 计入连失 |

**参数命名规范：** 所有 SRS 参数与 Anki 同名对齐，不加任何后缀。

### 卡片状态流转

```
new → learning（学习中）→ review（复习中/已掌握）
                             ↓ Again
                         relearning（重学中）→ review
```

### 卡片状态显示规则

| srs_stage | interval | 显示标签 | 颜色 |
|---|---|---|---|
| new | - | 待开始 | 灰 |
| learning | - | 学习中 | 橙 |
| relearning | - | 重学中 | 红 |
| review | < maximum_interval | 复习中 | 蓝 |
| review | ≥ maximum_interval | 已掌握 | 绿 |
| suspended | - | 待确认 | 紫 |

---

## 版本历史

### v5.2.1 — 2026-05-31

**Bug 修复：会话恢复 / 同步稳定性**
- 修复账号页卡在「正在恢复登录」：新增 `_sessionRestoring` 标志替代 backup 存在与否代理逻辑（影响 SDK CDN 不可达、backup 损坏、getSession 异常等场景）
- 修复 `openSrsDb` IDB blocked 导致同步永久挂死：新增 `onblocked` 8s 超时，补全 `return _srsDbPromise`
- 修复登录按钮网络死挂后永久 disabled：`signInWithPassword` 加 15s 超时
- 修复二次登录替换已有 `_sb` 实例的双客户端问题
- 修复 modal 同步失败（含 IDB blocked）时用户无任何提示

---

### v5.2.0 — 2026-05-30

**新功能：语音辅助系统**
- 家属录音陪伴：可为 11 个语音槽录制家人声音（最长 30 秒，webm/mp4 双格式），以 TTS 为兜底
- 语音槽分三组：固定节点（开始练习/完成练习/首页空闲/浏览空闲）、情绪触发（答错提示/答对鼓励/连对连击/练习空闲/每日首次）、功能提示（引导答题/答案朗读延迟提示）
- 全局静音开关 + 答案朗读延迟调节（设置 Tab）
- `screen-voice-assist` 全屏管理界面，三组折叠面板
- IDB `yihai_srs` 升版 v6→v7，新增 `voiceSlots` store
- 连对连击：连续答对 3 张触发鼓励语音，下次重置
- Idle 计时器：首页 8s / 练习 15s / 浏览 10s，60s 冷却防重复
- `card_type`（choice/recognize）字段扩展，recognize 类卡片跳过选项朗读
- Supabase `cards_pool` 表新增 `card_type`、`ext` 列

---

### v5.1.6 — 2026-05-27

**改进：术语统一**
- 首页牌组区标题「我的相册」统一改为「我的牌组」，英文 My Decks，西文 Mis Mazos
- 决策依据：「牌组」对齐国际 SRS 工具（Anki）Deck 概念，消除与手机相册的歧义

---

### v5.1.5 — 2026-05-27

**修复**
- 移除 `publishDeck` 功能（preset/shared 权限设计未完善，待后续重新设计）
- 修复 `migrateMediaKeys` race condition：从 v5.1.3 升级时，localStorage deck key 已去掉 `cloud_` 前缀，但 IndexedDB blob key 迁移被 `setTimeout` 推迟，导致 `restoreDecks` 读图时找不到 blob，图片全部显示为空；改为 `await` 顺序执行，确保迁移完成后再加载卡片

---

### v5.1.4 — 2026-05-27

**功能：牌组云端同步**
- Migration 010：新建 `decks`/`deck_cards` 统一 schema，替代原 `server_decks`/`cards_pool`/`server_deck_cards` 三表；删除废弃表 `card_state_log`/`upload_log`
- 本地 deck key 格式清理：去 `cloud_` 前缀，改用 `crypto.randomUUID()` 生成新牌组 key，`DECKS_META` 增加显式 `deck_type` 字段
- 个人牌组云端同步：`uploadDeckToCloud`（首次上传）、`checkPersonalDeckUpdates`（session 就绪后拉取更新）、`saveDeck`/`deleteDeck` 推送云端
- 发布机制：`publishDeck` 更新 `decks.updated_at`，牌组详情屏新增「发布」按钮，支持将个人牌组发布为公开 preset

**测试**
- 全部回归测试对齐新 schema（表名/key 格式/登录 UI/data-theme 主题检测）：_playwright_test / cloud_test / v4.10_regression / cross_device_sync / session_mode_queue 全绿

---

### v5.1.3 — 2026-05-25

**修复**
- 我的页面/账户屏登录状态判断加 `_syncEnabled` 门禁：session 恢复失败（网络不通）时不再误显已登录头像与邮箱，避免离线状态下显示在线 UI

---

### v5.1.2 — 2026-05-24

**UI 整合：云端入口统一**
- 删除设置面板「云端」Tab，登录/登出/同步全部集中到账户屏
- 删除散落的文件导入入口（首页隐藏 input、我的-导入文件、Action Sheet 导入/从链接下载），导入操作走账户屏
- CSS 优化：home-tabbar 浮动圆角风格、mine-scroll 响应式 max-width

---

### v5.1.1 — 2026-05-24

**重构：Session Restore 重写**
- 3 级恢复链（L1 getSession → L2 setSession → L3 300ms retry）→ 单次 getSession() + 7s 超时
- 删除 `_sessionRestoring`、`_sessionOffline`、`_onlineListenerActive`、`_scheduleSessionRetry`、`isRealLogout` 正则
- 状态模型：6 变量 → 3 变量（`_syncEnabled`/`_cloudUserEmail`/`_cloudUserId`）
- updateCloudTabUI：4 分支 → 3 分支；online 监听内联到 restoreSession 失败分支
- 代码净减少 138 行

**修复**
- 首页 topbar 增加 `max-width:500px`，PC 浏览器桌面适配
- 设置面板 sheet-section/sheet-tabs padding 统一为 16px，与其他页面一致

---

### v5.1.0 — 2026-05-23

**重构：Wave 1 导航 + i18n 地基**
- Wave 1 导航架构：Tab Bar（首页/FAB开始练习/我的）+ 独立功能屏（浏览/账户/设置/牌组详情/制卡）
- 阶段 0 i18n 地基：`detectLocale/t/getLocale/setLocale/detectScript/resolveFieldLang/normalizeField`；TTS `lang` 参数跟随字段语言；`.yhspack` 字段语言迁移
- i18n Stage 1：221 个 key × 3 语言（zh-CN/en/es），JS 硬编码字符串全部替换为 `t()`
- 医疗术语清理：删除 AD 建议值功能，meta 改「记忆练习」
- PWA 诊断面板入口移植：版本号连击 5 次打开诊断面板

---

### v4.11.19 — 2026-05-22

**改进**
- 版本号连击 5 次即可在 PWA 中打开诊断面板
- 诊断面板支持拖拽移动，不再遮挡 App 页面

---

### v4.11.18 — 2026-05-21

**改进**
- 登录后同步补加 `events:true`，与手动点「🔄 同步」行为一致，登录时自动上传本地积压的 app_events 日志

---

### v4.11.17 — 2026-05-21

**Bug 修复**
- 修复 session_restore L2 正则误判：`refresh_token_not_found`（下划线）匹配不到 SDK 实际返回的空格写法 `Refresh Token Not Found`，导致 token 服务端过期时走 offline 分支显示"网络不稳定"而非登录界面；修复后检测到真实登出时清除 `yihai_session_backup` 并直接返回，跳过 L3 和 offline 兜底

---

### v4.11.16 — 2026-05-21

**诊断增强 + Bug 修复**
- 新增分级诊断日志系统（`log.debug/info/warn/error`），IDB v5→v6 新增 `yh_logs` store，`window.yhLog` DevTools 工具
- warn/error 自动上传 Supabase（`syncAppEvents`），`markEventSynced` 改为批量单事务写回
- 修复 `runSync` 竞态：deck 下载/同步时跳过 `updateDeckStats()`，由 `runSync` 统一在状态同步后调用
- 修复 `getDeviceInfo()` catch 块返回 `null` 导致 `device_registry.device_info` 存 NULL

---

### v4.11.15 — 2026-05-21

**Bug 修复**
- 修复 `getDeviceInfo()` 返回 `JSON.stringify(...)` 字符串导致 `device_info` jsonb 列双编码，`->>'ua'` 等操作符全部返回 NULL，Admin 看板设备解析失效

---

### v4.11.14 — 2026-05-20

**Bug 修复**
- 修复刷新退出登录：自有 `yihai_session_backup` 备份 session token，防 Supabase SDK 因 refresh 失败自行清除 token 后无法恢复
- 在 `restoreCloudSession`、`doCloudLogin`、`TOKEN_REFRESHED` 各成功路径更新备份

---

### v4.11.13 — 2026-05-20

**诊断增强**
- 在 restoreCloudSession 每级失败/成功路径写入 app_events 结构化日志（8 种 session_restore_* 事件），记录错误码、token 状态、定位登出根因
- 修复 onAuthStateChange SIGNED_OUT 覆盖 _sessionOffline 模式的问题

---

### v4.11.12 — 2026-05-20

**Bug 修复**
- 修复刷新页面退出登录问题：提取 `_createSupabaseClient()` 工厂函数，统一三处 `createClient` 调用
- 显式配置 `auth.storage=localStorage`，修复 v4.9.5 曾添加但在后续重构中丢失的 session 持久化配置
- 三级 session 恢复全失败兜底：有 localStorage token 但网络不可达时进入 offline 模式，等待 `online` 事件自动重试
- 添加 `onAuthStateChange` 监听器，SDK 自动续签 token 或检测被动登出时实时更新 UI

### v4.11.11 — 2026-05-20

**Bug 修复**
- 修复牌组首页到期数虚高：`getDeckStatsSrs` 未按牌组实际卡片列表过滤，孤儿 CardState 导致显示 2 到期但练习提示"今日完成"

---

### v4.11.10 — 2026-05-20

**热修复**
- 修复 `isRetrying` ReferenceError：v4.11.9 删除死代码时漏改引用，导致 TrialLog 写入崩溃，记录列表为空

---

### v4.11.9 — 2026-05-20

**Bug 修复**
- `reviewed_today` 移入 `firstRatingKey` 首次判断块：learning 重出步骤不消耗日计数槽位
- `backfillAfterPractice` 加入 `syncAppEvents()`：练习结束自动上传事件日志
- `difficultyScore` 字段名修正：`s.lapses` → `s.lapses_total`

---

### v4.11.8 — 2026-05-20

**练习模式算法修正**
- learning 阶段卡牌难度评分加 0.5 bonus，与 relearning 一致，排入曲线中间段
- 普通模式 hard 卡比例 0.35 → 0.25（20张上限中 hard ≤ 5张）

---

### v4.11.7 — 2026-05-20

**练习模式难度曲线**
- 新增 `session_mode` 参数：普通（20张，hard≤35%）/ 困难（30张上限）/ 生存（全量积压）
- 三档均按 easy-hard-easy 穹顶曲线排列出题顺序，适配陪伴型情绪价值定位
- 设置面板 → 通用 Tab 新增练习模式单选，即时切换并持久化

---

### v4.11.6 — 2026-05-18

**安全 + SRS 面板**
- 外部脚本加 SRI integrity hash：Supabase SDK 锁定 @2.105.4，JSZip 动态加载同步加 integrity
- SRS「失败保护」面板新增 `learning_hard_counts_lapse` 开关（AD 建议开启）
- Playwright 回归测试全面无头化，HEADED=1 可恢复有头模式；单机版测试耗时 3 分钟 → 33 秒

---

### v4.11.5 — 2026-05-18

**SRS 修复 + 离线登录进度保留**
- review `easy` 未清零 `lapses_streak`（与 `good` 行为对齐，新增 4-G 单测）
- 离线练习后登录进度丢失：`doCloudLogin` 改为 `await migrateDeviceRecordsToUser` 后再调 `runSync`，消除竞态；`restoreCloudSession` 三个路径均补加迁移调用
- 清除 `checkSyncNeeded()` 死代码（含 epoch/ISO 比较 bug）、`utcTodayStr()` 死代码
- 新增 `tests/_playwright_offline_login_test.js`（10 断言）

---

### v4.11.4 — 2026-05-18

**死代码清理**
- 清除 `card_state_log` 整条废弃管道：`CSL_STORE` 常量、IDB 建库语句、`logCardStateChange` / `uploadCardStateLog` / `markCslSynced` / `syncCardStateLogs` 函数及 `purgeOldLogs` 中的 CSL 清理段（共删除 57 行）
- 无行为变更，275 个单测通过

---

### v4.11.3 — 2026-05-17

**Session 恢复 Bug 修复**
- `restoreCloudSession()` Level 2 备用路径 sbKey 错误（全域名 `sb-xxx.supabase.co-auth-token` → 正确 `sb-{projectRef}-auth-token`），Level 2 `setSession()` 兜底路径现在真正生效
- 移除云端登录框硬编码 `value="zyhacl@gmail.com"`；改为从 `yihai_last_cloud_email` 预填上次登录邮箱
- 所有登录成功路径（手动登录 + Level 1/3 session 恢复）均保存 `yihai_last_cloud_email`
- 新增 `tests/_playwright_expired_token_test.js`（9 断言，模拟 access_token 过期后刷新场景）
- 新增 `tests/_playwright_version_update_test.js`（8 断言，版本更新后刷新 session 恢复）

---

### v4.11.2 — 2026-05-16

**Bug 修复（5项）**
- `alert()` 全部替换为 `showConfirmDialog()`（iOS PWA 屏蔽系统弹窗）
- 孤儿统计修复：`statsPend` 排除 DECKS 中已不存在的 CardState 孤儿记录
- `goHome()` 竞态修复：`_launchBusy=false` 和 `showScreen` 移入 `_lastSrsWrite.finally()` 内，防止 SRS 写入未完成时重入
- `runSync` 并发锁：新增 `_syncRunning` flag，防止多次点击或 visibilitychange 并发触发同步
- XSS 转义：`showConfirmDialog` 消息内容改用 `escHtml()` 转义

**在线状态修复**
- `online` 事件监听改为全局注册一次（而非每次 `initCloud` 重复注册），修复断网恢复后不自动重连

---

### v4.11.1 — 2026-05-14

**平板适配修复**
- `answer-panel` 隐藏时移除 padding 占位，修复平板图片遮挡选项区问题
- `visualViewport` 动态计算可用高度，防止键盘/地址栏弹出时选项被遮挡
- 选项按钮高度随 `vh` 动态缩放（`min(8vh, 52px)`），适配各终端
- `manifest.json` 锁定 PWA 竖屏方向（`orientation: "portrait"`）

---

### v4.11.0 — 2026-05-14

**iPad/平板响应式适配**
- 宽屏（≥600px）启用双列布局：左侧图片区 / 右侧选项区并列，提升平板使用体验
- 图片区高度限制（`max-height: 50vh`），防止大图挤压选项
- 练习/浏览模式均适配双列 flex 布局

---

### v4.10.1 — 2026-05-14

**Session 恢复增强**
- `restoreCloudSession()` 增加三级兜底：getSession → setSession（读 localStorage token）→ 300ms 后重试 getSession，修复 Chrome 硬刷新后 Supabase SDK 竞态导致不自动登录

**诊断工具**
| 文件 | 用途 |
|------|------|
| `tests/_dump_idb.js` | F12 控制台 fetch 执行，输出 IndexedDB CardState 详情 + localStorage 配置 |
| `tests/_bookmarklet_diagnose.html` | 书签按钮，一键诊断 |
| `tests/_diag_sync_state.js` | Playwright 云端 vs 本地对比 |
| `tests/_check_due_count.js` | Supabase 直接查询到期数 |

---

### v4.10 — 2026-05-14

**同步机制重新设计**

- **runSync 统一同步入口**：新增模态弹窗 `#sync-modal`，同步过程显示进度条 + 语音播报，"正在上传练习记录"→"同步配置"→"同步练习状态"→"同步牌组"。阻塞用户操作直到同步完成，确保练习前数据一致
- **登录调 runSync**：`doCloudLogin()` 登录后调用 `runSync({ modal:true, decks:true })`，不再执行旧 `syncAll`
- **登出保留本地数据**：退出登录不再清空 IndexedDB（card_states/trials），云牌组保留在列表中离线可用。`_cloudUserId` 保留（离线数据归属），仅 `_syncEnabled=false`
- **syncAll → runSync**：`syncAll(deckKey,showToast,noDecks)` 重构为 `runSync(options)`，支持 `options.modal/decks/deckKey/voice/title`

**多用户数据隔离**

- `getAllCardStates(deckKey)` 按 `user_id + deck_key` 双字段过滤 IndexedDB，不同用户同牌组互不干扰
- `syncTrialLog` / `syncCardState` 统一用 `getCurrentUserId()` 获取关联用户 ID

**跨设备同步重构**

- **DP 不再跨设备同步**：`daily_progress`（reviewed_today/daily_new_today/评级分布）仅本地维护。跨设备只需同步 CardState，练习队列自动对齐。删除 `syncAll` step 5 跨设备统计合并
- **Orphaned CardState 过滤**：统计页渲染时过滤 DECKS 中已不存在的卡片状态，牌组总览/筛选器计算逻辑解耦
- `getDeckStatsSrs` 兼容 `due_ts=0`：learning 卡不会被永久跳过

**新增/修改测试**

| 测试文件 | 断言 | 覆盖场景 |
|----------|------|---------|
| `_playwright_v4.10_regression_test.js` | 37 | 登录同步→练习→配置→注销保留→离线可用→重新登录验证 |
| `_playwright_multi_user_sync_test.js` | - | 多用户数据隔离验证 |
| `_playwright_cloud_test.js` | 17→17 | 移除 DP 检查，改进 Device B 同步等待 |
| `_playwright_cross_device_sync_test.js` | 21→18 | 移除 DP 验证（v4.10 不再跨设备同步 DP） |
| `_playwright_user_switch_test.js` | 7→8 | 登出后牌组保留断言 |

---

### v4.4 — 2026-05-01

**Supabase 云端同步**
- 静默登录 → 显式登录：云端 Tab 含邮箱/密码登录，退出后回到离线模式
- 会话持久化：Supabase SDK 管理 session，重开 App 自动恢复登录
- 云端下载：刷新 server_decks 列表，全量下载牌组（含媒体文件），进度条显示
- 增量同步：`syncDeckFromCloud` 基于 `cards_pool.updated_at > lastSyncAt` + URL 对比（`_imgUrl/_audUrl`），只拉变更的卡片和媒体，无变化秒级跳过
- 训练数据静默上传：每次答题后 fire-and-forget 上传 TrialLog + CardState 到 Supabase
- 离线模式：未登录时所有同步函数跳过，纯本地运行

**新增函数**
- `restoreCloudSession()` / `doCloudLogin()` / `doCloudLogout()` / `updateCloudTabUI()`
- `refreshServerDeckList()` / `downloadDeckFromCloud()` / `syncDeckFromCloud()`
- `syncTrialLog()` / `syncCardState()` / `showCloudToast()`
- `simpleHash()` / `esc()` / `escAttr()` 工具函数

**修复**
- 下载后 `currentDeck` 未切换：新增 `currentDeck = key` 在 `renderDeckList()` 前
- 云端列表显示原始牌组名：改为查 `server_decks.name` 而非 `cards_pool.deck_name`

---

### v4.9 — 2026-05-06

**Bug 修复**
- 配置同步先 pull 后 push，修复多设备场景本地空配置覆盖远端修改
- `getDeckStatsSrs` 无 CardState 卡片计入新卡数，修复下载后牌组显示 0/0
- `syncCardState` upsert 补 `user_id` 字段，修复卡片状态上传静默失败

**COS 回源停用**
- `MEDIA_CDN_BASE = ''`，媒体下载回退到 Supabase Storage

**CardState 同步优化**
- 改为先拉后推：syncAll 先下载云端卡牌状态再上传，避免过时数据覆盖远端
- 增量上传：新增 `synced_at` 脏标记，仅上传本地修改过的 CardState，减少同步量
- 同步完成自动刷新首页统计，解决新设备首次同步后仍显示「新卡 N」

**Bug 修复**
- `backfillAfterPractice` 返回 `Promise.resolve()`，修复 Supabase 客户端未就绪时 `undefined.catch()` 崩溃导致绕过完成界面
- `_launch` 构造队列失败回退改为 `showFinish()`，修复崩溃后显示全部卡片而非完成界面

**回归测试**
- 新增 `_playwright_cloud_test.js`（17 断言，含多设备同步测试）
- 新增 `_playwright_cross_device_sync_test.js`（21 断言，跨设备状态覆写回归）

**Bug 修复（2026-05-10）**
- `_launch` 进入练习屏前先调 `syncCardStatesFromCloud` 拉取云端状态，修复新设备 IndexedDB 为空时 `buildSessionQueue` 创建 new 状态并通过 `saveCardState`→`syncCardState` 实时上传，覆盖其他设备已练习的正确 CardState
- `buildSessionQueue` 自动建卡改用 `saveCardStateLocal`（仅写本地），避免临时 new 状态与用户答题后的正确状态产生异步竞争覆盖
- `syncAll` step3 跨设备今日进度同步的 `trial_date` 查询改用 `utcTodayStr()`（UTC 日期），对齐 PostgreSQL `to_timestamp()::date` 生成列的 UTC 时区，修复中国时区凌晨时段 `daily_progress` 跨设备同步失效

**数据埋点增强（2026-05-10）**
- IndexedDB `yihai_srs` 升级到 v4，新增 `app_events`（事件日志）和 `card_state_log`（状态变更快照）两个 store
- Supabase Migration 006：新增 `app_events`、`card_state_log`、`device_registry` 三张表
- 会员判定：`localStorage` 键 `yihai_has_ever_logged_in`，首次登录后置位
- 会员版：完整记录日志到 IndexedDB，实时上传至云端，`syncAll` 批量补传；30天事件/7天状态日志自动清理
- 非会员版：`app_events` 限 50 条，`card_state_log` 不记录，零性能影响
- 埋点位置：login / logout / build_queue / processAnswer / sync_started / sync_done / config_changed / start_practice / go_home / cloud_state_merge（共 10 处）
- `syncAll` 步骤从 5 步扩展到 7 步（新增 step 1.5 事件日志上传 + step 1.6 状态日志上传）

**设备信息采集**
- `sync_trials` 新增 `device_info` jsonb 字段，记录浏览器 UA、屏幕分辨率、语言设置
- `sync_trials` + `sync_card_states` 新增 `app_version` 独立列，记录产生该记录的 App 版本号
- 新增 `APP_VERSION` 常量，版本号统一定义在一处
- Supabase Migration 004：两张表结构变更

**同步防错加固**
- `_writeSrs` 增加 `!deckKey` 守卫，防止 `currentDeck` 为空时写出 `deck_key = null` 的 TrialLog
- `syncTrialLog` / `syncCardState` 增加 `!_cloudUserId` 守卫，避免未登录态尝试上传导致 RLS 403
- RLS 策略增加显式 `WITH CHECK`（`supabase_migration_005`），修复 upsert 场景 Postgres 未自动下推 USING 表达式导致 "new row violates row-level security" 错误

---

### v4.9.1 — 2026-05-10

**白屏修复**
- Supabase CDN 改为 JS 动态加载（`loadSupabaseSDK()`），UI 初始化不再等待 CDN
- SDK 加载失败 → 静默离线模式，不影响本地练习

**智能同步**
- 新增 `checkSyncNeeded()` — 先检查本地脏数据 + 服务器 `sync_card_states.updated_at` 和时间戳 `yihai_global_sync_ts` 对比
- 不需要同步时零网络等待，直接显示首页；需要时显示进度条阻塞同步
- 同步完成记录 `yihai_global_sync_ts`，供下次增量判断

**减少逐卡上传**
- 去掉 `logCardStateChange` 调用：`card_state_log` 表前端停产，TrialLog 已含 before/after 状态快照
- `saveCardState` 去掉逐卡实时上传，仅在 `syncAll` 时批量上传
- `writeTrialLog` 的 TrialLog entry 新增 `due_ts`、`due_date`、`suspended`、`suspended_reason` 字段，承载完整卡牌状态快照，后续数据库 trigger 可派生 `sync_card_states`

**Bug 修复**
- `showFinish()` 前 `await _lastSrsWrite`，避免最后一张卡 daily progress 计数偏少导致跨设备统计遗漏
- `getDeckStatsSrs()` 的 `due` 受 `max(0, max_reviews - reviewed_today)` 上限约束，不再虚高
- `renderStatsToday()` 路径 2 按日历日过滤（`timestamp >= 今日 0 点`），不再混入昨日数据
- `showFinish()` 改为 async，`backfillAfterPractice` 改为 await，减少关页面丢数据

**统计页优化**
- 「连续天数」改为「练习天数」：取本地 ∪ 云端 sync_trials 的唯一天数总数，不再要求连续，跨设备显示一致

**埋点增强**
- `build_queue` payload 增加 `used_review`、`review_slots`、`new_slots`、`max_reviews`、`max_new`
- 新增 `show_finish` 事件，含 `reviewed_today` + `session_pass/hard/fail`

**DB trigger**
- `sync_trials` 新增 `due_ts`、`due_date`、`suspended`、`suspended_reason` 列
- `fn_trial_to_card_state()` — TrialLog INSERT 自动 UPSERT sync_card_states，前端不再直接写

**后期修复**
- `_writeSrs` 更新 `first_pass/hard/fail_today`，单设备统计页评级不再为 0
- `openSrsDb` promise 缓存防并发两次 `indexedDB.open`
- `syncCardStatesFromCloud` 去掉 device_id 过滤，兼容双 Tab
- `cloudPushConfig` 用 `_cloudUserId` 替代 `getSession()`

---

### v4.8 — 2026-05-05

**同步架构重构**
- 统一同步按钮：单个「🔄 同步」同时同步牌组 + SRS 状态 + 配置 + 答题记录
- 全量/轻量分离：手动/登录后全量（含牌组），自动/后台仅状态+配置（`noDecks` 参数）
- 同步进度条：`showSyncProg(1/4, '正在上传练习记录...')` 分步显示
- 移除云端 tab「刷新列表」按钮和各牌组「同步」/「下载」按钮
- 服务端已删除卡片同步时自动移除本地副本（Anki 兼容）

**参数云端同步**
- `sync_config` 表 + `cloudPushConfig()` / `cloudPullConfig()`，同账号跨设备共享
- 所有 SRS + UI 参数自动 push，登录/加载/同步时 pull

**并发下载**
- `parallelMapLimit` 3 路并发 + 卡内图音并行，实测 16 张卡 32.6s（较串联 ~82s 提速 2.5 倍）

**UI 调整**
- 设置面板改为底部 Sheet，通用/语音/文字/SRS/云端 五 Tab
- 统计页：时长显示 `1`（代替 `<1分`），标签改为「时长(分)」
- 内置测试牌组（🧪 5 张 Emoji 卡）

**CDN 媒体加速**
- Tencent Cloud COS + CDN 回源，`MEDIA_CDN_BASE` 指向 COS 域名
- `downloadMediaFromCDNorSupabase` 优先 CDN、失败回退 Supabase Storage

---

### v4.3 — 2026-03-28

**SRS 核心 Bug 修复（8项）**
- SRS 写入竞争：新增 `_lastSrsWrite` Promise 追踪，`goHome`/`openStats` 均 await 写入完成后再读数据，修复统计页显示旧状态（如 Again 后仍显示「已掌握」）
- iOS PWA `confirm()` 被屏蔽：新增 `showConfirmDialog()` 自制弹窗，修复「重置牌组」/「初始化新卡」点击无反应
- `daily_remove` 保护失效：`buildSessionQueue` 三队列（review/relearning/learning）+ `getPendingLearningCards` 均加 `_dailyRemovedToday` 过滤；达阈值后任意评分均跳过写入
- 卡片初始化不完整：`unsuspendCard reset` 改用 `newCardState()` 重建，所有字段（含 ease_factor/due_date/review_mode 等）完整归零
- `learn_ahead_limit` 缺失导致 `1d` 步骤当场毕业：新增 Anki 同名参数，主队列耗尽时只追加 due_ts 在窗口内的卡
- `advanceOneDay` interval 与 due_date 不同步：+1天时同步 `interval = max(1, interval-1)`
- SRS Tab 内容被截断：删除多余 `</div>` 修复 `sheet-panels` DOM 结构
- 统计页「本次/今日」不显示：补上 `st-session` innerHTML 末尾缺失的 `</div>`

**新功能**
- 学习/重学步骤多单位输入：支持 `m`/`h`/`d`（大小写不敏感），hint 实时显示（如 `1m · 10m · 1d`）
- `learn_ahead_limit` 参数：SRS Tab 可配置，默认 1200s（20m），与 Anki 默认一致
- 卡片状态新增「复习中」标签：`interval < maximum_interval` 显示蓝色「复习中」，`≥ maximum_interval` 才显示绿色「已掌握」
- 首页牌组列表对齐 Anki：去掉「今日」列，保留蓝色「到期」+ 绿色「新卡」两列
- 练习界面三色计数器：进度条右侧显示蓝（新卡）+ 橙（学习中）+ 绿（复习），每题更新，对齐 Anki 底部计数器
- 卡片详情「初始化为新卡」按钮：所有卡均显示，带自制二次确认弹窗
- 记录 tab 上限从 20 条改为 100 条

**UI 调整**
- 统计页标题、完成界面标题改为 `var(--ocean)` 颜色
- 卡片详情面板：`width:calc(100%-32px)`，全圆角，`bottom:8px` 悬浮
- 统计页布局：`align-items:center` 居中，topbar padding 对齐

**测试工具（发布前移除）**
- 首页底部橙色「🗑 重置牌组」+「⏭ +1天」按钮
- 卡片详情调试行：`iv=X ef=X im=X → G=X H=X`

**SRS 单元测试**
- Node.js 后台运行 67 个测试用例全部通过
- 覆盖：新卡学习路径、Review、Relearning、lapses 保护、完整生命周期、截图数据交叉验证

---

### v4.2 — 2026-03-26（浏览模式零改动确认）

---

### v4.1 — 2026-03-25

**SRS 练习流程接入**
- `_launch('quiz')` 改用 `buildSessionQueue`，生成 `session_id`
- T1 评分映射：第1次答对→Good，第2次答对（曾答错）→Hard，两次错→Again
- `_writeSrs()` 完整写入：processAnswer + TrialLog + lapses 保护 + DailyProgress
- `onNext()` async：due_ts 检查，`learn_ahead_limit` 窗口过滤追加 learning 卡
- 完成界面 `screen-finish`

---

### v4.0 — 2026-03-25

**SRS 数据层（纯新增，无 UI 改动）**
- IndexedDB `yihai_srs` v3，含 `card_states` + `trials` store（`synced_at` 索引预埋）
- 完整 `SRS_CONFIG`（Anki 命名对齐）
- `processAnswer` 状态机（Learning/Review/Relearning）
- `buildSessionQueue`（daily 槽位规则）、`DailyProgress`、`getOrCreateDeviceId()`
- 统计页：今日/牌组/卡片/记录四个 tab

---

### v3.9 — 2026-03-20

**Bug 修复**
- 浏览翻页时答案一闪而过：`onNext` 时禁用 `answer-panel` transition，显示新答案前恢复
- 首页初始不选中已有牌组：将 `currentDeck` 初始化移到 `map()` 之前

---

### v3.8 — 2026-03-20

**Bug 修复（未完全修复，v3.9 继续）**
- 尝试在 `render()` 开头清除 answer-panel 状态，未处理 transition 根本原因

---

### v3.7 — 2026-03-20

**Bug 修复**
- `warmupSpeech()` 同时解锁 TTS 和 Audio 播放权限，修复浏览模式录音不播问题

---

### v3.6 — 2026-03-20

**功能优化**
- 练习/浏览播报延迟拆分为独立参数（`SPEAK_DELAY` / `BROWSE_SPEAK_DELAY`）
- `tone('ok')` 后固定延迟 300ms 再播「回答正确」，避免与音效重叠

---

### v3.5 — 2026-03-20

**功能优化**
- 浏览模式时序重构：语音播报和文字显示延迟并行启动，不再串行等待
- 「回答正确」提示在答案名称播报之前播放

---

### v3.4 — 2026-03-20

**Bug 修复（5条）**
- 首页选牌组 `currentDeck` 未同步
- 浏览模式语音与练习模式不一致
- 浏览模式答案显示延迟失效
- 撒花/回答正确开关未生效
- `sessionId` 机制阻断跨页语音链

---

### v3.3 — 2026-03-19

**新增功能**
- 全局 `-webkit-touch-callout: none`，禁止长按菜单
- 图片禁止拖拽（`-webkit-user-drag: none`）
- WakeLock 防锁屏（iOS 16.4+，旧版静默忽略）

---

### v3.2 — 2026-03-19

**新增功能**
- 全局 `user-select: none`，禁止文字选中

---

### v3.1 — 2026-03-19

**新增功能**
- 防误触延迟参数（默认 120ms）

---

### v3.0 — 2026-03-19

- 庆祝动画回退为单一彩带方案

---

### v2.4 — 2026-03-19

**重要版本：语音功能全面改造**
- 答题提示、选项提示、答错提示、朗读物品提示各自独立开关 + 延迟配置
- `speakOptHint` 函数：解析 `{A}{B}{C}` 通配符 + 停顿符

---

### v2.3 — 2026-03-18

**重要版本：.yhspack 导入支持**
- IndexedDB 图片/录音持久化（跨会话恢复）
- 录音优先播放，降级 TTS
- 内置测试牌组（20张 Emoji 卡）

---

### v1.6 — 2026-03-17（基线版本）

- 基础功能：IndexedDB 媒体持久化、浏览/练习模式、答题交互、倒计时

---

## 已知问题

| 问题 | 状态 | 说明 |
|------|------|------|
| PWA standalone 模式底部按钮下沉 | 未解决 | `position:absolute;inset:0` 在 PWA 下高度包含 Home Indicator，待重构布局时解决 |
| Service Worker 缓存 | 暂停 | GitHub Pages App-Bound Domain 限制，待绑定独立域名后恢复 |
| 单张卡片牌组边界 | 未验证 | 理论上循环正常，未专项测试 |
| maximum_interval 触顶时 Hard=Good | 遗留 | 结构性问题，Anki 同样存在；建议使用 AD 建议值 7 |
| 答案朗读开关关闭后 TTS 仍发音 | 待修复 | `playAnswer` 缺开关控制 |
| 离线练习后登录 CardState user_id 不更新 | 待修复 | 离线下 user_id=deviceId，登录后 `syncCardStatesFromCloud` 因本地 updated_at 更新跳过覆盖，导致进度消失（Issue #26） |

---

## 关键技术决策备忘

| 决策 | 结论 | 原因 |
|------|------|------|
| sessionId 机制 | 每次 `_launch` / `goHome` 自增 | 阻断跨页面异步语音链 |
| answer-panel transition | show 前恢复，翻页时禁用 | 翻页 transition 淡出会导致新内容闪现 |
| warmupSpeech | 必须在用户手势内调用 | iOS 同时解锁 TTS 和 Audio 权限 |
| 录音播放降级 | audioBlob → TTS | 制卡工具可选录音，训练 App 需兼容无录音卡片 |
| 停顿符 `.` | 每个 100ms，可叠加 | 选项提示需要自然节奏，避免机械连读 |
| SRS 参数命名 | 与 Anki 同名对齐，不加后缀 | 跨工具一致性，便于文档对照 |
| _lastSrsWrite | 追踪最近写入 Promise | 防止 IndexedDB 写入竞争导致统计页读到旧数据 |
| showConfirmDialog | 自制弹窗替代 confirm() | iOS PWA standalone 模式屏蔽系统弹窗 |
| learn_ahead_limit | 主队列耗尽时限制追加窗口 | 防止 1d 步骤被绕过，与 Anki 行为一致 |

---

## 相关文档

| 文档 | 用途 |
|------|------|
| `忆海拾光_训练App发布检查清单.md` | 每次发版前执行 |
| `忆海拾光_训练App布局问题复盘.md` | safe area / 底部按钮问题历史记录 |
| `患者端_功能需求文档.md` | 功能设计意图和参数说明 |
| `00_导航索引.md` | 项目整体导航，跨会话恢复上下文入口 |
| `srs_design_v6_9.md` | SRS 设计规格文档 |
