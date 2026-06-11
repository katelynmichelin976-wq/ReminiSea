# localStorage Keymap Normalization Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 `index.html` 中 ~100+ 散乱的 `localStorage.setItem/getItem` 调用迁移到一套统一的命名规范：`yh:v1:` 前缀 + 冒号分层 + camelCase 段、集中 key 注册表 + 工厂函数、按生命周期聚合的 config blob。

**Architecture:** 三个连续 phase——(1) 引入 `LS_KEYS` 注册表 + `lsGet/lsSet/lsRemove` helper，所有 raw call site 改走 helper（不动 key 名），(2) per-deck 同步状态 / voice config / UI config 聚合为单 JSON entry，启动时 eager copy + 删旧 key，(3) 全部 top-level key 加 `yh:v1:` 前缀 + 冒号分层。每个 phase 一个 patch release，单独可发布、可回滚。云端 `sync_config` schema **不变**，由本地翻译表桥接。

**Tech Stack:** Vanilla JS（无 transpile）、单文件 `index.html`、Node + 内联 localStorage stub 跑单测、Playwright 跑回归。

**Risk:** Low — 目前唯一真实用户是用户的妈妈，无生产数据风险；上线前完成是核心动机。

---

## Pre-flight

**当前命名混乱（grep 实测）：**

| 风格 | 例子 | 数量 |
|---|---|---|
| `yihaiXxxYyy` camelCase 直连 | `yihaiPushedAt`, `yihaiLastCloudEmail`, `yihaiDeviceId` | ~15 |
| `yihai_xxx_yyy` snake_case | `yihai_deck_`, `yihai_ui_locale`, `yihai_has_ever_logged_in` | 3 |
| `yihaiXxx:{id}` 冒号分隔 | `yihaiPushedAt:{deckKey}`, `yihaiDeletedCards:{deckKey}` | 6 类 × N decks |
| `srs_xxx` snake_case 前缀 | `srs_session_mode`, `srs_easy_session_size` | ~25 |
| `phraseXxx` / `ttsXxx` 无前缀 | `phraseCorrect`, `ttsRate`, `theme`, `bdur` | ~20 |
| `fs-xxx` / `ls-xxx` kebab | `fs-opt`, `ls-ans`（typography CSS var） | 8 |

**目标规范：**

```
yh:v1:{namespace}:{resource}:{id?}:{field?}
```

- 前缀 `yh:v1:` —— 短、有版本、未来好整批迁移/清理
- `:` 分层 —— 业内通用（Redis/Discord/Notion 客户端）
- 段内 camelCase —— 与 JS 代码一致
- DB 列名 snake_case 保持 —— 与本地 key 解耦

**最终 key map（目标态）：**

```
yh:v1:deck:{key}:cards          ← was LS_DECK_PREFIX + key (yihai_deck_*)
yh:v1:deck:{key}:sync           ← 聚合 {pushedAt, pulledAt, pushedMediaAt, deletedCards} JSON
yh:v1:decks:index               ← was LS_INDEX (yihaiDecksIndex)
yh:v1:user:lastEmail            ← was yihaiLastCloudEmail
yh:v1:user:lastUserId           ← was yihaiLastCloudUserId
yh:v1:user:deviceId             ← was yihaiDeviceId
yh:v1:user:hasEverLoggedIn      ← was yihai_has_ever_logged_in
yh:v1:session:backup            ← was yihaiSessionBackup
yh:v1:sync:globalTs             ← was yihaiGlobalSyncTs
yh:v1:sync:easyPulledAt         ← was yihaiEasyPulledAt
yh:v1:sync:realtimeUpload       ← was yihaiRealtimeUpload
yh:v1:sync:pendingFeedback      ← was yihaiPendingFeedback
yh:v1:sync:v5MigrationPending   ← was yihaiV5MigrationPending
yh:v1:config:ui                 ← 聚合 {theme, locale, appMode, confettiOn, logLevel} JSON
yh:v1:config:voice              ← 聚合 ~20 phrase/tts/voice/delay keys JSON
yh:v1:config:typography         ← 聚合 fs-*/ls-* (8 keys) JSON
yh:v1:srs:{configKey}           ← was srs_* (保持每 key 独立，因云端按字段同步)
yh:v1:daily:progress            ← was LS_DAILY (yihaiDailyProgress)
yh:v1:practiceDays              ← was yihaiPracticeDays
yh:v1:logLevel                  ← was yihaiLogLevel
yh:v1:voice:slot:{slotName}     ← was 各 slot.storageKey（自定义 TTS 脚本文本）
```

**Killed keys（直接删除）：**
- `yihaiSyncAt:{deckKey}` —— v5.8 拆分为 PushedAt/PulledAt 后已无人读，仅死写 4 处

---

## Phase 1: Infrastructure (key 名不变)

**目标：** 引入 helper + 注册表，所有 raw `localStorage.X` 调用改走 helper。此 phase 完成后**外观无变化**（所有 key 名仍是 `yihaiXxx`），但代码可维护性大幅提升、为 phase 2/3 铺路。

**发布版本：** v5.13.2 (patch, refactor)

### Task 1.1: 添加 LS helper + 注册表骨架

**Files:**
- Modify: `C:\code\index.html`（在 `APP_VERSION` 之后、`SRS_CONFIG` 之前的全局区域插入）
- Create: `tests/yihai_v5.14_ls_test.js`

- [ ] **Step 1: 在 `tests/yihai_v5.14_ls_test.js` 写失败测试**

```javascript
// tests/yihai_v5.14_ls_test.js
// LS helper + 注册表纯函数单测

let passed = 0, failed = 0;
function check(desc, ok) {
  if (ok) passed++;
  else { failed++; console.log(`  ✗ ${desc}`); }
}

// stub localStorage
const _store = new Map();
const localStorage = {
  getItem: k => _store.has(k) ? _store.get(k) : null,
  setItem: (k, v) => _store.set(k, String(v)),
  removeItem: k => _store.delete(k),
  clear: () => _store.clear(),
  key: i => Array.from(_store.keys())[i],
  get length() { return _store.size; },
};

// ── 被测代码：从 index.html 复制 LS_KEYS + lsGet/lsSet/lsRemove ──
const LS_KEYS = {
  LAST_CLOUD_EMAIL:   'yihaiLastCloudEmail',
  DEVICE_ID:          'yihaiDeviceId',
  THEME:              'theme',
  DECK_INDEX:         'yihaiDecksIndex',
};
const lsGet = k => localStorage.getItem(k);
const lsSet = (k, v) => localStorage.setItem(k, String(v));
const lsRemove = k => localStorage.removeItem(k);
const lsGetJSON = (k, def = null) => {
  try { const v = localStorage.getItem(k); return v == null ? def : JSON.parse(v); }
  catch { return def; }
};
const lsSetJSON = (k, v) => localStorage.setItem(k, JSON.stringify(v));

// ── tests ──
{
  _store.clear();
  lsSet(LS_KEYS.THEME, 'dark');
  check('lsSet/lsGet round-trip string', lsGet(LS_KEYS.THEME) === 'dark');
  check('lsSet writes raw value', _store.get('theme') === 'dark');
}
{
  _store.clear();
  lsSet(LS_KEYS.DEVICE_ID, 12345);
  check('lsSet coerces number to string', lsGet(LS_KEYS.DEVICE_ID) === '12345');
}
{
  _store.clear();
  check('lsGetJSON returns default on missing', lsGetJSON('missing', { x: 1 }).x === 1);
  lsSetJSON('blob', { a: 1, b: [2, 3] });
  const v = lsGetJSON('blob');
  check('lsSetJSON/lsGetJSON round-trip', v.a === 1 && v.b[1] === 3);
}
{
  _store.clear();
  _store.set('bad', '{not json');
  check('lsGetJSON returns default on parse error', lsGetJSON('bad', 'fallback') === 'fallback');
}
{
  _store.clear();
  lsSet(LS_KEYS.LAST_CLOUD_EMAIL, 'a@b.com');
  lsRemove(LS_KEYS.LAST_CLOUD_EMAIL);
  check('lsRemove clears key', lsGet(LS_KEYS.LAST_CLOUD_EMAIL) === null);
}

console.log(`\n结果：${passed} 通过  ${failed} 失败`);
process.exit(failed === 0 ? 0 : 1);
```

