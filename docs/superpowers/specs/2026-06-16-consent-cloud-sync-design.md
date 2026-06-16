# 同意状态云同步 + 版本升级流程（P2 #1+#2+#3）设计

**日期**：2026-06-16
**关联 spec**：`docs/superpowers/specs/2026-06-14-privacy-policy-and-terms-design.md`（P1 上游）
**关联 plan**：`docs/superpowers/plans/2026-06-15-privacy-policy-and-terms-p1.md`（P1，已实施 commit 52c2f7b #575）
**目标版本**：v5.13.13

---

## 1. 目标

在 P1（隐私政策 + 用户协议中文页 + 登录/注册 form 同意 checkbox + LS 落地）基础上实现：

1. **`consent` 状态跨设备同步**：A 设备勾过的同意状态，在 B 设备登录后自动生效，免重复勾选。
2. **协议版本升级弹窗**：PP/ToS 文本变更需用户重新征同意时，bump 代码常量 `CONSENT_PROTOCOL_VERSION` 即可触发全用户重新征。
3. **拒绝同意流程**：已登录用户拒绝 → signOut + 跳登录屏；未登录用户拒绝 → 提示「不同意不能继续使用」后关弹窗，不隔离主屏。

不在范围（推后到 P3）：
- 老用户回溯（无老用户，N/A）
- 历史 `consent_records` append-only 表
- 英文 / 其他语种 PP/ToS HTML（独立 PR）
- App Store 隐私标签 JSON

---

## 2. 架构

### 2.1 数据存储

复用现有 `sync_config.config_json jsonb` 列，添加顶层 key `consent`：

```jsonc
// sync_config.config_json schema（新增 consent 段）
{
  "srs":     { /* 现有 SRS 参数 */ },
  "ui":      { /* 现有 UI 参数 */ },
  "consent": {                         // 新增
    "version": "v1",                   // 同意的协议版本号
    "at": "2026-06-15T08:23:45.123Z"   // ISO 时间戳
  }
}
```

**零 DB schema migration**（`config_json` 已经是 `jsonb`，新增字段无需 alter）。

**为何不单建 `consent_records` 表**：当前对法律举证要求未达到「每次同意一条记录」的强度。`sync_config.consent` 单条最新状态足以支持「我是否同意了当前版本」检查。需要历史追踪时再加 records 表（P3）。

### 2.2 协议版本常量

`index.html` 顶部新增：

```javascript
const CONSENT_PROTOCOL_VERSION = 'v1';
```

PP/ToS 文本变更需重新征同意时，手动 bump 此常量到 `'v2'`，下次 release 部署后所有用户登录时触发升级弹窗。

**何时 bump**：
- ✅ PP/ToS 增减实质条款（数据收集范围、第三方分享、用户权利、纠纷解决地）
- ❌ 文字润色、排版调整、邮箱地址改动 → 不 bump

### 2.3 本地存储（P1 已有）

```
yh:v1:user:consentAt        ISO 时间戳
yh:v1:user:consentVersion   协议版本号
```

P2 不改 LS schema，复用 P1 helper。

---

## 3. 数据流

### 3.1 登录/注册 → 推云

```
doAccountLogin / doRegister 成功
  → _writeConsentLs()          // P1 已有
  → cloudPushConfig()          // 新增触发点（原本只在设置变更时推）
       config_json.consent = { version, at } 从 LS 读
       merge 后 upsert sync_config
```

为何登录后立即推：用户在本设备勾的同意，需立刻同步到云供其他设备读，避免「A 设备勾完后立即切到 B 设备登录还要再勾」的体验问题。

### 3.2 启动 / restoreCloudSession → 拉云 + apply + 升级检查

```
restoreCloudSession 成功
  → runSync(...)
    → cloudPullConfig()
        ├─ 取 cloud.config_json.consent
        ├─ 取 LS consent (P1 已有 yh:v1:user:consent*)
        ├─ mergeConsent(local, cloud) → 写回 LS
        └─ checkConsentUpgrade() ← 新增
            ├─ LS consentVersion === CONSENT_PROTOCOL_VERSION → noop
            └─ 不一致 → showConsentUpgradeDialog()
```

### 3.3 mergeConsent 规则（纯函数）

