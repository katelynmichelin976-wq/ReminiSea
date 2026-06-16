# 回归测试覆盖率 baseline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为全量 ~20 个 Playwright 套件生成一次性代码覆盖率 baseline，输出 HTML 报告 + 总体 % 数字。不集成 CI、不设门槛。

**Architecture:** `YIHAI_COVERAGE=1` 环境变量门控；`_playwright_helper.js` 加 `startCoverage` / `stopAndCollectCoverage`；20 套件各加 2 行采集；`monocart-coverage-reports` 合并 V8 raw → HTML/lcov。

**Tech Stack:** Playwright `page.coverage` V8 API + `monocart-coverage-reports` npm 包 + Node.js 脚本。

**Reference Spec:** `docs/superpowers/specs/2026-06-16-test-coverage-baseline-design.md`

---

## File Structure

| 文件 | 改动 |
|---|---|
| `package.json` | dev dep 加 `monocart-coverage-reports` |
| `.gitignore` | 加 `coverage/` |
| `tests/_playwright_helper.js` | 加 `startCoverage` / `stopAndCollectCoverage` + 暴露 |
| `tests/_pw_*.js`（20 个） | 各 newPage 后加 startCoverage；close 前加 stopAndCollectCoverage |
| `scripts/build-coverage-report.js` | 新建：读 raw → monocart → HTML/lcov |
| `scripts/run-all-pw.js` | 新建：批量跑套件 + 容错继续 |
| `CLAUDE.md` | 新章节「测试覆盖率」 |
| spec 末尾 | append 「baseline 数据」章节 |

---

## Task 1: 脚手架

**Files:**
- Modify: `C:\code\package.json`
- Modify: `C:\code\.gitignore`
- Modify: `C:\code\tests\_playwright_helper.js`
- Create: `C:\code\scripts\build-coverage-report.js`
- Create: `C:\code\scripts\run-all-pw.js`

### - [ ] Step 1.1: 装 monocart-coverage-reports

```powershell
npm install --save-dev monocart-coverage-reports
```

Expected: `package.json` 多一行 dev dep；`package-lock.json` 更新；无错误。

### - [ ] Step 1.2: .gitignore 加 coverage/

In `C:\code\.gitignore`, 找文件末尾，追加：

```
# test coverage (一次性 baseline，不入 git)
coverage/
```

如果 `.gitignore` 不存在则新建仅这两行。

### - [ ] Step 1.3: _playwright_helper.js 加 coverage helper

In `C:\code\tests\_playwright_helper.js`, 文件顶部找 `const fs = require('fs'), path = require('path');` 一行（约 line 7）。

在该行之后加：

```javascript
const COVERAGE_ENABLED = !!process.env.YIHAI_COVERAGE;
const COVERAGE_RAW_DIR = path.join(__dirname, '..', 'coverage', 'raw');
```

在 module.exports 之前，加两个函数（紧挨现有 `getCounts` / `getBaseUrl` 等 helper）：

```javascript
async function startCoverage(page) {
  if (!COVERAGE_ENABLED) return;
  await page.coverage.startJSCoverage({
    reportAnonymousScripts: true,
    resetOnNavigation: false,
  });
}

async function stopAndCollectCoverage(page, suiteName) {
  if (!COVERAGE_ENABLED) return;
  let coverage;
  try {
    coverage = await page.coverage.stopJSCoverage();
  } catch (e) {
    console.warn(`[coverage] stop failed for ${suiteName}: ${e.message}`);
    return;
  }
  const filtered = coverage.filter(entry => {
    if (!entry.url) return false;
    if (entry.url.includes('/index.html')) return true;
    if (entry.url.includes('localhost:8080') && entry.url.endsWith('.js')) return true;
    return false;
  });
  try {
    fs.mkdirSync(COVERAGE_RAW_DIR, { recursive: true });
    const outPath = path.join(COVERAGE_RAW_DIR, `${suiteName}.json`);
    fs.writeFileSync(outPath, JSON.stringify(filtered, null, 2));
  } catch (e) {
    console.warn(`[coverage] write failed for ${suiteName}: ${e.message}`);
  }
}
```