- [ ] **Step 2: 跑测试验证失败**

```powershell
node tests/yihai_v5.14_ls_test.js
```

Expected: 全部 PASS（这一步测试纯函数本身，已内联代码到测试，应该直接过）。如果失败，说明 helper 逻辑写错。

- [ ] **Step 3: 在 `index.html` 添加 helper（grep "let SRS_CONFIG = " 找位置，插入其前）**

找到 `let SRS_CONFIG = {` 那一行（约 L2939），在它**之前**插入：

```javascript
// ─── localStorage 注册表 + helper (v5.13.2) ───────────────────────
// 所有 localStorage 访问通过 LS_KEYS 常量 + lsXxx helper，禁止 raw 调用
const LS_KEYS = {
  // user / session
  LAST_CLOUD_EMAIL:    'yihaiLastCloudEmail',
  LAST_CLOUD_USER_ID:  'yihaiLastCloudUserId',
  DEVICE_ID:           'yihaiDeviceId',
  HAS_EVER_LOGGED_IN:  'yihai_has_ever_logged_in',
  SESSION_BACKUP:      'yihaiSessionBackup',
  SESSION_BACKUP_OLD:  'yihai_session_backup',  // legacy, only removed on logout
  // sync
  GLOBAL_SYNC_TS:      'yihaiGlobalSyncTs',
  EASY_PULLED_AT:      'yihaiEasyPulledAt',
  REALTIME_UPLOAD:     'yihaiRealtimeUpload',
  PENDING_FEEDBACK:    'yihaiPendingFeedback',
  V5_MIGRATION:        'yihaiV5MigrationPending',
  PRACTICE_DAYS:       'yihaiPracticeDays',
  LOG_LEVEL:           'yihaiLogLevel',
  // app / ui
  APP_MODE:            'yihaiAppMode',
  THEME:               'theme',
  LOCALE:              'yihai_ui_locale',
  CONFETTI_ON:         'confettiOn',
  // decks
  DECK_INDEX:          'yihaiDecksIndex',
  DAILY_PROGRESS:      'yihaiDailyProgress',
  // voice / TTS
  PHRASE_CORRECT:        'phraseCorrect',
  PHRASE_WRONG:          'phraseWrong',
  PHRASE_STREAK_CORRECT: 'phraseStreakCorrect',
  PHRASE_SESSION_FINISH: 'phraseSessionFinish',
  PHRASE_IDLE_BROWSE:    'phraseIdleBrowse',
  PHRASE_OPT_HINT:       'phraseOptHint',
  PHRASE_QUIZ_PROMPT:           'phraseQuizPrompt',
  PHRASE_QUIZ_PROMPT_RECOGNIZE: 'phraseQuizPromptRecognize',
  TTS_RATE:            'ttsRate',
  TTS_PITCH:           'ttsPitch',
  TTS_VOICE_NAME:      'ttsVoiceName',
  VOICE_MUTED:         'voiceMuted',
  VOICE_ASSIST_ENABLED: 'voiceAssistEnabled',
  ANS_READ_DELAY:      'ansReadDelay',
  OPT_READ_DELAY:      'optReadDelay',
  BROWSE_ANS_DELAY:    'browseAnsDelay',
  OPT_COUNT:           'optCount',
  OPT_TOUCH_DELAY:     'optTouchDelay',
  NDUR:                'ndur',
  BDUR:                'bdur',
  // easy mode
  EASY_RETRY_ON_WRONG: 'easyRetryOnWrong',
  EASY_SESSION_SIZE:   'easySessionSize',
};

// per-deck key factory（dynamic-growing keys）
const LS_DECK = (deckKey, field) => {
  // field ∈ 'cards'|'syncAt'|'pushedAt'|'pulledAt'|'pushedMediaAt'|'deletedCards'
  const prefix = {
    cards:          'yihai_deck_',
    syncAt:         'yihaiSyncAt:',
    pushedAt:       'yihaiPushedAt:',
    pulledAt:       'yihaiPulledAt:',
    pushedMediaAt:  'yihaiPushedMediaAt:',
    deletedCards:   'yihaiDeletedCards:',
  }[field];
  if (!prefix) throw new Error('LS_DECK: unknown field ' + field);
  return prefix + deckKey;
};

// SRS config key factory（已有 srs_ 前缀约定，单独工厂方便 grep）
const LS_SRS = configKey => 'srs_' + configKey;

// typography key factory（fs-/ls- CSS var）
const LS_TYPO = (kind, slot) => `${kind}-${slot}`;  // kind ∈ 'fs'|'ls'; slot ∈ 'opt'|'ans'|'hint'|'btn'

// voice slot custom TTS script — 走 slot.storageKey，由 VOICE_SLOTS 数据定义

// helpers
const lsGet = k => localStorage.getItem(k);
const lsSet = (k, v) => localStorage.setItem(k, String(v));
const lsRemove = k => localStorage.removeItem(k);
const lsGetJSON = (k, def = null) => {
  try { const v = localStorage.getItem(k); return v == null ? def : JSON.parse(v); }
  catch { return def; }
};
const lsSetJSON = (k, v) => localStorage.setItem(k, JSON.stringify(v));
// ──────────────────────────────────────────────────────────────────
```

- [ ] **Step 4: 注册新测试套件到 `tests/run_all.js`**

在 `tests/run_all.js` 的 `UNIT_SUITES` 数组末尾加：

```javascript
'yihai_v5.14_ls_test.js',
```

- [ ] **Step 5: 跑 run_all 验证**

```powershell
node tests/run_all.js
```

Expected: 全部套件通过，新 helper 测试出现在汇总中。

- [ ] **Step 6: Commit**

```powershell
git add index.html tests/yihai_v5.14_ls_test.js tests/run_all.js
git commit -m "refactor: 引入 LS_KEYS 注册表 + lsGet/lsSet helper 骨架 (Phase 1.1)"
```

---

### Task 1.2: 删除 `yihaiSyncAt:{key}` 死写

**Files:**
- Modify: `C:\code\index.html` (4 处写入)

`yihaiSyncAt:{deckKey}` 在 v5.8 已被 `yihaiPushedAt`/`yihaiPulledAt` 完全取代，仅剩死写。grep 实测仅以下读取点（如有，则不能删）：

- [ ] **Step 1: 确认无读取**

```powershell
node -e "const fs=require('fs');const s=fs.readFileSync('C:\\code\\index.html','utf8');const lines=s.split('\n');lines.forEach((l,i)=>{if(l.includes('yihaiSyncAt'))console.log((i+1)+': '+l.trim())});"
```

Expected: 列出 ~5 处，其中读取（`getItem`）应只有 0–1 处（容错），写入 4 处。如有真实读取消费值，则不能删，改用 issue 跟踪。

- [ ] **Step 2: 删除所有 `yihaiSyncAt:` 写入 + removeDeck 中的 `yihaiSyncAt:` 清理**