```javascript
function mergeConsent(local, cloud) {
  // local, cloud: { version, at } | null
  if (!local && !cloud) return null;
  if (!local) return cloud;
  if (!cloud) return local;

  // 跨版本：高位版本胜（v2 > v1）
  if (local.version !== cloud.version) {
    return _compareVersion(local.version, cloud.version) >= 0 ? local : cloud;
  }

  // 同版本：取较晚的 at
  return new Date(local.at) >= new Date(cloud.at) ? local : cloud;
}

function _compareVersion(a, b) {
  // 'v1' vs 'v2' → 比较数字部分
  const na = parseInt(a.replace(/^v/, ''), 10) || 0;
  const nb = parseInt(b.replace(/^v/, ''), 10) || 0;
  return na - nb;
}
```

合并结果若与 LS 当前不同，写回 LS（`lsSet('yh:v1:user:consentAt', ...)` + `lsSet('yh:v1:user:consentVersion', ...)`）。

### 3.4 checkConsentUpgrade

```javascript
async function checkConsentUpgrade() {
  const lsVer = lsGet('yh:v1:user:consentVersion');

  if (lsVer === CONSENT_PROTOCOL_VERSION) return;  // 已最新

  // 未同意 || 旧版本 → 弹升级框
  showConsentUpgradeDialog();
}
```

### 3.5 升级弹窗

复用现有 `showConfirmDialog(title, message, onConfirm, onCancel)`。

**已登录路径**：

```
showConfirmDialog(
  title: t('consent_upgrade_title'),      // 「协议已更新」
  message: t('consent_upgrade_msg'),       // 「《隐私政策》和《用户协议》已更新，请重新阅读并同意后继续使用。」
  onConfirm: async () => {
    _writeConsentLs();        // 写 LS 新版本 + at=now
    await cloudPushConfig();  // 推云
  },
  onCancel: async () => {
    await signOut();
    showScreen('screen-account');
  }
);
```

按钮文案：
- 确认按钮 `consent_upgrade_accept`：「我已阅读并同意」
- 取消按钮 `consent_upgrade_decline`：「拒绝」

**未登录路径**：

```
showConfirmDialog(
  title, message,
  onConfirm: () => { _writeConsentLs(); /* 无 cloudPush */ },
  onCancel: () => {
    toast(t('consent_required_hint'));  // P1 已有 key
    // 不切屏，不隔离
  }
);
```

未登录用户的升级检查在何时触发：app 启动时（DOMContentLoaded 后 setTimeout 内）做一次。因为未登录用户也可能从本地练习——他们 LS 里也写过 P1 consentVersion。

### 3.6 文案 i18n key

5 语种各加 4 key：

| key | zh-CN |
|---|---|
| `consent_upgrade_title` | 协议已更新 |
| `consent_upgrade_msg` | 《隐私政策》和《用户协议》已更新，请重新阅读并同意后继续使用本应用。 |
| `consent_upgrade_accept` | 我已阅读并同意 |
| `consent_upgrade_decline` | 拒绝 |

`consent_required_hint`（未登录拒绝 toast）P1 已有，复用。

升级 dialog 中需要带 PP/ToS 链接，复用 P1 i18n key（`consent_privacy` / `consent_and` / `consent_terms`）。Message 拼接见 Task plan。

---

## 4. 实施改动单

| 文件 | 改动 |
|---|---|
| `index.html` | (1) 加常量 `CONSENT_PROTOCOL_VERSION = 'v1'`；(2) 加纯函数 `_mergeConsent` + `_compareConsentVersion`；(3) `cloudPushConfig` 加 consent 字段；(4) `cloudPullConfig` 加 consent merge + apply；(5) 新增 `checkConsentUpgrade()`；(6) 新增 `showConsentUpgradeDialog()`；(7) `doAccountLogin` / `doRegister` 成功后追加 `cloudPushConfig()` 调用；(8) 启动序列加未登录用户升级检查；(9) i18n 4 key × 5 语种 |
| `tests/yihai_v5.13.13_consent_test.js` | 纯函数单测：`_mergeConsent`（同版本取较晚、跨版本取高位、空值兼容、对称性）+ `_compareConsentVersion`（数字比较、容错）+ checkConsentUpgrade 逻辑（mock LS）。~22 cases |
| `tests/_pw_consent_sync.js` | E2E：① A 设备登录勾同意 → push；② B 设备登录 → pull consent → LS 写入；③ LS consentVersion=v0 手动注入 → restoreCloudSession 后弹升级框；④ 接受 → LS 更新 + cloud 更新；⑤ 拒绝 → signOut + 切 screen-account；⑥ 未登录场景的拒绝仅 toast。需登录测试账号 zyhaff@gmail.com，~14 断言 |
| `CLAUDE.md` | 新测试登记 2 行（单测 + Playwright）|

`sql/supabase_schema.sql` **不改**（jsonb 列复用，仅添加 comment 注明 consent 字段为可选）。

