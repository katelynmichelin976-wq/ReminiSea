# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**忆海拾光 (Memory Glimmers)** — 家庭记忆与学习卡片 PWA。单文件 app（`yihai_v{version}.html`），内联 CSS/JS，自定义 SM-2 SRS，IndexedDB 本地存储，Supabase 云同步，GitHub Pages 部署。

技术架构见 `docs/architecture.md`（数据表、存储层、关键数据流）。

## Key Files

### 当前版本
| File | Purpose |
|------|---------|
| `yihai_v5.3.html` | 主训练 App（v5.3.2，单 HTML 文件，Supabase 云同步） |
| `yihai_admin_v1.html` | 管理看板（监控面板，Supabase Edge Functions） |
| `index_v49.html` | 制卡工具（暂停）|

### 测试
| File | Purpose |
|------|---------|
| `tests/srs_test.js` | SRS 单元测试（85 cases） |
| `tests/yihai_v4.4_test.js` | v4.4 工具函数测试（98 cases） |
| `tests/yihai_v4.8_test.js` | v4.8 工具函数测试（46 cases） |
| `tests/yihai_v4.9_test.js` | v4.9 配置合并测试（48 cases） |
| `tests/yihai_v5.0_i18n_test.js` | i18n 纯函数单测（27 cases） |
| `tests/yihai_v5.2_voice_test.js` | 语音辅助迁移逻辑单测（17 cases） |
| `tests/run_all.js` | 单元测试统一入口（6 套件，321 断言） |
| `tests/_pw_ui_smoke.js` | UI 冒烟（导航/账户屏/设置/i18n/函数存在性/语言选择器/语音/openSrsDb，54 断言，无需登录） |
| `tests/_pw_srs_e2e.js` | SRS 端到端（导入/.yhspack/5天练习/IDB验证/统计/session_mode/曲线，14 断言，无需登录） |
| `tests/_pw_cloud_sync.js` | 云端流程（登录/decks下载/同步/session restore/user_id隔离/登出/重登/双客户端防护/feedback E2E，32 断言） |
| `tests/_pw_cross_device.js` | 跨设备同步（设备A练习→同步→设备B接收/review不被覆写/DP不跨设备，11 断言） |
| `tests/_pw_session_restore.js` | 会话恢复流程（SDK失败/无backup/token失效/backup损坏/pathD/登录超时，13 断言，无需登录） |
| `tests/_pw_sync_guard.js` | runSync 30s watchdog（REST挂起/IDB blocked 时 modal 自动关闭+toast，7 断言，无需登录） |
| `tests/_pw_feedback.js` | 意见反馈模块（函数存在性/sheet 开关/表单校验，11 断言，无需登录） |
| `tests/_playwright_helper.js` | Playwright 公共工具（cloudLogin/cloudLogout/navigateTo 等） |

### 文档
| File | Purpose |
|------|---------|
| `docs/architecture.md` | 技术架构（数据表/存储层/数据流） |
| `docs/srs_design_v6.9.md` | SRS 算法权威设计文档 |
| `docs/忆海拾光_训练App_README.md` | 训练 App 版本历史 |
| `docs/忆海拾光_训练App发布检查清单.md` | 发布检查清单 |
| `docs/yihai_实现说明.md` | 实现说明（场景组织） |
| `docs/yihai_变更记录_CLAUDE参考.md` | 完整变更历史（AI 参考） |

### 基础设施
| File | Purpose |
|------|---------|
| `sql/supabase_schema.sql` | 数据库 schema |
| `sql/supabase_storage_policies.sql` | Storage RLS 策略 |
| `supabase/functions/` | Edge Functions（管理 API） |
| `archive/` | 历史版本（v4.3–v4.8） |

## Recent Changes

**当前版本：v5.3.2**（`yihai_v5.3.html`，线上版）。完整历史见 `docs/yihai_变更记录_CLAUDE参考.md`。

**v5.3.2：** 修复 `phrase_opt_hint` 云同步（替代废弃 `phraseOptHint`），补入 `cloudPushConfig` 推送列表；修复多实例 `autoRefreshToken` 竞态（`restoreSession` 创建新客户端前调用 `stopAutoRefresh` 防止旧实例旋转令牌后新实例用失效令牌报 `refresh_token_not_found`）

**v5.3.1：** 修复语音答题提示云同步 — `phrase_quiz_prompt` 统一为唯一 key（替代废弃 `phraseSelect`），补入 `cloudPushConfig` 推送列表，`onSlotRowTap` 保存后触发 `debouncePushConfig`，清理迁移兼容代码