在 `module.exports = { ... }` 中加入：

```javascript
  startCoverage, stopAndCollectCoverage,
```

### - [ ] Step 1.4: 创建 scripts/build-coverage-report.js

Create file with exact content:

```javascript
const path = require('path');
const fs = require('fs');

const rawDir = path.join(__dirname, '..', 'coverage', 'raw');
const outDir = path.join(__dirname, '..', 'coverage');

if (!fs.existsSync(rawDir)) {
  console.error(`coverage/raw 不存在：先跑 $env:YIHAI_COVERAGE='1'; node scripts/run-all-pw.js`);
  process.exit(1);
}

let MCR;
try {
  MCR = require('monocart-coverage-reports');
} catch (e) {
  console.error('monocart-coverage-reports 未装：npm install --save-dev monocart-coverage-reports');
  process.exit(1);
}

(async () => {
  const reporter = MCR({
    name: '忆海拾光 — Playwright 覆盖率 baseline',
    outputDir: outDir,
    reports: ['v8', 'console-summary', 'lcovonly'],
    cleanCache: true,
    entryFilter: (entry) => {
      return entry.url && (entry.url.includes('/index.html') || entry.url.endsWith('.js'));
    },
  });

  const files = fs.readdirSync(rawDir).filter(f => f.endsWith('.json'));
  console.log(`合并 ${files.length} 个 raw coverage 文件...`);
  for (const f of files) {
    try {
      const raw = JSON.parse(fs.readFileSync(path.join(rawDir, f), 'utf8'));
      if (Array.isArray(raw) && raw.length > 0) {
        await reporter.add(raw);
      } else {
        console.warn(`[skip] ${f}: 空数据`);
      }
    } catch (e) {
      console.warn(`[skip] ${f}: ${e.message}`);
    }
  }
  await reporter.generate();
  console.log(`\n报告已生成：${path.join(outDir, 'index.html')}`);
})();
```

### - [ ] Step 1.5: 创建 scripts/run-all-pw.js

Create file with exact content:

```javascript
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const testsDir = path.join(__dirname, '..', 'tests');
const files = fs.readdirSync(testsDir)
  .filter(f => /^_pw_.+\.js$/.test(f))
  .sort();

if (!process.env.YIHAI_COVERAGE) {
  console.warn('提示：未设 YIHAI_COVERAGE=1，将跑测试但不采集覆盖率');
}
if (!process.env.TEST_PASSWORD) {
  console.warn('提示：未设 TEST_PASSWORD，需登录的套件会 skip');
}

const results = [];
const tStart = Date.now();
for (const f of files) {
  const filePath = path.join(testsDir, f);
  const t0 = Date.now();
  console.log(`\n${'═'.repeat(60)}\n  ${f}\n${'═'.repeat(60)}`);
  const r = spawnSync('node', [filePath], { stdio: 'inherit', env: process.env });
  const dt = ((Date.now() - t0) / 1000).toFixed(1);
  const ok = r.status === 0;
  const skipped = r.status === 2;
  results.push({ file: f, ok, skipped, status: r.status, dt });
  console.log(`\n  → ${ok ? '✓' : skipped ? '○ skipped' : '✗ FAIL'} (${dt}s)`);
}

const total = ((Date.now() - tStart) / 1000).toFixed(1);
console.log(`\n${'═'.repeat(60)}\n  汇总 (${total}s)\n${'═'.repeat(60)}`);
for (const r of results) {
  const icon = r.ok ? '\x1b[32m✓\x1b[0m' : r.skipped ? '\x1b[33m○\x1b[0m' : '\x1b[31m✗\x1b[0m';
  console.log(`  ${icon} ${r.file.padEnd(36)} ${r.dt}s`);
}
const failed = results.filter(r => !r.ok && !r.skipped).length;
console.log(`\n  通过 ${results.filter(r => r.ok).length} / 跳过 ${results.filter(r => r.skipped).length} / 失败 ${failed}`);
if (failed > 0) process.exit(1);
```

