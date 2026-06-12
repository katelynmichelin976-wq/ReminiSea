# 本地日志系统统一设计

**日期：** 2026-06-12
**作者：** chenlian + Claude
**关联：** PR #508（语音链路诊断埋点）

---

## 1. 背景

诊断 v5.13.4 中"妈妈连对鼓励语音偶尔不播"的过程暴露出本地日志体系的混乱：

- **`yh_logs` (IDB LOG_STORE, 300 条)**：技术调试日志，默认 `warn` 级别才落盘，info/debug 在生产环境不写 IDB。意味着出问题时大部分上下文已经丢失。
- **`app_events` (IDB EVT_STORE, 50 条)**：业务里程碑事件，同步上传 Supabase `sync_app_events` 表。容量小、时间窗短（30 天清理）。
- **`_voiceLog` (内存 ring buffer, 60 条)**：今日 PR #508 临时引入，专门给鼓励语音链路埋点。一次性方案，与其他日志体系并存。

三套机制并行的问题：

1. **`yh_logs` 与 `_voiceLog` 用途重叠**：都是"技术诊断细节"，只是后者绕开 log level 过滤。
2. **`yh_logs` 与 `app_events` 边界不清**：技术错误是用 `log.error` 还是 `logAppEvent('error_xxx')`？现状里两边都有。
3. **未来扩展无规范**：再加一个语音/SRS/同步专用 buffer 就是再一个 `_xxxLog`，越积越乱。

同时反馈链路 (`collectDiagnostics → submitFeedback → feedback 表`) 已经验证可用，但 payload 当前同时带 `logs` (yh_logs) + `events` (app_events) + `voice_log`——重复且无清晰边界。

## 2. 目标与非目标

### 目标

- **一个本地日志系统**：消灭 `yh_logs` 与 `_voiceLog`，统一为 `local_log`。
- **清晰的双轨边界**：`app_events`（业务里程碑，自动上传）+ `local_log`（技术细节，仅 feedback 携带），不重叠。
- **覆盖一整天用量**：buffer 容量足够装 1-2 个 session 的细粒度日志。
- **call site 签名兼容**：现有 `log.warn(module, msg, data)` 调用点不需要大范围重写，结构演进而非破坏。
- **零持久化开销**：纯内存 ring buffer，不写 IDB。

### 非目标

- **不做远程开启日志**：场景 A（妈妈出问题后几分钟内反馈）下，常驻内存 buffer 已足够；远程开启增加复杂度暂不引入。
- **不做日志聚合分析**：feedback 表里是单条记录，分析靠人工或后续 SQL 查询，不在本设计范围。
- **不改 `app_events` 系统**：保持业务里程碑事件的自动上传链路不动。

## 3. 系统边界

### 3.1 两条独立的日志线

| 系统 | 定位 | 容量 / 持久化 | 上报 |
|------|------|--------------|------|
| **`app_events`** | 业务里程碑（user did what when）| 50 条 IDB + Supabase 长期 | 同步时自动批量上传 |
| **`local_log`** | 技术诊断细节（链路时序、异常、迁移）| 2000 条内存 | 仅 feedback 提交时携带 |

### 3.2 怎么判断该写哪边？

| 场景 | 写入位置 | 例子 |
|-----|---------|------|
| 用户主动操作 / 状态切换 | `app_events` | login, start_practice, config_changed (locale=en) |
| 服务端要做趋势统计 | `app_events` | sync_started, import_deck |
| 一次链路中的子步骤 | `local_log` | `voice.tts_speak`, `sync.phase_start`, `media.upload_retry` |
| 技术异常 / 状态修复 | `local_log` | `storage.idb_tx_fail`, `config.cfg_field_invalid` |
| 排查时需要看时序 | `local_log` | `voice.correct_hint_call` → `voice.tts_onend` |

**两边都写的反模式：** 不要在同一个事件上调用 `logAppEvent` 又调 `log.info`。如有疑问，问"服务端要不要长期保留这条做统计？"是 → `app_events`，否 → `local_log`。

### 3.3 服务端关联分析

定位问题时，从 feedback 拿到 `user_id + created_at`：

```sql
-- 反馈本身
SELECT diagnostics FROM feedback WHERE id = '...';

-- 同时间段的业务里程碑（app_events 服务端已有）
SELECT * FROM sync_app_events
WHERE user_id = 'b5b1343e-...'
  AND timestamp BETWEEN
        (SELECT created_at FROM feedback WHERE id = '...') - interval '1 hour'
    AND (SELECT created_at FROM feedback WHERE id = '...');
```

feedback payload 因此**不再重复携带 `events` 字段**。

## 4. API 设计

### 4.1 核心结构