**v5.3.0：** 意见反馈模块 — `意见反馈` 入口（screen-mine）、底部 sheet（textarea 必填 200 字/字数计数/空提交红框校验）、`collectDiagnostics()`（IDB 2s 超时读取日志/事件，不采集 JWT/邮箱）、`submitFeedback()`（Supabase 5s 超时 + 剪贴板降级 + localStorage 暂存）、`runSync` 补传、zh/en/es 三语言、Supabase feedback 表（anon INSERT only RLS）

**v5.2.0 bug fixes：** 会话恢复 UI 卡死修复 — 新增 `_sessionRestoring` 标志替代 backup-proxy 逻辑（修复缺陷1/2/3/5）；`openSrsDb` onblocked 8s 超时防挂死 + 修复 `return _srsDbPromise` 缺失；`doAccountLogin` 15s 超时；`if (!_sb)` 双客户端防护；`runSync` catch 块 modal 失败时显示 toast

**v5.2.0：** 语音辅助系统 — 家属录音+TTS 双轨、11 个语音槽（固定节点/情绪触发/功能提示）、IDB voiceSlots store（DB v7）、screen-voice-assist 管理界面、idle 计时器、连对连击鼓励、card_type/ext 字段扩展

**v5.1.8：** 修复语言选择页宽度、勾选抖动；移除设置深色模式开关（统一用主题）；设置 sheet 加关闭按钮

**v5.1.7：** 新增界面语言选择功能 — `screen-lang` 全屏选择页（中/英/西）+ 设置抽屉入口

**v5.1.6：** 术语统一 — 「我的相册」→「我的牌组」，My Albums → My Decks，Mis Álbumes → Mis Mazos

**v5.1.5：** 移除 `publishDeck`（preset/shared 权限边界未定）；修复 `migrateMediaKeys` race condition（改 await 顺序执行，修复 v5.1.3 升级图片丢失）

**v5.1.4：** migration 010 — 新建 `decks`/`deck_cards` 替代旧三表；本地 deck key 去 `cloud_` 前缀；个人牌组云端同步（`uploadDeckToCloud`/`checkPersonalDeckUpdates`）

**v5.1.3：** `updateMineProfile`/`renderAccount` 增加 `_syncEnabled` 门禁，session 恢复失败时不误显在线 UI

**导航结构（v5.2.x）：**
- `screen-home`：首页（默认），底部 `.home-tabbar`
- `screen-mine`：我的，底部 `.home-tabbar`
- `screen-quiz`：练习/浏览（无 Tab Bar）
- `screen-stats`：统计（无 Tab Bar，`closeStats()` 回 `_statsOrigin`）
- `screen-finish`：完成（无 Tab Bar）
- `screen-voice-assist`：语音辅助管理（全屏，11 个语音槽录制/编辑）
- Settings：底部 Sheet overlay

## Environment

**Windows 11 + PowerShell 5.1。** 所有 shell 命令用 PowerShell 工具，不用 Bash。路径分隔符 `\`，环境变量 `$env:VAR`，无 `&&`/`||` 管道链（改用 `; if ($?) {}`）。

## First-time Setup

```powershell
# Enable git hooks
git config core.hooksPath .githooks
```

## Development Commands

```powershell
# 单元测试（全量，312 断言）
node tests/run_all.js

