# 忆海拾光 变更记录（CLAUDE 参考）

v4.9.1–v4.10.0 详细变更，供 AI 理解版本演进的上下文。用户面向的版本历史见 `docs/忆海拾光_训练App_README.md`。

## v5.13.19 — 二级页返回来源页 + 删除浏览引导/每日学习目标 + 语音默认文案/清理废弃参数

### 导航：二级页返回回到来源页（修复）

theme/about/account → 我的、reset-password → 账户、create-card → 牌组详情、deck-detail 来源追踪（新增 `_deckDetailOrigin` + `backFromDeckDetail()`），不再一律 `goHome()` 回首页。`screen-quiz`/`screen-finish` 回首页是练习流程正常设计，未动。

### 语音/参数清理

- **删除浏览引导**：移除 `idle_browse` 语音槽 + 定时器全套（`startIdleBrowseTimer`/`clearIdleTimers`/`_idleBrowseTimer`/`IDLE_BROWSE_SEC`/`IDLE_COOLDOWN`）+ 调用点 + 5 语种 i18n（`voice_slot_idle_browse`/`voice_default_idle_browse`）+ `phraseIdleBrowse` 字段（`VOICE_FIELDS`/`PHRASE_VOICE_FIELDS`/云端字段列表）。
- **答对鼓励默认** → 「回答正确」（5 语种 `voice_default_correct_hint`）。
- **读出选项默认** → 「请在{A}.{B}.{C}中选择一个符合图片上的东西」（5 语种 `default_opt_hint`，`.` 为停顿标记，日文由 `・` 统一为 `.`）。
- **删除「每日学习目标」**：该控件实为 `maximum_reviews_per_day` 的重复滑块、无独立引用 → 删整个「目标」设置分区 + `onDailyGoalChange`/`loadDailyGoalUI` + 2 处调用 + 5 语种 i18n。
- **移除废弃 SRS 参数**：`hard_step_multiplier`（已标 deprecated）、`t1_review_before_mix`、`t1_mix_before_t7`（定义后从未被读），同步从 `SRS_PRESETS` 移除。

### 测试

- 新增 `tests/_pw_nav_back.js`（14 断言）：6 个二级页返回目标 + deck-detail 双来源追踪。
- 新增 `tests/_pw_voice_cleanup.js`（14 断言）：idle_browse 删除 / 默认文案 / 每日学习目标 UI / 废弃参数。
- `yihai_v5.14_ls_test.js` / `yihai_v5.16_lang_phrases_test.js` 同步去 `phraseIdleBrowse`。
- 回归：单元 706 + ui_smoke 68 + srs_e2e 21 + easy 28 + config_sync 23 + nav_back 14 + voice_cleanup 14 全绿。

## v5.13.18 — 内置牌组改名 + Playwright 覆盖率 baseline + 上架文档三件套

### 内置示例牌组改名

「测试牌组」→「示例·看图识物」（5 语种 `deck_builtin_label` i18n key）。上架前用户面向命名规范化，避免「测试」字样在 App Store 评审看到。

### 产品文档三件套

- `docs/功能特性.md`：功能全景图（从代码反推产品视角）
- `docs/初心与演化反思.md`：初心 vs 演化对照（产品意图与实现一致性 review）
- `docs/上架就绪清单.md`：P0/P1/P2 发布前事项（含 9.4/9.5 测试工具栏/调试行核查标记已完成）

### Playwright 测试覆盖率 baseline（工程基础设施）

新增 `monocart-coverage-reports` 集成 + 23 个 Playwright 套件全部改造采集 V8 coverage：

- 脚手架：`_playwright_helper.js` 加 `startCoverage` / `stopAndCollectCoverage` / `stopAndCollectFromBrowser`（`YIHAI_COVERAGE=1` 门控，平时 noop 零开销）
- `scripts/build-coverage-report.js`：合并 V8 raw → HTML + lcov + console summary（含 inline `<script>` 行号映射）
- `scripts/run-all-pw.js`：批量跑所有 _pw_*.js + 容错继续
- CLAUDE.md 加「测试覆盖率」章节
- spec `docs/superpowers/specs/2026-06-16-test-coverage-baseline-design.md` §12 含完整 baseline 数据

**baseline 数据**（25 raw / 23 套件 / 25 通过 1 flaky）：
- Statements 55.89% / Branches 42.33% / Functions 54.29% / Lines 61.81% / Bytes 66.29%

**关键发现**：
- V8 把 `index.html?v=<ts>` 视为独立 entry → helper 写 raw 前 `.split('?')[0]` 规范化（否则数字虚低 17%）
- monocart 原生支持 inline `<script>` in HTML，行号正确映射

### 修测试套件适配 v5.17 deckid salt

- `_pw_media_recovery` / `_pw_sync_scenarios`：查询用 `toServerDeckId(key, 'personal', _cloudUserId)` 拼 server id（v5.17 加盐后云端 `decks.id` = `localKey~userId`）
- `_pw_easy_sync.setupDevice`：加显式 `runSync({ decks: true })`（v5.13.12+ 登录不再自动拉 preset）
- `_pw_media_upload`：测试文件路径 `../家人.yhspack` → `tests/test_data/家人.yhspack`

### 测试

- 单元：17 套件 / 706 断言全过
- 最小回归：`_pw_ui_smoke`(68) / `_pw_srs_e2e`(21) 全过
- 全 23 Playwright 套件 with coverage: 25/1（`_pw_media_upload` PHASE 3 UI 渲染时机 flaky，pre-existing）

### 遗留

- `_pw_media_upload` PHASE 3 「首页卡片列表 `<img src="blob:...">` 渲染」flaky 待修
- HTML 报告 → 未覆盖业务核心函数清单分析（推 P3）
- 覆盖率 CI 集成 / 门槛（推 P3）

## v5.13.17 — 多语种 PP/ToS（英文 + 繁体）+ locale 链接路由（P2 #4）

### 动机

v5.13.13 P1 只提供中文 PP/ToS，登录/注册 form consent 链接硬编码中文 URL。本版本补全英文 + 繁体版本（覆盖海外华人社区主要需求），同时让主 app 中 PP/ToS 链接根据当前 locale 自动路由。

### 方案

文件命名约定 `{name}_{locale}.html`：
- `privacy.html` / `terms.html`（zh-CN，P1 不动 URL）
- `privacy_en.html` / `terms_en.html`（新建，英文全文 13 章节）
- `privacy_zh-Hant.html` / `terms_zh-Hant.html`（新建，简→繁转换 + 词汇本地化「軟體/網路/影片/品質/實施」等台湾习惯）

每个 PP/ToS 顶部加 lang-nav 互相跳转。

### 改动边界

- 新增 `_localizedUrl(filename)` / `getPrivacyUrl()` / `getTermsUrl()` 函数：locale === 'en'/'es'/'ja' → `_en.html`；'zh-Hant' → `_zh-Hant.html`；其他 → `*.html`（默认 zh-CN）。es/ja fallback 到英文版（人工翻译质量未保证，先以英文兜底）。
- 新增 `_refreshConsentLinks()`：刷新 4 个 `<a id>`（`consent-login-privacy-a` / `consent-login-terms-a` / `consent-register-privacy-a` / `consent-register-terms-a`）的 href。
- `setLocale` 末尾调用 `_refreshConsentLinks`；启动序列加 `setTimeout(_refreshConsentLinks, 0)` 初次刷新。
- 登录/注册 form 4 处 `<a>` 加 id（href 仍保留 zh-CN 兜底，JS 启动后即刷新）。
- `showConsentUpgradeDialog` body 改用 `getPrivacyUrl()` / `getTermsUrl()` 动态拼接。

### 测试

- `tests/_pw_consent_lang_url.js`：13 断言 7 phase（zh-CN / en / zh-Hant / es-fallback / ja-fallback / 还原 / dialog 内链接随 locale）。无需登录。
- `tests/_pw_consent_checkbox.js`：Phase 3 加 `setLocale('zh-CN')` 前置（Playwright 默认 navigator.language='en-US' 会让启动初次刷新把链接路由到 `_en.html`，破坏 P1 假设）。
- 回归：单元 17×706 + `_pw_ui_smoke`(68) + `_pw_srs_e2e`(21) + `_pw_consent_checkbox`(14) + `_pw_consent_lang_url`(13) 全绿。

### 部署前 ops

- grep 6 个 HTML 占位符必须替换：`[开发者姓名待填]` / `[Developer Name TBD]` / `[開發者姓名待填]`。
- 翻译为 AI 生成，未经律师 review，正文按 v1.0 上线，待 P2 #6 律师复核后修订。

### 遗留

- es / ja 完整翻译推后；fallback 到英文版的设计已稳定，未来加翻译只需新建文件 + 修 `_localizedUrl` 路由。
- App Store 隐私标签 JSON（P2 #5）。

## v5.13.16 — 诊断日志按模块配额选取（voice 降采样）

### 动机

妈妈练习后反馈携带的 `local_log` 共 193 条、几乎全是 `voice` 模块的 TTS 链事件（每答一张卡发 ~10-13 条：`slot_tts`/`tts_speak`/`tts_onend`/`correct_click`/…）。`collectDiagnostics` 只带最近 500 条，voice 一多就把 `sync`/`srs` 等关键日志挤出反馈载荷，排查同步问题时反而看不到。

### 改动

- 新增纯函数 `selectDiagnosticLog(logs, opts)` 替换 `LOCAL_LOG.slice(-500)`：
  - **warn/error 全保**（任何模块，不限量）——异常永不丢
  - voice info 最近 `voiceMax`（默认 60）
  - 其余 info 最近 `otherMax`（默认 240）
  - 按时间戳升序归并
- 只改 `collectDiagnostics` 一处 + 新增纯函数，**不碰 TTS 链热路径**（`log.info` 调用零改动）。

### 未做（留待按需）

第二层"发射端降冗余"（去 `tts_onend` / 合并 `slot_tts`+`tts_speak`）暂不做——`LOCAL_LOG` 2000 缓冲对日常 easy 局（15/19/23 卡）足够，且去 `tts_onend` 会损失 TTS 链时间线排查能力。

### 测试

- `tests/yihai_v5.18_diaglog_test.js`：7 断言（warn/error 全保、各类配额截断、voice 刷屏不挤掉非 voice、时序、默认值、空输入）
- 回归：单元 706 + `_pw_ui_smoke`(68) + `_pw_srs_e2e`(21) + `_pw_feedback`(11) 全绿

---

## v5.13.15 — 同意状态云同步 + 协议版本升级弹窗（P2 #1+#2+#3）

### 动机

v5.13.13 P1 在登录/注册 form 加了同意 checkbox + 本地 LS 记录同意状态，但不跨设备同步——A 设备勾过的同意状态在 B 设备登录后还要再勾一遍；PP/ToS 文本变更后无法触发已登录用户重新征同意。本版本补全云同步 + 版本升级流程。

### 方案

复用现有 `sync_config.config_json jsonb` 加顶层 `consent: { version, at }` 段（零 DB schema migration）。新增代码常量 `CONSENT_PROTOCOL_VERSION = 'v1'`——bump 此常量驱动全用户重新征同意。

### 改动边界

- 常量 `CONSENT_PROTOCOL_VERSION` + 纯函数 `_compareConsentVersion` / `_mergeConsent`：同版本取较晚 at；跨版本取高位 version。
- `cloudPushConfig` 收尾段从 LS 读 consentAt+consentVersion，与云端 cloudCfg.consent merge 后随 ui/srs 一并 upsert。
- `cloudPullConfig` 拉取后 merge 写回 LS；末尾 `setTimeout(checkConsentUpgrade, 0)` 异步检查协议版本。
- `checkConsentUpgrade`：LS consentVersion ≠ CONSENT_PROTOCOL_VERSION → 弹 `showConsentUpgradeDialog`；`_consentUpgradeInFlight` 防重入。
- `showConsentUpgradeDialog`：复用 `showConfirmDialog`（扩展签名 opts: confirmText/cancelText/html/dismissable），含 PP/ToS 链接。接受 → `_writeConsentLs` + `cloudPushConfig`；拒绝 → 已登录 `doAccountLogout` + `screen-account`；未登录 → toast。
- `doAccountLogin` / `doRegister` 成功后追加 `cloudPushConfig()`，让本设备勾的同意立刻同步到云。
- 启动序列加未登录 P1 用户的升级检查（LS 已有 consentVersion 才检查，避免拦新装用户）。
- `_writeConsentLs` 硬编码 `'v1'` → `CONSENT_PROTOCOL_VERSION` 常量。
- i18n 4 key × 5 语种：`consent_upgrade_title` / `consent_upgrade_msg` / `consent_upgrade_accept` / `consent_upgrade_decline`。
- `tests/_playwright_helper.js cloudLogin`：保留 master 已有的 `_updateLoginConsent()` 写法（v5.13.13 后登录门控）。

### 测试

- `tests/yihai_v5.13.13_consent_test.js`：纯函数单测 24 cases（_compareConsentVersion 跨版本/null/容错；_mergeConsent 同版本/跨版本/对称/边界）。
- `tests/_pw_consent_sync.js`：E2E 6 phase 13 断言（未登录同/旧版本启动检查、push/pull 跨设备传播、已登录接受/拒绝分流），需登录账号。
- 回归：单元 699 + `_pw_ui_smoke`(68) + `_pw_srs_e2e`(21) + `_pw_config_sync`(23) 全绿。

### 兼容性

- 老 P1 用户首次启动 v5.13.15 时 LS 已有 consentVersion=v1，与 CONSENT_PROTOCOL_VERSION 一致，无弹窗。
- 老 sync_config.config_json 无 consent 字段时 `cloudCfg?.consent` 取 undefined，merge 函数允许 cloud=null，向后兼容。
- 未来 PP/ToS 实质性条款变更时，bump `CONSENT_PROTOCOL_VERSION` 到 `'v2'`，发布后所有用户登录/启动时弹升级框。

### 遗留

- App Store 隐私标签 JSON 配置（P2 #5）、英文/zh-Hant/es/ja PP/ToS HTML 翻译版（P2 #4）、consent_records append-only 历史表（P3）均推后。
- `daily_progress` / `last_warmup` 仍仅本地（dev rule #14）。

## v5.13.14 — 个人牌组 deck id 加盐（修复跨用户导入主键冲突）

### 动机

同一个 `.yhspack` 被不同用户导入后，云端同步报 RLS 错误。根因：`decks.id` 是全局单列主键，而个人牌组 `deck_key` 由内容/名字哈希派生——两个用户导入同一文件得到相同 deck_key，第二个用户 upsert 时触发 `ON CONFLICT UPDATE`，但行 owner 是别人，RLS `user_id = auth.uid()` 拦截。实际触发：开发者账号先上传了「蔬菜水果」（id=`3e85da18`），妈妈导入同名文件同步即冲突。

经查 `sync_trials` / `easy_card_states` 均带 `user_id` 且 `deck_key` 无跨用户唯一约束，本就容忍多用户共用本地 key；Storage 路径已 `personal/{userId}/...` 隔离。**唯一真正撞的只有 `decks.id`**。故不改复合主键（会破坏 `deck_cards.deck_id` 外键 + 需加列回填 + 重写 RLS），改为只在同步边界给个人牌组 server id 加盐。

### 方案（Option B：可逆拼接）

- 新增纯函数 `toServerDeckId(localKey, deckType, userId)`：personal → `localKey + '~' + userId`；preset/shared → 原样。`fromServerDeckId(serverId)`：含 `~` 取第一段还原。本地 key 为 hex/uuid，绝不含 `~`，往返安全自描述。
- **本地 key / DECKS_META / sync_trials / easy_card_states / Storage 路径 / IDB 全不动**，只在读写 `decks`·`deck_cards` 的同步边界转换。
- 铁律：传给 `.from('decks'|'deck_cards')` 的 id/deck_id 用 server id；IDB/Storage/DECKS_META/getDeckSync 用本地 key。