### - [ ] Step 1.6: 验证脚手架

```powershell
# 不开 coverage 跑一个，确认 helper 改动没破坏 noop 路径
node tests/_pw_ui_smoke.js
```

Expected：68/0 全过（与改造前一致）。

```powershell
# 试 coverage 模式跑同一个，确认 raw 文件生成
$env:YIHAI_COVERAGE = "1"
node tests/_pw_ui_smoke.js
ls coverage/raw
```

Expected：`coverage/raw/` 创建 — 但 ui_smoke 尚未调 helper，应为空目录或不存在。**预期此时为空**：Task 2 会改造 smoke 套件加入 helper 调用。

---

## Task 2: Mini baseline 验证（3 套件）

**Files:**
- Modify: `C:\code\tests\_pw_ui_smoke.js`
- Modify: `C:\code\tests\_pw_srs_e2e.js`
- Modify: `C:\code\tests\_pw_consent_lang_url.js`

### - [ ] Step 2.1: 改造 _pw_ui_smoke.js

In `C:\code\tests\_pw_ui_smoke.js`:

找 `require('./_playwright_helper')` 行，在解构里加入 `startCoverage`, `stopAndCollectCoverage`：

```javascript
const { pass, /*...其他...*/ startCoverage, stopAndCollectCoverage } = require('./_playwright_helper');
```

找 `browser.newPage(` 一行（接着创建 page 的位置）。在 page 创建之后立即加：

```javascript
  await startCoverage(page);
```

找文件末尾 `finally` 块或 `browser.close()` 调用前，加：

```javascript
    await stopAndCollectCoverage(page, '_pw_ui_smoke');
```

具体位置：如果套件结构是 `try { ... } finally { await browser.close(); }`，则在 `await browser.close()` 之前；如果没有 finally 块、直接 `browser.close()`，则也在它之前。

### - [ ] Step 2.2: 改造 _pw_srs_e2e.js

同 Step 2.1 模式。suiteName 用 `'_pw_srs_e2e'`。

### - [ ] Step 2.3: 改造 _pw_consent_lang_url.js

同 Step 2.1 模式。suiteName 用 `'_pw_consent_lang_url'`。

### - [ ] Step 2.4: 跑 3 套件 with coverage

```powershell
$env:YIHAI_COVERAGE = "1"
$test = $null; try { $test = Invoke-WebRequest -Uri "http://localhost:8080/index.html" -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop } catch {}
if (-not $test) { Start-Process -FilePath "python" -ArgumentList "-m","http.server","8080","--directory","C:\code" -WindowStyle Hidden; Start-Sleep -Seconds 3 }

node tests/_pw_ui_smoke.js
node tests/_pw_srs_e2e.js
node tests/_pw_consent_lang_url.js

ls coverage/raw
```

Expected: `coverage/raw/` 含 3 个 JSON 文件，每个非空数组（含 `url` / `functions` / `source` 字段）。

### - [ ] Step 2.5: 生成 mini 报告

```powershell
node scripts/build-coverage-report.js
```

Expected：console 输出 summary（Statements/Branches/Functions/Lines %）；`coverage/index.html` 存在。

```powershell
start coverage/index.html
```

**人工检查项**：
1. 报告打得开（HTML 渲染正常）
2. index.html 列在报告内，能点开查看行级覆盖
3. inline `<script>` 内行号与原文一致（抽 1-2 个函数比对）
4. 覆盖率数字合理（不是 0% / 100%）

如果 1-3 中任何一项失败 → **STOP**，更新 spec §8 risk 章节，报告给用户决定是否换工具 / 放弃。

### - [ ] Step 2.6: 记录 mini baseline 数字

把 console summary 4 项 % 数字记到这里（手填）：

```
mini baseline (3 套件 = ui_smoke + srs_e2e + consent_lang_url):
- Statements:  __%
- Branches:    __%
- Functions:   __%
- Lines:       __%
```

如果数字 < 30% 且明显异常（如几乎所有 inline script 都未识别）→ 工具集成有问题，参考 Step 2.5 STOP 流程。

