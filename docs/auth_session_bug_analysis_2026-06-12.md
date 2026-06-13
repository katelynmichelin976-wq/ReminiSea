# 版本更新后"被登出"——根因分析与修复方案

**日期：** 2026-06-12  
**状态：** v5.13.5 发布后用户验证复现，**已查到真实根因**  
**影响范围：** 所有用户，包括妈妈 chenlian@263.net 已多次被影响

---

## TL;DR

**根因不是"session 自然过期"，是 `doAccountLogout()` 用了 `global` scope 的 signOut——任何一次开发/测试登出会撤销该用户所有设备的 refresh_token。**

证据：
- zyhaff 今天凌晨 5-6 点被 Playwright 跑了 ~50 次登录测试 + 1 次登出（06:31:09）
- 16 小时后用户验证 v5.13.5，发现登出（22:11:23）
- 妈妈 2026-06-08 09:53 也被开发设备 logout 过，之后两次被强制重登

**核心修复：`signOut()` → `signOut({ scope: 'local' })`。一行改动，杜绝再次发生。**

---

## 1. 现象与用户报告

用户报告："app 版本更新时有较高概率会退出登录状态"。

最初聚焦于"版本更新"作为关键触发条件——但实测发现，触发的是**测试机/开发机的 signOut 操作**，版本更新只是用户最容易发现该问题的时机。

---

## 2. Phase 1：证据收集

### 2.1 zyhaff@gmail.com 今日完整时间线

查 `app_events` 表（user_id `fd0c4941-ad03-40eb-83b6-79ff4870d902`）：

| 时刻 (CST) | event_type | device_id 模式 | 含义 |
|-----------|-----------|---------------|------|
| 05:29:53–06:30:38 | 47 次 `session_restore_none` + `login` 循环 | 每次新 dev_xxxxxxx | Playwright 启 Chromium，全新 localStorage 触发空 session restore + 登录 |
| 06:31:01 | `session_restore_ok` | dev_56cyin | 测试登录成功 |
| **06:31:09** | **`logout`** | dev_56cyin | **★ Playwright 调用 cloudLogout → doAccountLogout → signOut（global）** |
| 06:31:11 | `login` | dev_56cyin | 测试重新登（其他用例） |
| 06:31:18 | `login` | dev_56cyin | 又一次测试 |
| **16 小时静默** | | | |
| 22:11:23.838 | `session_restore_start` | dev_gvzs6i | 用户用真实设备打开 v5.13.5 验证 |
| **22:11:23.841** | **`session_restore_offline`** | dev_gvzs6i | **★ 3ms 内进入 offline，reason: "no_session"** |
| 22:11:38 | `login` | dev_gvzs6i | 用户手动重新输密码登录 |

### 2.2 妈妈 chenlian@263.net 同样被影响过

查最近 7 天的 logout 事件：

| 时刻 (CST) | event_type | device_id |
|-----------|-----------|-----------|
| **2026-06-08 09:53:02** | **`logout`** | **dev_gvzs6i**（开发设备模式 ID）|
| 2026-06-08 09:53:31 | `login` | dev_gvzs6i（开发设备又登回去）|
| 2026-06-08 10:02:26 | `login` | dev_hzn4ct（妈妈真实手机被强制重登）|
| 2026-06-12 09:43:45 | `login` | dev_opnso3（今天上午又被强制重登）|

**妈妈本人没有点过登出按钮**——但开发测试设备的一次 global logout 撤销了她所有 refresh_token，她真实手机被迫重新输密码登录。**已经发生多次。**

### 2.3 关键观察

| 现象 | 含义 |
|------|------|
| 测试每次 device_id 不同 | Playwright 每次启全新 Chromium，localStorage 空 |
| `session_restore_none` 反复出现 | 新 Chromium 没有 sb-token → restoreSession 走 "完全没凭据" 分支 |
| 06:31:09 单次 `logout` | 测试套件 cleanup 调了 cloudLogout |
| 22:11 用户验证时 `no_session` 而非 `session_restore_none` | 真实设备 localStorage **有** sb-token blob，但服务端校验时被告知 token 失效 |

3ms 时序（22:11:23.838 → 22:11:23.841）原本被我假设为"SDK 同步读取 localStorage 判定 access_token 过期"。**这个假设是错的——SDK 仍然发了网络请求，但服务端立刻返回 token 无效，因为它已经被 06:31:09 的 logout 撤销了。**