### 改动边界

- 上传写：`upsertDeckRow` / `upsertCardsBatch` / `upsertCardsMediaBatch` / `deleteCardsBatch`。
- `SyncJob`：缓存 `this.serverId`，`runStructurePhase` / `runCardsPhase` / `fetchAllDeckCards` 查询用 server id；`loadMedia` / `buildPath` 仍用本地 key。
- 下载：`downloadDeckFromCloud`（preset，裸 id 不变）、`downloadPersonalDeckFromCloud`（personal，入参本地 key、内部转 serverId 查云端）、`syncDeckFromCloud`（本就按 name 取本地 key，无需改）。
- 列表 UI：`renderCloudDecksTab` / `showCloudDecks` / `refreshDeckUpdateBadges` 用 `fromServerDeckId` 映射本地 key。
- 删除：`deleteDeck` 个人牌组分支用 server id。

### 存量迁移

`sql/migrate_personal_deck_id_salt.sql`：drop FK → 重定向 `deck_cards.deck_id` → 改 `decks.id` → 重建 FK。幂等（`position('~' in id)=0` 守卫）。**须在代码发布同一维护窗口执行**（新旧 id 格式不能长期并存）。`media.url`（含本地 key 的 Storage 路径）与 trials/easy 的 deck_key 不动。

### 测试

- `tests/yihai_v5.17_deckid_test.js`：加盐纯函数 8 断言（从 index.html 抽取真实源码）。
- `tests/_pw_deck_id_salt.js`：真实 RLS 端到端 7 断言（同步无报错、云端 id=`localKey~userId`、无裸 key 污染、deck_cards 在 salted id 下、清理）。
- `tests/_pw_media_upload.js`：适配 salt（清理/校验查询用 server id）。
- 回归：单元 699 + `_pw_ui_smoke`(68) + `_pw_srs_e2e`(21) 全绿。

### 遗留

`downloadDeckFromCloud` 下载 preset 时硬编码 `deck_type='preset'`（既有行为，与本次无关）。

---

## v5.13.13 — sync/cloud/SRS 错误路径写入 LOCAL_LOG 诊断缓冲

### 动机

妈妈账号导入 `蔬菜水果.yhspack` 后同步报错，但 feedback 上报的 `local_log` 为空，只能翻 Postgres 服务端日志才定位到根因（个人牌组 `deck_key` 与开发者账号已上传的同名牌组冲突，upsert ON CONFLICT 触发 RLS `user_id = auth.uid()` 拦截）。

根因：`LOCAL_LOG`（feedback 携带的诊断 ring buffer）只接收 `log.info/warn/error()` 写入，而所有 sync 错误路径用的是裸 `console.warn` / `console.error`，绕过 `LOCAL_LOG`；异常又被 `try/catch` 吞掉，连 `window.unhandledrejection` 都不触发。结果同步类错误对 feedback 诊断完全不可见。

### 改动

约 30 处裸 `console.warn` / `console.error` 替换为 `log.warn` / `log.error`（行为无损——`_push` 内部仍调用 console，同时追加 `LOCAL_LOG`）：

- **云端同步**：trial/cardState/config 上传下载、backfill、runSync、syncDeck/dirtyDeck、final upsertDeckRow、login/account/logout、featured download/sync、easy state pull/write、sync 顶层 catch
- **媒体**：upload/download fail、cloud img/aud fail、downloadSlot
- **数据/操作**：`_writeSrs`（规则 15，静默丢 TrialLog 最该捕获）、import/export .yhspack、buildSessionQueue 构造失败、restoreDecks skipping card/deck、cloud download error、gc deleteCardStates、share/download

**保留**裸 console（有意）：启动迁移（log 未必就绪 + 低价值）、`yh_diag` 诊断面板（本就 verbose 且用户主动触发）、高频 saveMedia（会刷屏 LOCAL_LOG）、js_error 上报兜底（改 log 有递归风险）、次要 UI 渲染（updateDeckStats）。

### 关联数据修复（非代码）

删除开发者账号 `06b9d739` 占用的 `decks.id='3e85da18'` + 33 条 deck_cards，解除妈妈账号 upsert 的 RLS 冲突。妈妈手动同步后牌组（33 卡 + 66 媒体文件）正常上传。

### 遗留

`decks.id` 为全局唯一主键 → 同一 `.yhspack` 被多个用户导入会主键冲突（第二人同步必失败）。根治需将个人牌组 PK 改为 `(id, user_id)` 复合键 + 调整 `syncDeck` upsert conflict target，另立计划。

### 测试

行为无损改动。单元 667 断言 + Playwright `_pw_ui_smoke`(68) / `_pw_srs_e2e`(21) / `_pw_js_error_report`(10) 全绿。

---

## v5.13.12 — 精选牌组 tab + 同步按钮去耦合 + yh_diag 同步重构

### 动机

牌组管理「精选」段一直是占位（"精选牌组即将上线"）。同时「同步」按钮 + 登录后自动 sync 内部会下载所有云端 preset 牌组（`runSync({ decks: true })`），用户感知不到、modal 时间也被拉长。本版本把 preset 下载入口集中到牌组管理「精选」tab，同步按钮专注做 SRS 同步。

诊断面板 `yh_diag.js`（GitHub Pages CDN 加载）因为这几轮重构（P1-P4 IDB rename / LS Phase 3 / 本地日志重设计）落下了，本版本一并同步。

### 改动

#### 精选牌组 tab 实现（`feat: 8f3f03c`）

- `index.html:#decks-panel-featured` 占位 div 替换为 `<div id="featured-decks-list">`
- 新增函数 `showFeaturedDecks` / `renderFeaturedDecksTab` / `doDownloadPresetDeckAction` / `doSyncPresetDeckAction`
- 拉 `_sb.from('decks').select(...).eq('deck_type','preset')` 列表
- 按本地存在状态显示「下载」/「同步」/「已同步」/「待下载」badge，复用现有 `downloadDeckFromCloud` / `syncDeckFromCloud` / `_downloading` 进度机制
- `switchDecksTab` 加 `featured` 路由
- 新增 4 个 i18n key × 5 语种（`featured_loading` / `featured_empty` / `featured_load_fail` / `featured_login_required`），废弃 `decks_featured_coming`

#### 同步按钮去耦合

`doAccountLogin` (L6287) + `doAccountSync` (L6546) 两处 `runSync` 调用：`decks: true` → `decks: false`。`runSync` 内 `if (options.decks)` 分支保留代码不动，等几个 release 验证无误后清理。

#### 用户视角变化

| 场景 | v5.13.11 | v5.13.12 |
|---|---|---|
| 登录账号 | 自动下载所有 preset + 同步 SRS | 只同步 SRS（更快） |
| 「同步」按钮 | modal 含 preset 拉取 | modal 只 SRS 同步 |
| 已下载 preset 牌组 | 在「本地」段 | 不变 |
| 想下载新 preset | 必须点同步按钮（盲下） | 进牌组管理→精选→点对应牌组下载 |

#### `yh_diag.js` 同步重构（`fix: a8882da`）

诊断面板对齐 v5.13.5-12 几轮重构：

- `DB_VER` 改成动态读 `IDB_DBS.srs.version`
- 删除全部 `yh_logs` 引用（store v5.13.5 已删）
- 「⚠️ 日志」tab 改读 `LOCAL_LOG` 内存 ring buffer（v5.13.5+ 架构）
- 「⚙️ 设置」tab 移除日志等级切换 UI（v5.13.5 后无 level 概念），改成架构说明
- 4 处 LS key 迁移到 `yh:v1:` 前缀（`device_id` / `globalSyncTs` / `sessionBackup`）
- 状态 tab 加 `voice_slots` / `media_blobs` / `LOCAL_LOG` 计数
- 事件 tab 加「错误」filter chip（聚合 `js_error` + `idb_write_fail` 两类 v5.13.11 新事件）

CDN 加载 (`https://katelynmichelin976-wq.github.io/ReminiSea/tests/yh_diag.js`)，push 后自动生效。

### 测试

- 新增 `tests/_pw_featured_tab.js`（10 断言，需登录）：未登录占位、登录后列表渲染、tab 路由、`doAccountSync` 调用 `runSync(decks: false)` 验证
- `_pw_cloud_sync.js` / `_pw_cross_device.js` 内补显式 `runSync({ decks: true })` 调用作为 workaround（原来依赖登录自动下载 preset）— 测试不走新精选 tab UI 路径，但功能上等价

### 不在本版本

- ❌ 删除 `runSync({ decks: true })` 内部分支（保留代码，几个 release 后清理）
- ❌ 精选 tab 搜索/排序/标签
- ❌ 首登引导用户进精选 tab
- ❌ Service Worker / inline CDN（独立工作，未启动）

## v5.13.11 — 答题热路径 IDB 写入容错 + JS 异常自动上报

### 动机

讨论"上线前运营维护方面缺什么"时识别出两项真实风险：

1. **IDB 写入失败会掐断答题流** — 5 个写入函数（`saveCardState` / `saveCardStateLocal` / `writeTrialLog` / `putEasyState` / `_writeSrs`）的 IDB 失败会一路 reject 到调用方，可能掐断"下一题显示"路径
2. **妈妈不会主动反馈 bug** — 现在只有用户主动 feedback 才知道有崩溃，妈妈遇到问题以为是自己操作有误

其他讨论中识别的项（同步 UX modal、离线 UI、媒体预热）经审视后判定 YAGNI 或 Capacitor 上线后自然解决，明确不做。

### 改动

#### IDB 写入容错（`fix: 2444291`）

5 个写入函数外层加 try-catch：

- `saveCardState` / `saveCardStateLocal` / `putEasyState` / `writeTrialLog`：catch 后 `log.error('idb', 'write_fail', { fn, cardId, err })` + `logAppEvent('idb_write_fail', ...)` 双通道
- `writeTrialLog`：catch 后 `return;`，避免触发 `syncTrialLog` 上传一个本地未持久化的 ghost trial
- `_writeSrs`：外层 try-catch 兜底，catch 用 `srs_write_fail` 区分（捕获 IDB 之外的其他异常）
- 嵌套 `try { logAppEvent } catch {}` 内层包装：`logAppEvent` 自身也写 `appEvents` IDB，hijack 测试时会再次抛错，需隔离

设计 trade-off：宁可丢部分 SRS 进度（内存正确、磁盘旧值）也不掐断答题流。详见 spec `docs/superpowers/specs/2026-06-14-idb-write-resilience-design.md`。

#### JS 异常自动上报（`feat: 1030cac`）

`logAppEvent` 后插入：

- `window.addEventListener('error')` 捕获同步异常
- `window.addEventListener('unhandledrejection')` 捕获 Promise 拒绝
- 走 `logAppEvent('js_error', {type, message, filename, lineno, colno, stack, screen, hash})`
- session 级去重（`_reportedJsErrors` Set，同 `type|message` 只报一次），防 setInterval 类炸表
- message 限 500 / stack 限 1000 字符 / filename 去掉 `location.origin` 前缀

后续 admin 看板按 `event_type = 'js_error'` 聚合可识别"哪些用户/页面在崩"。

### 测试

- 新增 `tests/_pw_idb_resilience.js`（hijack `idbPut` 抛 QuotaExceededError，验证 5 函数仍 resolve + log 双通道写入，8 断言）
- 新增 `tests/_pw_js_error_report.js`（触发 sync error / unhandledrejection / 重复 message，验证 appEvents 写入 + session 去重，10 断言）

### 不在本版本

- ❌ Sync UX modal 改造（练习屏没有 sync 入口，无问题）
- ❌ 离线状态视觉提示（Capacitor 后自然解决）
- ❌ 媒体预热（emoji 兜底可接受，Capacitor 后媒体持久化）
- ❌ Service Worker（独立工作，未启动）
- ❌ Inline CDN（独立工作，后续 Capacitor 铺路）

## v5.13.10 — IDB 命名规范化 P1-P4 + 测试盲点修复

### 动机

memory `naming-convention-todo` 列了"IDB store 名 / keyPath / record 字段命名风格不统一"的技术债。继 v5.13.2-5.13.4 完成 localStorage Phase 1-3 之后，本版本完成 IDB 这一层。

### 改动（user 视角零行为变化）

#### Phase 1：注册表 + helper（`f486039 / 29bc20f / 99d2389 / f486039`）

- 新增 `IDB_DBS` / `IDB_STORES` 注册表常量，集中声明所有 DB / store 元数据
- 新增 helper 函数 `idbGet/Put/Delete/GetAll/Count/Clear/PutWithKey/GetByKey/GetAllKeys/Tx` + 内部 `_idbDbFor/_idbReqAsPromise`
- `IDB_STORES` entries 加 `indexes` 字段，让 onupgradeneeded 可声明 secondary index（修复 v5.11 `easy_card_states` `deck_key` 索引初次设计漏列）

#### Phase 2：store rename + schema 迁移（`ec300bb / ed0089f / f6ff337` + spec 修正 `72d1ad1`）

- IDB store 名 snake_case 对齐 Supabase 表名：
  - `trials` → `sync_trials`
  - `card_states` → `sync_card_states`
  - `easyCardStates` → `easy_card_states`
  - `voiceSlots` → `voice_slots`
  - `blobs` → `media_blobs`
- IDB schema version bump：`yihai_srs` v9→v10，`yihai_media` v1→v2
- `openSrsDb` / `openDB` 的 onupgradeneeded 改写为注册表驱动（删老 store + 按 IDB_STORES 重建）
- **Spec §3.1 关键修正**：扫描发现现状代码 173 处 `entry.snake_field` 业务访问点已经一致用 snake_case 跟 Supabase 列名 1:1 对齐 → record 字段保留 snake_case（不改 camelCase），sync 层零字段名转换，P2 改动量减 90%
- onupgradeneeded 内 `obsoleteStoreNames` 列表包括 `easyCardStates` 旧名，删后按注册表新建保留索引

**用户升级体验**：冷启动一次触发 schema 升级，已登录用户通过 runSync 自动从 Supabase 拉回 `sync_card_states` / `easy_card_states`；voice slot 数据丢失（确认无录音）；个人牌组媒体从云端重下。

#### Phase 3：调用点改用 helper（`0e92cac / 43ce579 / 390c963 / e231622 / c0febb1`）

- ~30+ 处 `tx.objectStore(NAME).put/get/getAll/delete` 改用 helper
- SRS 热路径：`_writeSrs / saveCardState / saveCardStateLocal / getCardState / getAllCardStates / writeTrialLog / getTrialLogs / getEasyState / putEasyState`
- Sync 路径：`uploadTrial / uploadCardState / runSync / syncAppEvents / logAppEvent / backfillAfterPractice`
- Voice 路径：`saveVoiceSlot / loadVoiceSlot / deleteVoiceSlot / loadAllVoiceSlots`
- Media 路径：`saveMedia / loadMedia / deleteMediaForDeck / checkMedia / cleanOrphanMedia` + 个人牌组 sync 卡片删除清理
- Cursor / migration / index 路径走 `idbTx(stores, mode, callback)` 包装，callback 内用 `tx.objectStore(IDB_STORES.xxx.name)` 注册表引用
- 删除遗留常量 `TRIAL_STORE / CS_STORE / VOICE_SLOT_STORE / IDB_STORE`；保留 `EVT_STORE`（trimStore 参数）、`EASY_STORE`（index API）、`SRS_DB_NAME` / `SRS_DB_VER` / `IDB_NAME` / `IDB_VER`（open*Db 内引用）