grep 找到 4 处 `localStorage.setItem('yihaiSyncAt:'` 和 1 处 `localStorage.removeItem('yihaiSyncAt:'`，全部删除。如有 getItem，同步删除（值 fallback 走 PulledAt）。

注意 `LS_DECK` 工厂里也应同步删 `syncAt` 字段：

```javascript
const LS_DECK = (deckKey, field) => {
  const prefix = {
    cards:          'yihai_deck_',
    pushedAt:       'yihaiPushedAt:',
    pulledAt:       'yihaiPulledAt:',
    pushedMediaAt:  'yihaiPushedMediaAt:',
    deletedCards:   'yihaiDeletedCards:',
  }[field];
  if (!prefix) throw new Error('LS_DECK: unknown field ' + field);
  return prefix + deckKey;
};
```

- [ ] **Step 3: 跑单测 + Playwright 冒烟**

```powershell
node tests/run_all.js
python -m http.server 8080 --directory C:\code
```

另开终端：

```powershell
node tests/_pw_ui_smoke.js
node tests/_pw_srs_e2e.js
```

Expected: 全 PASS。

- [ ] **Step 4: Commit**

```powershell
git add index.html
git commit -m "refactor: 删除 v5.8 后失活的 yihaiSyncAt:{key} 死写 (Phase 1.2)"
```

---

### Task 1.3: 静态 key 调用改走 LS_KEYS + helper

**Files:**
- Modify: `C:\code\index.html`（按类别批量改）

不动 key 名，只把字符串字面量替换为 `LS_KEYS.X` 引用 + `lsGet/lsSet` 调用。

**风险点：** 大量替换易遗漏或误改。规则：
- 一类一类改、一类一 commit
- 改完每类跑 `run_all.js`
- 全部改完跑 `_pw_ui_smoke.js`

- [ ] **Step 1: 用户/会话类**

替换：`yihaiLastCloudEmail`, `yihaiLastCloudUserId`, `yihaiDeviceId`, `yihai_has_ever_logged_in`, `yihaiSessionBackup`。

每处形如：

```javascript
// before
localStorage.setItem('yihaiLastCloudEmail', _cloudUserEmail);
// after
lsSet(LS_KEYS.LAST_CLOUD_EMAIL, _cloudUserEmail);
```

```javascript
// before
var did = localStorage.getItem('yihaiDeviceId');
// after
var did = lsGet(LS_KEYS.DEVICE_ID);
```

跑 `node tests/run_all.js`，过则 commit：

```powershell
git add index.html
git commit -m "refactor: 用户/会话 LS 调用走 LS_KEYS helper (Phase 1.3a)"
```

- [ ] **Step 2: 同步状态类**

替换：`yihaiGlobalSyncTs`, `yihaiEasyPulledAt`, `yihaiRealtimeUpload`, `yihaiPendingFeedback`, `yihaiV5MigrationPending`, `yihaiPracticeDays`, `yihaiLogLevel`。

```powershell
node tests/run_all.js
git add index.html
git commit -m "refactor: 同步状态 LS 调用走 LS_KEYS helper (Phase 1.3b)"
```

- [ ] **Step 3: UI 类**

替换：`yihaiAppMode`, `theme`, `yihai_ui_locale` (LOCALE_KEY 删除 const，改用 `LS_KEYS.LOCALE`), `confettiOn`。

注意 LOCALE_KEY const 引用要同步消除：

```javascript
// before
const LOCALE_KEY = 'yihai_ui_locale';
// after: 删除 const，调用点改 LS_KEYS.LOCALE
```

```powershell
node tests/run_all.js
git add index.html
git commit -m "refactor: UI 类 LS 调用走 LS_KEYS helper (Phase 1.3c)"
```

- [ ] **Step 4: deck 索引/卡片本体**

替换：`LS_INDEX`, `LS_DECK_PREFIX`, `LS_DAILY` const → `LS_KEYS.DECK_INDEX`, `LS_KEYS.DAILY_PROGRESS` + `LS_DECK(key, 'cards')`。

注意：
- `LS_DECK_PREFIX + key` 改 `LS_DECK(key, 'cards')`
- 大值 JSON 走 `lsGetJSON(LS_KEYS.DECK_INDEX, [])` 替代 `JSON.parse(localStorage.getItem(LS_INDEX) || '[]')`

```powershell
node tests/run_all.js
node tests/_pw_ui_smoke.js
node tests/_pw_srs_e2e.js
git add index.html
git commit -m "refactor: deck 索引/卡片 LS 调用走 LS_KEYS helper (Phase 1.3d)"
```

- [ ] **Step 5: voice / TTS 类（~20 key）**

替换 voice 相关全部 key（`phraseXxx`, `ttsXxx`, `voiceXxx`, `*Delay`, `optCount`, `optTouchDelay`, `ndur`, `bdur`）。

**注意 cloudPullConfig / cloudPushConfig 中的 key 引用：** 这里 key 是云端 JSON 字段名（`cfg.ui[k]`），不是 localStorage key。两边碰巧同名。Phase 1 阶段两者仍同名，直接替换 `localStorage.setItem(k, ...)` 中的 raw 调用为 `lsSet(k, ...)` 即可（k 仍是云端字段名 = 本地 key 名）。

```powershell
node tests/run_all.js
node tests/_pw_ui_smoke.js
$env:TEST_PASSWORD="667788"; node tests/_pw_config_sync.js
git add index.html
git commit -m "refactor: voice/TTS LS 调用走 LS_KEYS helper (Phase 1.3e)"
```

- [ ] **Step 6: per-deck 同步状态类**

替换 `yihaiPushedAt:`, `yihaiPulledAt:`, `yihaiPushedMediaAt:`, `yihaiDeletedCards:`, `yihai_deck_` 拼接为 `LS_DECK(deckKey, field)` 调用。

```javascript
// before
localStorage.setItem('yihaiPushedAt:' + key, String(maxMod));
// after
lsSet(LS_DECK(key, 'pushedAt'), String(maxMod));

// before
localStorage.removeItem('yihaiSyncAt:' + key);
localStorage.removeItem('yihaiPushedAt:' + key);
localStorage.removeItem('yihaiPulledAt:' + key);
localStorage.removeItem('yihaiPushedMediaAt:' + key);
// after (removeDeck)
['pushedAt', 'pulledAt', 'pushedMediaAt', 'deletedCards'].forEach(f =>
  lsRemove(LS_DECK(key, f))
);
```

```powershell
node tests/run_all.js
node tests/_pw_ui_smoke.js
node tests/_pw_srs_e2e.js
$env:TEST_PASSWORD="667788"; node tests/_pw_cross_device.js
git add index.html
git commit -m "refactor: per-deck 同步状态走 LS_DECK 工厂 (Phase 1.3f)"
```

- [ ] **Step 7: SRS 配置类 (`srs_*`)**

替换 `'srs_' + key` 拼接为 `LS_SRS(key)`。

注意 `cloudPullConfig` 中应用 SRS 部分（L3484-3494）每个 type 分支都有 `localStorage.setItem('srs_' + k, ...)`，全部替换为 `lsSet(LS_SRS(k), ...)`。

```powershell
node tests/run_all.js
$env:TEST_PASSWORD="667788"; node tests/_pw_config_sync.js
git add index.html
git commit -m "refactor: SRS 配置走 LS_SRS 工厂 (Phase 1.3g)"
```

- [ ] **Step 8: typography (`fs-*`/`ls-*`) + voice slot 自定义 TTS**