---

## 5. 测试策略

### 5.1 纯函数单测（无 IDB / 无浏览器）

`tests/yihai_v5.13.13_consent_test.js` 覆盖：

- `_compareConsentVersion('v1', 'v2') < 0`
- `_compareConsentVersion('v2', 'v1') > 0`
- `_compareConsentVersion('v1', 'v1') === 0`
- `_compareConsentVersion(null, 'v1')` 容错（null 视为 0，cloud 胜）
- `_mergeConsent(null, null) === null`
- `_mergeConsent({v1, at_old}, null)` → local
- `_mergeConsent(null, {v1, at_new})` → cloud
- `_mergeConsent({v1, at_old}, {v1, at_new})` → at_new
- `_mergeConsent({v1, at_new}, {v1, at_old})` → at_new
- `_mergeConsent({v2, at_old}, {v1, at_new})` → 跨版本：取 v2 (local)
- `_mergeConsent({v1, at_old}, {v2, at_new})` → 跨版本：取 v2 (cloud)
- `_mergeConsent({v1, at}, {v1, at})` → 任意一方
- 对称性：`_mergeConsent(a, b) === _mergeConsent(b, a)` 当结果应一致时
- 边界：at 字符串解析失败容错
- `checkConsentUpgrade` 逻辑分支：mock `lsGet('yh:v1:user:consentVersion')` 返回 v1 / null / v0 / v2，断言是否触发 showConsentUpgradeDialog（通过 spy 函数）

预期 ~22 cases。

### 5.2 Playwright E2E

`tests/_pw_consent_sync.js` 6 个 Phase：

**Phase 1**：未登录 + 已勾 P1 → 启动检查无弹窗（versions 一致）
**Phase 2**：未登录 + LS 注入 consentVersion='v0' → 启动检查弹升级框 → 拒绝 → 仅 toast 不切屏
**Phase 3**：已登录 A 角色 + 勾 consent → cloudPushConfig 推云（查 sync_config 表确认 consent 字段）
**Phase 4**：清 LS → 登录 B 同账号 → cloudPullConfig 写回 LS（验证传播）
**Phase 5**：已登录 + LS 注入 consentVersion='v0' → restoreCloudSession 后弹升级框 → 接受 → LS 更新到 v1 + 云更新
**Phase 6**：已登录 + LS 注入 v0 → 升级框 → 拒绝 → signOut + 切 screen-account

需 `TEST_PASSWORD` env。~14 断言。

### 5.3 回归

发布前：
- `node tests/run_all.js`（含新单测）
- `node tests/_pw_ui_smoke.js`
- `node tests/_pw_srs_e2e.js`
- `node tests/_pw_config_sync.js`（云端配置同步路径触及）
- `node tests/_pw_consent_checkbox.js`（P1 不破）
- `node tests/_pw_consent_sync.js`（新增）

---

## 6. 已知风险

| 风险 | 等级 | 缓解 |
|---|---|---|
| `signOut` 后异步同步任务在飞 → fire-and-forget 失败 | 低 | dev rule #10 fire-and-forget 模式，可接受；日志会捕获 |
| `showConfirmDialog` 在老 iOS PWA 上 sheet 高度受限 → 文案截断 | 中 | Playwright 验证；文案精简到 2 行内 |
| 未登录用户每次启动都做升级检查 → 启动开销 | 低 | 纯 LS 读 + 字符串比较，~微秒级，可忽略 |
| 跨版本协议升级时本地有 v0 / v1 用户同时存在 → merge 后写云覆盖更高 version | 中 | `_mergeConsent` 取高位 version 已保证；测试覆盖 |
| 老用户启动后弹升级框 → 用户困惑 | N/A | 用户确认无老用户 |
| 用户 sync_config 表无记录（新注册第一次登录前）→ cloudPull 返回 null | 低 | `cloudPullConfig` 已有空兼容，consent merge 函数允许 cloud=null |

---

## 7. 实施顺序

按 P1 经验，单 PR 6 task 流程：

1. 常量 + `_mergeConsent` + `_compareConsentVersion` 纯函数（最小可测单元）
2. 单元测试套件（覆盖纯函数）
3. `cloudPushConfig` 加 consent 字段（向后兼容）
4. `cloudPullConfig` 加 consent merge + apply + 调用 checkConsentUpgrade
5. `showConsentUpgradeDialog` + 接受/拒绝逻辑 + i18n
6. `doAccountLogin` / `doRegister` 追加 cloudPushConfig + 启动序列加未登录检查 + Playwright + 全回归 + 单 commit

详见后续 plan 文档。