#### Phase 4：规范文档定型（`7f4f109`）

- 新增 `docs/naming_convention.md`，汇总 Supabase / IDB / localStorage / JS 四层命名规范 + 跨层映射表 + 不在规范的事
- `CLAUDE.md` rule 5 加引用

### 测试

- 新增 `tests/yihai_v5.13.10_idb_p1_test.js`（注册表静态校验，33 断言）
- 新增 `tests/_pw_idb_helpers.js`（10 个 helper round-trip + 批量事务原子性，27 断言）
- 新增 `tests/_pw_idb_migration.js`（v9 → v10 schema 迁移，18 断言）
- 新增 `idbGetAllKeys` helper + PHASE 6.5 测试

### 关键发现：测试盲点修复（`cbaf0d6`）

跨设备测试时发现 **P2 store rename 时漏改了 7 个测试文件**（`_pw_srs_e2e / _pw_cloud_sync / _pw_cross_device / _pw_flip_card / yh_diag / _diag_sync_state / _dump_idb`）。这些测试用 `page.evaluate` 内 `db.transaction('card_states', ...)` 等老 store 名，触发 `NotFoundError` 被 Playwright `evaluate` 静默 reject，后续断言全部静默 skip，程序到 `finally` 正常退出，**报告为"全过"实为只跑了 30% 断言**。

修复后真实数字：
- `_pw_srs_e2e.js` 2 → 21
- `_pw_cloud_sync.js` 8 → 32
- `_pw_cross_device.js` 8 → 39
- `_pw_flip_card.js` 未运行 → 14

修复后 IDB P1-P4 改动实际通过跨设备 + 云端同步端到端验证。

### 关联文档

- 设计：`docs/superpowers/specs/2026-06-13-idb-naming-convention-design.md`（含 §3.1 修正后的论证）
- 实施 plans：`docs/superpowers/plans/2026-06-13-idb-naming-p1.md` / `2026-06-14-idb-naming-p2.md` / `2026-06-14-idb-naming-p3.md`
- 规范文档：`docs/naming_convention.md`

## v5.13.9 — iPad 横屏 overlay 锁定

### 动机

用户在 iPad PWA standalone 模式下横屏使用 Easy 模式，发现"小联全家"三口合照里中间一人（站后排的儿子）的脸被裁掉。诊断到根因：

- 照片实际像素 1141×1600（竖向，儿子脸在画面 y=270-450 上 1/4 处）
- `CARD_RENDERERS.choice.mount` 里 `_card.style.aspectRatio = '1/1'`，且 onload 的自然比例分支只覆盖横图（`naturalWidth > naturalHeight × 1.15`），竖图不进
- iPad 横屏（vh=810）`--img-max-h = 810 - 70(bar) - 344(4 选项) - 30 = 366`，容器变 720×366（1.97:1 扁矩形）
- object-fit:cover 把竖向图缩到 720×1010，上下各裁 322 显示像素，原图可见 y=510-1090，**儿子的脸全在 510 之上完全裁没**

iPad PWA **不尊重 `manifest.json` 的 `orientation:portrait`**（Apple 把 iPad 视作多任务设备，故意忽略），`screen.orientation.lock()` 在 Safari 不支持。横屏布局未支持前任由用户进入会产生"app 支持横屏"的错觉。

### 改动

#### iPad 横屏 overlay 锁定（`index.html`）

新增 `#rotate-prompt` overlay：

- HTML：旋转图标 SVG + i18n 文案
- CSS：`@media (orientation:landscape) and (hover:none) and (pointer:coarse) { display:flex }` — 纯 CSS 触发，触屏设备横屏才命中，桌面浏览器不影响
- z-index 99999，全屏挡住所有 UI（含 settings sheet）
- 背后 quiz/home 状态完全不动，旋转回竖屏 overlay 自动消失

iPhone PWA 继续靠 `manifest.json` orientation 锁定，根本不触发 overlay。iPad 用 overlay 兜底。

#### i18n 5 语 rotate_to_portrait / _sub

en / zh-CN / zh-Hant / es / ja 五语种各加两个 key（主提示「请竖屏使用」+ 副提示「请旋转设备」）。

### 与裁脸根因的关系

锁屏只是 UI 层兜底——iPad 横屏看不到 quiz UI，今天看到的"裁脸"在 iPad 上临时消失。**CSS 1:1 + max-height 压扁竖向图的根因未修**，等以后做横屏左右分栏布局时一并解决。

### 测试

- 新增 `tests/_pw_orientation_lock.js`（13 断言）：桌面横屏不触发 / 触屏竖屏不触发 / 触屏横屏触发 / zh-CN+en+ja 文案 / 横竖屏切换状态保留
- run_all.js 单元回归 634 断言全过

## v5.13.8 — session 恢复三处独立 bug 修复

### 动机

发布 v5.13.5 后用户报告"打开 app 发现已退出登录"。诊断过程查 app_events 串起三个独立根因，完整分析见 `docs/auth_session_bug_analysis_2026-06-12.md`。

### 改动

#### #1 `doAccountLogout` 改 `signOut({ scope: 'local' })`

**`index.html:6235`：** 原 `_sb.auth.signOut()` 默认 scope 是 `global`——撤销服务端**所有** refresh_token，所有设备下次冷启动都失败。

实证铁链：今天凌晨 5-6 点 Playwright 跑了 ~50 次 `_pw_cloud_sync` 类登录测试，06:31:09 一次 cleanup logout（global）撤销 zyhaff 所有 refresh_token；16 小时后用户用真实设备开 v5.13.5 验证 → `session_restore_offline (no_session)` 3ms 内触发。妈妈也被影响过：2026-06-08 09:53 开发设备 global logout 后她真实手机被强制重登。

修复：`signOut({ scope: 'local' })` 只清当前 client 的 localStorage，**不撤销服务端 token**。Playwright cleanup / 用户多设备登出 / 开发手动登出三种场景同时受益。一行改动。

#### #2 `restoreSession` 加 refresh_token 续期分支

**`index.html:3378-3398, 3404-3427`：** 原代码 `getSession()` 返回 null 时直接进 offline 并 `stopAutoRefresh()`——refresh_token 仍有效却没用上。

修复：在进 offline 前显式 `Promise.race([_sb.auth.refreshSession(), 5s timeout])`。成功则等同 online 分支（新增 `session_restore_refresh_ok` 事件）；失败才真的 offline。提取 `_applyRestoredSession` + `_goOffline` 两个 helper 减少分支重复代码（~30 行 net 增加）。

`refreshSession()` 不需要密码——用 localStorage 现有 refresh_token 一次 HTTPS 请求换新 access_token，用户完全无感知。

#### #3 offline handler 加 'online' 恢复 listener

**`index.html:11602-11608`：** 原代码使用中 WiFi 闪断时设 `_syncEnabled = false` + UI 重渲染，**但不注册 'online' 监听器**——网络恢复后无法自愈，必须关闭重开 app。完全无 app_event 留痕。

修复：offline handler 内追加 `window.addEventListener('online', _onOnlineRetry)` + 新增 `network_offline` 事件用于量化触发频率。3 行新增。

### refresh_token 实际不会按时间过期（认知校正）

查 `auth.refresh_tokens` 表结构发现**没有 `expires_at` 列**——失效完全靠 `revoked` 布尔位。免费版项目的 refresh_token 没有时间硬性过期（实测妈妈 28 小时前的 token 仍未撤销）。bug #2 的"长时间不开 app 后 access_token 过期"是真正的触发条件；refresh_token 自身只会被 global logout / 改密 / 管理员撤销/Pro 套餐 inactivity timeout（免费版无）这几种主动操作撤销。

### 监测

部署 7 天后查 `app_events`：

```sql
SELECT COUNT(*) FILTER (WHERE event_type = 'session_restore_refresh_ok') AS refresh_ok,
       COUNT(*) FILTER (WHERE event_type = 'network_offline') AS net_offline,
       COUNT(*) FILTER (WHERE event_type = 'logout') AS logout
FROM app_events
WHERE timestamp > extract(epoch from now() - interval '7 days')*1000;
```

修复有效标志：`refresh_ok > 0`（自动续期生效）；用户 `logout` 平均下降（开发测试不再波及真实用户）。

### 测试

回归全过：12 套件 608 单测 + 68 ui_smoke + 21 srs_e2e。修复内容深在 Supabase SDK 与 'online'/'offline' 事件路径中，单测与 Playwright 难覆盖，主要靠生产 app_events 监测。

### 零外观变化

UI 和行为完全保持现状。用户感知：之后版本更新或长时间不开后再开，**多数情况不需要重输密码**。

---

## v5.13.7 — 提示词云端 schema 改嵌套同步（修 v5.13.6 跨设备跨 locale 污染）

### 动机

v5.13.6 实现"按 UI 语言分组存储"时，云端 `sync_config.ui` schema 保持扁平字段不变（push 时只平铺当前 locale 的 phrase 字段）。这导致跨设备跨 locale 场景污染：

| 场景 | v5.13.6 行为 | v5.13.7 行为 |
|------|-------------|-------------|
| 设备 A、B 同语言 | ✓ 正确 | ✓ 正确 |
| 设备 A 中文 push、设备 B 英文 pull | ❌ 中文脚本写入 B 的英文 locale 桶，污染英文自定义 | ✓ A 的中文写入 B 的中文 locale 桶 |
| 单设备多语言切换后 push | ❌ 云端始终只保留最后 push 的那个 locale 内容 | ✓ 所有 locale 一起同步 |

### 改动（突破性 schema 变更，按用户决策不考虑老数据）

#### 1. `cloudPushConfig`：phrases 整个 locale-keyed blob 同步

```js
const { phrases: _phrases, ...vcFlat } = getVoiceConfig();
const localUi = {
  ...vcFlat,
  phrases:    _phrases || {},  // 整个 locale-keyed 对象一起上传
  confettiOn: getUiField('confettiOn'),
  theme:      getUiField('theme'),
};
```

merge 后显式清理 `PHRASE_VOICE_FIELDS` 中的 8 个 key（删除老版本 v5.13.6 及更早留在 `sync_config.ui` 顶层的扁平 phrase 字段），确保旧数据不持续残留。

#### 2. `cloudPullConfig`：识别 `phrases` 嵌套对象 + 跳过老版本遗留扁平字段

```js
if (k === 'phrases' && v && typeof v === 'object') {
  const vc = getVoiceConfig();
  vc.phrases = v;  // 整个 blob 覆盖本地 voiceConfig.phrases
  lsSetJSON('yh:v1:config:voice', vc);
} else if (PHRASE_VOICE_FIELDS.includes(k)) {
  // 老版本云端遗留扁平 phrase 字段：跳过，避免污染当前 locale
}
```

#### 3. 测试

- `tests/yihai_v5.2_voice_test.js` Test 6b 跟随更新：断言 `phrases: _phrases` 析构 + `_phrases || {}` 整体上传 + `mergedUi` 清理；新增 Test 6c 断言 pull 端识别 `phrases` 嵌套对象 + 跳过 PHRASE_VOICE_FIELDS 老字段（+3 断言）
- `tests/_pw_config_sync.js` 跟随云端 schema 改动：3 处断言从 `cloudUi.phraseQuizPrompt`/`cloudUi.phraseWrong` 改为 `cloudUi.phrases[locale].phraseQuizPrompt`/`cloudUi.phrases[locale].phraseWrong`
- 单测 13 套件 634 断言全通过；Playwright UI smoke 68、SRS e2e 21、config_sync 23 全通过

### 设计可扩展性

v5.13.7 把 locale 抬升为 first-class 数据维度。未来如需录音也按语言分：

- IDB key：`voice-slot:{slot}:{locale}`（替代当前 `{slot}`）
- voiceConfig 加 `recordings: { 'zh-CN': { wrong_hint: {duration, mime} }, 'en': {...} }` 子对象（与 `phrases` 同形）
- 云端 Storage 路径：`voice-slots/{user}/{locale}/{slot}.webm`
- `sync_config.ui` 加 `recordings_meta` 嵌套字段（与 `phrases` 同形）

二进制录音不走 `sync_config`（走 Supabase Storage），所以 `sync_config.ui` 只需新增 metadata 嵌套字段，与本次 `phrases` 改动的 pattern 完全一致。

### 已知取舍

- 不向后兼容老云端数据：v5.13.7 设备 pull 到 v5.13.6 及更早 push 的扁平 phrase 字段会忽略（设计意图，让用户重新自定义一次后即恢复正常）
- 因 v5.13.6 刚发布、影响面极小（单用户），按"既然做了就要到位"原则一并改完，不留半年的"半残"feature

---

## v5.13.6 — 语音提示词按 UI 语言分组存储

### 动机

之前所有 8 个语音提示词脚本（`phraseWrong` / `phraseCorrect` / `phraseQuizPrompt` 等）扁平存于 `yh:v1:config:voice` 单一字段集。`setLocale()` 切换语言时为防止"中文脚本被英文 TTS 朗读"会粗暴清空全部脚本——用户的自定义内容永久丢失，且 quiz_prompt（功能性槽）因有内存变量 `PHRASE_SELECT` 而感知到"切了"，wrong_hint 等情绪槽却不显示文字内容、用户无从察觉。

### 改动

#### 1. 数据结构：`yh:v1:config:voice` 内新增 `phrases` 子对象

```json
{
  "ttsRate": "0.85",
  "voiceMuted": "0",
  "phrases": {
    "zh-CN": { "phraseWrong": "没关系！", "phraseCorrect": "太棒了！", ... },
    "en":    { "phraseWrong": "Try again!", ... }
  }
}
```

- 8 个 phrase 字段按 locale 分组（`PHRASE_VOICE_FIELDS` 注册表）
- 非 phrase 字段（ttsRate / voiceMuted 等）原地保持扁平
- 总量 5 locale × 8 phrase = ~40 条短字符串，远小于 5KB 聚合阈值
- 符合 v5.13.4 落定的 LS 命名规范：`yh:v1:config:voice` 已存在合规 key，`phrases` 是 JSON 子键（不是 LS key 段，camelCase 规则不适用）

#### 2. helper 路由（调用方零改动）

- `getVoiceField(name)` / `setVoiceField(name, value)`：对 `PHRASE_VOICE_FIELDS` 内字段自动路由至 `cfg.phrases[getLocale()]`，其余字段走原扁平路径
- 所有调用方（`playVoiceSlot` / `openRecordingOverlay` / `onSlotRowTap` / `cloudPullConfig` 等）完全不动

#### 3. `setLocale` 简化

- **删除** 7 个 phrase 字段的清空循环——per-locale 存储后切换语言不再需要破坏数据
- `PHRASE_SELECT` / `PHRASE_OPT_HINT` 改为切换后直接 `getVoiceField('phraseQuizPrompt') || t('quiz_select_hint')` 读新 locale 的值
- **删除** `loadPhraseOrDefault`（原本用于检测"存储值是否为某语言默认值"防止跨设备污染——per-locale 存储后这个问题消失）

#### 4. 迁移 `migrateLangPhrases`

- 幂等：`if (cfg.phrases) return`
- 旧扁平 phrase 字段 → 当前 locale 的 `phrases[locale]` 桶
- 启动顺序：`migrateVoiceConfig` → `migrateUiConfig` → `migrateLangPhrases` → `migrateTypographyConfig` → `migrateKeyRenames`（必须在 `migrateUiConfig` 之后，确保 `getLocale()` 能读到 v5.13.3 之前用户的 locale）

#### 5. `cloudPushConfig` 排除 `phrases` blob