替换 `fs-${key}` / `ls-${key}` 模板字符串为 `LS_TYPO('fs', key)` / `LS_TYPO('ls', key)`。

voice slot 走 `slotStorageKey(slotName)` 返回值，无需改（已是工厂）。

```powershell
node tests/run_all.js
node tests/_pw_ui_smoke.js
git add index.html
git commit -m "refactor: typography fs-/ls- 走 LS_TYPO 工厂 (Phase 1.3h)"
```

- [ ] **Step 9: 验证无 raw 调用残留**

```powershell
node -e "const fs=require('fs');const s=fs.readFileSync('C:\\code\\index.html','utf8');const re=/localStorage\.(getItem|setItem|removeItem)/g;let m,c=0;while((m=re.exec(s))){c++}console.log('raw localStorage calls:',c)"
```

Expected: 0。如有残留，逐个排查（可能在 helper 实现内部、或诊断/调试代码——这些保留）。允许的例外：`lsGet/lsSet/lsRemove/lsGetJSON/lsSetJSON` 函数体内部本身的 `localStorage.X` 调用。

实际允许残留数应 = helper 函数内部数（约 5–7）。

---

### Task 1.4: Phase 1 发布

**Files:**
- Modify: `C:\code\index.html` (APP_VERSION)
- Modify: `docs\忆海拾光_训练App_README.md`
- Modify: `docs\yihai_变更记录_CLAUDE参考.md`
- Modify: `CLAUDE.md`（当前版本行）

- [ ] **Step 1: 跑完整最小回归**

```powershell
node tests/run_all.js
python -m http.server 8080 --directory C:\code  # 另开终端
node tests/_pw_ui_smoke.js
node tests/_pw_srs_e2e.js
```

Expected: 全 PASS。

- [ ] **Step 2: APP_VERSION 改 `5.13.2`**

`index.html` grep 找 `APP_VERSION = '5.13.1'` 改 `'5.13.2'`。

- [ ] **Step 3: 文档同步**

- `CLAUDE.md`：当前版本行 `v5.13.1` → `v5.13.2`，"Recent Changes" 顶部加 v5.13.2 简述
- `docs/忆海拾光_训练App_README.md`：加版本条目
- `docs/yihai_变更记录_CLAUDE参考.md`：加 v5.13.2 详述

- [ ] **Step 4: Release commit + tag + push（需用户明确指令）**

按 CLAUDE.md "Deployment" 流程。**注意：等用户说"发布"再执行 push/tag。** 本 plan 内仅完成本地 commit：

```powershell
git add index.html docs CLAUDE.md
git commit -m "release: v5.13.2"
```

---

## Phase 2: Aggregation（聚合 + 迁移）

**目标：** 把同生命周期的多 key 聚合为单 JSON entry，启动时一次性 copy old→new + 删 old key。

**发布版本：** v5.13.3

**关键设计：**
- 迁移策略：**eager copy + 立即删 old**（不走读 fallback，避免 storage 浪费）
- 迁移幂等：每个 migrator 函数检查 `if (lsGet(NEW_KEY)) return;` 已迁移直接跳过
- 触发位置：app 启动早期（DOMContentLoaded 之前的初始化区域），失败时降级（保留旧 key、跳过此次迁移、下次启动重试）
- 云端 `sync_config` schema **不变**：保留 `{srs: {...}, ui: {...}}`，本地通过翻译表把 cloud field name 映射到 local aggregated path

### Task 2.1: per-deck 同步状态聚合

**当前：** 每个 deck 4 个 key（`yihaiPushedAt:{k}`, `yihaiPulledAt:{k}`, `yihaiPushedMediaAt:{k}`, `yihaiDeletedCards:{k}`）

**目标：** 每个 deck 1 个 JSON key `deckSync:{k}` = `{pushedAt, pulledAt, pushedMediaAt, deletedCards}`

**Files:**
- Modify: `C:\code\index.html`（LS_DECK 工厂、SyncJob、所有读写点）
- Modify: `tests/yihai_v5.14_ls_test.js`

- [ ] **Step 1: 在测试中加 migrateDeckSync 失败测试**

在 `tests/yihai_v5.14_ls_test.js` 末尾追加：

```javascript
// ── Phase 2: deckSync 聚合迁移 ─────────────────────────────────

function getDeckSync(deckKey) {
  return lsGetJSON('deckSync:' + deckKey, { pushedAt: 0, pulledAt: 0, pushedMediaAt: 0, deletedCards: [] });
}
function setDeckSync(deckKey, patch) {
  const cur = getDeckSync(deckKey);
  const next = { ...cur, ...patch };
  lsSetJSON('deckSync:' + deckKey, next);
}
function migrateDeckSync() {
  const oldKeys = ['yihaiPushedAt:', 'yihaiPulledAt:', 'yihaiPushedMediaAt:', 'yihaiDeletedCards:'];
  const fieldOf = { 'yihaiPushedAt:': 'pushedAt', 'yihaiPulledAt:': 'pulledAt', 'yihaiPushedMediaAt:': 'pushedMediaAt', 'yihaiDeletedCards:': 'deletedCards' };
  const seenDecks = new Set();
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!k) continue;
    for (const prefix of oldKeys) {
      if (k.startsWith(prefix)) seenDecks.add(k.slice(prefix.length));
    }
  }
  let migrated = 0;
  for (const deckKey of seenDecks) {
    const newK = 'deckSync:' + deckKey;
    if (lsGet(newK)) continue;
    const patch = {};
    for (const prefix of oldKeys) {
      const oldK = prefix + deckKey;
      const v = lsGet(oldK);
      if (v == null) continue;
      patch[fieldOf[prefix]] = fieldOf[prefix] === 'deletedCards' ? JSON.parse(v) : Number(v);
    }
    if (Object.keys(patch).length === 0) continue;
    lsSetJSON(newK, {
      pushedAt: 0, pulledAt: 0, pushedMediaAt: 0, deletedCards: [],
      ...patch,
    });
    for (const prefix of oldKeys) lsRemove(prefix + deckKey);
    migrated++;
  }
  return migrated;
}

{
  _store.clear();
  _store.set('yihaiPushedAt:abc', '1700000000000');
  _store.set('yihaiPulledAt:abc', '1700001000000');
  _store.set('yihaiDeletedCards:abc', '["c1","c2"]');
  const n = migrateDeckSync();
  check('migrate count = 1', n === 1);
  const s = getDeckSync('abc');
  check('migrated pushedAt', s.pushedAt === 1700000000000);
  check('migrated pulledAt', s.pulledAt === 1700001000000);
  check('migrated deletedCards', s.deletedCards.length === 2 && s.deletedCards[0] === 'c1');
  check('migrated pushedMediaAt default 0', s.pushedMediaAt === 0);
  check('old key removed', _store.get('yihaiPushedAt:abc') == null);
}
{
  _store.clear();
  _store.set('deckSync:abc', JSON.stringify({ pushedAt: 999, pulledAt: 0, pushedMediaAt: 0, deletedCards: [] }));
  _store.set('yihaiPushedAt:abc', '1700000000000');
  const n = migrateDeckSync();
  check('idempotent: new key present, skip', n === 0);
  check('idempotent: old key not removed (no migration)', _store.get('yihaiPushedAt:abc') === '1700000000000');
}
{
  _store.clear();
  _store.set('yihaiPushedAt:a', '100');
  _store.set('yihaiPushedAt:b', '200');
  _store.set('yihaiPulledAt:b', '300');
  const n = migrateDeckSync();
  check('multi-deck migrate count', n === 2);
  check('deck a pushedAt', getDeckSync('a').pushedAt === 100);
  check('deck b pulledAt', getDeckSync('b').pulledAt === 300);
}
```

