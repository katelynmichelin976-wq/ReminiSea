# 忆海拾光 变更记录（CLAUDE 参考）

v4.9.1–v4.10.0 详细变更，供 AI 理解版本演进的上下文。用户面向的版本历史见 `docs/忆海拾光_训练App_README.md`。

## v5.3.2 Key Changes

- **语音文案 key 统一 camelCase**: `phraseQuizPrompt` / `phraseQuizPromptRecognize` / `phraseOptHint` 替代 v5.2 引入的 snake_case key（`phrase_quiz_prompt` / `phrase_quiz_prompt_recognize` / `phrase_opt_hint`）。cloudPushConfig / loadSettings / onSlotRowTap / onPhraseChange / setLocale / migrateVoiceSettings 全部对齐，删除废弃 key 迁移代码。
- **多实例 autoRefreshToken 竞态修复**: `restoreSession` 创建新客户端前调用 `stopAutoRefresh`，防止旧实例旋转令牌后新实例用失效令牌报 `refresh_token_not_found`。

## v5.3.0 Key Changes

- **意见反馈模块（Feedback Module）**: 用户可在「我的」页面发起反馈，无需登录。
- **入口与 UI**: `screen-mine` 新增 `mine-group`（`.mine-menu-item`），点击打开 `#feedback-overlay` 底部 sheet。sheet 含 `#feedback-textarea`（maxlength=200，必填，空提交红框 `#ef4444`，输入清框）、字数计数 `#feedback-count`（>=180 蓝色预警）、发送按钮 `#feedback-send-btn`（成功绿色，1.5s 后关闭）、脚注。
- **`collectDiagnostics()`**: 收集 `app_version / collected_at / idb_version / sync_enabled / has_session_backup / last_sync_ts / deck_count / logs / log_source / events`。IDB 读取用 `Promise.race + 2s timeout` 防挂死；JWT 和邮箱不采集（只采集 `!!localStorage.getItem('yihai_session_backup')`）。
- **`submitFeedback(userDesc)`**: 调 `collectDiagnostics()`；用 `FB_SUPABASE_URL/KEY`（测试期复用主项目）创建独立 client；`Promise.race + 5s timeout` 投递到 `feedback` 表；失败降级 `clipboard.writeText` + `localStorage.setItem('yihai_pending_feedback')`；返回 `'success'|'clipboard'`。
- **`formatFeedbackText(payload)`**: 剪贴板兜底格式：【忆海拾光 意见反馈】+ 版本/设备/时间/描述/最近错误日志（最多 3 条）。
- **`runSync` 补传**: `purgeOldLogs()` 前检查 `yihai_pending_feedback`；`_syncEnabled` 为 true 时用独立 client 补传，成功清除 key，失败 `log.warn` 静默。
- **Supabase feedback 表**: `CREATE TABLE IF NOT EXISTS feedback (id uuid PK, created_at, app_version NOT NULL, feedback_type DEFAULT 'general', user_desc NOT NULL, device_id, locale, device_info jsonb, diagnostics jsonb)`；RLS `anon_insert` FOR INSERT TO anon WITH CHECK (true)，无 SELECT policy。
- **常量**: `FB_SUPABASE_URL = SUPABASE_URL`（测试期复用）、`FB_SUPABASE_ANON_KEY = SUPABASE_ANON_KEY`、`FEEDBACK_EMAIL = 'zyhacl@gmail.com'`。
- **i18n**: zh/en/es 各 9 个 feedback key（`mine_menu_feedback / mine_menu_feedback_sub / feedback_sheet_title / feedback_placeholder / feedback_send_btn / feedback_sending / feedback_sent_ok / feedback_footnote / feedback_toast_fail`）。
- **测试**: `tests/_pw_feedback.js`（11 assertions）：函数存在性 5 + 菜单项 1 + sheet 开关 2 + 空提交红框 1 + 输入清框 1 + 关闭隐藏 1。

## v5.2.0 Key Changes

- **语音辅助系统（Voice Assistance）**: 完整语音引导框架，针对老人/儿童等不熟悉移动设备的用户，以家属录音为主要陪伴方式、TTS 为兜底。
- **playVoiceSlot(slotName, ttsText, ttsLang)**: 统一语音入口。IDB 录音优先 → TTS 兜底 → `VOICE_MUTED=true` 时静默。URL 对象在 `onended`/`onerror` 后 `revokeObjectURL` 防内存泄漏。
- **VOICE_SLOTS 注册表（11 个槽）**:
  - `fixed`（4）: `session_start`、`session_finish`、`idle_home`、`idle_browse`
  - `emotion`（5）: `wrong_hint`、`correct_hint`、`streak_correct`、`idle_quiz`、`each_day_start`
  - `functional`（2，无录音，仅编辑文本）: `quiz_prompt`、`opt_hint`
