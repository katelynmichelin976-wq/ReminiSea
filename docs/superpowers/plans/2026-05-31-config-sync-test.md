# 语音辅助参数云同步回归测试 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新建 `tests/_pw_config_sync.js`，覆盖语音参数 push→pull 一致性（全 13 key）、废弃 key 清理、跨设备传播三个同步场景，约 18 个断言；PHASE 4 保留语音录音 URL 同步骨架待后续填充。

**Architecture:** 单文件 Playwright 回归测试，复用 `_playwright_helper.js` 工具函数。通过 `page.evaluate` 直接调用应用内全局函数 `cloudPushConfig` / `cloudPullConfig` 和 Supabase SDK（`_sb`），在每层存储操作后直接读库核对（localStorage、Supabase `sync_config` 表、运行时全局变量三层均有断言）。PHASE 3 用两个独立 BrowserContext 模拟跨设备。

**Tech Stack:** Playwright (chromium)、Node.js、Supabase JS SDK（通过应用全局变量 `_sb` 访问）

---

## 文件清单

| 操作 | 路径 |
|------|------|
| Create | `tests/_pw_config_sync.js` |
| Modify | `CLAUDE.md`（测试范围规则 + 文件列表） |

---

### Task 1：创建文件骨架

**Files:**
- Create: `tests/_pw_config_sync.js`

- [ ] **Step 1: 写入完整骨架文件**

新建 `tests/_pw_config_sync.js`，内容如下（try 块各 PHASE 留占位注释，后续 Task 逐步填充）：

```js
/**
 * 忆海拾光 语音辅助参数云同步回归测试
 * 依赖：python -m http.server 8080 --directory C:\code
 *        $env:TEST_PASSWORD="xxx"
 * 运行：$env:TEST_PASSWORD="xxx"; node tests/_pw_config_sync.js
 *
 * 覆盖：语音文字参数 push→pull 一致性（全 13 key）
 *        废弃 snake_case key 清理
 *        跨设备语音参数传播
 *        语音录音 URL 同步（骨架，待实现）
 */
const { chromium } = require('playwright');
const helper = require('./_playwright_helper');
const { pass, section, wait, run, getCounts, getBaseUrl, cloudLogin } = helper;

const CFG = { url: getBaseUrl() + '?v=' + Date.now() };
const TEST_EMAIL    = 'zyhaff@gmail.com';
const TEST_PASSWORD = process.env.TEST_PASSWORD || '';

// 全部 13 个语音参数测试值（pw-test- 前缀便于区分测试数据）
const VOICE_PARAMS = {
  phraseQuizPrompt:          'pw-test-问题提示',
  phraseQuizPromptRecognize: 'pw-test-认识吗',
  phraseWrong:               'pw-test-再想想',
  phraseOptHint:             'pw-test-选项提示',
  phraseCorrect:             'pw-test-答对了',
  ansReadDelay:              '3.5',
  optReadDelay:              '4.0',
  browseAnsDelay:            '2.0',
  ttsRate:                   '0.9',
  ttsPitch:                  '1.1',
  ttsVoiceName:              'pw-test-voice',
  voiceMuted:                '1',
  voiceAssistEnabled:        '1',
};

// cloudPushConfig 合并后必须删除的废弃 key
const DEPRECATED_KEYS = [
  'phrase_quiz_prompt', 'phrase_quiz_prompt_recognize',
  'phrase_opt_hint', 'phraseSelect',
];

async function waitSyncDone(page, maxMs) {
  const iters = Math.ceil((maxMs || 120000) / 500);
  for (let i = 0; i < iters; i++) {
    const done = await run(page, () =>
      typeof _syncInFlight === 'undefined' || !_syncInFlight
    );
    if (done) return true;
    await wait(page, 500);
  }
  return false;
}

(async () => {
  if (!TEST_PASSWORD) { console.error('FATAL: 请设置 TEST_PASSWORD 环境变量'); process.exit(1); }

  const browser = await chromium.launch({ headless: !process.env.HEADED });
  const page    = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.on('pageerror', e => console.log(`  [PAGE ERROR] ${e.message}`));

  let ctxB, pageB;

  try {
    // PHASE 0–4 在后续步骤填充

  } finally {
    if (ctxB) await ctxB.close().catch(() => {});
    const { passed, failed } = getCounts();
    section('结果');
    console.log(`  通过: ${passed}  失败: ${failed}`);
    await browser.close();
    process.exit(failed > 0 ? 1 : 0);
  }
})();
```

- [ ] **Step 2: 确认无语法错误**

```powershell
node -e "try { require('./tests/_pw_config_sync.js') } catch(e) { console.log(e.message) }"
```

预期：打印 `FATAL: 请设置 TEST_PASSWORD 环境变量` 后退出（无 SyntaxError）。