- [ ] **Step 2: 跑测试验证 PASS**

```powershell
node tests/yihai_v5.14_ls_test.js
```

- [ ] **Step 3: 在 `index.html` 实现 `getDeckSync` / `setDeckSync` / `migrateDeckSync`**

紧接 LS helper 之后插入：

```javascript
// ─── per-deck sync state 聚合 (Phase 2.1) ────────────────────────
function getDeckSync(deckKey) {
  return lsGetJSON('deckSync:' + deckKey, { pushedAt: 0, pulledAt: 0, pushedMediaAt: 0, deletedCards: [] });
}
function setDeckSync(deckKey, patch) {
  const cur = getDeckSync(deckKey);
  lsSetJSON('deckSync:' + deckKey, { ...cur, ...patch });
}
function removeDeckSync(deckKey) {
  lsRemove('deckSync:' + deckKey);
}
function migrateDeckSync() {
  const oldKeys = ['yihaiPushedAt:', 'yihaiPulledAt:', 'yihaiPushedMediaAt:', 'yihaiDeletedCards:'];
  const fieldOf = { 'yihaiPushedAt:': 'pushedAt', 'yihaiPulledAt:': 'pulledAt', 'yihaiPushedMediaAt:': 'pushedMediaAt', 'yihaiDeletedCards:': 'deletedCards' };
  const seenDecks = new Set();
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!k) continue;
    for (const prefix of oldKeys) {
      if (k.startsWith(prefix)) seenDecks.add(k.slice(prefix.length));
    }
  }
  for (const deckKey of seenDecks) {
    const newK = 'deckSync:' + deckKey;
    if (lsGet(newK)) continue;
    const patch = {};
    for (const prefix of oldKeys) {
      const oldK = prefix + deckKey;
      const v = lsGet(oldK);
      if (v == null) continue;
      patch[fieldOf[prefix]] = fieldOf[prefix] === 'deletedCards' ? lsGetJSON(oldK, []) : Number(v);
    }
    if (Object.keys(patch).length === 0) continue;
    lsSetJSON(newK, { pushedAt: 0, pulledAt: 0, pushedMediaAt: 0, deletedCards: [], ...patch });
    for (const prefix of oldKeys) lsRemove(prefix + deckKey);
  }
}
// ──────────────────────────────────────────────────────────────────
```

- [ ] **Step 4: 在 app 启动早期调用 `migrateDeckSync()`**

找到 `restoreDecks()` 调用前的初始化区域（grep "restoreDecks()" 找第一次调用，在它之前插入）。包 try/catch 让失败不阻塞启动：

```javascript
try { migrateDeckSync(); } catch (e) { console.warn('[migrate] deckSync failed', e); }
```

- [ ] **Step 5: 替换所有 `LS_DECK(key, 'pushedAt')` 等 4 类调用为 `getDeckSync(key).pushedAt` / `setDeckSync(key, { pushedAt: ... })`**

grep `LS_DECK(.*'pushedAt')`, `LS_DECK(.*'pulledAt')`, `LS_DECK(.*'pushedMediaAt')`, `LS_DECK(.*'deletedCards')` 找全调用点。

典型替换：

```javascript
// before (SyncJob.runStructurePhase 等)
const pushedAt = parseWatermark(lsGet(LS_DECK(this.deckKey, 'pushedAt')));
// after
const pushedAt = getDeckSync(this.deckKey).pushedAt;

// before
lsSet(LS_DECK(this.deckKey, 'pulledAt'), String(maxRemoteMod));
// after
setDeckSync(this.deckKey, { pulledAt: maxRemoteMod });

// before (removeDeck)
['pushedAt', 'pulledAt', 'pushedMediaAt', 'deletedCards'].forEach(f => lsRemove(LS_DECK(key, f)));
// after
removeDeckSync(key);

// before (deletedCards 读)
const arr = lsGetJSON(LS_DECK(deckKey, 'deletedCards'), []);
// after
const arr = getDeckSync(deckKey).deletedCards;

// before (deletedCards push tombstone)
const arr = lsGetJSON(LS_DECK(deckKey, 'deletedCards'), []);
arr.push(cardId);
lsSetJSON(LS_DECK(deckKey, 'deletedCards'), arr);
// after
const cur = getDeckSync(deckKey);
setDeckSync(deckKey, { deletedCards: [...cur.deletedCards, cardId] });
```

注意 `LS_DECK(key, 'cards')` (deck 本体) **不动**——这是大数据，单独 key 合理。

清理后 `LS_DECK` 工厂可以瘦身：

```javascript
const LS_DECK = (deckKey, field) => {
  if (field === 'cards') return 'yihai_deck_' + deckKey;
  throw new Error('LS_DECK: only "cards" supported; use getDeckSync/setDeckSync for sync state');
};
```

- [ ] **Step 6: 跑回归**

```powershell
node tests/run_all.js
node tests/_pw_ui_smoke.js
node tests/_pw_srs_e2e.js
$env:TEST_PASSWORD="667788"; node tests/_pw_cross_device.js
```

- [ ] **Step 7: Commit**

```powershell
git add index.html tests/yihai_v5.14_ls_test.js
git commit -m "refactor: per-deck 同步状态聚合为 deckSync:{key} (Phase 2.1)"
```

---

### Task 2.2: voice config 聚合

**当前：** ~20 个 phrase/tts/voice/delay 扁平 key

**目标：** 单 JSON `voiceConfig` = `{phraseCorrect, phraseWrong, ..., ttsRate, ttsPitch, ..., voiceMuted, voiceAssistEnabled, ansReadDelay, ...}`

**关键约束：** `cloudPullConfig` / `cloudPushConfig` 用 raw 扁平 key 作为云端字段名（如 `cfg.ui.phraseCorrect`）。**云端 schema 不动**，本地通过翻译表桥接。

**Files:**
- Modify: `C:\code\index.html`
- Modify: `tests/yihai_v5.14_ls_test.js`

- [ ] **Step 1: 加 migrateVoiceConfig 测试**

在 `tests/yihai_v5.14_ls_test.js` 末尾追加：

```javascript
// ── Phase 2.2: voiceConfig 聚合迁移 ────────────────────────────

const VOICE_FIELDS = [
  'phraseCorrect','phraseWrong','phraseStreakCorrect','phraseSessionFinish',
  'phraseIdleBrowse','phraseOptHint','phraseQuizPrompt','phraseQuizPromptRecognize',
  'ttsRate','ttsPitch','ttsVoiceName','voiceMuted','voiceAssistEnabled',
  'ansReadDelay','optReadDelay','browseAnsDelay','optCount','optTouchDelay','ndur','bdur',
];
function getVoiceConfig() { return lsGetJSON('voiceConfig', {}); }
function setVoiceConfig(patch) { lsSetJSON('voiceConfig', { ...getVoiceConfig(), ...patch }); }
function migrateVoiceConfig() {
  if (lsGet('voiceConfig')) return;
  const cfg = {};
  for (const k of VOICE_FIELDS) {
    const v = lsGet(k);
    if (v != null) cfg[k] = v;
  }
  if (Object.keys(cfg).length === 0) return;
  lsSetJSON('voiceConfig', cfg);
  for (const k of VOICE_FIELDS) lsRemove(k);
}

{
  _store.clear();
  _store.set('phraseCorrect', '太棒了');
  _store.set('ttsRate', '1.2');
  _store.set('voiceMuted', '1');
  migrateVoiceConfig();
  const cfg = getVoiceConfig();
  check('voice migrate phraseCorrect', cfg.phraseCorrect === '太棒了');
  check('voice migrate ttsRate', cfg.ttsRate === '1.2');
  check('voice migrate voiceMuted', cfg.voiceMuted === '1');
  check('voice old key removed', _store.get('phraseCorrect') == null);
}
{
  _store.clear();
  _store.set('voiceConfig', '{"phraseCorrect":"existing"}');
  _store.set('phraseWrong', '不对');
  migrateVoiceConfig();
  const cfg = getVoiceConfig();
  check('voice idempotent', cfg.phraseCorrect === 'existing');
  check('voice idempotent: old key kept', _store.get('phraseWrong') === '不对');
}
```