- **IDB yihai_srs 升版 v6→v7**: 新增 `voiceSlots` store（keyPath: `slotName`，字段: `audioBlob/mimeType/recordedAt`）。CRUD: `saveVoiceSlot`/`loadVoiceSlot`/`deleteVoiceSlot`/`loadAllVoiceSlots`。
- **录制覆层（#recording-overlay）**: 三态状态机（idle/recording/playback）。MediaRecorder mimeType webm→mp4 降级兼容 iOS。`REC_MAX_SEC=30`。麦克风在 `stopRecording()`/`closeRecordingOverlay()` 时释放（`MediaStream.getTracks().forEach(t => t.stop())`）。
- **功能槽文本编辑（#text-edit-overlay）**: 替代 iOS PWA 禁用的 `window.prompt()`，自定义 textarea overlay + `showTextEditOverlay()`/`closeTextEditOverlay()`/`saveTextEdit()`。`onSlotRowTap()` 对 functional 槽调用此 overlay，保存时同时写 `phrase_opt_hint`（localStorage）+ `phraseOptHint`（旧 key）+ 更新内存变量 `PHRASE_OPT_HINT`。
- **screen-voice-assist**: 全屏管理界面，顶栏 + 启用总开关 + 延迟滑块 + 三组折叠面板（手风琴）。「我的」→「语音辅助」入口。
- **设置 Voice Tab 变更**: 移除 5 个旧 toggle（`answerReadOn`/`correctHintOn`/`wrongHintOn`/`idleHintOn`/`sessionHintOn`），改为：全局静音开关（`#voice-muted-toggle`）+ 答案朗读延迟行（`#ans-read-delay-row`）+ 语音辅助入口（`#voice-assist-entry`）。
- **localStorage 迁移（migrateVoiceSettings）**: 旧 5 个 boolean 键（`answerReadOn`/`correctHintOn`/`wrongHintOn`/`idleHintOn`/`sessionHintOn`）迁移到 content-as-toggle 模型。`toggle=1` 时将旧文本值迁移到新键，`toggle=0` 时清空新键（视为删除录音）。`correctHintOn` 保留在 localStorage（不进清理数组），供现有 `CORRECT_HINT_ON` 变量读取直到完全废弃。
- **触发点**:
  - `_launch()`: `session_start`（500ms delay），`each_day_start`（1200ms，按 `lastPracticeDay` localStorage key 每日首次守卫）
  - `showFinish()`: `session_finish`（800ms）
  - `onSel()` 答对分支: `streak_correct`（`_correctStreak===3` 时触发，然后设为 999 防重复，答错/新 session 重置）
  - `goHome()` + tab bar 按钮: `startIdleHomeTimer()`（8s，60s 冷却）
  - `render()` 末尾: `startIdleQuizTimer()`（15s，60s 冷却）
  - `_renderBrowseCard()` 末尾: `startIdleBrowseTimer()`（10s，60s 冷却）
  - `showScreen()` 顶部: `clearIdleTimers()`
- **quiz_prompt 分支**: `startCardPrompts()` 中，`card_type==='recognize'` 时读 `phrase_quiz_prompt_recognize` 键（默认「认识这个人吗」），否则读标准 `phrase_quiz_prompt`。
- **card_type/ext 扩展**: `restoreDecks()` 中补全 `card.cardType = card.cardType || card.card_type || 'choice'`; `card.ext = card.ext || {}`。Supabase `cards_pool` 新增 `card_type TEXT NOT NULL DEFAULT 'choice'`、`ext JSONB NOT NULL DEFAULT '{}'`（MCP 已执行）。
- **alert/confirm 替换**: `toggleRecording()`/`saveVoiceRecording()` 中的 `alert()` 改为 `showToastMsg()`。回退按钮 onclick 补 `closeRecordingOverlay()` 防止麦克风泄漏。
- **i18n**: 新增 18 个 voice 相关 key（`voice_slot_*`/`voice_default_*`/`settings_voice_assist`/`settings_va_entry` 等），三语言（zh-CN/en/es）。
- **单元测试**: `tests/yihai_v5.2_voice_test.js`（8 assertions，迁移逻辑 + i18n key 存在性）。Playwright `_pw_ui_smoke.js` 新增 6 个断言（Phase 9），合计 47 个。