---

### Task 2：实现 PHASE 0 + PHASE 1

**Files:**
- Modify: `tests/_pw_config_sync.js`

- [ ] **Step 1: 将 try 块占位注释替换为 PHASE 0 + PHASE 1 代码**

```js
    // ════ PHASE 0: 初始化 + 登录 ════
    section('PHASE 0: 初始化 + 登录');
    await page.goto(CFG.url, { waitUntil: 'networkidle', timeout: 30000 });
    await wait(page, 1500);
    await run(page, async () => {
      localStorage.clear();
      try {
        const dbs = await indexedDB.databases();
        for (const db of dbs) indexedDB.deleteDatabase(db.name);
      } catch (e) { /* ignore */ }
    });
    await wait(page, 300);
    await page.goto(CFG.url, { waitUntil: 'networkidle', timeout: 30000 });
    await wait(page, 2000);
    pass('初始化登录成功', await cloudLogin(page, TEST_EMAIL, TEST_PASSWORD));
    pass('登录同步完成', await waitSyncDone(page));
    await run(page, () => goHome());
    await wait(page, 500);

    // ════ PHASE 1: 全量语音文字参数 push→pull 一致性 ════
    section('PHASE 1: 全量语音文字参数 push→pull 一致性');

    // 写入全部 13 个 voice 参数
    await run(page, (params) => {
      Object.entries(params).forEach(([k, v]) => localStorage.setItem(k, v));
    }, VOICE_PARAMS);

    // push 到云端
    const push1Ok = await run(page, async () => {
      try { await cloudPushConfig(); return true; } catch (e) { return false; }
    });
    pass('PHASE 1: cloudPushConfig 推送成功', push1Ok);
    await wait(page, 1000);

    // 直接读 Supabase sync_config.config_json.ui 核对（代表 5 个类型）
    const cloudUi1 = await run(page, async () => {
      const { data } = await _sb.from('sync_config').select('config_json').maybeSingle();
      return data?.config_json?.ui || null;
    });
    pass('云端 phraseQuizPrompt 写入正确', cloudUi1?.phraseQuizPrompt === 'pw-test-问题提示');
    pass('云端 phraseWrong 写入正确',     cloudUi1?.phraseWrong      === 'pw-test-再想想');
    pass('云端 ansReadDelay 写入正确',    cloudUi1?.ansReadDelay     === '3.5');
    pass('云端 voiceMuted 写入正确',      cloudUi1?.voiceMuted       === '1');
    pass('云端 ttsRate 写入正确',         cloudUi1?.ttsRate          === '0.9');

    // 清空本地全部 13 个 key
    await run(page, (params) => {
      Object.keys(params).forEach(k => localStorage.removeItem(k));
    }, VOICE_PARAMS);

    // pull 拉取云端配置
    await run(page, async () => { await cloudPullConfig(); });
    await wait(page, 500);

    // 本地值 == 云端值（全 13 个 key 整体比对）
    const localMatch1 = await run(page, (params) => {
      return Object.entries(params).every(([k, v]) => localStorage.getItem(k) === v);
    }, VOICE_PARAMS);
    pass('cloudPullConfig 后本地 13 个 key 全部还原（本地 == 云端）', localMatch1);

    // 运行时全局变量映射正确
    const globals1 = await run(page, () => ({
      phraseSelect: typeof PHRASE_SELECT   !== 'undefined' ? PHRASE_SELECT   : null,
      ansDelay:     typeof ANS_READ_DELAY  !== 'undefined' ? ANS_READ_DELAY  : null,
      voiceMuted:   typeof VOICE_MUTED     !== 'undefined' ? VOICE_MUTED     : null,
    }));
    pass('PHRASE_SELECT 全局变量映射正确',                globals1.phraseSelect === 'pw-test-问题提示');
    pass('ANS_READ_DELAY 全局变量映射正确（3.5s → 3500ms）', globals1.ansDelay   === 3500);
    pass('VOICE_MUTED 全局变量映射正确',                  globals1.voiceMuted   === true);
```

- [ ] **Step 2: 启动本地 HTTP 服务（新 PowerShell 窗口）**

```powershell
python -m http.server 8080 --directory C:\code
```

- [ ] **Step 3: 运行测试，确认 PHASE 0 + PHASE 1 全部通过**

```powershell
$env:TEST_PASSWORD="667788"; node tests/_pw_config_sync.js
```

预期输出（部分）：
```
  ✓ 初始化登录成功
  ✓ 登录同步完成
  ✓ PHASE 1: cloudPushConfig 推送成功
  ✓ 云端 phraseQuizPrompt 写入正确
  ✓ 云端 phraseWrong 写入正确
  ✓ 云端 ansReadDelay 写入正确
  ✓ 云端 voiceMuted 写入正确
  ✓ 云端 ttsRate 写入正确
  ✓ cloudPullConfig 后本地 13 个 key 全部还原（本地 == 云端）
  ✓ PHRASE_SELECT 全局变量映射正确
  ✓ ANS_READ_DELAY 全局变量映射正确（3.5s → 3500ms）
  ✓ VOICE_MUTED 全局变量映射正确
```