- [ ] **Step 2: 跑测试验证 PASS**

```powershell
node tests/yihai_v5.14_ls_test.js
```

- [ ] **Step 3: 在 `index.html` 实现 voiceConfig helper + migrator**

紧接 deckSync helper 之后插入：

```javascript
// ─── voice config 聚合 (Phase 2.2) ───────────────────────────────
const VOICE_FIELDS = [
  'phraseCorrect','phraseWrong','phraseStreakCorrect','phraseSessionFinish',
  'phraseIdleBrowse','phraseOptHint','phraseQuizPrompt','phraseQuizPromptRecognize',
  'ttsRate','ttsPitch','ttsVoiceName','voiceMuted','voiceAssistEnabled',
  'ansReadDelay','optReadDelay','browseAnsDelay','optCount','optTouchDelay','ndur','bdur',
];
function getVoiceConfig() { return lsGetJSON('voiceConfig', {}); }
function getVoiceField(name, def = null) {
  const v = getVoiceConfig()[name];
  return v == null ? def : v;
}
function setVoiceField(name, value) {
  if (value == null) {
    const cfg = getVoiceConfig();
    delete cfg[name];
    lsSetJSON('voiceConfig', cfg);
  } else {
    lsSetJSON('voiceConfig', { ...getVoiceConfig(), [name]: String(value) });
  }
}
function migrateVoiceConfig() {
  if (lsGet('voiceConfig')) return;
  const cfg = {};
  for (const k of VOICE_FIELDS) {
    const v = lsGet(k);
    if (v != null) cfg[k] = v;
  }
  if (Object.keys(cfg).length === 0) return;
  lsSetJSON('voiceConfig', cfg);
  for (const k of VOICE_FIELDS) lsRemove(k);
}
// ──────────────────────────────────────────────────────────────────
```

启动早期同样加：

```javascript
try { migrateVoiceConfig(); } catch (e) { console.warn('[migrate] voiceConfig failed', e); }
```

- [ ] **Step 4: 替换所有 voice key 读写为 getVoiceField/setVoiceField**

20 个 key 的 `lsGet(LS_KEYS.PHRASE_CORRECT)` → `getVoiceField('phraseCorrect')`、`lsSet(LS_KEYS.TTS_RATE, v)` → `setVoiceField('ttsRate', v)`。

**重点：** `cloudPullConfig` / `cloudPushConfig` 中：

```javascript
// cloudPushConfig (L3422-3443)
const localUi = {
  confettiOn:    getVoiceField('confettiOn'),       // wait, confettiOn 是 UI 不是 voice
  phraseWrong:   getVoiceField('phraseWrong'),
  ttsRate:       getVoiceField('ttsRate'),
  // ...其他 voice 字段同
};

// cloudPullConfig (L3501-3505)
if (cfg.ui) {
  Object.entries(cfg.ui).forEach(([k, v]) => {
    if (VOICE_FIELDS.includes(k)) setVoiceField(k, v);
    else lsSet(k, String(v));  // 非 voice 字段（如 theme/locale）走原路径
  });
}
```

注意 `confettiOn`、`theme` 这些不是 voice 字段，云端 push 时也要从对应 source 取（暂时仍 `lsGet(LS_KEYS.THEME)` 等）。

- [ ] **Step 5: 清理 LS_KEYS 中 voice 部分**

20 个 voice key 从 `LS_KEYS` 删除（已不再用作 localStorage key），加注释：

```javascript
// voice/TTS fields aggregated into voiceConfig — see getVoiceField/setVoiceField
```

- [ ] **Step 6: 跑回归**

```powershell
node tests/run_all.js
node tests/_pw_ui_smoke.js
$env:TEST_PASSWORD="667788"; node tests/_pw_config_sync.js
```

`_pw_config_sync.js` 必须通过——它专门测云端 config sync。

- [ ] **Step 7: Commit**

```powershell
git add index.html tests/yihai_v5.14_ls_test.js
git commit -m "refactor: voice/TTS 配置聚合为 voiceConfig (Phase 2.2)"
```

---

### Task 2.3: UI / typography config 聚合

**当前：** `theme`, `yihai_ui_locale`, `yihaiAppMode`, `confettiOn`, `yihaiLogLevel` 散落 + `fs-opt/ans/hint/btn` + `ls-opt/ans/hint/btn` 8 个 typography 扁平 key

**目标：**
- `uiConfig` JSON = `{theme, locale, appMode, confettiOn, logLevel}`
- `typographyConfig` JSON = `{fs: {opt, ans, hint, btn}, ls: {opt, ans, hint, btn}}`

**Files:**
- Modify: `C:\code\index.html`
- Modify: `tests/yihai_v5.14_ls_test.js`

- [ ] **Step 1: 加 migrate 测试**（仿 2.2 pattern，含 idempotent + cloud field 翻译）

略，pattern 同 voiceConfig。

- [ ] **Step 2: 跑测试 PASS**

- [ ] **Step 3: 实现 helper + migrator**

```javascript
const UI_FIELDS = ['theme', 'locale', 'appMode', 'confettiOn', 'logLevel'];
const UI_OLD_MAP = {
  theme: 'theme',
  locale: 'yihai_ui_locale',
  appMode: 'yihaiAppMode',
  confettiOn: 'confettiOn',
  logLevel: 'yihaiLogLevel',
};
function getUiConfig() { return lsGetJSON('uiConfig', {}); }
function getUiField(name, def = null) { const v = getUiConfig()[name]; return v == null ? def : v; }
function setUiField(name, value) {
  if (value == null) { const cfg = getUiConfig(); delete cfg[name]; lsSetJSON('uiConfig', cfg); }
  else lsSetJSON('uiConfig', { ...getUiConfig(), [name]: String(value) });
}
function migrateUiConfig() {
  if (lsGet('uiConfig')) return;
  const cfg = {};
  for (const [field, oldKey] of Object.entries(UI_OLD_MAP)) {
    const v = lsGet(oldKey);
    if (v != null) cfg[field] = v;
  }
  if (Object.keys(cfg).length === 0) return;
  lsSetJSON('uiConfig', cfg);
  for (const oldKey of Object.values(UI_OLD_MAP)) lsRemove(oldKey);
}

const TYPO_SLOTS = ['opt', 'ans', 'hint', 'btn'];
function getTypographyConfig() { return lsGetJSON('typographyConfig', { fs: {}, ls: {} }); }
function getTypoField(kind, slot) { return getTypographyConfig()[kind]?.[slot] ?? null; }
function setTypoField(kind, slot, value) {
  const cfg = getTypographyConfig();
  if (!cfg[kind]) cfg[kind] = {};
  if (value == null) delete cfg[kind][slot];
  else cfg[kind][slot] = String(value);
  lsSetJSON('typographyConfig', cfg);
}
function migrateTypographyConfig() {
  if (lsGet('typographyConfig')) return;
  const cfg = { fs: {}, ls: {} };
  let any = false;
  for (const kind of ['fs', 'ls']) {
    for (const slot of TYPO_SLOTS) {
      const v = lsGet(`${kind}-${slot}`);
      if (v != null) { cfg[kind][slot] = v; any = true; }
    }
  }
  if (!any) return;
  lsSetJSON('typographyConfig', cfg);
  for (const kind of ['fs', 'ls']) for (const slot of TYPO_SLOTS) lsRemove(`${kind}-${slot}`);
}
```