```javascript
const LOCAL_LOG = [];
const LOCAL_LOG_MAX = 2000;

function _push(level, module, event, data) {
  if (LOCAL_LOG.length >= LOCAL_LOG_MAX) LOCAL_LOG.shift();
  LOCAL_LOG.push({
    t: Date.now(),  // timestamp ms
    lv: level,      // 'info' | 'warn' | 'error'
    m: module,      // 模块名
    e: event,       // 事件 key (snake_case)
    d: data,        // 可选 payload（object）
  });
  const fn = level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'info';
  console[fn](`[${module}]`, event, data || '');
}

const log = {
  info:  (m, e, d) => _push('info',  m, e, d),
  warn:  (m, e, d) => _push('warn',  m, e, d),
  error: (m, e, d) => _push('error', m, e, d),
};
```

### 4.2 关键决策

- **取消 `debug` 级别**：高频调试日志用 `console.debug` 仅控制台输出，不进 buffer。原 `log.debug` 调用点全部改为 `console.debug` 或删除。
- **不再有 log level 过滤**：要看就全要（info/warn/error 全部入 buffer）。简化心智模型。
- **签名 `(module, event, data)`**：`event` 是 snake_case 短 key（`tts_onend` 而非 `"TTS ended for correct_hint"`）。`data` 携带结构化字段。
- **dev console 镜像**：所有日志同步写到 `console.info/warn/error`，本地开发时不需要单独看 buffer。

### 4.3 模块分类（11 个）

| module | 用途 | 典型 event |
|--------|-----|-----------|
| `voice` | TTS / 录音播放链路 | `tts_speak`, `tts_onend`, `tts_onerror`, `slot_recording`, `slot_muted`, `safety_net_fired`, `enc_cancelled` |
| `sync` | 云同步三阶段、watchdog、重试 | `phase_start`, `phase_done`, `watchdog_timeout`, `push_retry`, `pull_done` |
| `srs` | SRS 状态写入、队列构建（含 easy 模式）| `write_ok`, `write_race`, `queue_build`, `easy_classify` |
| `config` | 设置/主题/语言/SRS_CONFIG 变更、迁移、云端 pull/push | `theme_change`, `locale_change`, `cfg_pull_ok`, `cfg_field_invalid`, `cfg_migrate_voice_v2` |
| `storage` | IndexedDB + localStorage 异常/迁移 | `idb_tx_fail`, `ls_migrate_v3`, `idb_upgrade_v8_v9` |
| `auth` | 登录、注册、session restore、token 刷新 | `session_restore_ok`, `session_restore_timeout`, `login_fail`, `oauth_redirect` |
| `media` | 媒体上传/下载、Storage 异常 | `upload_start`, `upload_retry`, `media_404`, `flush_batch` |
| `deck` | 牌组导入/导出/重命名/删除 | `import_yhspack`, `rename_ok`, `delete_card`, `share_url_open` |
| `ui` | 关键 UI 操作（导航 / 模式切换）| `go_home`, `mode_switch`, `start_practice` |
| `feedback` | 反馈本身（提交、回退、重试）| `submit_ok`, `submit_fail`, `clipboard_fallback`, `pending_retry` |
| `diag` | 诊断面板 `yh_diag.js` 自身行为 | `panel_open`, `query_ok`, `export_csv`, `panel_err` |

新模块需求出现时可追加，但应避免单一 call site 自创模块（容易碎片化）。

## 5. 容量与生命周期

- **2000 条**内存上限
- **估算**：每条平均 150 字节 × 2000 ≈ **300KB** 常驻内存
- **每天用量基线**（一次 19 张 easy session）：~150 voice + ~30 sync/srs/config + ~20 其他 ≈ 200 条/session
- **覆盖**：1 天 1-2 session 内的所有细粒度日志，留有余量
- **生命周期**：
  - 页面 unload → 内存释放（不持久化）
  - PWA 在前台 / 后台短暂未被杀 → buffer 保留
  - PWA 被 iOS 杀掉重启 → buffer 重置（接受此风险，场景 A 下用户会立即反馈）

## 6. feedback payload 收口

`collectDiagnostics()` 改为：

```javascript
{
  app_version,
  collected_at,
  idb_version,
  sync_enabled,
  has_session_backup,
  last_sync_ts,
  deck_count,
  user_id,                           // 用于服务端定位用户
  device_info,                       // 含 model 解析
  local_log: LOCAL_LOG.slice(-500),  // 最近 500 条（约 75KB）
}
```

**移除字段：**
- `logs`（yh_logs 已删）
- `events`（app_events 服务端已有，靠 user_id+ts 关联）
- `voice_log`（合并进 local_log）
- `log_source`（无意义）