## v5.2.2 Key Changes

- **`_sessionRestoring` 标志（修复缺陷 1/2/3/5）**: 新增全局 `let _sessionRestoring = false`。`restoreSession()` 开头置 `true`，`finally` 块统一置 `false` 并调 `updateCloudTabUI()`（各路径内部的 `updateCloudTabUI()` 调用全部移至 finally）。`renderAccount()` 将条件 `!_cloudUserEmail && localStorage.getItem('yihai_session_backup')` 改为 `_sessionRestoring`，彻底消除用 backup 存在与否代理恢复状态的根因。SDK CDN 不可达时 `_sessionRestoring` 从未被置 `true`，账号页直接显示登录表单（缺陷 5 副作用修复）。
- **`openSrsDb` IDB blocked 防挂死**: 新增 `req.onblocked` 处理器，8s 后 reject 并打 `console.warn`；补全缺失的 `return _srsDbPromise`（修复首次调用返回 undefined）。
- **`doAccountLogin` 15s 超时**: `signInWithPassword` 改为 `Promise.race([..., 15s timeout])`，网络死挂时 finally 块恢复按钮可用状态。
- **`if (!_sb)` 双客户端防护**: `doAccountLogin()` 中改为 `if (!_sb) _sb = _createSupabaseClient()`，避免已有 `_sb` 实例被二次登录替换。
- **`runSync` catch 块 toast**: 将 `if (options.showToast)` 改为 `if (options.showToast || options.modal)`，modal 同步失败（含 IDB blocked）时用户能看到错误提示。
- **测试覆盖**: 新增 `_pw_session_restore.js`（13 断言）、`_pw_sync_guard.js`（7 断言，含 IDB blocked 回归）；`_pw_ui_smoke.js` 修复 Task 7 `assert.ok` 哑火问题并新增 openSrsDb 断言（合计 54）；`_pw_cloud_sync.js` 新增双客户端防护 PHASE 10（合计 28）。

## v5.1.6 Key Changes

- **术语统一**: 首页 `home_album_section` i18n key 的值从「我的相册 / My Albums / Mis Álbumes」改为「我的牌组 / My Decks / Mis Mazos」。HTML fallback 文本同步更新。CSS class（`album-section-lbl`）及代码内部标识符（`deck`/`DECKS`）不变。决策：「牌组+卡片」= Deck+Card，与 Anki 中文版术语对齐。

## v5.1.5 Key Changes

- **移除 publishDeck**: 删除「发布」按钮（`#dd-publish-btn`）、JS 可见性逻辑、`publishDeck()` 函数体、3 种语言 i18n key（`common_publish`/`deck_published_ok`/`deck_publish_fail`）。原因：preset/shared 权限边界未确定，普通用户不应直接将 deck_type 改为 preset。
- **migrateMediaKeys race condition 修复**: `restoreDecks()` 中将 `setTimeout(() => migrateMediaKeys(rawIdx), 0)` 改为 `await migrateMediaKeys(rawIdx)`。从 v5.1.3 升级时，localStorage deck key 已即时迁移（去 `cloud_` 前缀），但 IDB blob key（`cloud_xxx_cardId_img` → `xxx_cardId_img`）被延迟执行，导致 `restoreDecks` 中 `loadMedia(newKey_cardId_img)` 找不到 blob，所有云端牌组图片显示为空。改为顺序 await 后，IDB 迁移完成才继续加载卡片。

## v5.1.4 Key Changes

- **Migration 010**: 新建 `decks`（`id TEXT PK, user_id, name, deck_type, card_count, updated_at`）和 `deck_cards`（`id BIGINT AI, deck_id FK, card_id, name, image_url, audio_url, sort_order`）。RLS：preset/shared 类型全员可读，personal 仅 owner 可读写。从 `server_decks`/`cards_pool`/`server_deck_cards` 迁移 preset 数据。删除废弃表 `card_state_log`、`upload_log`。
- **Deck key 格式变更**: 旧格式 `cloud_XXXXXXXX`（带前缀）→ 新格式直接用 `decks.id`（8 字符 UUID 片段或完整 UUID）。`DECKS_META` 新增 `deck_type: 'preset'`（旧 `source: 'cloud'` 废弃）。`downloadDeckFromCloud` 改查 `deck_cards`（字段 `card_id/name/image_url/audio_url/sort_order`），不再查 `server_deck_cards`+`cards_pool`。
- **个人牌组云端同步**: `uploadDeckToCloud(deckKey)` — 上传本地牌组到 `decks`+`deck_cards`（deck_type='personal'）。`checkPersonalDeckUpdates()` — session 就绪后对比 `decks.updated_at` 拉取更新。`saveDeck`/`deleteDeck` 触发 `uploadDeckToCloud`/`_sb.from('decks').delete()`。
- **发布机制**: `publishDeck(deckKey)` — 将 `decks.deck_type` 更新为 `'preset'`，更新 `updated_at`，触发牌组列表刷新。牌组详情屏增加「发布」按钮（仅 `deck_type='personal'` 的牌组显示）。
- **回归测试对齐**: `_playwright_cross_device_sync_test` 全面重写（server_decks→decks，old login UI→helper.cloudLogin，settings sync btn→runSync()，localStorage key去cloud_前缀）。cloud_test PHASE6 主题检测改用 `getAttribute('data-theme')`，jade/amber 替代 dark/light。v4.10_regression/session_mode_queue 同步适配。