- `const { phrases: _phrasesByLocale, ...vcFlat } = getVoiceConfig()` 析构剔除 `phrases`
- 展开当前 locale 的 phrase 字段为扁平格式上传（与现有云端 schema 一致），云端 `sync_config.ui` schema **完全不动**
- `cloudPullConfig` 零改动（`setVoiceField` 已自动路由到当前 locale）

#### 6. 测试

- 新增单测 `tests/yihai_v5.16_lang_phrases_test.js`（22 断言）：phrase 按 locale 存储 / 非 phrase 扁平路径 / 删除幂等 / 跨 locale 互不干扰 / migrate 幂等 / 全 8 字段覆盖
- run_all.js 13 套件 631 断言全通过
- Playwright UI smoke 68 通过 + SRS e2e 21 通过
- `tests/yihai_v5.2_voice_test.js` Test 6b 跟随更新（断言 `cloudPushConfig` 新析构模式）

### 已知设计取舍

- 跨设备跨 locale 同步：设备 A（中文）push → 云端扁平字段 → 设备 B（英文）pull → 写入设备 B 当前 locale（英文）的 phrases；spec 明确接受，云端 schema 不动的代价
- `migrateLangPhrases` 全新安装会写 `{"phrases":{}}` 空 sentinel（无害但与 `migrateVoiceConfig` 的"无数据不写"模式略不一致）

### Spec / Plan

- spec：`docs/superpowers/specs/2026-06-12-per-locale-voice-phrases-design.md`
- plan：`docs/superpowers/plans/2026-06-12-per-locale-voice-phrases.md`

---

## v5.13.5 — 本地日志系统统一 + 测试缓存机制（基础设施）

### 动机

诊断 v5.13.4 中"妈妈连对鼓励语音偶尔不播"的过程暴露出本地日志体系混乱：`yh_logs` (IDB, 300 条, warn+ 才落盘) + `app_events` (IDB+Supabase, 50 条) + PR #508 临时引入的 `_voiceLog` (内存 60 条)，三套机制并行、用途重叠、未来扩展无规范。同时 release 流程的回归测试在多次"已通过状态"下被重复运行，浪费时间。

### 改动

#### 1. 本地日志统一（spec：`docs/superpowers/specs/2026-06-12-local-log-design.md`，plan：`docs/superpowers/plans/2026-06-12-local-log-unified.md`）

- **删除** `yh_logs` IDB store（v8→v9 migration `deleteObjectStore`），删除 `_voiceLog` 内存 buffer
- **新增** `LOCAL_LOG` 内存 ring buffer（2000 条），新 `log.info/warn/error(module, event, data)` API（取消 `debug` 级别，高频日志走 `console.debug`）
- **11 个模块**：`voice / sync / srs / config / storage / auth / media / deck / ui / feedback / diag`
- **15 处** `_logVoice` 调用合并为 `log.info('voice', ...)`（2 处错误路径升 `log.warn`）
- **14 处** 现有 `log.warn/error/info` 改为 snake_case event key + 结构化 `data`（如 `'runSync watchdog: 30s timeout'` → `'watchdog_timeout', { ms: 30000 }'`），`idb` 模块统一改为 `storage`
- **`speak()` 加 `utt.onerror`**：iOS TTS 链路即使 onend 不触发也有兜底，配合 `log.info('voice', 'tts_onerror', ...)` 可定位 iOS 静默丢 utterance 问题

#### 2. 双轨边界明确

| 系统 | 定位 | 持久化 | 上报 |
|------|------|-------|------|
| `app_events` | 业务里程碑（user did what when）| IDB + Supabase | 自动 |
| `local_log` | 技术诊断细节（链路时序、异常）| 内存 300KB | 仅 feedback 携带 |

服务端关联：从 feedback 拿到 `user_id + created_at`，JOIN `sync_app_events` 同时间段事件。

#### 3. collectDiagnostics 收口

- 函数体改同步（保留 async 签名兼容调用方），无 IDB 读
- 移除：`logs` / `events` / `voice_log` / `log_source`
- 新增：`local_log: LOCAL_LOG.slice(-500)` + `user_id: _cloudUserId || null`
- `formatFeedbackText` 改用 `d.local_log` 过滤 warn/error，字段名跟随 `l.lv/l.m/l.e/l.t`

#### 4. getDeviceInfo 补 model 字段

UA 解析：iOS（"iPhone / iOS 17.4"）/ Android（含具体型号 "Pixel 7 / Android 14"）/ Mac / Windows NT。从 feedback 直接识别设备类型。

#### 5. 测试通过缓存机制

- 新增 `tests/_cache.js` + `tests/run_test.js`
- `.cache/test-state.json` 记录每个测试上次通过时的 HEAD SHA
- `node tests/run_test.js <test>`：HEAD == 缓存 SHA 或仅文档变更（SAFE_PATTERNS：`docs/`、`CLAUDE.md`、`README.md`、`MEMORY.md`、`.cache/`、`.gitignore`、`tests/_cache.js`、`tests/run_test.js`）则 SKIP；否则真跑，通过后写缓存
- 防御：检测 "通过: 0 失败: 0" 模式拒绝缓存（避免 server 配错等环境异常被误判为通过）
- CLI：`node tests/_cache.js list / mark / clear`
- release skill 跟随更新，最小回归扩展为 `run_all + _pw_ui_smoke + _pw_srs_e2e`，全部走 `run_test.js` 包装器

#### 6. 测试

- 新增 `tests/yihai_v5.15_log_test.js`（12 断言，LOCAL_LOG ring buffer 形状/累积/挤旧/level/data 省略）
- 单测套件总数：12 套件 608 断言
- Playwright 回归：`_pw_ui_smoke.js` 68/68 + `_pw_srs_e2e.js` 21/21 + `_pw_easy.js` 28/28 + `_pw_feedback.js` 11/11

### 改动文件

- `index.html`：log 系统重写、collectDiagnostics、getDeviceInfo、15+14 处调用点、IDB v9 migration
- `tests/yihai_v5.15_log_test.js`：新增
- `tests/run_all.js`：注册新套件 + 兼容英文测试输出格式
- `tests/_cache.js`、`tests/run_test.js`：新增
- `.gitignore`：`.cache/` 加入 ignore
- `CLAUDE.md`：版本号、测试清单、Recent Changes 同步
- `~/.claude/skills/release/SKILL.md`：第三步增加 Playwright 最小回归，走 wrapper

### 零外观与行为变化

所有改动均为基础设施层，最终用户体验无差异。妈妈侧用法不变。

---

## v5.13.4 — localStorage keymap 规范化 Phase 3（`yh:v1:` 前缀 rename）

### 动机

Phase 1 (v5.13.2) 完成基础设施层（helper + 注册表）、Phase 2 (v5.13.3) 完成同生命周期聚合。Phase 3 最后一步：统一 key 命名规范化——所有 top-level key 加 `yh:v1:{namespace}:{...}` 前缀 + 冒号分层，对齐业内通用规范（Redis/Discord/Notion 客户端约定）。前缀里带版本号 (`v1`) 方便未来 schema 演进时整批迁移/清理。

### 改动

#### 1. Key rename 总表

**Top-level（KEY_RENAMES 18 项）：**

| 旧 key | 新 key |
|---|---|
| `yihaiLastCloudEmail` | `yh:v1:user:lastEmail` |
| `yihaiLastCloudUserId` | `yh:v1:user:lastUserId` |
| `yihaiDeviceId` | `yh:v1:user:deviceId` |
| `yihai_has_ever_logged_in` | `yh:v1:user:hasEverLoggedIn` |
| `yihaiSessionBackup` | `yh:v1:session:backup` |
| `yihaiGlobalSyncTs` | `yh:v1:sync:globalTs` |
| `yihaiEasyPulledAt` | `yh:v1:sync:easyPulledAt` |
| `yihaiRealtimeUpload` | `yh:v1:sync:realtimeUpload` |
| `yihaiPendingFeedback` | `yh:v1:sync:pendingFeedback` |
| `yihaiV5MigrationPending` | `yh:v1:sync:v5MigrationPending` |
| `yihaiPracticeDays` | `yh:v1:practiceDays` |
| `yihaiDecksIndex` | `yh:v1:decks:index` |
| `yihaiDailyProgress` | `yh:v1:daily:progress` |
| `easyRetryOnWrong` | `yh:v1:srs:easyRetryOnWrong` |
| `easySessionSize` | `yh:v1:srs:easySessionSize` |
| `voiceConfig` | `yh:v1:config:voice` |
| `uiConfig` | `yh:v1:config:ui` |
| `typographyConfig` | `yh:v1:config:typography` |

**Prefix（PREFIX_RENAMES 4 类）：**

| 旧 prefix | 新 prefix | suffix |
|---|---|---|
| `deckSync:` | `yh:v1:deck:` | `:sync` |
| `yihai_deck_` | `yh:v1:deck:` | `:cards` |
| `yihaiSyncAt:` | `yh:v1:deck:` | `:syncAt` |
| `srs_` | `yh:v1:srs:` | (无) |

保留不变：
- `yihai_session_backup` — legacy session backup，仅在 logout 路径主动清除（KEY_RENAMES 跳过）
- Supabase SDK 自管 token (`sb-*`) — 不在我们 namespace

#### 2. 实施

- `LS_KEYS` 16 个 value 全部改 `yh:v1:` 路径
- `LS_DECK(k, 'cards') → 'yh:v1:deck:' + k + ':cards'`、`LS_DECK(k, 'syncAt') → 'yh:v1:deck:' + k + ':syncAt'`
- `LS_SRS(configKey) → 'yh:v1:srs:' + configKey`
- 聚合 helper 内部 key 字符串全部更新（`getDeckSync/setDeckSync/migrateDeckSync` 使用 `'yh:v1:deck:' + k + ':sync'`；`getVoiceConfig/setVoiceConfig/migrateVoiceConfig` 使用 `'yh:v1:config:voice'`；同 ui/typography）
- 新增 `migrateKeyRenames` 函数：idempotent + 不覆盖已存在新 key

#### 3. 启动顺序

```javascript
// 顺序至关重要：聚合 migrate 先（read 旧扁平 key），rename 最后（统一加 prefix）
try { migrateVoiceConfig(); } catch ...
try { migrateUiConfig(); } catch ...
try { migrateTypographyConfig(); } catch ...
try { migrateKeyRenames(); } catch ...
```

升级路径覆盖：
- v5.13.0/.1 直跳 v5.13.4：聚合 migrate 把 raw key 聚合到 voiceConfig/uiConfig/typographyConfig → migrateKeyRenames 再加 yh:v1: 前缀
- v5.13.2 跳 v5.13.4：raw key 已聚合（前置 migrate no-op）→ migrateKeyRenames 加前缀
- v5.13.3 跳 v5.13.4：纯 rename
- v5.13.4 重启：全 idempotent，no-op

#### 4. migrateSyncWatermarks / gcOrphanSyncKeys 跟进

`migrateSyncWatermarks` 改扫 `yh:v1:deck:_:syncAt` 前缀（因 keyRenames 已把 yihaiSyncAt: 重命名）。`gcOrphanSyncKeys` 简化为扫 `yh:v1:deck:_:sync` + `yh:v1:deck:_:syncAt`。

#### 5. 修 Phase 2.2 遗留 bug（Voice slot 同步漏）

调研发现 voice slot 录音 / 读取 / save 路径（`slotStorageKey()` 三处调用）漏 Phase 2.2 迁移，仍 raw `lsGet/lsSet/lsRemove` 写 `phraseWrong` 等扁平 key。`setVoiceField/getVoiceField` 写入 voiceConfig JSON，二者持久层错位，跨设备 cloud sync 看不到 slot 自定义 TTS 脚本。

修复：3 处全部改走 `setVoiceField/getVoiceField`：
- `playVoiceSlot` 读 custom TTS
- `recordSlotShow` 加载已存脚本
- `saveVoiceRecording` 保存脚本（`scriptText || null` 一次写）

slot.storageKey 值（`phraseWrong` 等）现在是 voiceConfig 字段名而非 localStorage key；和 cloudPushConfig `...getVoiceConfig()` 平铺路径一致。

### 测试

- 新增 v5.14_ls_test.js 套件 +24 断言（KEY_RENAMES 全字段、PREFIX_RENAMES 4 类、idempotent 双向、`sb-*` SDK token 不动、未知 raw key 不动、empty no-op）
- 单测合计 **11 套件 596 断言**
- Playwright 全过：smoke 68/68 + SRS e2e 21/21 + cross-device 39/39 + config sync 23/23
- `_pw_srs_e2e.js`: `localStorage.getItem('srs_session_mode')` → `'yh:v1:srs:session_mode'`
- `_pw_cross_device.js`: `localStorage.getItem('yihaiDailyProgress')` → `'yh:v1:daily:progress'`；PHASE 6 setup 改直接写 `yh:v1:deck:_:syncAt`（因 keyRenames 已重命名 yihaiSyncAt:）

### 外观与功能

- **零变化** —— App 行为与 v5.13.3 完全一致
- **localStorage 命名彻底规范化** —— 全部 key 形如 `yh:v1:{ns}:{...}`，业内通用模式，调试面板易扫描、批量清理简单、未来 schema v2 可整批迁移
- **云端 sync_config schema 完全未变** —— 跨设备已部署版本可无缝读写

### keymap 规范化三 phase 总结

| Phase | 版本 | 目标 | LS entry 数量影响 |
|---|---|---|---|
| 1 | v5.13.2 | 引入 LS_KEYS 注册表 + helper + 工厂；统一访问层 | 不变 |
| 2 | v5.13.3 | 同生命周期字段聚合为 JSON blob（deckSync/voiceConfig/uiConfig/typographyConfig） | per-deck N×4 → N×1；voice 20 → 1；ui 5 → 1；typo 8 → 1 |
| 3 | v5.13.4 | 所有 top-level key 加 `yh:v1:` 前缀 + 冒号分层 | 数量不变；命名彻底规范化 |

完整 plan 见 `docs/superpowers/plans/2026-06-11-localstorage-keymap-normalization.md`。

## v5.13.3 — localStorage keymap 规范化 Phase 2（聚合配置 blob）

### 动机

Phase 1 (v5.13.2) 完成了基础设施层（helper + 注册表），但 key 仍然分散。Phase 2 把同生命周期的多 key 聚合为单 JSON entry，减少 entry 数量 + 实现原子读写 + 简化 GC/迁移路径。云端 `sync_config` schema **不变**，本地通过翻译表桥接（保兼容跨设备已部署版本）。

### 改动

#### Phase 2.1: per-deck 同步状态聚合 `deckSync:{key}`

4 个旧 key:
- `yihaiPushedAt:{k}` (push 水位，number)
- `yihaiPulledAt:{k}` (pull 水位，number)
- `yihaiPushedMediaAt:{k}` (media push 水位，number)
- `yihaiDeletedCards:{k}` (tombstone array)

→ 单 JSON entry `deckSync:{k}` = `{pushedAt, pulledAt, pushedMediaAt, deletedCards}`，默认值 `DECK_SYNC_DEFAULT = {pushedAt: 0, pulledAt: 0, pushedMediaAt: 0, deletedCards: []}`。

新 helper：`getDeckSync/setDeckSync/removeDeckSync/migrateDeckSync`。`migrateDeckSync` 启动时扫所有旧 key，按 deckKey 聚合，写新 entry 删旧 key；对 ISO 字符串/数字两种水位格式都能解析（`/^\d+$/.test(v) ? parseInt(v) : (Date.parse(v) || 0)`）。

注意：`yihaiSyncAt:{k}` 因 preset 牌组 `syncDeckFromCloud`/`downloadDeckFromCloud` 仍在用作 delta 水位（v5.13.2 Phase 1.2 调研所发现），保留在 `LS_DECK` 工厂中独立。