---

## Task 3: 全量套件改造

**Files:**
- Modify: 其余 ~17 个 `tests/_pw_*.js` 套件

### - [ ] Step 3.1: 列出剩余套件

```powershell
Get-ChildItem tests\_pw_*.js | Where-Object { $_.Name -notin @('_pw_ui_smoke.js','_pw_srs_e2e.js','_pw_consent_lang_url.js') } | Select-Object Name
```

预期得到 ~17 个套件名。

### - [ ] Step 3.2: 逐套件改造

每个套件按 Task 2.1 同样的 3 步：
1. require 解构加 `startCoverage, stopAndCollectCoverage`
2. newPage 后加 `await startCoverage(page)`
3. close 前加 `await stopAndCollectCoverage(page, '<suiteName>')`

**多 page 套件**（如 `_pw_cross_device.js` / `_pw_easy_sync.js`）：每个 page 独立 start + collect，suiteName 加后缀：

```javascript
const pageA = await browser.newPage({ ... });
await startCoverage(pageA);
const pageB = await browser.newPage({ ... });
await startCoverage(pageB);

try {
  // ...
} finally {
  await stopAndCollectCoverage(pageA, '_pw_cross_device_A');
  await stopAndCollectCoverage(pageB, '_pw_cross_device_B');
  await browser.close();
}
```

**循环 newPage 套件**（如某些 phase 内 close 再 newPage）：每个新 page 都要 start，每次 close 前都要 collect。suiteName 加 `_phase1` / `_phase2` 等后缀。

### - [ ] Step 3.3: 验证套件不破

不开 coverage 跑 ui_smoke + srs_e2e（无登录）+ consent_checkbox（P1 回归）：

```powershell
Remove-Item env:YIHAI_COVERAGE -ErrorAction SilentlyContinue
node tests/_pw_ui_smoke.js
node tests/_pw_srs_e2e.js
node tests/_pw_consent_checkbox.js
```

Expected: 全过（与现状一致，helper noop）。

---

## Task 4: 全量采集 + 报告

**Files:**
- Output: `coverage/raw/*.json`
- Output: `coverage/index.html` + `coverage/lcov.info`

### - [ ] Step 4.1: 清空旧 raw

```powershell
Remove-Item -Recurse -Force coverage\raw -ErrorAction SilentlyContinue
```

### - [ ] Step 4.2: 跑全套

```powershell
$env:YIHAI_COVERAGE = "1"
$env:TEST_PASSWORD = "667788"
$test = $null; try { $test = Invoke-WebRequest -Uri "http://localhost:8080/index.html" -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop } catch {}
if (-not $test) { Start-Process -FilePath "python" -ArgumentList "-m","http.server","8080","--directory","C:\code" -WindowStyle Hidden; Start-Sleep -Seconds 3 }

node scripts/run-all-pw.js
```

Expected：每个套件输出汇总；总耗时 ~30-40 分钟（含登录套件）。

**注意**：按 [test-subagent](memory)，跑全套应该派 sonnet subagent，主上下文只看汇总。但本步骤不需要分析输出，只需采集 → 等结束。

允许单套件失败继续（脚本设计为 `process.exit(1)` 仅在末尾）。

### - [ ] Step 4.3: 生成报告

```powershell
node scripts/build-coverage-report.js
```

Expected：console summary + `coverage/index.html` + `coverage/lcov.info`。

### - [ ] Step 4.4: 打开报告

```powershell
start coverage/index.html
```

---

## Task 5: 分析 + 文档化

**Files:**
- Modify: `C:\code\docs\superpowers\specs\2026-06-16-test-coverage-baseline-design.md`
- Modify: `C:\code\CLAUDE.md`

### - [ ] Step 5.1: 总结 baseline 数据

在 spec 末尾追加章节：