启动早期调用 `migrateUiConfig()` + `migrateTypographyConfig()`。

- [ ] **Step 4: 替换调用点**

`theme`、`yihai_ui_locale`、`yihaiAppMode`、`confettiOn`、`yihaiLogLevel` 全部读写 → `getUiField/setUiField`。`fs-X`、`ls-X` → `getTypoField/setTypoField`。

**cloudPullConfig / cloudPushConfig 翻译：**

```javascript
// cloudPushConfig — 收集 ui 部分
const localUi = {
  // voice fields
  ...getVoiceConfig(),
  // ui fields (云端 key 名保持兼容)
  theme:       getUiField('theme'),
  confettiOn:  getUiField('confettiOn'),
  // typography
  ...Object.fromEntries(Object.entries(getTypographyConfig().fs || {}).map(([s, v]) => [`fs-${s}`, v])),
  ...Object.fromEntries(Object.entries(getTypographyConfig().ls || {}).map(([s, v]) => [`ls-${s}`, v])),
};
Object.keys(localUi).forEach(k => { if (localUi[k] === null || localUi[k] === undefined) delete localUi[k]; });

// cloudPullConfig — 写回
if (cfg.ui) {
  Object.entries(cfg.ui).forEach(([k, v]) => {
    if (VOICE_FIELDS.includes(k)) setVoiceField(k, v);
    else if (k === 'theme' || k === 'confettiOn') setUiField(k, v);
    else if (k.startsWith('fs-')) setTypoField('fs', k.slice(3), v);
    else if (k.startsWith('ls-')) setTypoField('ls', k.slice(3), v);
    // 其他未知 key 忽略（不再 fallback 写 raw localStorage，避免污染）
  });
}
```

- [ ] **Step 5: 清理 LS_KEYS**

移除 `THEME`, `LOCALE`, `APP_MODE`, `CONFETTI_ON`, `LOG_LEVEL`、`LS_TYPO` 工厂。

- [ ] **Step 6: 回归**

```powershell
node tests/run_all.js
node tests/_pw_ui_smoke.js
$env:TEST_PASSWORD="667788"; node tests/_pw_config_sync.js
```

- [ ] **Step 7: Commit**

```powershell
git add index.html tests/yihai_v5.14_ls_test.js
git commit -m "refactor: UI/typography 配置聚合 (Phase 2.3)"
```

---

### Task 2.4: Phase 2 发布 v5.13.3

- [ ] APP_VERSION → `5.13.3`
- [ ] 文档同步
- [ ] 跑最小回归（含 `_pw_config_sync.js`、`_pw_cross_device.js`）
- [ ] `release: v5.13.3` commit（等用户"发布"指令再 push/tag）

---

## Phase 3: `yh:v1:` 前缀 rename

**目标：** 所有 top-level localStorage key 加 `yh:v1:` 前缀 + 冒号分层。**纯命名规范化，无功能变化。**

**发布版本：** v5.13.4

**经 Phase 2 后剩余的 top-level keys（约 18 个）：**

```
yihaiLastCloudEmail        → yh:v1:user:lastEmail
yihaiLastCloudUserId       → yh:v1:user:lastUserId
yihaiDeviceId              → yh:v1:user:deviceId
yihai_has_ever_logged_in   → yh:v1:user:hasEverLoggedIn
yihaiSessionBackup         → yh:v1:session:backup
yihai_session_backup       → yh:v1:session:backupLegacy
yihaiGlobalSyncTs          → yh:v1:sync:globalTs
yihaiEasyPulledAt          → yh:v1:sync:easyPulledAt
yihaiRealtimeUpload        → yh:v1:sync:realtimeUpload
yihaiPendingFeedback       → yh:v1:sync:pendingFeedback
yihaiV5MigrationPending    → yh:v1:sync:v5MigrationPending
yihaiPracticeDays          → yh:v1:practiceDays
yihaiDecksIndex            → yh:v1:decks:index
yihaiDailyProgress         → yh:v1:daily:progress
easyRetryOnWrong           → yh:v1:srs:easyRetryOnWrong
easySessionSize            → yh:v1:srs:easySessionSize
uiConfig                   → yh:v1:config:ui
voiceConfig                → yh:v1:config:voice
typographyConfig           → yh:v1:config:typography
deckSync:{k}               → yh:v1:deck:{k}:sync
yihai_deck_{k}             → yh:v1:deck:{k}:cards
srs_{k}                    → yh:v1:srs:{k}
{slot.storageKey}          → yh:v1:voice:slot:{slotName}  (需查看 VOICE_SLOTS 定义)
```

### Task 3.1: 通用 rename migrator + 注册表更新

**Files:**
- Modify: `C:\code\index.html`
- Modify: `tests/yihai_v5.14_ls_test.js`

- [ ] **Step 1: 测试通用 rename migrator**

```javascript
// ── Phase 3: yh:v1: prefix rename ───────────────────────────────

const KEY_RENAMES = [
  ['yihaiLastCloudEmail',    'yh:v1:user:lastEmail'],
  ['yihaiDeviceId',          'yh:v1:user:deviceId'],
  ['yihaiSessionBackup',     'yh:v1:session:backup'],
  ['yihaiDailyProgress',     'yh:v1:daily:progress'],
  ['voiceConfig',            'yh:v1:config:voice'],
  ['uiConfig',               'yh:v1:config:ui'],
];
const PREFIX_RENAMES = [
  ['deckSync:',  'yh:v1:deck:', ':sync'],   // deckSync:abc → yh:v1:deck:abc:sync
  ['yihai_deck_','yh:v1:deck:', ':cards'],
  ['srs_',       'yh:v1:srs:',   ''],
];

function migrateKeyRenames() {
  for (const [oldK, newK] of KEY_RENAMES) {
    if (lsGet(newK) != null) continue;
    const v = lsGet(oldK);
    if (v == null) continue;
    lsSet(newK, v);
    lsRemove(oldK);
  }
  // prefix renames
  const allKeys = [];
  for (let i = 0; i < localStorage.length; i++) allKeys.push(localStorage.key(i));
  for (const k of allKeys) {
    if (!k) continue;
    for (const [oldPrefix, newPrefix, newSuffix] of PREFIX_RENAMES) {
      if (k.startsWith(oldPrefix)) {
        const id = k.slice(oldPrefix.length);
        const newK = newPrefix + id + newSuffix;
        if (lsGet(newK) != null) continue;  // 不覆盖
        lsSet(newK, lsGet(k));
        lsRemove(k);
        break;
      }
    }
  }
}

{
  _store.clear();
  _store.set('yihaiLastCloudEmail', 'a@b.com');
  _store.set('yihaiDeviceId', 'dev123');
  _store.set('voiceConfig', '{"phraseCorrect":"yes"}');
  _store.set('deckSync:abc', '{"pushedAt":100}');
  _store.set('yihai_deck_abc', '[{"id":"c1"}]');
  _store.set('srs_session_mode', 'normal');
  migrateKeyRenames();
  check('rename: lastEmail', lsGet('yh:v1:user:lastEmail') === 'a@b.com');
  check('rename: deviceId',  lsGet('yh:v1:user:deviceId') === 'dev123');
  check('rename: voiceConfig', lsGet('yh:v1:config:voice') === '{"phraseCorrect":"yes"}');
  check('rename: deckSync',   lsGet('yh:v1:deck:abc:sync') === '{"pushedAt":100}');
  check('rename: deck cards', lsGet('yh:v1:deck:abc:cards') === '[{"id":"c1"}]');
  check('rename: srs',        lsGet('yh:v1:srs:session_mode') === 'normal');
  check('rename: old removed', _store.get('yihaiLastCloudEmail') == null && _store.get('voiceConfig') == null);
}
{
  _store.clear();
  _store.set('yihaiLastCloudEmail', 'old@x.com');
  _store.set('yh:v1:user:lastEmail', 'new@x.com');  // already migrated
  migrateKeyRenames();
  check('rename idempotent: keep new value', lsGet('yh:v1:user:lastEmail') === 'new@x.com');
  check('rename idempotent: old not deleted (no migration)', _store.get('yihaiLastCloudEmail') === 'old@x.com');
}
```