## 7. 迁移计划

### 7.1 IDB schema：v8 → v9

- 删除 `LOG_STORE` (`yh_logs`) object store
- 升级路径：`migrate v8 → v9` 中 `db.deleteObjectStore('yh_logs')`

### 7.2 代码删除

- `LOG_STORE` 常量
- `_writeLogToIdb()` 函数
- `_logLevel` 变量与 `_LOG_LEVELS` 常量
- `_doLog()` 函数
- `window.yhLog` 全局对象（`show/showErrors/export/clear`）
- `purgeOldLogs()` 内清理 LOG_STORE 的代码
- `_voiceLog` 数组、`_logVoice()` 函数

### 7.3 调用点改造

**类型 1：`_logVoice('xxx', data)` → `log.info('voice', 'xxx', data)`**（15 处，机械替换）

**类型 2：现有 `log.warn/error(module, sentence, data)` 调整为 event key 风格**（约 30 处）：

```javascript
// 旧
log.warn('sync', 'runSync watchdog: 30s timeout');
// 新
log.warn('sync', 'watchdog_timeout', { ms: 30000 });
```

**类型 3：`log.debug(...)` 统一改为 `console.debug`**（不入 buffer，仅本地开发控制台可见）。

**类型 4：补埋点**——核心链路要保证关键事件被记录：
- `config`：cfg_pull_ok/cfg_push_ok/cfg_migrate_*
- `auth`：session_restore_* 已有，无需改动
- `storage`：idb_upgrade_* / ls_migrate_*
- `ui`：go_home / start_practice / mode_switch

补埋点不在本次迁移强制要求，按需追加。

### 7.4 `app_events` 系统

**完全不动**。`logAppEvent()` 函数、`EVT_STORE`、`uploadAppEventBatch()`、`config_changed` 等事件类型全部保留。

## 8. 测试与验证

### 8.1 单元测试

- `tests/run_all.js` 全过（596 断言不能少）
- 不新增 local_log 专用单元测试（纯函数逻辑过于简单）

### 8.2 Playwright

- `_pw_ui_smoke.js`：验证 `log.*` 调用没引入运行时错误
- `_pw_cloud_sync.js`：验证迁移路径 `v8 → v9` 不破坏现有同步

### 8.3 手动验证

1. 妈妈再做一次易模式 session
2. 立即提交意见反馈
3. 查 Supabase：
   ```sql
   SELECT diagnostics->'local_log'
   FROM feedback
   WHERE diagnostics->>'user_id' = 'b5b1343e-b619-4008-b0f2-7cc9790fea75'
   ORDER BY created_at DESC LIMIT 1;
   ```
4. 确认 local_log 含 `voice.*`、`srs.*`、`config.*` 多模块事件

## 9. 风险与取舍

| 风险 | 影响 | 缓解 |
|------|------|------|
| iOS PWA 被杀 → 内存 buffer 丢 | 跨日反馈拿不到当时日志 | 接受。场景 A 用户会立即反馈；远程开启留作后续 |
| 2000 条不够装重度用户一天 | 早期日志被覆盖 | 监控线上 feedback 的 local_log 长度分布，必要时扩容 |
| 删 `log.debug` 后某些调试场景缺日志 | 开发期不便 | 用 `console.debug` 替代；不入 buffer 但本地开发能看 |
| call site 迁移引入语义偏差 | 旧 sentence msg 改成 event key 时丢上下文 | 关键 msg 信息放进 `data` 字段 |

## 10. 未来扩展（不在本次实施）

- **远程开启**：通过 `sync_config` 加一个 `debug_mode` 字段，app 启动时读取，开启后将 `local_log` 同步上传到独立表
- **持久化（IDB）**：若发现跨日反馈频繁丢失日志，引入 IDB 持久化层（异步写，不阻塞）
- **日志聚合 Edge Function**：feedback 提交后自动触发 Supabase Edge Function 把 `local_log` 拆解到独立的 `feedback_logs` 表，支持按模块/事件 SQL 查询

---

## 实施顺序

1. **新建 `log` API + LOCAL_LOG 数组** + 老 API 标记 deprecated（运行时不报错，仅控制台 warn）
2. **批量替换 15 处 `_logVoice`** 为 `log.info('voice', ...)`
3. **批量改 30 处 `log.warn/error`** 的 event key 风格
4. **删除 `log.debug` 调用点**
5. **删 `_voiceLog` / `yh_logs` 相关代码 + IDB v9 migration**
6. **更新 `collectDiagnostics`** 移除 logs/events/voice_log，加 local_log
7. **跑测试 + 提交**

每步独立可验证，allow 中途暂停。