---

## 3. Phase 2：代码路径定位

### 3.1 `doAccountLogout`（`index.html:6231`）

```javascript
async function doAccountLogout() {
  logAppEvent('logout', {});
  ...
  try { if (_sb) await _sb.auth.signOut(); } catch(e) { ... }   // ★ 没指定 scope
  _syncEnabled = false; _cloudUserEmail = ''; _sb = null;
  lsRemove(LS_KEYS.SESSION_BACKUP);
  ...
}
```

**Supabase JS v2 的 `signOut()` 默认 `scope: 'global'`：**

| scope | 服务端动作 | 其他设备影响 |
|-------|----------|------------|
| `'global'`（**默认**） | 撤销该用户**所有** refresh_token | **所有设备**下次启动 token 失效 |
| `'local'` | 仅清当前 client 的 localStorage | 其他设备**不受影响** |
| `'others'` | 撤销除当前外的所有 refresh_token | 当前保留，其他失败 |

### 3.2 测试调用链 `_pw_cloud_sync.js` → `cloudLogout` → `doAccountLogout`

`tests/_playwright_helper.js:106`：
```javascript
async function cloudLogout(page) {
  await run(page, () => { showScreen('screen-account'); });
  await run(page, () => {
    const btns = document.querySelectorAll('button');
    for (const b of btns) { if (b.getAttribute('onclick') === 'doAccountLogout()') { b.click(); return; } }
  });
  ...
}
```

测试**直接调用 app 真实的登出按钮**——继承 global scope 的行为。

### 3.3 影响蔓延路径

```
开发者/CI 跑 _pw_cloud_sync.js
  → 测试用 zyhaff 登录
  → 测试结束 cleanup 调 cloudLogout()
  → doAccountLogout() → signOut() （global）
  → Supabase 服务端撤销 zyhaff 所有 refresh_token
  → 任何持有该 refresh_token 的设备（包括真实用户）下次刷新失败
  → 用户：今天怎么又退出登录了？
```

**对妈妈也是同样路径——只是 logout 触发来自手工开发操作而非 Playwright。**

---

## 4. Phase 3：根因综合

### 4.1 双层根因

| 层级 | 根因 | 影响 | 严重程度 |
|------|------|------|---------|
| **业务逻辑** | `doAccountLogout` 用 global scope —— 单设备登出操作错误地撤销了**所有**设备的 session | 任意一次登出（用户主动、测试自动、开发手动）→ 所有设备失效 | **P0** |
| **错误处理** | `restoreSession()` 在 access_token 过期场景下不主动尝试 refresh，直接关 autoRefresh 进 offline | refresh_token 仍有效时的常见冷启动场景没续期 | P2 |
| **UI 表达** | `_syncEnabled && _cloudUserEmail` 把"离线"等同于"未登录" | 用户体验：误以为被登出 | P3（用户已否决修复，不做） |

### 4.2 为什么"版本更新时高概率"

不是版本更新本身的问题——是**版本更新需要重启 app 重新加载页面，强迫 SDK 重新校验存储的 token**。在校验时如果 refresh_token 已被撤销，必然失败。

正常情况下 PWA 挂着不关，autoRefresh 偶尔续期不会感知。版本更新逼着重启 → 立刻撞到这个 bug。

---

## 5. Phase 4：修复方案

### 5.1 修复 1（P0，必做）：登出默认改 local scope

**`index.html:6235`：**

```diff
- try { if (_sb) await _sb.auth.signOut(); } catch(e) { console.warn('[sync] signOut error:', e.message); }
+ try { if (_sb) await _sb.auth.signOut({ scope: 'local' }); } catch(e) { console.warn('[sync] signOut error:', e.message); }
```

**这一行同时解决：**
- ✅ Playwright 测试登出不再撤销真实用户 session
- ✅ 用户在 A 设备登出不再连带把 B 设备登出（更合理的默认行为）
- ✅ 开发手动登出不再误伤真实用户

**为什么 local 是更合理的默认：**

通常用户的登出意图是"我这台不想留着登录状态了"——不是"我要从所有设备退出"。后者通常是怀疑被盗号时的特殊操作，应该单独提供按钮（"在所有设备退出登录"），不应该是默认行为。

### 5.2 修复 2（P2，建议同时做）：startup 主动 refresh

即使没有 global signOut 这个 bug，`access_token` 过期 + `refresh_token` 仍有效的场景仍然存在（PWA 长时间不开后冷启动）。