如有断言失败，先检查 `[PAGE ERROR]` 行定位具体错误，再排查。

---

### Task 3：实现 PHASE 2 + PHASE 3

**Files:**
- Modify: `tests/_pw_config_sync.js`（在 PHASE 1 代码末尾追加）

- [ ] **Step 1: 追加 PHASE 2 废弃 key 清理代码**

紧接 PHASE 1 最后一行 `pass('VOICE_MUTED...')` 之后插入：

```js
    // ════ PHASE 2: 废弃 snake_case key 清理 ════
    section('PHASE 2: 废弃 snake_case key 清理');

    // 向云端注入废弃 key（模拟旧版本残留）
    await run(page, async (deprecatedKeys) => {
      const { data } = await _sb.from('sync_config').select('config_json').maybeSingle();
      const cfg = data?.config_json || { srs: {}, ui: {} };
      deprecatedKeys.forEach(k => { cfg.ui[k] = 'stale-value'; });
      await _sb.from('sync_config').upsert({
        user_id:     _cloudUserId,
        config_json: cfg,
        updated_at:  Date.now(),
      }, { onConflict: 'user_id' });
    }, DEPRECATED_KEYS);
    await wait(page, 500);

    // cloudPushConfig 的 merge 逻辑会 delete 废弃 key
    const push2Ok = await run(page, async () => {
      try { await cloudPushConfig(); return true; } catch (e) { return false; }
    });
    pass('PHASE 2: cloudPushConfig 推送成功', push2Ok);
    await wait(page, 1000);

    // 直接读云端断言废弃 key 全部消失
    const cloudUi2 = await run(page, async () => {
      const { data } = await _sb.from('sync_config').select('config_json').maybeSingle();
      return data?.config_json?.ui || null;
    });
    pass('废弃 key 全部从云端 config_json 中删除',
      cloudUi2 !== null && DEPRECATED_KEYS.every(k => !(k in cloudUi2)));
    pass('合法 key phraseQuizPrompt 仍存在于云端',
      cloudUi2 !== null && 'phraseQuizPrompt' in cloudUi2);
```

- [ ] **Step 2: 追加 PHASE 3 跨设备传播代码**

紧接 PHASE 2 最后一行 `pass('合法 key...')` 之后插入：

```js
    // ════ PHASE 3: 跨设备语音参数传播 ════
    section('PHASE 3: 跨设备语音参数传播');

    // 4 个参数值与 VOICE_PARAMS 有意不同，便于区分跨设备新写入
    const CROSS_PARAMS = {
      phraseWrong:               'cross-再试试',
      optReadDelay:              '6.5',
      voiceAssistEnabled:        '0',
      phraseQuizPromptRecognize: 'cross-认识吗',
    };

    // Device A（当前 page，已登录）写入参数并 push
    await run(page, (params) => {
      Object.entries(params).forEach(([k, v]) => localStorage.setItem(k, v));
    }, CROSS_PARAMS);
    const push3Ok = await run(page, async () => {
      try { await cloudPushConfig(); return true; } catch (e) { return false; }
    });
    pass('Device A cloudPushConfig 推送成功', push3Ok);
    await wait(page, 1000);

    // 直接读 Supabase 断言云端值正确（Device A 视角）
    const cloudUi3 = await run(page, async () => {
      const { data } = await _sb.from('sync_config').select('config_json').maybeSingle();
      return data?.config_json?.ui || null;
    });
    pass('Device A → 云端 phraseWrong 正确',
      cloudUi3?.phraseWrong === CROSS_PARAMS.phraseWrong);
    pass('Device A → 云端 optReadDelay 正确',
      cloudUi3?.optReadDelay === CROSS_PARAMS.optReadDelay);

    // Device B（新 BrowserContext，空白状态）登录 + 等待同步
    ctxB  = await browser.newContext({ viewport: { width: 390, height: 844 } });
    pageB = await ctxB.newPage();
    pageB.on('pageerror', e => console.log(`  [B PAGE ERROR] ${e.message}`));
    await pageB.goto(CFG.url, { waitUntil: 'networkidle', timeout: 30000 });
    await wait(pageB, 2000);

    pass('Device B 登录成功', await cloudLogin(pageB, TEST_EMAIL, TEST_PASSWORD));
    pass('Device B 同步完成', await waitSyncDone(pageB, 120000));
    await wait(pageB, 1000);

    // 断言 Device B 本地值 == 云端值（全 4 个 cross key）
    const bLocalMatch = await run(pageB, (params) => {
      return Object.entries(params).every(([k, v]) => localStorage.getItem(k) === v);
    }, CROSS_PARAMS);
    pass('Device B 本地值 == 云端值（全 4 个 cross key）', bLocalMatch);

    // 断言 Device B 运行时全局变量映射正确
    const globalsB = await run(pageB, () => ({
      phraseWrong: typeof PHRASE_WRONG    !== 'undefined' ? PHRASE_WRONG    : null,
      optDelay:    typeof OPT_READ_DELAY  !== 'undefined' ? OPT_READ_DELAY  : null,
    }));
    pass('Device B PHRASE_WRONG 全局变量映射正确',
      globalsB.phraseWrong === 'cross-再试试');
    pass('Device B OPT_READ_DELAY 全局变量映射正确（6.5s → 6500ms）',
      globalsB.optDelay === 6500);
```