# Playwright（需先启动：python -m http.server 8080 --directory C:\code）
node tests/_pw_ui_smoke.js
node tests/_pw_srs_e2e.js
$env:TEST_PASSWORD="xxx"; node tests/_pw_cloud_sync.js
$env:TEST_PASSWORD="xxx"; node tests/_pw_cross_device.js
```

**测试范围规则：**
- **Bug 修复** → `node tests/run_all.js`
- **发布** → 单元测试 + `_pw_ui_smoke.js` + `_pw_srs_e2e.js`
- **云端/登录改动** → 加跑 `_pw_cloud_sync.js`
- **跨设备/同步改动** → 加跑 `_pw_cross_device.js`
- **全量回归** → 仅用户明确要求时跑全部 4 个 Playwright 文件

Current counts: SRS 85, v4.4 98, v4.8 46, v4.9 48, i18n 27, voice 8（run_all.js 合计 312）；Playwright ui_smoke 54 / srs_e2e 14 / cloud_sync 32 / cross_device 11 / session_restore 13 / sync_guard 7 / feedback 11。

## SRS Architecture

`processAnswer` 实现 SM-2 变体，三阶段：`learning` → `review` ← `relearning`。完整状态机见 `srs_design_v6.9.md`。

**关键保护机制：**
- `daily_remove_lapses` (3)：连续失败 N 次当天移出队列
- `auto_suspend_lapses` (8)：累计失败 N 次自动挂起
- `learn_ahead_limit` (1200s)：防止跳过 learning 步骤

**Learning hard 延迟：** 第一步 `(steps[0]+steps[1])/2`；仅一步时 `steps[0]×1.5`；第二步起不变。

**游戏难度模式（`SRS_CONFIG.session_mode`）：**
- `normal`：20 张，hard≤5 张，其余 easy/new
- `hard`：≤30 张 + `applyCurve()`（U 形曲线：首尾易中间难）
- `survival`：全量积压 + curve
- `difficultyScore(s)` — ef 反转 + lapses 归一 + learning/relearning +0.5 bonus

**参数命名规则：** 所有 SRS 参数对齐 Anki 命名，不加后缀。

## Development Rules

1. **Single-file app** — 所有代码在 `yihai_v{version}.html`，无单独 CSS/JS 文件。
2. **Version in filename** — 输出文件必须是 `yihai_v{version}.html`，UI 内显示版本号。
3. **One version per iteration** — patch bump 修复，minor bump 功能，major 平台迁移。
4. **No confirm()** — iOS PWA 会阻塞。用 `showConfirmDialog()` 自定义弹窗。
5. **SRS write race guard** — `_lastSrsWrite` promise chain；`goHome()`/`openStats()` 必须 `await _lastSrsWrite` 后再读。
6. **sessionId** — 每次 `_launch`/`goHome` 递增，打断跨页异步 TTS 链。
7. **warmupSpeech()** — 必须在用户手势内调用（iOS 解锁 TTS + Audio）。
8. **浏览器端改动必须先写 Playwright 测试** — Node.js 单测覆盖不到 DOM 渲染/SDK 异步加载。流程：写测试复现（预期失败）→ 改代码 → 测试通过 → 跑回归 → 提交。
9. **Release prep** — 发布前移除测试工具栏（`🗑 重置牌组`、`⏭ +1天`）和调试行（`iv=X ef=X...`）。
10. **Supabase cloud sync** — 所有 Supabase 调用包 try/catch，fire-and-forget。`_syncEnabled` 门控所有同步。
11. **Cloud session** — SDK 自动持久化 session。启动时 `restoreCloudSession()`，状态：`_syncEnabled`（在线）、`_sessionRestoring`（恢复中）。
12. **Per-card upload: TrialLog only** — 逐卡只上传 `sync_trials`；`sync_card_states` 由 DB trigger 自动维护。
13. **runSync 统一入口** — 所有同步通过 `runSync(options)`。`options.modal` 控制弹窗；`options.decks` 控制牌组同步。
14. **DP 仅本地** — `daily_progress` 不跨设备同步，只记本地。
15. **`_writeSrs` 改动后必须跑 Playwright** — 运行时错误会导致 TrialLog 静默丢失，单测覆盖不到 IDB 写入路径。

## Coding & Editing Rules

1. **Simplicity first** — 最少代码解决问题。不添加未要求的功能，不为单次使用创建抽象。
2. **Surgical changes** — 只改必须改的。不"改进"相邻代码，匹配现有风格。只清理自己改动造成的孤儿引用。
3. **Goal-driven** — "修 bug" → 先写复现测试；"加功能" → 先定义验收标准。

## Workflow Rules

1. **Bug fix** — 先查数据/代码定位根因，分析确认后再动手改。
2. **Feature/enhancement** — 先列路径和利弊，确定方向后再实现。
3. **文档先行** — `git add` 前检查 README/docs/CLAUDE.md 是否需同步。
4. **本地提交** — commit 前必须跑对应单元测试并全部通过。
5. **发布需指令** — `git push` / GitHub Pages 部署必须等明确「发布」指令。
6. **版本号仅在发布时 bump** — 发布 commit 同时完成：HTML 3 处版本号 + 复制为 `index.html` + 打 tag。
7. **Commit message** — 格式 `type: v{version}: description (#issue)`：
   - `fix: v5.1.6: 描述 (#N)` — 版本号为发现问题的已发布版本
   - `feat: 功能描述 (#N)` — 新功能不绑定版本号
   - `release: v5.1.7` — 发布 commit

## Deployment

1. 所有测试通过（run_all.js + _pw_ui_smoke + _pw_srs_e2e）
2. 文档同步：`CLAUDE.md` 版本号 + `docs/忆海拾光_训练App_README.md` + `docs/yihai_变更记录_CLAUDE参考.md`
3. 修改 `yihai_v5.1.html` 中 **3 处**版本号：`<title>`、`.home-version`、`APP_VERSION`
4. 复制 `yihai_v5.1.html` → `index.html`
5. 所有改动放入 `release: v5.x.x` commit
6. `git tag v5.x.x`
7. `git push; git push --tags`
8. `$env:HTTPS_PROXY="http://127.0.0.1:10808"; gh release create v5.x.x --title "v5.x.x" --notes "..."`
9. GitHub Pages 自动部署到 https://katelynmichelin976-wq.github.io/gemi/

**代理说明：** git 代理已全局配置；`gh` 命令需每次新会话设置 `$env:HTTPS_PROXY=http://127.0.0.1:10808`。