## v5.1.3 Key Changes

- **`_syncEnabled` 门禁**: `updateMineProfile()` 和 `renderAccount()` 的登录状态判断从 `_cloudUserEmail` 改为 `_syncEnabled && _cloudUserEmail`。session 恢复失败时 `_cloudUserEmail` 已有值但 `_syncEnabled=false`，此前会误显已登录头像和邮箱（显示为在线状态），修复后正确显示离线/未登录状态。

## v5.1.2 Key Changes

- **云端 UI 整合**: 删除设置面板「云端」Tab（`tab-3` / `cloud-login-section` / `cloud-connected-section` / `cloud-restoring-section`）。所有登录/登出/同步 UI 统一到 `screen-account`（账户屏）。删除 `doCloudLogin()`、`doCloudLogout()` 函数，登出逻辑内联到 `doAccountLogout()`。
- **导入入口统一**: 删除散落的 `.yhspack` 导入触发点：首页隐藏 `#importFile` input、「我的」导入文件菜单项、Action Sheet「导入文件」和「从链接下载」按钮。导入操作统一走账户屏。
- **updateCloudTabUI 进一步简化**: 仅保留 `updateMineProfile()` + `renderAccount()`，云端 DOM 操作全部移除。
- **CSS**: `home-tabbar` 改为透明背景 + `::before` 伪元素圆角浮动风格；`mine-scroll` 加 `width: 100%; max-width: 500px; margin: 0 auto`；`home-scroll` 底部 padding 补全；平板媒体查询补全 `mine-scroll`/`mine-topbar`。

## v5.1.1 Key Changes

- **Session restore 重写**: `restoreCloudSession()` → `restoreSession()`。删除 3 级恢复链（L1 getSession → L2 setSession with isRealLogout regex → L3 300ms retry），改为单次 getSession() + 7s 超时。任何失败统一离线（`_syncEnabled=false`），保留 `_cloudUserEmail`。online 事件监听内联到 restoreSession 失败分支，不再需要独立的 `_scheduleSessionRetry()`。
- **状态模型简化**: 删除 `_sessionRestoring`（SDK 加载中）、`_sessionOffline`（凭证+网络失败）、`_onlineListenerActive`（防重注册）。UI 状态由 3 变量推导：`_syncEnabled=true` → 在线；`_syncEnabled=false && _cloudUserEmail` → 离线（📵）；`_cloudUserEmail` 为空 → 未登录。
- **updateCloudTabUI 简化**: 4 分支 → 3 分支，移除 `_sessionRestoring` 和 `_sessionOffline` 引用。`cloud-restoring-section` DOM 节点保留但不再被 JS 引用。
- **initCloud 简化**: 移除 `_sessionRestoring=true/false` 管理，移除 redundant `session_restore_start` 日志，SIGNED_OUT 处理不再区分 `_sessionOffline`。
- **CSS 修复**: `.home-topbar` 添加 `max-width:500px`（其他 topbar 均已有，仅此遗漏）；`.sheet-section` padding `20px` → `16px`；`.sheet-tabs` padding `8px` → `16px`。

## v5.1.0 Key Changes