**`index.html:3388` 附近 `restoreSession()` 改造：**

```diff
 }).then(function(result) {
   var data = result.data, error = result.error;
   if (!error && data.session) {
     // 在线分支（不变）
     ...
     return;
   }
+
+  // 新增：getSession 返回 null 时显式尝试 refresh
+  if (!timedOut) {
+    return Promise.race([
+      _sb.auth.refreshSession(),
+      new Promise(function(resolve) {
+        setTimeout(function() {
+          resolve({ data: { session: null }, error: { message: 'refresh_timeout' } });
+        }, 5000);
+      })
+    ]).then(function(rr) {
+      if (!rr.error && rr.data && rr.data.session) {
+        _syncEnabled    = true;
+        _cloudUserEmail = rr.data.session.user.email;
+        _cloudUserId    = rr.data.session.user.id;
+        lsSet(LS_KEYS.SESSION_BACKUP, JSON.stringify(rr.data.session));
+        lsSet(LS_KEYS.LAST_CLOUD_EMAIL, _cloudUserEmail);
+        logAppEvent('session_restore_refresh_ok', { uid: _cloudUserId });
+        runSync({ decks: false, showToast: false }).then(() => refreshDeckUpdateBadges().catch(() => {})).catch(() => {});
+        return;
+      }
+      // refresh 也失败 → 真的需要重登
+      goOffline(rr.error ? rr.error.message : 'refresh_no_session');
+    });
+  }
+
+  goOffline(timedOut ? 'timeout' : (error && error.message) || 'no_session');
+
+  function goOffline(reason) {
+    _syncEnabled = false;
+    _cloudUserEmail = parsed.user.email;
+    _cloudUserId = parsed.user.id || '';
+    try { _sb.auth.stopAutoRefresh(); } catch(e) {}
+    logAppEvent('session_restore_offline', { reason });
+    window.removeEventListener('online', _onOnlineRetry);
+    window.addEventListener('online', _onOnlineRetry);
+  }
- // 原代码的 offline 处理删除（被 goOffline 替代）
 });
```

### 5.3 修复 1 vs 修复 2 的关系

| 场景 | 单做修复 1 | 单做修复 2 | 两个都做 |
|------|----------|----------|---------|
| 测试 logout 撤销真实 session | ✅ 杜绝 | ❌ 仍然撤销，refresh 也失败 | ✅ 杜绝 |
| access_token 自然过期（PWA 冷启动） | ❌ 不处理 | ✅ 自动续期 | ✅ 自动续期 |
| refresh_token 真过期（>1 周不开） | ❌ 进 offline | ❌ 进 offline | ❌ 进 offline（合理）|
| 多设备登出独立性 | ✅ 修复 | ❌ 不修复 | ✅ 修复 |

**结论：修复 1 是必做的根因修复。修复 2 是日常稳健性增强，对未来添加更多功能（OAuth 等）也有好处。**

---

## 6. 实施计划

### 6.1 修复 1（紧急）

1. 改 `index.html:6235`：`signOut()` → `signOut({ scope: 'local' })`
2. 测试：单元测试无关，Playwright `_pw_cloud_sync.js` 的 logout 路径仍走通即可（不需要校验全局撤销）
3. **不**改 Playwright 的 cloudLogout 代码——它继承 app 行为，app 改了它就对了
4. 发 v5.13.6 patch

### 6.2 修复 2（同 commit / 同版本）

3. 改 `restoreSession()` 加 refresh 分支（约 25 行）
4. 新增 `session_restore_refresh_ok` event_type
5. 验证：同上，单元测试不易写，Playwright 难 mock，靠生产 app_events 长期监测

### 6.3 验证

**短期（发布后立即验证）：**
1. zyhaff 在 app 里登录
2. 跑 `_pw_cloud_sync.js`（如果有 TEST_PASSWORD）
3. 重新打开 zyhaff 的 app
4. **预期：不需要重新登录，直接可用**

**长期（部署后 7 天查 app_events）：**

```sql
SELECT 
  COUNT(*) FILTER (WHERE event_type = 'session_restore_ok') AS direct_ok,
  COUNT(*) FILTER (WHERE event_type = 'session_restore_refresh_ok') AS refresh_ok,
  COUNT(*) FILTER (WHERE event_type = 'session_restore_offline') AS offline,
  COUNT(*) FILTER (WHERE event_type = 'session_restore_none') AS none,
  COUNT(*) FILTER (WHERE event_type = 'logout') AS logout
FROM app_events
WHERE timestamp > extract(epoch from now() - interval '7 days')*1000;
```