SyncJob 所有 watermark 读写路径（runStructurePhase/runCardsPhase/runMediaPhase/upsertDeckRow）改写 `lsGet(LS_DECK(k, 'pushedAt'))` → `getDeckSync(k).pushedAt`、`lsSet(LS_DECK(k, 'pushedAt'), String(maxMod))` → `setDeckSync(k, { pushedAt: maxMod })`。`markCardDeleted/getDeletedCards/clearDeletedCards` 改读写 `deckSync.deletedCards`。`removeDeck` 用 `removeDeckSync(key)` 替代 4 个独立 remove。`migrateSyncWatermarks` 改为直接写 deckSync（不再经 yihaiPushedAt 中转）。`gcOrphanSyncKeys` 简化 prefix 列表为 `['deckSync:', 'yihaiSyncAt:']`。`LS_DECK` 工厂瘦身只剩 `cards + syncAt`，aggregated 字段抛错指引走 deckSync helper。

#### Phase 2.2: voice config 聚合 `voiceConfig`

~20 个扁平 voice/TTS/delay key（phraseCorrect/phraseWrong/phraseStreakCorrect/phraseSessionFinish/phraseIdleBrowse/phraseOptHint/phraseQuizPrompt/phraseQuizPromptRecognize/ttsRate/ttsPitch/ttsVoiceName/voiceMuted/voiceAssistEnabled/ansReadDelay/optReadDelay/browseAnsDelay/optCount/optTouchDelay/ndur/bdur）→ 单 JSON entry `voiceConfig`。

新 helper：`VOICE_FIELDS` 注册表 + `getVoiceConfig/getVoiceField/setVoiceField/migrateVoiceConfig`。`setVoiceField(name, null)` 删字段、`setVoiceField(name, value)` 自动 `String()` 化。

**云端 `sync_config.config_json.ui` schema 不变**：
- `cloudPushConfig` 改为 `localUi = { ...getVoiceConfig(), ... }` 平铺
- `cloudPullConfig` 按 `VOICE_FIELDS` 路由：`if (VOICE_FIELDS.includes(k)) setVoiceField(k, v)`

`loadPhraseOrDefault(voiceField, i18nKey)` 改读 `getVoiceField`（修复 PHRASE_SELECT 全局映射断言）。LS_KEYS 移除 20 个 voice 常量。

#### Phase 2.3: UI + typography 聚合

UI config `uiConfig`：
- `theme` (CSS theme key)
- `locale` (was `yihai_ui_locale`)
- `appMode` (was `yihaiAppMode`)
- `confettiOn`
- `logLevel` (was `yihaiLogLevel`)

5 key → 单 JSON entry。新 helper：`UI_OLD_MAP/getUiConfig/getUiField/setUiField/migrateUiConfig`。

Typography config `typographyConfig`：
- `fs-opt`, `fs-ans`, `fs-hint`, `fs-btn`（font-size CSS var）
- `ls-opt`, `ls-ans`, `ls-hint`, `ls-btn`（letter-spacing CSS var）

8 key → 嵌套 JSON `{fs: {opt, ans, hint, btn}, ls: {...}}`。新 helper：`TYPO_SLOTS/getTypographyConfig/getTypoField/setTypoField/migrateTypographyConfig`。

**云端兼容**：
- `cloudPushConfig` 展开 `typographyConfig` 为扁平 `fs-opt` / `ls-ans` 等保留云端 schema
- `cloudPullConfig` 按 field type 路由：`if (k === 'theme' || k === 'confettiOn') setUiField(...)`，`if (k.startsWith('fs-')) setTypoField('fs', k.slice(3), v)`

仅 `theme + confettiOn` 走云同步；`locale/appMode/logLevel` 仅本地。

`LS_KEYS` 移除 `THEME/LOCALE/APP_MODE/CONFETTI_ON/LOG_LEVEL`，`LS_TYPO` 工厂删除。

#### 启动顺序

所有 migrate 函数在 helper 定义之后立即运行（loadSettings/loadPhrases 之前），避免一次性升级时设置取到默认值：

```javascript
try { migrateVoiceConfig(); } catch ...
try { migrateUiConfig(); } catch ...
try { migrateTypographyConfig(); } catch ...
```

（`migrateDeckSync` 仍在 initUI 中跟 `migrateSyncWatermarks` 一起，因前者依赖 restoreDecks 后的 DECKS_META 不存在，可独立运行）

### 测试

- 新增 v5.14_ls_test.js 套件 +63 断言（deckSync/voiceConfig/uiConfig/typographyConfig migrate/idempotent/no-op + set\*Field null deletion + 默认 fallback），单测合计 **11 套件 570 断言**
- Playwright 全过：
  - `_pw_ui_smoke.js` 68/68
  - `_pw_srs_e2e.js` 21/21
  - `_pw_cross_device.js` 39/39（PHASE 6/9/10 改用 `getDeckSync`/`setDeckSync` API）
  - `_pw_config_sync.js` 23/23（voice 字段读写改 `setVoiceField`/`getVoiceField`；finally cleanup 同步改 API）
- `tests/yihai_v5.2_voice_test.js` 跟随改：检测 `VOICE_FIELDS` + `...getVoiceConfig()` 平铺模式，替代旧 grep `phraseQuizPrompt` 字面量

### 外观与功能

- **零变化** — 所有 localStorage entry 数量减少（per-deck N×4 → N×1；voice 20 → 1；UI 5 → 1；typography 8 → 1），但 App 行为与 v5.13.2 完全一致
- **代码可维护性进一步提升** — 同生命周期字段集中、原子读写、`removeDeck`/`switchLocale` 等批量操作单次 entry 写完
- **云端 sync_config schema 完全未变** — 跨设备已部署版本可无缝读写

### 已知遗留

- Phase 3（`yh:v1:` prefix rename）仍在 plan 中，本版本未做
- 云端 `sync_config` 仍是扁平结构 `{srs: {...}, ui: {phraseCorrect, theme, fs-opt, ...}}`，未来 schema v2 可考虑结构化（独立后续工作）

## v5.13.2 — localStorage keymap 规范化 Phase 1（infrastructure）

### 动机

- 上线前命名规范化窗口期：目前仅妈妈一位真实用户，无数据风险，趁此完成长期维护性改造
- `index.html` 内 ~140 处 raw `localStorage.X(...)` 调用、4 种命名风格混用（`yihaiXxx` camelCase 直连 / `yihai_xxx_yyy` snake_case / `yihaiXxx:{id}` 冒号分隔 / `srs_xxx` / `phraseXxx` / `fs-xxx` kebab），grep 困难、易引入命名冲突
- 完整目标 plan 见 `docs/superpowers/plans/2026-06-11-localstorage-keymap-normalization.md`，分三 phase：Phase 1 引入 helper（本次）、Phase 2 聚合配置 blob、Phase 3 加 `yh:v1:` 前缀

### Phase 1 改动

**新增 helper 与注册表（`index.html` 工具函数区）：**

- `LS_KEYS` 常量：~40 个静态 key 集中注册（user/session/sync/UI/voice/TTS/typography/easy mode/SRS……）
- `LS_DECK(deckKey, field)` 工厂：per-deck 动态 key 生成器，`field` ∈ `cards|syncAt|pushedAt|pulledAt|pushedMediaAt|deletedCards`
- `LS_SRS(configKey)` 工厂：`srs_` 前缀 SRS 配置 key 生成器
- `LS_TYPO(kind, slot)` 工厂：typography CSS var key（`fs-/ls-` × `opt|ans|hint|btn`）
- `lsGet/lsSet/lsRemove`：统一访问 helper，`lsSet` 自动 `String()` 化 value
- `lsGetJSON(k, def)/lsSetJSON(k, v)`：JSON 序列化变体，解析失败/缺失走 default

**所有 raw 调用迁移到 helper（8 个分类 commit）：**

| Phase | 范围 | Commit |
|---|---|---|
| 1.3a | 用户/会话（LastCloudEmail/UserId, DeviceId, SessionBackup, HasEverLoggedIn） | refactor: 用户/会话 LS 调用走 LS_KEYS helper |
| 1.3b | 同步状态（GlobalSyncTs, EasyPulledAt, RealtimeUpload, PendingFeedback, V5MigrationPending, PracticeDays, LogLevel） | refactor: 同步状态 LS 调用走 LS_KEYS helper |
| 1.3c | UI（theme, locale, appMode, confettiOn）+ 删除 `LOCALE_KEY` 旧 const | refactor: UI 类 LS 调用走 LS_KEYS helper |
| 1.3d | deck 索引/卡片（DECK_INDEX, DAILY_PROGRESS, deck cards body）+ 删除 `LS_INDEX/LS_DECK_PREFIX/LS_DAILY` 旧 const | refactor: deck 索引/卡片 LS 调用走 LS_KEYS helper |
| 1.3e | voice/TTS ~20 key（phrase\*, tts\*, voice\*, \*Delay, optCount, optTouchDelay, ndur, bdur） | refactor: voice/TTS LS 调用走 LS_KEYS helper |
| 1.3f | per-deck 同步状态（PushedAt/PulledAt/PushedMediaAt/DeletedCards/SyncAt + cards body 内联调用）走 `LS_DECK` 工厂 | refactor: per-deck 同步状态走 LS_DECK 工厂 |
| 1.3g | SRS 配置（srs_\*）+ easy mode（EASY_RETRY_ON_WRONG, EASY_SESSION_SIZE） | refactor: SRS 配置走 LS_SRS 工厂 |
| 1.3h | typography（`fs-`/`ls-`）+ voice slot 自定义 TTS 脚本 + cloudPushConfig/cloudPullConfig 内部循环 + Supabase SDK token 读取 | refactor: typography/voice slot/SDK token LS 调用走 helper |

**意外发现：** 计划中标注的 `yihaiSyncAt:{key}` 死代码实际仍被 `syncDeckFromCloud`/`downloadDeckFromCloud`（preset 牌组路径）用作 delta 同步水位，与 personal deck `yihaiPushedAt`/`yihaiPulledAt` 共存。Plan 中删除方案作废，`LS_DECK` 工厂保留 `syncAt` 字段。

### 测试

- 新增 `tests/yihai_v5.14_ls_test.js`：23 断言覆盖 `lsGet/lsSet/lsRemove/lsGetJSON/lsSetJSON` 行为 + `LS_KEYS/LS_DECK/LS_SRS/LS_TYPO` 工厂
- `tests/run_all.js` 注册新套件，**合计 11 套件 510 断言**（原 487 + 新 23）
- Playwright 回归全部通过：
  - `_pw_ui_smoke.js` 68/68
  - `_pw_srs_e2e.js` 21/21
  - `_pw_cross_device.js` 39/39
  - `_pw_config_sync.js` 23/23

### 外观与功能影响

- **零外观变化** — 所有 localStorage key 名保持不变，App 行为与 v5.13.1 完全一致
- **代码可维护性大幅提升** — grep `LS_KEYS.X` 找全 key 调用点；新增 key 必走 `LS_KEYS` 注册；批量重命名只需改注册表与工厂
- **剩余 5 处 raw `localStorage.X(`** 全在 helper 内部实现，无业务代码 raw 调用

### 已知遗留

- 云端 `sync_config.config_json.ui` 字段名仍直接用 localStorage key 名作为字典 key（兼容跨设备已部署版本）。Phase 2 聚合 voice/UI config 时引入翻译表桥接，schema 不动
- Phase 2/3 仍在 plan 中，本版本仅完成 Phase 1（基础设施）

## v5.13.1 — UI 与陪伴语境对齐 patch

### 完成屏移除红色「答错数」行

- **冲突**：`finish-stats` 渲染 `finish_again` 行 + 套 `wrong` class（红色），与全应用「答错的选项无声消失、不给负反馈」核心理念冲突——妈妈每次练习的最后一眼是红色失败计数
- **修法**：删该行（5 个 i18n locale 中未引用的 `finish_again` key 一并清理）。`sFail` 仍计算并传 `logAppEvent('show_finish', {session_fail})`，照护者端 stats 数据完整

### easy 模式倒计时环隐藏数字秒数

- **场景**：陪伴模式下显示倒计时数字（5、4、3…）给妈妈带来时间压力感
- **修法**：`startNRing` tick 加 `showSec = SRS_CONFIG.session_mode !== 'easy'` 开关，仅普通模式写 `sec.textContent`。SVG 环动画完全保留，时间到 `onNext()` 不变

### easy 模式顶栏 SRS 计数器改 cur/total 进度

- **场景**：陪伴模式下 `0+12+5` Anki 三元组对妈妈没意义且增加认知负担
- **修法**：HTML 加 `<span class="srs-cnt-remain">`，CSS 用 `.srs-counter[data-mode="easy"]` attribute 切换：易模式显示 `${qIdx+1}/${Qs.length}` 进度（如 `12/20`），隐藏三元组与分隔符；普通模式行为不变

## v5.13.0 — 个人牌组跨设备同步可靠性全面修复

minor bump：新增 `confirmed: boolean` 本地 schema 字段（仅 IDB 持久化，不入 DB），覆盖 crash-mid-sync 恢复语义。配合 P0/P1 的水位/失败语义修复，关闭 3 类静默数据丢失。

### sync 顺序 fix（P0）

- **根因**：`runStructurePhase` 中 `pulledAt` 推进顺序写反——在 `computeDeckDiff` 之前推进水位，导致 `toPull` 的 `r.ts <= pulledAt` 把所有远端卡误判为已同步，跨设备增量拉取被掐死
- **修法**：快照前置（diff 用旧水位）、推进后置（`computeDeckDiff` 完成后再写 `pulledAt`）
- **`runMediaPhase` 广播**：结尾新增 `_didPush` 标记，push 发生时调用 `upsertDeckRow` 更新 `decks.updated_at`，否则其他设备的 `remoteAhead` 检测永不触发

### 媒体 upsert 失败恢复（P1 #1）

- **根因**：`flushMediaUpsert` 中 `pendingMediaUpsert.clear()` 在 `await` 之前执行 + `.catch` 仅 `console.warn` 吞错，导致失败批次彻底丢失——本地 `s.url` 已写、guard 永远 skip 重传，DB 行缺失卡片媒体
- **修法**：改为先 `await` 完成再分支处理；`upsertCardsMediaBatch` 改返回 `{failed: [{card, err}]}` 不再吞错；失败时通过 `uploadedSlots` 数组回滚本次上传 slot 的 `s.url` + 重新抛错让 `SyncJob` 进 `error` 状态，下次同步自动重传+重写 DB
- **新增 `rollbackUploadedSlots` 纯函数**：12 断言单测
- **新增 `_pw_media_recovery.js`**：failure injection e2e，7 断言

### 死代码清理（P1 #2）

- **删除 `uploadDeckToCloud`**：零调用，且含 `delete().eq('deck_id')` 再 `insert` 的全量重传反模式（CLAUDE.md §8 禁止模式第一条）
- **删除 `uploadMissingPersonalDecks`**：标注 `// deprecated v5.8 ... remove in v5.9`，至 v5.12 仍在；仅是 `syncAllDirtyDecks()` 的薄壳
- **同步 `docs/architecture.md`**：个人牌组同步流程图重写为当前 SyncJob 三阶段路径（runStructurePhase / runCardsPhase / runMediaPhase）

### crash-mid-sync 恢复（P2）

