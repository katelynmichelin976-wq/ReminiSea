# 答题热路径 IDB 写入容错设计

**日期：** 2026-06-14
**作者：** chenlian + Claude
**关联：** 上线前预防性加固清单（[memory: feedback-dev-workflow](../../../../memory/feedback-dev-workflow.md) 等）

---

## 1. 背景

讨论"app 上线前运营维护方面缺什么"时识别出多项预防性加固，其中绝大多数（同步 UX、离线 UI、媒体预热）经过审视后判定**当前防御充足**或 Capacitor 上线后自然解决，YAGNI 删除。仅剩一项真实风险：**答题热路径里的 IDB 写入若 throw，会掐断答题流**。

### 风险路径

| 函数 | 调用时机 | 当前失败行为 |
|---|---|---|
| `_writeSrs` | 每次答题后写 `sync_card_states` | 内部 `idbPut('syncCardStates', ...)` throw → 调用者 `_lastSrsWrite` chain reject → 后续 `await _lastSrsWrite` 处（如 `goHome` / `openStats`）卡住或抛错 |
| `writeTrialLog` | 每次答题后写 `sync_trials` + 后台上传 | `idbPut('syncTrials', ...)` throw → `writeTrialLog` reject → 调用方未 try-catch 时影响下一张显示 |
| `saveCardState` / `saveCardStateLocal` | sync 上下行 + manual reconcile | reject 后调用方 fire-and-forget 已捕获，但日志缺失 |
| `putEasyState` | Easy 模式答题后更新 EasyState | reject → Easy session 状态机异常 |

### 触发场景

- IDB quota 满（移动设备低存储）
- 浏览器 sandbox 损坏（Safari 偶尔）
- 后续 schema 改动 bug
- 单纯的"IndexedDB 进入 stale-while-revalidate 死锁"等罕见状态

## 2. 目标与非目标

### 目标

- 任何 IDB 写入失败**不掐断答题流**：当前题答完，下一题正常显示
- 写失败有结构化日志可追溯（上传到 admin 监控）
- 内存状态机继续正确推进（SRS_STATES、_easyState 等）

### 非目标

- ❌ retry 重写（IDB 错误通常持续，retry 也错）
- ❌ 弹 toast / UI 提示（避免妈妈练习时看到错误消息）
- ❌ 兜底写到 localStorage（增加复杂度，不解决根因）
- ❌ 修复 `_onOnlineRetry` 不拉媒体（用户明确：Capacitor 上线后再补）

## 3. 设计

### 3.1 try-catch 模式

每个被加固的函数内部包 try-catch，catch 块结构化：

```javascript
async function _writeSrs(q, rating, attempt) {
  // ...内存状态推进...
  try {
    await idbPut('syncCardStates', state);
  } catch (e) {
    log.error('idb', 'write_fail', {
      fn: '_writeSrs',
      cardId: q.id,
      err: e && e.message
    });
    // 不 rethrow — 答题流继续
  }
}
```

### 3.2 数据流不变性保证

| 不变量 | 保证 |
|---|---|
| 内存中 SRS_STATES / _easyState 正确推进 | 写盘前已更新，catch 不影响 |
| `_lastSrsWrite` chain 不被毒化 | 用 `.catch(() => {})` 包外层，避免 unhandled rejection 传播 |
| 下一张卡显示不受影响 | 写盘是 await 的最后一步，catch 后函数 resolved |
| 离线后台同步 fire-and-forget | 不动 — 这部分本来就 catch ok |

### 3.3 日志结构

落到 `app_events` 表（自动上传 + admin 看板查询）：

```json
{
  "event_id": "...",
  "type": "error",
  "module": "idb",
  "msg": "write_fail",
  "payload": {
    "fn": "_writeSrs" | "writeTrialLog" | "saveCardState" | "saveCardStateLocal" | "putEasyState",
    "cardId": "...",
    "err": "QuotaExceededError: ..."
  },
  "ts": 1234567890,
  "user_id": "...",
  "device_id": "..."
}
```

admin 看板可按 `module=idb` + `msg=write_fail` 聚合，识别"哪些用户在写盘失败"。

### 3.4 内存与磁盘不一致的处理

如果 IDB 写失败，**内存正确 → 磁盘旧值**。后果：

- 用户继续练习当前 session：体验正常
- 关闭 app 再开：从 IDB 加载，丢失本 session SRS 进度
- 已登录用户：下次 sync 时云端比本地新 → 用云端覆盖（如果本 session 趁 trial 上传到云端成功 → 不丢；否则丢）

trade-off 已接受：宁可丢部分进度也不卡死答题。

## 4. 不在本设计内

- 历史 Sync 上下行的容错（已有 `.catch(() => {})`）
- localStorage 写入容错（不在本次范围）
- Storage media blob 写入容错（不在本次范围）
- Service Worker（独立工作）
- inline CDN（独立工作）

## 5. 测试

### 单元测试

`tests/yihai_v5.13.11_idb_resilience_test.js`：

- mock `idbPut` 抛 QuotaExceededError → 验证 `_writeSrs` resolved 不 throw
- 验证 `log.error` 被调一次，payload 含 `fn` 和 `err.message`
- mock 多次成功+失败混合 → 验证错误不串扰

### Playwright 回归

- `_pw_srs_e2e`：现有 21 断言不破坏
- `_pw_easy`：现有 28 断言不破坏
- `_pw_idb_helpers`：27 断言不破坏

## 6. 关联

- 触及函数已在 P3 中改用 `idbPut/Get` helper（v5.13.10）
- `log.error` API：现状 `local_log` ring buffer + `app_events` 双轨（详见 `docs/superpowers/specs/2026-06-12-local-log-design.md`）
- 上线监控：admin 看板按 `module=idb` 聚合