**修复有效的标志：**
- `logout` 数量（按用户日均）下降 —— 真实用户不再被开发测试错误登出
- 妈妈不再出现"被强制重登"模式（device_id 变化频率下降）
- `refresh_ok` > 0 —— 自动续期生效

### 6.4 历史污染清理

修复 1 只能防止**未来**再次发生。已经被撤销的 token 无法恢复——妈妈/zyhaff 此次仍需重新输一次密码完成登录，下次起就正常了。

---

## 7. 补充：中途断网（bug #3）

实施过程中追加发现的独立路径：`index.html:11594` 的 offline handler 只做减法，**不注册 'online' 监听器**——使用中 WiFi 闪断后 UI 立刻显示"请登录"，网络恢复后无法自愈，必须关闭重开 app。完全无 app_event 留痕。

**修复 #3：offline handler 加 online 恢复 listener（3 行）：**

```diff
 window.addEventListener('offline', function() {
+  logAppEvent('network_offline', {});
   if (_sb) { try { _sb.auth.stopAutoRefresh(); } catch(e) {} }
   if (_syncEnabled) { _syncEnabled = false; updateCloudTabUI(); }
+  window.removeEventListener('online', _onOnlineRetry);
+  window.addEventListener('online', _onOnlineRetry);
 });
```

复用 `_onOnlineRetry`，与启动时离线的恢复路径完全一致。

---

## 8. 重要校正：refresh_token 实际不会"按时间过期"

查 `auth.refresh_tokens` 表结构发现**没有 `expires_at` 列**——失效完全靠 `revoked` 布尔位。

| 触发 `revoked = true` | 来源 |
|----------------------|------|
| `signOut({ scope: 'global' })` | bug #1，今天根因 |
| 用户改密码 | Supabase 自动 |
| 管理员撤销 | Dashboard |
| Inactive timeout / max session lifetime | **仅 Pro 套餐有此功能，免费版无** |

实测：妈妈一条 refresh_token created 在 28 小时前仍未撤销，可继续使用。

**结论：免费版项目的 refresh_token 没有时间硬性过期。** 文档早期版本里写的"1 周必须重登"是错的。真实场景下用户被踢只有两种原因：bug #1（global logout）或 access_token 过期 + 没主动 refresh（bug #2）。

**Supabase 可配但本次不动：** JWT expiry 默认 1 小时，可在 Dashboard 拉到 7 天（免费版即可）。拉长后 bug #2 触发频率降低，但不替代代码修复。

---

## 9. 风险评估

| 修复 | 风险 | 缓解 |
|------|------|------|
| 1（local scope） | 用户期待"全设备登出"被打破 | 现行行为本身就是 bug，几乎不可能有人依赖；后续如需"全设备登出"再单独加按钮 |
| 2（refresh 续期） | refresh 慢导致启动延迟 | 5s timeout，最坏情况 +5s 启动；典型场景 <1s |
| 3（online 恢复） | 频繁 online/offline 抖动可能多次触发 restoreSession | `_onOnlineRetry` 内部先 removeEventListener 再触发，单流量保护 |
| 共同 | 改动局限三处独立位置 | git revert 单 commit 即可恢复 |

---

## 8. 文档历史

| 修订 | 内容 |
|------|------|
| 初稿（已废弃） | 假设根因是 access_token 自然过期 + SDK getSession 不刷新，B 方案作为唯一修复 |
| **当前版本** | 用户提出"测试用同账号"假设，查 app_events 证实测试 global logout 是真正根因；B 方案降为 P2，新增 P0 修复 1 |

---

## 9. 待评审项

- [ ] §5.1 是否需要保留"全设备登出"的选项？建议：暂不加，按需求出现时再说
- [ ] §5.2 5s refresh timeout 是否合理？保守起见可以 3s
- [ ] §6.3 是否需要主动通知妈妈"今天可能需要重登一次"？不需要，她下次开 app 输一次密码就好
- [ ] 是否在本次同步加 Playwright 测试的额外防护：cleanup 不调真实 doAccountLogout，而是直接清 localStorage？不需要——修复 1 已经让 doAccountLogout 安全了

---

**文档状态：** 待评审。批准后进入实施。