- **根因**：P1 #1 修了显式 flush 失败抛错回滚，但浏览器在 checkpoint `saveDeckCards`(s.url 持久化到 IDB) 与 `flushMediaUpsert`(DB UPDATE) 之间崩溃——IDB 已有 `s.url`、DB 行 `media` 字段还是空。下次 sync 的上传 guard `!s._blob || s.url` 看 `s.url` 已有就 skip，永远不再补 DB 写
- **修法**：引入 per-slot `confirmed: boolean` 字段，仅本地 IDB 持久化（DB 写不带）：
  - `flushMediaUpsert` 成功后才调 `commitUploadedSlots` 把 `s.confirmed = true`
  - 上传 guard 三态化：`confirmed` → skip / 未 confirmed + 有 url → 仅补 DB 写（不重传 Storage） / 无 url → 走 Storage + DB
  - 所有从 DB 拉 url 的构造点（runCardsPhase pull / downloadDeckFromCloud / syncDeckFromCloud / diag 重传 / mergeCard 合并）共 9 处自动置 confirmed=true
  - `serializeMedia` 拆为本地（保 confirmed）+ `serializeMediaForCloud`（剥 confirmed）
- **mergeCard 单独修复**：之前重建 `merged.media[slot]` 时丢弃 local 的 confirmed → 每次跨设备 pull 后下次 sync 都会触发冗余 DB UPDATE（churn）。修：merged slot 加 `confirmed: rs.url ? true : false`
- **新增**：22 断言 v5.12 单测（rollback + commit + serialize + mergeCard）+ `_pw_media_recovery.js` PHASE 5 crash 恢复 e2e（7 新断言，共 14）

### 测试套件计数

| 套件 | v5.12.1 | v5.13.0 |
|------|---------|---------|
| `run_all.js` 单测 | 9 套件 459 断言 | 10 套件 487 断言 |
| `_pw_media_recovery.js` | 不存在 | 14 断言 |

## v5.12.1 — 安全 + 行为修复 patch

### XSS 修复（hot path）

- **3 处模板插值未转义**：`L9007` 选项按钮 `<div class="otxt">${name}</div>`、`L9170` revealBrowse 详情 `<div class="detail-txt">${txt}</div>`、`L9313` revealAnswer 详情同模板
- **攻击面**：name / details 由照护者填写并跨设备同步（含预置牌组）。恶意 name（如 `<img onerror="...">`）会在每张卡片渲染时执行脚本，能读到 localStorage 中 Supabase 会话 token
- **修法**：3 处加 `esc()` 包裹，函数已存在（L10306，div-textContent 模式）。零行为变化，最小 diff（+3/-3）
- **审计**：其他 innerHTML 路径（flip card L9059–9078 / stats trial-name L11672 / card detail L11724 / confirm dialog L12203 等）已正确使用 `esc()`/`escAttr()`，无遗漏

### 语音辅助门控修复

- **遗漏的 3 个槽**：`quiz_prompt`（"请选择"）、`opt_hint`（读选项 ABCD）、`wrong_hint`（"不要着急"）原本只 gate `VOICE_MUTED`，未 gate `VOICE_ASSIST_ENABLED`。导致关闭"语音辅助"toggle 后这三类提示仍响
- **修法**：`startCardPrompts` 函数开头加 `if (!VOICE_ASSIST_ENABLED) return`（一次盖 quiz_prompt + speakOptHint）；`wrong_hint playVoiceSlot` 调用加 `VOICE_ASSIST_ENABLED` gate
- **未改动**：`playAnswer`（朗读卡片名）仅 gate `VOICE_MUTED` — 卡片内容音不属于"辅助"

### 找回密码 hash 路由兼容

- **问题**：Supabase 默认 recovery 邮件链接 hash 格式为 `#access_token=...&type=recovery`（非自定义的 `#/reset-password`）；signup 验证邮件同理。原 `handleAuthHashRoute` 只匹配自定义路径
- **修法**：`handleAuthHashRoute` 加 `|| h.includes('type=recovery')` / `type=signup` 兼容；`onAuthStateChange` 加 `PASSWORD_RECOVERY` 事件 → 直接进 `screen-reset-password`，加 `SIGNED_IN` 事件 → 自动恢复 session；`email-confirmed` 路径补 `getSession()` 自动登录
- **`_capturedHash` 在 `_tryInitCloud` 之外捕获**：避免 hash 被 onload reset 后丢失

### 高级模式 FAB 清理

- **去掉**：`updateTabBarMode` 中 advanced 模式 FAB 切换为「开始制卡」/`onAdvancedFabTap`/`+`图标的分支
- **结果**：standard / advanced 两模式 FAB 行为一致 —「开始练习」/`onFabTap`/`▶`图标
- **删除孤儿**：`onAdvancedFabTap` 函数 + 5 locale × `nav_start_create` i18n key
- **保留**：制卡入口仍在牌组详情页右上角「+」（`dd-topbar-add` → `showCreateCard(currentDeck)`）

### 测试卫生

- **`_pw_config_sync.js` finally 加 cleanup**：清云端 `sync_config` 行 + localStorage 中 `VOICE_PARAMS` / `CROSS_PARAMS` / `DEPRECATED_KEYS` 所有键。原本测试结束后 `voiceMuted=1` / `pw-test-*` 等异常值持续存在云端，导致任何后续登录测试账号的设备被静音 + PHRASE 文本污染。`CROSS_PARAMS` 提到模块作用域便于 finally 引用

## v5.12.0 — 用户管理 + 跨设备同步 fix + 媒体 JSONB 收尾

### 用户管理（注册/找回密码/改密）

- **账户屏链接**：未登录态加「注册新账号」「忘记密码?」文字链接（`account_link_register` / `account_link_forgot`）；已登录态加「修改密码」按钮（`change_pwd_menu`）
- **3 个 sheet**：`#register-overlay` / `#reset-request-overlay` / `#change-password-overlay`，沿用 `feedback-overlay` / `feedback-sheet` 视觉模式（style.display 切换）
- **全屏 screen**：`#screen-reset-password`，从邮件链接 hash `#/reset-password` 进入
- **处理函数**：`doRegister` / `doRequestReset` / `doChangePassword` / `doApplyResetPassword` / `doResendVerification` / `handleAuthHashRoute`
- **改密安全 2 步**：先 `signInWithPassword({email:_cloudUserEmail, password:oldPwd})` 验老密，成功后才 `updateUser({password:newPwd})`
- **Hash 路由**：`handleAuthHashRoute()` 在 cloud init 之后 `setTimeout(200)` 内识别 `#/email-confirmed` 与 `#/reset-password`，处理后用 `history.replaceState` 清掉 hash
- **隐私**：找回密码统一显示「已发送」无论邮箱是否存在（防爆破探测）
- **配置依赖**：Supabase Auth Email Confirmation ON + SMTP 已配 + Redirect URLs 白名单含 `#/email-confirmed` `#/reset-password`
- **i18n**：5 locale × 32 keys
- **测试**：新单文件 `tests/_pw_user_mgmt.js`（22 断言，mock Supabase Auth）+ `_pw_ui_smoke.js` +3 断言

### 个人牌组本地/云端解耦

- **本地操作不再自动上传**：导入 / 重命名 / 新建牌组直接进 `localDirty` 状态，不再触发上传，等用户手动同步
- **牌组管理页本地 Tab 同步按钮**：`doSyncDeckAction(deckKey, btnEl)` 完成后按当前 Tab 重渲染列表，状态徽章实时刷新

### 跨设备同步 fix

- **`saveCardFromForm` 新卡 mod 补全**：新建卡片必须同时写 `card.mod` + `meta.mod`，否则 `computeDeckDiff` 视为无变更跳过 `toPush`，结果跨设备拉不到新卡
- **远端删除传播**：`runStructurePhase` 拉云端 deck name；`computeDeckDiff` 加 `localDelete` 路径处理"远端已删本地未删"——避免对端删除后本地反推回云端
- **`runMediaPhase` NOT NULL fix**：改用 `.update()` 替代 `.upsert()`，避免 sort_order 等 NOT NULL 列因 upsert 缺省值触发 PostgREST 23502

### 媒体 JSONB 收尾 refactor

- **下载路径迁移**：`downloadDeckFromCloud` / `syncDeckFromCloud` 完全迁移至 media JSONB；select 只取 `card_id,name,media`
- **删除迁移代码**：`deck_cards` 旧媒体列 fallback、`restoreDecks` 旧媒体格式恢复路径、历史版本迁移代码全部清理（v5.9 以前格式已无设备需要兼容）

### 测试稳定性

- **`_pw_cloud_sync.js`**：PHASE 3 由轮询 `_syncInFlight` 改为轮询 `DECKS_META` 包含目标 deck（runSync watchdog 30s 提前置 `_syncInFlight=false` 时下载仍在后台继续，原 wait 误判完成）
- **`_pw_config_sync.js`**：Device B PHRASE_WRONG 断言改为 `localStorage.getItem('phraseWrong')`（全局变量 `PHRASE_WRONG` 已在 index.html:5292 显式删除，TTS 在 `playVoiceSlot` 内直接读 localStorage）

## v5.11.2 — 首页交互 + 管理页样式细化

- **首页牌组点击**：`selectDeck` 移除 `showDeckDetail()` 调用，点击改为仅切换选中态（`.selected` → 红色背景 + 左侧 accent 条）；`import` 路径在 `selectDeck` 后显式补 `showDeckDetail()` 保留旧行为
- **首页 navChevron 删除**：移除右侧 `.album-nav-btn` 按钮 + 对应 CSS（v5.11.1 改 `advanced-only` 后已无实际价值）
- **首页点击修复**：v5.11.1 删左滑时一并删除了 `initDeckSwipe(grid)` 导致 click handler 丢失，补回纯 click 监听 `grid.addEventListener('click', e => selectDeck(closest('.deck-card-inner')))`
- **登录表单间距**：新增 `.account-field + .account-btn { margin-top: 14px }` 让密码 input 与登录按钮分隔
- **牌组管理页平铺风格**：撤回 v5.11.1 给云端 list 加 `.deck-grid` 容器的改动；改用 `.decks-panel` 作用域覆盖，让该页内的 `.deck-grid` 与 `.deck-card-inner` 显示为无圆角平铺行（disable 背景/边框/阴影/border-radius、padding 14×16、name 15px、隐藏 selected accent bar），与原云端 list 风格一致；**首页 home 的圆角卡片风不受影响**

## v5.11.1 — UI 简化（advanced/standard 模式分流）

- **首页**：删除「+ 新建」按钮（已在牌组管理页「本地 Tab」提供）；删除牌组卡片的左滑「导出/重命名/删除」交互（同样移到牌组管理页本地 Tab），相关 swipe 变量与 `initDeckSwipe` 初始化一并清掉
- **我的页**：删除「统计」菜单项（Tab Bar「统计」承担）
- **账户页**：删除「云端牌组」section（牌组管理页「云端 Tab」承担）
- **同步语音**：`runSync` 删除 `speak(options.title)` 块；两个调用点的 `voice: true` 参数也一并清掉
- **Tab Bar 模式分流**：7 处 `<button class="tab-item">`（牌组/统计）加 `advanced-only` 类，沿用 L269 已存在的 `[data-mode="standard"] .advanced-only { display: none !important; }` 规则。standard 模式 Tab Bar 简化为「首页/练习/我的」3 项，advanced 模式保持「首页/牌组/练习/统计/我的」5 项
- **回归**：单测 9 套件 459/0；`_pw_ui_smoke` 65/0；`_pw_srs_e2e` 21/0；`_pw_cross_device` 39/0（未跑但 v5.11.0 已绿且本次不涉及同步路径）

## v5.11.0 — Easy 模式重设计 + 同步性能修复

### 同步性能修复（v5.9 退化）

- **根因**：v5.9.0 重写 `runMediaPhase` 时，每个 slot 上传完都立即调 `upsertSingleCard`（PostgREST 单行 UPDATE）。一张含 img+aud 双 slot 的卡 → 4 次后台请求（2 Storage + 2 upsert）。500 卡 = 2000+ 后台请求，妈妈牌组同步从秒级退化到分钟级。
- **修复**：删 `upsertSingleCard`；新增 `upsertCardsMediaBatch`（仅写 media 列 + updated_at，安全保留 sort_order）；`runMediaPhase` 累积 `pendingMediaUpsert` Set，在现有 checkpoint（每 20 张）+ 末尾各 flush 一次，把 N 次 upsert 降为 ⌈N/20⌉ 次。
- **效果**：500 卡 PostgREST 写从 1000 次降为 25 次（×40）。Storage 上传次数不变（本就受文件数限制）。中断恢复语义保持（每 checkpoint 已 flush）。

### Easy 模式重设计

- **独立数据层 EasyState**：IDB 新 store `easyCardStates`（DB v7→v8，复合键 `['deck_key','card_id']`，`deck_key` index），字段 `seen / history(≤3) / last_seen / last_warmup`，与 `sync_card_states` 完全隔离。
- **三级分类**：`unseen`（无记录）/ `learning`（见过未稳）/ `confident`（`history === [1,1,1]`）。任意一次首答错立即跌回 learning。
- **Session 结构**：用户配总张数 T（默认 19，预设 chip 15/19/23），算法 `[warmup CCC] + (L CCC)×k + [tail r×C]`，公式 `k = floor((T-3)/4), r = T-3-4k`。T<7 或 deckSize<7 走 flat 兜底。
- **槽位选择**：L 槽 unseen 优先（随机）→ learning 最弱（lastIsCorrect/zeros/last_seen 复合键）→ 远 confident 兜底。C 槽 confident → learning 最稳（伪 confident 兜底，冷启动主路径）→ unseen 极端兜底。session 内 `usedIds` 去重。
- **写入唯一真相源 attempt**：`_writeSrs` 新增 `isEasyMode` 分支末尾 EasyState 写入。首错记 0 即使后续重试答对（`attempt.attemptNumber===1 && attempt.isCorrect===true` 为对，其余记错）；hard 视为错。
- **跨设备同步（trigger 维护）**：新表 `easy_card_states` + RLS（仅 SELECT 自己的），新 PG trigger `on_easy_trial_insert` 在 sync_trials INSERT 时 upsert（first attempt 才推 history，array slice 保留最近 3），`SECURITY DEFINER`。客户端 `pullEasyStates` 在 runSync trials upload 后调用，`yihaiEasyPulledAt` 增量水位；put 时保留本地 `last_warmup`（不入云）。
- **配置项变更**：`easy_session_size` 默认 19；新增 `easy_confident_window:3`（固定不暴露）、`easy_retry_on_wrong:true`（设置页 toggle 控制；false 时首错直接 revealAnswer 跳过选项排除）。localStorage hydration 同步加入。
- **诊断面板**：`yh_diag.js` Tab 0 新增「轻松模式统计」per-deck 段，显示最常出现次数 / confident / learning / unseen；同时 `DB_VER` 升 8 防止 onblocked。
- **测试**：新单测 `yihai_v5.11_easy_test.js`（38 断言：T 公式 / 分类 / 弱度·稳度 / L·C picker / buildEasyQueue 集成）；`_pw_srs_e2e.js` +7 断言（Easy IDB 写入 / sync_card_states 不写 / 首错记 0）；`_pw_cross_device.js` +7 断言（A→B EasyState 传播 / last_warmup 仅本地 / 云端 easy_card_states 验证）。单测合计 9 套件 459 断言。

## v5.10.0 post — #402