- [ ] **Step 2: 跑测试 PASS**

- [ ] **Step 3: 在 `index.html` 实现 `migrateKeyRenames` + 启动调用**

启动顺序：

```javascript
try { migrateKeyRenames(); } catch (e) { console.warn('[migrate] keyRenames failed', e); }
try { migrateDeckSync();   } catch (e) { console.warn('[migrate] deckSync failed', e); }
try { migrateVoiceConfig();} catch (e) { console.warn('[migrate] voiceConfig failed', e); }
try { migrateUiConfig();   } catch (e) { console.warn('[migrate] uiConfig failed', e); }
try { migrateTypographyConfig(); } catch (e) { console.warn('[migrate] typographyConfig failed', e); }
```

注意：`migrateKeyRenames` 必须在 phase 2 的几个 migrate 之**后**调用还是之**前**？

→ **之后**。理由：phase 2 的 migrator 检查 `deckSync:`、`voiceConfig` 等老名，期望它们尚未被 rename。phase 3 migrator 最后跑，把所有最终名 rename 到 yh:v1: 前缀。

修正启动顺序：

```javascript
try { migrateDeckSync();   } catch (e) { console.warn('[migrate] deckSync failed', e); }
try { migrateVoiceConfig();} catch (e) { console.warn('[migrate] voiceConfig failed', e); }
try { migrateUiConfig();   } catch (e) { console.warn('[migrate] uiConfig failed', e); }
try { migrateTypographyConfig(); } catch (e) { console.warn('[migrate] typographyConfig failed', e); }
try { migrateKeyRenames(); } catch (e) { console.warn('[migrate] keyRenames failed', e); }
```

- [ ] **Step 4: 更新所有 key 常量到 `yh:v1:*`**

- `LS_KEYS.LAST_CLOUD_EMAIL` 值改 `'yh:v1:user:lastEmail'`，余同
- `deckSync:` 改 `'yh:v1:deck:' + key + ':sync'`（即 `getDeckSync/setDeckSync` 内部）
- `voiceConfig` → `'yh:v1:config:voice'`
- `uiConfig` → `'yh:v1:config:ui'`
- `typographyConfig` → `'yh:v1:config:typography'`
- `LS_DECK(key, 'cards')` → `'yh:v1:deck:' + key + ':cards'`
- `LS_SRS(k)` → `'yh:v1:srs:' + k`
- voice slot `storageKey`：检查 `VOICE_SLOTS` 数据定义，把每个 `storageKey: 'phraseXxx'` 改 `storageKey: 'yh:v1:voice:slot:xxx'`（若 phase 2 voiceConfig 没吸收 slot script，slot script 仍是独立 key）

注意 `VOICE_SLOTS.storageKey` 是定义在数据上的，不是 LS_KEYS 中。grep `storageKey:` 找全部定义。

- [ ] **Step 5: 回归**

```powershell
node tests/run_all.js
node tests/_pw_ui_smoke.js
node tests/_pw_srs_e2e.js
$env:TEST_PASSWORD="667788"; node tests/_pw_config_sync.js
$env:TEST_PASSWORD="667788"; node tests/_pw_cross_device.js
```

注意：第一次跑 Playwright 时，浏览器 localStorage 里可能仍是 phase 2 的 key 名。migrator 会自动 rename。手动验证：
- 打开 http://localhost:8080
- DevTools → Application → Local Storage → 检查所有 key 都以 `yh:v1:` 开头（除 helper 内部、Supabase SDK 自带 `sb-` 前缀外）

- [ ] **Step 6: Commit**

```powershell
git add index.html tests/yihai_v5.14_ls_test.js
git commit -m "refactor: 全部 localStorage key 加 yh:v1: 前缀 + 冒号分层 (Phase 3.1)"
```

---

### Task 3.2: Phase 3 发布 v5.13.4

- [ ] APP_VERSION → `5.13.4`
- [ ] 文档同步（README, 变更记录, CLAUDE.md 当前版本行 + Recent Changes）
- [ ] 跑最小回归 + `_pw_config_sync.js` + `_pw_cross_device.js`
- [ ] `release: v5.13.4` commit（等用户"发布"指令再 push/tag）

---

## Self-Review

**Spec coverage：**
- ✅ `LS_KEYS` 注册表 + helper（Task 1.1）
- ✅ 删 `yihaiSyncAt:` 死写（Task 1.2）
- ✅ 所有 raw call site 走 helper（Task 1.3）
- ✅ per-deck 同步状态聚合（Task 2.1）
- ✅ voice config 聚合（Task 2.2）
- ✅ UI + typography 聚合（Task 2.3）
- ✅ `yh:v1:` 前缀 rename（Task 3.1）
- ✅ 云端 `sync_config` schema 不变 + 翻译表（Task 2.2 Step 4 / Task 2.3 Step 4）
- ✅ 启动 eager migrate + idempotent（Task 2.x Step 4 / Task 3.1 Step 3）
- ✅ 三阶段独立 release，单独可回滚

**未覆盖（已记录为不在 scope）：**
- voice slot 录音 blob（IndexedDB，不动）
- IndexedDB schema（与本 plan 无关）
- 云端 `sync_config` schema v2 升级（独立后续工作）
- ServiceWorker cache（PWA 资源缓存，与 localStorage 无关）

**Type 一致性：**
- `getDeckSync/setDeckSync/removeDeckSync/migrateDeckSync` — 命名一致
- `getVoiceConfig/getVoiceField/setVoiceField/migrateVoiceConfig` — 一致
- `getUiConfig/getUiField/setUiField/migrateUiConfig` — 一致
- `getTypographyConfig/getTypoField/setTypoField/migrateTypographyConfig` — 一致
- `lsGet/lsSet/lsRemove/lsGetJSON/lsSetJSON` — 一致

**Placeholder 检查：** 无 TBD/TODO/"similar to" — 所有代码具体。

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-06-11-localstorage-keymap-normalization.md`.

**Two execution options:**

1. **Subagent-Driven (recommended)** — 主会话每 task 派发新 subagent 执行，中间 review；适合此类有清晰边界的 refactor。
2. **Inline Execution** — 在当前会话顺序执行 task，每 phase 结束 checkpoint。

由于 task 之间共享 `index.html` 状态、改动密集、需要频繁跑测试（PowerShell 启 HTTP 服务器 + Playwright）、有云端 sync 测试需要 `TEST_PASSWORD` 环境变量，**inline execution 更适合此 plan**。subagent 跨任务交接 `index.html` 内联状态成本高。

**建议路径：inline 执行 + 每 phase 结束 checkpoint review。**