- [ ] **Step 3: 运行测试，确认 PHASE 0–3 全部通过**

```powershell
$env:TEST_PASSWORD="667788"; node tests/_pw_config_sync.js
```

预期：
```
  通过: 18  失败: 0
```

如有断言失败，先确认 Device B 页面无 `[B PAGE ERROR]`，再检查云端 config_json 字段名是否与代码一致。

---

### Task 4：添加 PHASE 4 骨架 + 更新 CLAUDE.md + 提交

**Files:**
- Modify: `tests/_pw_config_sync.js`（追加 PHASE 4 骨架）
- Modify: `CLAUDE.md`

- [ ] **Step 1: 追加 PHASE 4 骨架**

紧接 PHASE 3 最后一行 `pass('Device B OPT_READ_DELAY...')` 之后、try 块结束前插入：

```js
    // ════ PHASE 4: 语音录音 URL 同步（骨架，待实现）════
    // 依赖：语音录音上传 Supabase Storage 功能（独立设计文档）
    // 待填充步骤：
    //   1. Device A 录制语音槽 → 上传 Supabase Storage → 存储 path/URL → cloudPushConfig
    //   2. 读 Storage 断言文件存在（createSignedUrl 可访问）
    //   3. Device B 登录 → pull → 下载录音写入 IDB
    //   4. 断言 Device B IDB voiceSlots blob 有效（URL.createObjectURL 可生成）
    section('PHASE 4: 语音录音 URL 同步（骨架，待实现）');
    console.log('  [SKIP] 依赖语音录音云端存储功能，实现后填充');
```

- [ ] **Step 2: 更新 CLAUDE.md — 测试文件列表**

在 `| \`tests/_pw_feedback.js\`` 行之后新增一行：

```
| `tests/_pw_config_sync.js` | 语音辅助参数云同步（push→pull 一致性/废弃 key 清理/跨设备传播，~18 断言，需登录） |
```

- [ ] **Step 3: 更新 CLAUDE.md — 测试范围规则**

在 `**云端/登录改动** → 加跑 \`_pw_cloud_sync.js\`` 行之后新增：

```
- **语音参数/config 同步改动** → 加跑 `_pw_config_sync.js`
```

- [ ] **Step 4: 末次运行验证全部通过**

```powershell
$env:TEST_PASSWORD="667788"; node tests/_pw_config_sync.js
```

预期：
```
  通过: 18  失败: 0
```

- [ ] **Step 5: 提交**

```powershell
git add tests/_pw_config_sync.js docs/superpowers/specs/2026-05-31-config-sync-test-design.md docs/superpowers/plans/2026-05-31-config-sync-test.md CLAUDE.md
git commit -m "feat: 新增语音辅助参数云同步回归测试 _pw_config_sync.js"
```

---

## 自检结论

**Spec 覆盖：**
- PHASE 1 push→pull 全 13 key ✓（含云端读库 + 本地 == 云端 + 运行时变量三层）
- PHASE 2 废弃 key 清理 ✓（注入 → push → 读云端核对）
- PHASE 3 跨设备传播 ✓（Device A push → 云端核对 → Device B 本地 == 云端 + 运行时变量）
- PHASE 4 骨架 ✓

**占位符扫描：** 无 TBD/TODO，PHASE 4 骨架有明确注释说明依赖。

**类型一致性：**
- `VOICE_PARAMS` 所有值为字符串（与 `localStorage.getItem` 返回类型一致）
- `ANS_READ_DELAY` 断言 3500（ms），来自 `parseFloat('3.5') * 1000` ✓
- `OPT_READ_DELAY` 断言 6500（ms），来自 `parseFloat('6.5') * 1000` ✓
- `CROSS_PARAMS.optReadDelay = '6.5'`，与 `VOICE_PARAMS.optReadDelay = '4.0'` 不同，跨设备场景可区分 ✓