- **触发器自洽维护 `sync_card_states`**：`_writeSrs` trial entry 补 `lapses_streak_after` / `lapses_total_after` / `review_mode_after` / `step_index_after`，来自 `processAnswer` 算出的 `newState`。`syncTrialLog` / `uploadTrialBatch` 显式字段列表同步补充。
- **DB Migration 011**：`sync_trials` 加 4 列；重建 `fn_trial_to_card_state` 触发器，改用 `_after` 值（`COALESCE` 兼容旧 trial 降级到 `_before`）。`sync_card_states` 中 `lapses_streak` / `lapses_total` / `review_mode` / `step_index` 现在由触发器完整维护，不再依赖 JS 补偿。
- **`syncPendingData` 简化**：删除全量 card state backfill（触发器已自洽，补传 trial 时触发器同步更新状态）。
- **`unsuspendCard` 即时云同步**：reset / resume 后直接调用 `syncCardState()`，手动操作（无 trial 路径）立即同步云端，不再依赖下次 backfill。
- **职责分离确立**：trial → 触发器维护所有 SRS 状态（含 lapses）；`syncCardState()` 仅负责无 trial 操作（挂起/重置）；`synced_at` 不参与跨设备合并（合并逻辑全程用 `updated_at`）。

## v5.10.0 Key Changes

- **牌组管理页（screen-decks）**：新增独立全屏牌组管理入口，三段式：本地 Tab（左滑重命名/导出/删除）/ 云端 Tab（同步状态徽章 + 同步/下载/补全媒体操作）/ 精选 Tab（占位）。`renderLocalDecksTab()` 复用现有 deck-card + swipe 逻辑；`renderCloudDecksTab()` 迁移自 `showCloudDecks()`。
- **Tab Bar 扩展为 5 项**：首页 / 牌组 / ▶练习 / 统计 / 我的。`screen-home`、`screen-mine`、`screen-stats` 均同步更新。
- **本地操作解耦**：`saveCard` 删除 `uploadDeckToCloud` 自动上传调用——新建/修改卡片只操作本地，所有云端交互统一收归牌组页云端 Tab。
- **首页黄点导航**：个人牌组同步状态黄点（`deck-update-dot`）可点击，直接跳转到牌组页云端 Tab（`showDecks('cloud')`）。
- **账户页入口迁移**：「查看云端牌组」按钮改为 `showDecks('cloud')`，不再进入独立 `screen-cloud-decks`。
- **i18n 补充**：5 个 locale（zh-CN/zh-Hant/en/es/ja）新增 `nav_decks`/`nav_stats`/`decks_tab_*`/`decks_local_hint`/`decks_featured_coming` 等 7 个 key。
- **smoke test 修复**：`_pw_ui_smoke.js` 移除已删 `uploadPersonalDeckMedia` 检查，改为 `renderCloudDecksTab` 存在性检查；新增 `_pw_deck_mgmt.js`（15 断言，覆盖 Tab Bar/导航/段选/列表）。

## v5.9.0 Key Changes

- **media slot 模型**：卡片媒体字段从 `_imgUrl`/`img`/`_audUrl`/`audioUrl` 迁移为 `media.{slot}.{url, v, _blob}` 结构。`url` 为 Storage 路径，`v` 为版本号（替换媒体时递增），`_blob` 为运行时 blob URL（不序列化）。
- **新纯函数**：`hasMedia`/`mediaLoaded`/`cardMediaComplete`/`deckMediaComplete`/`serializeMedia`/`mergeCard`/`buildPath`/`mimeToExt`，均有单元测试覆盖（`yihai_v5.9_sync_test.js`，32 断言）。
- **DB migration**：`deck_cards` 新增 `media jsonb DEFAULT '{}'` 列；存量 `image_url`/`audio_url` 数据迁移为 `media.img`/`media.aud` slot 格式；旧列保留向后兼容。
- **序列化层**：`saveDeckCards` 改用 `serializeMedia`（strip `_blob`）；`restoreDecks` 新格式 + 兼容旧 `imgUrl`/`audUrl`，逐 slot 从 IDB 恢复 `_blob`，恢复后同步 `card.img`/`card.audioUrl` 供渲染层使用。
- **computeDeckDiff**：`remoteCardMeta` 字段名由 `.updated_at`（ISO 字符串）规范为 `.ts`（epoch ms），消除命名歧义。
- **computeDeckSyncState**：`mediaIncomplete` 改用 `deckMediaComplete(cards)` 判断（原逻辑只检测 `_imgUrl && !img`，slot 模型下失效）。
- **upsertCardsBatch**：写 `media` JSONB 列（不再写 `image_url`/`audio_url`）；新增 `upsertSingleCard` 用于 Phase 3 逐卡上传后即时更新云端 `media.url`。
- **runCardsPhase pull**：SELECT 改为 `media` 列；远端 `media` slot 补 `_blob`（IDB 优先）；用 `mergeCard` 合并（同 url+v 保留本地 `_blob`，否则清空待重下）；merge 后同步 `merged.img`/`merged.audioUrl`。
- **runMediaPhase 重写**：slot 模型遍历；upload guard（`_blob` 有且 `url` 空时上传，`upsertSingleCard` 即时更新）；download（`url` 有且 `_blob` 空时下，IDB 缓存优先）；每 20 张 checkpoint + `saveDeckCards`；`run()` 改为 `await runMediaPhase()`（根治 fire-and-forget）；下载后同步 `card.img`/`card.audioUrl`。
- **GC 补全**：`deleteDeck` 补清 `yihaiPushedAt`/`yihaiPulledAt`/`yihaiPushedMediaAt` 三个孤儿 key + 调 `deleteCardStatesForDeck`；新增 `gcOrphanSyncKeys` 启动时清理无对应牌组的 sync key；`purgeOldLogs` 补清 `TRIAL_STORE` 30 天前已同步条目。
- **渲染层修复**：media slot 迁移后 `card.img`/`card.audioUrl` 未同步，导致图片不显示；在 `restoreDecks`/`runCardsPhase` pull/`runMediaPhase` download/`downloadPersonalDeckFromCloud` 四处补齐同步；`downloadPersonalDeckFromCloud` 同时写 `card.media` slot 防止 `saveDeckCards` 丢失路径。
- **yh_diag.js**：媒体统计改用 `media.img.url`/`media.img._blob` 判断（兼容旧字段），适配新 slot 格式。
- **测试**：`yihai_v5.9_sync_test.js`（32 断言）；`_pw_cross_device.js` 新增 PHASE 10（mediaIncomplete flag）+ PHASE 11（runMediaPhase await），共 39 断言；`run_all.js` 注册新套件（合计 8 套件 421 断言）。
- **CLAUDE.md**：新增规则 17——序列化层改动必须验证端到端渲染路径（路径 A/B/C）。

## v5.8.2 Key Changes

- **下载暂停持久化**：`downloadPersonalDeckFromCloud` 在检测到暂停状态前先调用 `saveDeckCards`，确保已下载卡片数据写入 localStorage；如果用户暂停后刷新页面或登出，下次恢复时不会看到空牌组。
- **登出取消下载**：`doAccountLogout` 在清理 SDK 前先 resolve 所有 `_downloading` Map 中的 pause promise，再 clear Map；worker 在 resume 后检测 `_downloading.get(deckId) === undefined` 立即 return，避免线程永久 blocked 或用 null `_sb` 继续请求。
- **媒体缺失状态**：`computeDeckSyncState` 新增 `mediaIncomplete` 检测（cards 中存在 `_imgUrl` 非空但 `img` 为空的卡片）；该标志通过返回值暴露给 `showCloudDecks`；`showCloudDecks` 据此显示「媒体缺失」徽章（蓝色）和「补全媒体」按钮（调 `doCloudDeckAction`，IDB 有缓存的卡片直接复用，只补下载缺失部分），取代错误的 SyncJob「同步」按钮。
- **移除 Supabase CDN SRI**：jsdelivr 不同 CDN 节点对同一版本号（`@2.105.4`）分发内容不一致，导致 `integrity` hash 时好时坏；去掉 `integrity` 属性以绕过浏览器 SRI 校验。

## v5.8.0 Key Changes

- **重设计动机**：v5.7 的 `uploadMissingPersonalDecks` 只判 deck ID 是否存在，本地修改/删除卡片不会传到云端，跨设备「我这台改了，对方收不到」；每次媒体同步即便没改也走 DELETE+INSERT 全量重传，3601 张卡逼近 30s watchdog；下载中断只能从头重来。
- **核心改动 — 卡片级 `mod` 时间戳**：每次新建/编辑/打答题/导入都调 `nextMod()`（基于 `Date.now()` 单调递增）写入 `card.mod` 与 `deck.mod`；同步时比 mod 找增量。
- **删除墓碑**：本地删卡写入 `yihaiDeletedCards:{deckId}` localStorage 记录 `{cardId, mod}`，同步时 push 到云端并触发对端 delete，确认后清墓碑。
- **SyncJob 三阶段引擎**：Phase 1 拉/推 `decks` 表元信息；Phase 2 比较卡片 mod，分批 push/pull/delete `deck_cards`（按 1000 行分页）；Phase 3 上传/下载媒体 blob。每阶段独立 try/catch + 进度回调，可在阶段间暂停。
- **暂停续传**：`SyncJob` 加 `paused/pausePromise` 字段，每张卡完成后 await pausePromise；`toggleSyncPause` 切换状态；每 100 张持久化进度（`saveDeckCards`），恢复或重启都能从断点继续。
- **状态徽章**：纯函数 `computeDeckSyncState(deckMeta, lastPushedAt, lastPulledAt, remoteUpdatedAt)` 返回 `synced/needsPush/needsPull/conflict`；`showCloudDecks` 渲染按状态显示徽章 + 单牌组「同步」按钮。
- **双水位拆分**：`yihaiSyncAt:{key}` 单值改为 `yihaiPushedAt:{key}` + `yihaiPulledAt:{key}`，分别追踪上传/下载水位；启动时一次性迁移（旧值复制到两个新 key）。
- **Supabase migration `deck_cards_deck_card_uk`**：`unique(deck_id, card_id)` 约束，配合 `upsert(onConflict='deck_id,card_id')`，消除并发写入导致的重复行。
- **deprecation**：`uploadMissingPersonalDecks` 和 `checkPersonalDeckUpdates` 改为 `syncAllDirtyDecks()` 的 wrapper，加 `// deprecated v5.8 ... remove in v5.9` 注释保留一版兼容。
- **测试**：新增 `tests/yihai_v5.8_sync_test.js`（22 断言，覆盖 `nextMod` 单调性、`computeDeckDiff` 增删改、`computeDeckSyncState` 四状态、水位迁移幂等）；`_pw_cross_device.js` +15 断言（设备 A 改卡只传增量、删卡墓碑跨设备生效、暂停续传、旧水位迁移）。spec/plan 见 `docs/superpowers/specs/2026-06-05-personal-deck-sync-design.md` 与 `docs/superpowers/plans/2026-06-05-personal-deck-sync.md`。

## v5.7.2 Key Changes

- **云端牌组下载支持暂停/继续**：`_downloading` Map 新增 `paused/pausePromise/pauseResolve` 字段；`parallelMapLimit` 每张卡完成后检查 `pausePromise`，非 null 则 `await` 挂起所有 worker；`toggleDownloadPause` 切换状态并 resolve 唤醒；`showCloudDecks` 渲染进行中状态时显示进度数字+暂停/继续按钮，`sub` 文字显示「下载中…」或「已暂停」。
- **诊断面板 Tab 0 新增媒体统计**：遍历 `DECKS_META/DECKS`，统计每张卡 `_imgUrl`（云端有图）和 `img.startsWith('blob:')` （已在内存），输出图片/音频已下载数、待下载数、逐牌组明细；`navigator.storage.estimate()` 显示本地总占用和配额，使用率超 70% 标红。

## v5.7.1 Key Changes

- **修复下载个人牌组时图片不显示**：`downloadPersonalDeckFromCloud` 原本把每张卡的下载结果写进局部变量 `deckCards[i]`，而 `DECKS[deckId]` 是 Phase 1 创建的 placeholder 数组，两者不同对象，只有最后 `DECKS[deckId] = deckCards` 才合并，练习页读取 `DECKS[deckId]` 全是 `img:''`。修复：删除 `deckCards` 中间变量，改为 `const card = DECKS[deckId][i]` 直接引用，blob URL 写入 `card.img` 即刻反映在 `DECKS` 里。同时重建 `DECKS[deckId]` 时保留已有 `_imgUrl/_audUrl` 供断点续传判断。
- **修复下载中途返回再进入云端牌组页进度丢失、误显已下载**：新增模块级 `_downloading` Map（`deckId → {done, total}`），`doCloudDeckAction` 开始时写入，完成后删除；`showCloudDecks` 渲染时优先检查 `_downloading`，正在下载则显示进度按钮（`id="dl-btn-{deckId}"`）并禁用，`onProgress` 通过 `getElementById` 找到当前 DOM 节点更新，不依赖可能已销毁的 `btnEl`。

## v5.7.0 Key Changes

- **修复个人牌组本地有云端无时同步不上传**：新增 `uploadMissingPersonalDecks()`，登录/手动同步时查询 Supabase `decks` 表，本地存在但云端缺失的个人牌组自动调 `uploadDeckToCloud`。根因：`uploadPersonalDeckMedia` 仅在 `uploaded > 0` 时调 `uploadDeckToCloud`；若所有媒体已标记上传则跳过，云端牌组结构永远缺失。
- **新增云端牌组管理页 `screen-cloud-decks`**：账户页登录态新增「云端牌组 → 查看」入口；列表展示云端所有个人牌组，本地已有显示「同步」，本地没有显示「下载」。
- **下载后立即显示首页**：`downloadPersonalDeckFromCloud` 改为两阶段——拉到卡片列表后立即更新 `DECKS_META` 并 `renderDeckList()`，媒体下载继续在后台进行。原实现需等 7202 次网络请求全完成才刷新首页。
- **IDB miss 回退**：若 `_imgUrl`/`_audUrl` 已设但 IDB 内无 blob（上次下载被中断），自动回落到远端重新下载并存入 IDB，不再静默跳过。
- **断点续传**：`downloadPersonalDeckFromCloud` 每完成 100 张调一次 `saveDeckCards`，将已下载卡的 `_imgUrl`/`_audUrl` 持久化；重启后这些卡走 IDB 路径，不重复下载。
- **进度显示**：下载按钮实时更新为 `{done}/{total}` 格式（如 `1800/3601`），通过 `onProgress` 回调驱动。

## v5.6.4 Key Changes

- **修复个人牌组全量上传导致 watchdog timeout**：`uploadPersonalDeckMedia` 末尾的 `uploadDeckToCloud` 调用从「有任何媒体 URL 就跑」改为「本次实际上传了新媒体（`uploaded > 0`）才跑」。根因：3601 张卡的牌组每次同步触发 DELETE+INSERT（9 次 Supabase 请求），高延迟下超过 30s watchdog。
- **修复诊断面板 `yh_diag.js` key 错误**：v5.5.0 camelCase 迁移后 `yh_diag.js` 有 6 处仍读旧 snake_case key（`yihai_session_backup`、`yihai_device_id`、`yihai_global_sync_ts` ×2、`yihai_log_level` ×3、`yihai_daily_progress`），导致 Session Backup email/expires_at 永远显示 `—`。
- **清理旧 key**：`doAccountLogout` 补 `removeItem('yihai_session_backup')`，清除 v5.5.0 前遗留的僵尸数据。

## v5.6.3 Key Changes

- **修复个人牌组同步黄点误报**：`uploadDeckToCloud` 上传成功后补写本地 `yihaiSyncAt = Date.now()`，消除上传后本地 `yihaiSyncAt` 未更新导致下次打开 app 误报未同步黄点的问题。

## v5.6.2 Key Changes