```markdown
---

## 12. Baseline 数据（实施后填写）

**采集日期**：YYYY-MM-DD
**APP_VERSION 时点**：vX.Y.Z
**套件数**：N 个 Playwright（含登录 M 个）
**总耗时**：~Tm

### 总体覆盖率

| 维度 | % | 说明 |
|---|---|---|
| Statements | XX.X% | |
| Branches | XX.X% | |
| Functions | XX.X% | |
| Lines | XX.X% | |

### 主要未覆盖区域

1. **<函数/模块名>** — 覆盖率 X%。原因：<推测>。是否需要补测试：<是 / 否 / 待定>。
2. ...

### 关键发现

- ...

### 后续 TODO

- [ ] ...
```

### - [ ] Step 5.2: CLAUDE.md 加章节

In `C:\code\CLAUDE.md`, find existing 「测试范围规则」章节末尾。在它之后插入：

```markdown
## 测试覆盖率

一次性 baseline 已采集（参 `docs/superpowers/specs/2026-06-16-test-coverage-baseline-design.md` §12）。

跑覆盖率：

\`\`\`powershell
$env:YIHAI_COVERAGE = "1"
$env:TEST_PASSWORD = "667788"
node scripts/run-all-pw.js
node scripts/build-coverage-report.js
start coverage/index.html
\`\`\`

`YIHAI_COVERAGE` 不设时 helper noop，平时测试无开销。报告输出到 `coverage/` 不入 git。
```

（实际写入时把 \` 改成正常反引号。）

### - [ ] Step 5.3: 单 commit

```powershell
git add package.json package-lock.json .gitignore tests/_playwright_helper.js tests/_pw_*.js scripts/build-coverage-report.js scripts/run-all-pw.js docs/superpowers/specs/2026-06-16-test-coverage-baseline-design.md CLAUDE.md
git commit -m "test: Playwright 覆盖率 baseline 采集 + monocart 集成"
```

注意：**不要** add `coverage/` 目录（已 gitignore）。

---

## Self-Review

**Spec 覆盖**（对照 `docs/superpowers/specs/2026-06-16-test-coverage-baseline-design.md`）：
- ✅ §2.1 工具 monocart-coverage-reports → Task 1.1
- ✅ §2.2 数据流 YIHAI_COVERAGE 门控 → Task 1.3
- ✅ §3 改动单 → Task 1-3
- ✅ §4 helper 实现 → Task 1.3
- ✅ §5 套件改造模板 → Task 2 + 3
- ✅ §6 报告脚本 → Task 1.4
- ✅ §7 运行流程 → Task 4
- ✅ §8 risk 已知 → Task 2.5 STOP 流程兜底
- ✅ §9 实施顺序 → Task 1-5
- ✅ §11 输出物 → Task 5.3 commit list

**Placeholder 扫描**：无 TBD / TODO（实施时 § 12 baseline 数字模板 OK，因属于实施输出）。

**Type 一致性**：
- `startCoverage` / `stopAndCollectCoverage` 函数名全文一致
- `COVERAGE_ENABLED` / `COVERAGE_RAW_DIR` 常量一致
- `YIHAI_COVERAGE` 环境变量一致
- `coverage/raw/{suiteName}.json` 路径约定一致

**已知 risk 重申**：
- Task 2.5 验证步骤是关键决策点 — 如果 monocart 对 inline JS 不支持则 STOP，写报告给用户
- Task 3.2 多 page 套件需逐个排查 newPage 结构

---

## 不在本 plan 内的事

- ❌ CI 集成（GitHub Actions / 本地 hook）
- ❌ 覆盖率门槛（如 ≥ 80% 失败 PR）
- ❌ 单测 (Node.js) 覆盖率（eval 模式难追踪）
- ❌ 跨版本覆盖率对比 / 趋势图
- ❌ 补测试以提升覆盖率（baseline 看清后单独决定）

---

## 估时

| Task | 耗时 |
|---|---|
| 1 脚手架 | 30 min |
| 2 Mini baseline | 30 min（含人工 review HTML） |
| 3 全量改造 | 30 min |
| 4 全量采集 + 报告 | 30-40 min（多数是测试运行时间） |
| 5 分析 + commit | 30 min |
| **合计** | ~2.5 h |