- **Wave 1 导航重构**: 首页改为 Tab Bar（首页/FAB/我的）。新增独立屏：`screen-browse`（浏览）、`screen-account`（账户）、`screen-deck-detail`（牌组详情，左滑重命名/导出/删除）、`screen-create-card`（制卡表单）。设置改为底部 Sheet overlay，不再是独立 screen。旧 `.home-gear-btn` 顶栏按钮删除。
- **阶段 0 i18n 地基**: 新增 `detectLocale/t/getLocale/setLocale/detectScript/scriptToLang/resolveFieldLang/normalizeField`。TTS `speak()` 使用字段 `lang` 而非固定 zh-CN。`.yhspack` 导入时 `normalizeField` 自动推断 `lang`。
- **i18n Stage 1**: 221 key × 3 语言（zh-CN/en/es）存入 `STRINGS` 常量；JS 所有硬编码中文替换为 `t(key)`；`data-i18n`/`data-i18n-placeholder`/`data-i18n-aria`/`data-i18n-content` 属性 + `applyI18n()` 全页扫描。
- **牌组列表事件委托**: `initDeckSwipe(grid)` 注册 click/touchstart/move/end/cancel，`onDeckClick` 委托到 `.deck-card-inner`（`e.target.closest`），触摸左滑展开操作按钮，点击进详情。
- **医疗术语清理**: 删除 AD 建议值功能（`_adMode`/AD 默认 SRS 参数），`<meta name="description">` 改「记忆练习」。
- **PWA 诊断面板移植**: 版本号连击 5 次打开诊断面板（移植自 v4.11.19，适配 Wave 1 DOM 结构）。
- **回归测试修复**: `_playwright_test.js` 更新 deck 选择方式（`.deck-card-inner` + `selectDeck(inner)`）和统计入口（`openStats()`），适配 Wave 1 导航变更。

## v4.11.19 Key Changes

- **PWA 诊断面板入口**: 版本号连击 5 次即可在 PWA standalone 模式（无书签栏）打开诊断面板，不再依赖 bookmarklet 注入。加载 `https://katelynmichelin976-wq.github.io/ReminiSea/tests/yh_diag.js`，支持 toggle 显示/隐藏。
- **诊断面板拖拽**: yh_diag.js 改为 `position:fixed` + `left` 定位（原 `right:0`），标题栏使用 pointer events 实现拖拽，支持鼠标/触摸，并限制边界防止拖出视口。

## v4.11.18 Key Changes

- **登录后同步补 events:true**: `doCloudLogin` 触发的 `runSync` 加入 `events: true`，与手动「🔄 同步」按钮行为一致，登录时自动上传本地积压的 app_events 日志（包含 session_restore 诊断事件）。

## v4.11.17 Key Changes

- **session_restore L2 正则修复**: `isRealLogout` 正则 `refresh_token_not_found`（下划线）匹配不到 Supabase SDK 实际返回的空格写法 `"Invalid Refresh Token: Refresh Token Not Found"`，导致 `isRealLogout=false`，进入 offline 分支显示"网络不稳定"。改为 `refresh.token.not.found`（`.` 匹配任意字符，兼容下划线和空格两种格式）。检测到真实登出后增加 `localStorage.removeItem('yihai_session_backup')` + `return`，清除失效备份并跳过 L3/offline 兜底，直接显示登录界面。

## v4.11.16 Key Changes

- **分级诊断日志系统**: 新增 `log.*`（debug/info/warn/error）两层架构。IDB 升级 v5→v6，新增 `yh_logs` store（keyPath: log_id autoIncrement，timestamp 索引，保留最近 300 条）。等级配置：URL `?log=debug` > `localStorage yihai_log_level` > 默认 `'warn'`。`window.yhLog` DevTools 工具（setLevel/show/showErrors/export/clear）。
- **warn/error 上传 Supabase**: `syncAppEvents` 读取 `yh_logs` 中未同步的 warn/error，封装为 `app_events`（event_type=`'log:warn'`/`'log:error'`）上传。
- **markEventSynced 批量写回修复**: 改为单事务批量写回 `synced_at`，删除旧的 fire-and-forget 调用；`uploadAppEvent` 返回 bool。
- **runSync 竞态修复**: `downloadDeckFromCloud`/`syncDeckFromCloud` 在 `noToast=true`（由 runSync 调用）时跳过 `updateDeckStats()`，避免 IDB 状态未就绪时覆盖 runSync 后续写入的正确值。
- **getDeviceInfo catch 修复**: catch 块返回 `{}` 而非 `null`，避免 `device_registry.device_info` 存入 SQL NULL。

## v4.11.15 Key Changes

- **getDeviceInfo 格式修复**: 原先返回 `JSON.stringify({...})` 字符串，Supabase JS SDK 将其存为 jsonb `string` 类型而非 `object`，导致 `->>` 操作符无法提取字段。改为直接返回对象，SDK 自动处理序列化。同步用 `(device_info #>> '{}')::jsonb` 修复线上 sync_trials（433行）和 device_registry 历史数据。

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