- **修复 `deck_cards` 下载截断**：新增 `fetchAllDeckCards(deckId, select)` 分页 helper，每次取 1000 行循环直到返回行数 < pageSize 为止。替换三处无分页查询：`downloadDeckFromCloud`（手动下载）、`checkPersonalDeckUpdates`（同步时 card_id 列表）、`downloadPersonalDeckFromCloud`（同步时完整卡片内容）。根因：Supabase PostgREST 默认 `db_max_rows=1000`，超过 1000 张的牌组静默截断，iPhone 同步 3601 张牌组只收到 1000 张。

## v5.6.0 Key Changes

- **个人牌组媒体云同步**: `importYhspack` 导入时 meta 写入 `deck_type:'personal'` + `nameLang`，立即 fire-and-forget 调 `uploadDeckToCloud`（原写法 `source:'local'` 导致 `uploadDeckToCloud` 门禁跳过，结构永不上传）。
- **新函数 `uploadPersonalDeckMedia(deckId)`**: 从 IDB 读取 blob，`parallelMapLimit(3)` 并发上传到 Supabase Storage（bucket `ReminiSea`，路径 `personal/{userId}/{deckId}/{cardId}_{type}.{ext}`）。续传机制：`_imgUrl`/`_audUrl` 非空跳过；上传成功写入字段，`saveDeckCards` 持久化，再调 `uploadDeckToCloud` 更新 `deck_cards.image_url`/`audio_url`。完成后 toast 通知。try/catch 包裹，单卡失败不中断整体。音频 MIME 映射完整（mpeg/ogg/webm/aac → mp3/ogg/webm/aac，fallback m4a）。
- **`doAccountLogin`/`doAccountSync` 串联**: `runSync().then()` 对所有 `deck_type:'personal'` 牌组触发 `uploadDeckToCloud + uploadPersonalDeckMedia`，覆盖「离线导入、上线后同步」场景。
- **i18n**: 5 个 locale 加 `toast_media_synced`（含 `{n}` 文件数）。
- **_pw_ui_smoke.js**: 新增 `uploadPersonalDeckMedia` 函数存在性断言，共 65 断言。

## v5.5.1 Key Changes

- **yh_fr_ localStorage key 清理**: `_writeSrs` 中每卡每日首次评级计数原用 `yh_fr_{date}_{cardId}` 写入 localStorage（每次答题一条），随时间积累不清理。改为内存 `_dailyRatedCards`（`Set`），每次 `_launch` 重置。tradeoff：同一天两个 session 各自计数（可接受，家庭场景单日单 session）。
- **flip card 背面布局改进**: 新增 `flip-back-body` 容器包裹内容区；背面补充单词+音标行（含音频按钮）；`flip-img` 改 `max-height:44vh` 支持大图；CSS 微调（`btm:has(.flip-reveal-btn)` padding、`flip-face` gap/padding 去内边距统一由 `flip-back-body` 管理）。
- **saveDeckCards 补存 cardType/ext**: 原 slim 格式只保存 `id/name/nameLang/imgUrl/audUrl`，flip 卡的 `cardType:'flip'` 和 `ext`（phonetic/definition/example 等）丢失。现补入两字段，flip 卡片数据跨 session 完整保留。

## v5.5.0 Key Changes

- **processAnswer lateDays TDZ 修复**: `processAnswer` review 分支原代码 `const daysLate = daysLate(state.due_date, today)` — 变量名与外层函数 `daysLate(dueDate, todayStr)`（line ~2639）同名，`const` 声明产生 TDZ（Temporal Dead Zone），调用点即抛 ReferenceError。该错误被 `_lastSrsWrite` 链末尾的 `.catch(e => console.warn(...))` 静默吞掉，导致所有 review 阶段答题完全不写入 CardState/TrialLog。修复：将局部变量重命名为 `lateDays`，3 处引用同步更新（`const lateDays =`、`lateDays / 2`、`lateDays`）。这是 snake_case→camelCase 批量重命名时引入的名称冲突。
- **buildSessionQueue normal 模式移除 applyCurve**: 练习模式重设计计划明确 normal 模式 `finalQueue = queue`（直接返回，Anki 到期顺序，不重排）。但实现时 else 分支遗留 `finalQueue = applyCurve(queue)`（原 survival 逻辑）。现改为 `finalQueue = queue`，与 i18n 描述「完整SRS，按到期顺序」对齐。`applyCurve` 函数保留定义（easy 模式未使用，暂不删除）。
- **测试更新**: `_pw_srs_e2e.js` — PHASE5 从测「hard 模式刷新后恢复」（已删除的模式）改为测「easy 模式刷新后恢复」；PHASE6 从测「U 形曲线（first/last ef > mid）」改为测「due_ts 升序（Anki 顺序）」；清除所有诊断日志（`page.on('console',...)`/spy patch/dayAnswerLog/sessionInfo/dayInfo/allTrialKeys）。`_pw_ui_smoke.js` — 对齐 v5.4.20 UI 变更：`#settings-lang-val` 已移除（语言入口在 mine 菜单），改为检查 mine 菜单语言按钮存在性及 `getLocale()` 返回值；`[data-i18n="voice_group_fixed"]` 已从 DOM 删除（固定节点并入情绪触发），断言改为验证情绪触发分组存在。共 64 断言（+6）。

## v5.4.20 Key Changes

- **syncAppEvents 批量上传**: 新增 `uploadAppEventBatch(events)` 用 `upsert({ onConflict: 'event_id', ignoreDuplicates: true })` 一次最多上传 10 条；两个顺序循环（业务事件 + 诊断日志）改为按 `EVT_BATCH=10` 分批调用。修复 zyhaff@gmail.com 账号 174 条积压事件顺序上传导致 runSync 触发 30s watchdog 的问题。
- **修复「我的」Tab 切换残留「点击登录」**: `showScreen('screen-mine')` 只做 CSS 切换，`mine-profile-name` 有 `data-i18n` 属性被 `applyI18n` 重置为「点击登录」但 `updateMineProfile` 未被调用。首页 Tab Bar 的「我的」按钮 onclick 补 `updateMineProfile()`。
- **语音辅助页 UI 整合**: ①宽度对齐（`va-scroll` 加 `max-width: var(--mw)`，边距 12px→16px）②取消折叠（`va-group-body` 始终显示，去掉 chevron/onclick/cursor）③固定节点组并入情绪触发组，顺序：答错安慰→答对鼓励→连对表扬→完成庆祝 ④浏览引导从 fixed 移至 functional 末位，保留录音能力（无 `functional:true`）⑤`updateVoiceAssistStatus` 的 `allNonFunc` 去掉已删除的 `VOICE_SLOTS.fixed`。
- **「我的」页高级模式**: ⚡ Zap 图标（`mine-menu-icon`）+ 顶部间距从 4px→10px（与其他区块对齐）+ `padding: 14px 16px` + `gap: 12px` + `mine-mode-lbl` 加 `flex:1`。
- **界面语言从设置内移至「我的」顶层**: 设置 sheet 删除「显示」区块（含「界面语言」行）；「我的」第二组新增「语言」按钮（地球图标，`onclick="openLangPicker()"`，`mine_menu_lang` i18n key，5 locale 均添加）；`openLangPicker` 去掉 `closeSettings()` 调用；语言选择页标题改用 `mine_menu_lang`（随界面语言动态）；语言列表顺序改为 EN→中文繁體→中文简体→日本語→Español。

## v5.4.9 Key Changes

- **pickVoice 已选声音无语言限制**: `if (TTS_VOICE_NAME && (!lang || lang.startsWith('zh')))` → `if (TTS_VOICE_NAME)`。只要用户选了声音且设备能找到，任何 lang 参数均使用该声音。原限制使得非中文内容（lang='en' 等）忽略用户选择，逻辑不一致。
- **zh-Hant 自动选声音链补充 yue-HK**: `voices.find(v => v.lang === 'zh-TW') || voices.find(v => v.lang === 'zh-HK') || voices.find(v => v.lang === 'yue-HK' || v.lang.startsWith('yue')) || voices.find(v => v.lang === 'zh-CN')`。iOS 上粤语声音（如善逸）的 `v.lang = 'yue-HK'`，原链只查 zh-TW/zh-CN 找不到，现在可以自动匹配。

## v5.4.8 Key Changes

- **pickVoice 中文变体覆盖**: 两处 `!lang || lang === 'zh-CN'` 改为 `!lang || lang.startsWith('zh')`。第一处：已选声音（`TTS_VOICE_NAME`）的命中条件；第二处：zh-Hant 界面下自动选 zh-TW 声音的条件。根因：`playVoiceSlot` 传 `getLocale()='zh-Hant'` 为 ttsLang，`speak(text, 0, null, 'zh-Hant')` → `pickVoice('zh-Hant')` 时两个条件均不命中（`'zh-Hant' !== 'zh-CN'`），前缀匹配 `zh` 拿到第一个 zh-CN 普通话声音。选项以 `lang='zh-CN'` 调用故命中正确。
- **speak/speakDirect utt.lang 对齐**: 找到 voice 后 `utt.lang = v.lang`（如 `zh-HK`）替代原始 `useLang`（可能为 `zh-Hant`）。`zh-Hant` 是 script subtag，非标准 speech locale，浏览器遇到不识别的 utt.lang 可能忽略显式 voice 回退默认声音。

## v5.4.7 Key Changes

- **回滚 TTS 修复代码至 v5.4.0 状态**: 还原 `pickVoice`（条件改回 `!lang || lang === 'zh-CN'`）、`speak`（去掉 `utt.lang = v.lang`，改回 `if (v) utt.voice = v`）、`speakDirect`（同上，恢复 lang mismatch log）、`onTtsVoiceChange`（去掉 TTS_VOICE_LANG 保存）、`cloudPushConfig localUi`（恢复 ttsVoiceName，去掉 ttsVoiceLang）、`cloudPullConfig`（去掉 ttsVoiceName skip 逻辑）、`loadSettings`（去掉 ttsVoiceLang 读取）。v5.4.1–v5.4.6 TTS 修复均非根因，等待用户提供复现路径后重新定位。

## v5.4.6 Key Changes

- **ttsVoiceName 不再云同步**: `cloudPushConfig` `localUi` 中移除 `ttsVoiceName` key（声音名称是设备特定的，iOS 叫"善逸"、Chrome 叫"Google 粤語（香港）"，不能跨设备共享）。`cloudPullConfig` apply UI params 循环中加 `if (k === 'ttsVoiceName') return` 跳过云端值。`ttsVoiceLang`（如 "zh-HK"）继续云同步，作为语种偏好：未选音色的设备通过 `pickVoice` 的 `TTS_VOICE_LANG` fallback 路径自动选最近声音。根因：PC 推云端 "Google 粤語（香港）"，iPhone pull 后覆盖本机选择的善逸，再 TTS 时找不到 PC 声音名，回退逻辑选了 zh-TW 普通话。

## v5.4.5 Key Changes

- **TTS_VOICE_LANG 跨设备声音回退**: 新增全局 `TTS_VOICE_LANG`（对应 localStorage `ttsVoiceLang`，加入 `cloudPushConfig` UI 字段）。`onTtsVoiceChange` 选声音时同步保存所选声音的 `v.lang`（如 `zh-HK`）。`pickVoice` 在 `TTS_VOICE_NAME` 按名找不到声音时（跨设备，本机无同名声音），以 `TTS_VOICE_LANG` 按语种前缀匹配本机声音。修复场景：PC 选「Google 粤語（香港）」（zh-HK），iPhone 无此名声音，现在能正确找到 iOS 粤语声音（如「善逸」）。移除 v5.4.4 临时 `[pickVoice]` 诊断日志。

## v5.4.4 Key Changes

- **[pickVoice] 诊断日志**: `pickVoice()` 函数顶部加无条件 `console.log('[pickVoice] TTS_VOICE_NAME=... lang=... voices=...')`，用于确认 TTS 触发时 `TTS_VOICE_NAME` 的实际值，定位声音选择失效根因。

## v5.4.3 Key Changes

- **utt.lang 对齐 voice.lang**: `speak()` 和 `speakDirect()` 中，原先 `utt.lang = useLang`（内容语种，可能为 `zh-Hant` 等非真实 speech locale），找到 voice 后只设 `utt.voice = v` 而未修正 `utt.lang`。浏览器遇到 `utt.lang='zh-Hant'` 无法匹配任何真实语音，会忽略显式 voice 回退到系统默认（普通话）。修复：`if (v) { utt.voice = v; utt.lang = v.lang; }` 使 utterance 语种严格对齐所选声音的真实 lang。同时移除已无必要的 `[speakDirect] lang mismatch` console.log。

## v5.4.2 Key Changes

- **pickVoice 语种前缀匹配**: 原条件 `(!lang || lang.startsWith('zh'))` 改为 `namedPrefix === wantPrefix`（`namedPrefix = named.lang.split('-')[0]`，`wantPrefix = (lang||'zh-CN').split('-')[0]`）。所选声音只在语种前缀与内容语种前缀相同时使用，否则落入自动选择逻辑。修复场景：①英文界面下中文声音被跳过导致英文提示音无变化；②用户选了英文声音希望控制英文提示语音；③所有非中文内容的声音选择行为。

## v5.4.1 Key Changes

- **pickVoice TTS_VOICE_NAME 条件扩展**: `(!lang || lang === 'zh-CN')` → `(!lang || lang.startsWith('zh'))`，两处：TTS_VOICE_NAME 已选语音判断 + zh-Hant 自动偏好 zh-TW voice 判断。修复原因：`playVoiceSlot` 传 `getLocale()` 作为 `ttsLang`，当 UI locale 为 `zh-Hant` 时，`speak()` 以 `lang='zh-Hant'` 调用 `pickVoice`，原条件不命中，已选粵語声音被跳过，前缀匹配 `zh` 返回第一个 zh-CN 声音（普通话）。

## v5.4.0 Key Changes

- **繁體中文 locale（zh-Hant）**: `SUPPORTED_LOCALES` 新增 `'zh-Hant'`；`I18N['zh-Hant']` 363 個 key（與 zh-CN 完整對齊）；`const names` 加入 `'zh-Hant': '繁體中文'`。
- **detectLocale 繁體映射修復**: 在精確匹配後、前綴匹配前插入 `traditionalVariants = ['zh-tw','zh-hk','zh-mo','zh-hant']` 顯式映射至 `zh-Hant`，防止 `zh-TW` 因前綴 `zh` 與 `zh-CN` 相同而被誤匹配。
- **screen-lang UI**: 移除所有 `.lang-flag` 元素（包含既有 zh-CN/en/es 三行）；新增 `[data-lang="zh-Hant"]` 行（lang-name: 中文（繁體），lang-name-sub: Chinese Traditional）。
- **pickVoice TTS**: 當 `getLocale() === 'zh-Hant'` 且卡片 lang 為 `zh-CN` 時，優先查找 `lang === 'zh-TW'` voice，找不到才退回 `zh-CN` voice；使用者手動設定 `TTS_VOICE_NAME` 時仍優先。
- **單元測試**: `yihai_v5.0_i18n_test.js` 新增 4 case（zh-TW/zh-HK/zh-Hant→zh-Hant，zh-CN 前綴迴歸），共 31 case；`SUPPORTED_LOCALES` 與 `detectLocale` 同步更新。
- **Playwright smoke**: PHASE 11 新增 4 個斷言（data-lang 存在、無 lang-flag、settings-lang-val 顯示「繁體中文」、首頁 Tab 含「頁」），共 58 個斷言。

## v5.3.3 Key Changes

- **cloudPushConfig 废弃 key 清理**: merge 后显式 `delete mergedUi[k]`，清除 `phrase_quiz_prompt` / `phrase_quiz_prompt_recognize` / `phrase_opt_hint` / `phraseSelect`，防止旧 snake_case key 通过 `{ ...cloudCfg.ui, ...localUi }` spread 永久留存云端。

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
