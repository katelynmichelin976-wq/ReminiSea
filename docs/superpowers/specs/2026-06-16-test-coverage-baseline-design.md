# 回归测试覆盖率 baseline 评估 设计

**日期**：2026-06-16
**状态**：spec 已确认；plan + 实施推到下个 session
**关联 memory**：[test-scope](C:/Users/chenl/.claude/projects/C--code/memory/feedback-test-scope.md) / [test-subagent](C:/Users/chenl/.claude/projects/C--code/memory/feedback-test-subagent.md) / [test-db-verify](C:/Users/chenl/.claude/projects/C--code/memory/feedback-test-db-verify.md)

---

## 1. 目标

为现有 16 单元 + ~20 Playwright 测试套件生成一次性 **代码覆盖率 baseline**：
- 总体 % 数字（行 / 分支 / 函数 / 语句）
- HTML 报告标注 index.html 中未覆盖的行/区域
- 不集成 CI，不设门槛，仅 baseline 看「我们有什么 / 缺什么」

非目标：
- 持续集成 / PR 门槛检查（推到 P3）
- 单测覆盖率（单测从 index.html eval 函数，V8 视为 `<anonymous>`，工具不易追踪；Playwright 已覆盖这些代码路径）
- 优化测试覆盖率（先看 baseline，后续决定）

---

## 2. 架构

### 2.1 工具选型

**`monocart-coverage-reports`**（V8 coverage 转报告）：
- 直接吃 Playwright `page.coverage.stopJSCoverage()` 的 V8 raw 输出
- 原生支持 inline `<script>` in HTML（关键 — index.html 是单文件 inline JS）
- 输出 HTML / lcov / istanbul / console summary
- 行号映射到 HTML 原始行号

不选：
- `nyc / c8` — 仪表化 .js 文件，inline HTML 难映射
- `playwright/test` 自带 coverage — 项目用 `playwright` 库 + 自定义 helper，非 `@playwright/test` framework
- 手动 V8 raw 处理 — 重复造轮子

### 2.2 数据流

```
Playwright 套件
  newPage() → startCoverage(page) ← 新 helper
    ↓
  跑测试逻辑（不变）
    ↓
  close() 前 stopAndCollectCoverage(page, suiteName) ← 新 helper
    ↓
  coverage/raw/{suite}.json （V8 raw 数组）

scripts/build-coverage-report.js
  ↓
  monocart merge + transform
    ↓
  coverage/html/index.html
  coverage/lcov.info
  console summary（行/分支/函数 %）
```

`YIHAI_COVERAGE=1` 环境变量门控 — 不设时 helper noop，测试运行无开销。

---

## 3. 改动单

| 文件 | 改动 |
|---|---|
| `package.json` | dev dep 加 `monocart-coverage-reports`（最新稳定版） |
| `.gitignore` | 加 `coverage/` |
| `tests/_playwright_helper.js` | 加 `startCoverage(page)` / `stopAndCollectCoverage(page, suiteName)` 函数；module.exports 暴露 |
| `tests/_pw_*.js`（20 个）| 各加 2 行：newPage 后 `await startCoverage(page)`；close 前 `await stopAndCollectCoverage(page, '<filename>')` |
| `scripts/build-coverage-report.js` | 新建：读 coverage/raw/*.json → monocart merge → 输出 HTML + lcov + console |
| `scripts/run-all-pw.js` | 新建：批量跑所有 _pw_*.js 套件（容忍单个失败继续），输出汇总 |
| `CLAUDE.md` | 加章节「测试覆盖率」说明环境变量 + 跑法 + 报告位置 |

不改：
- 17 个单元套件（覆盖率不依赖它们）
- index.html / 业务代码

---

## 4. helper 实现

```javascript
// _playwright_helper.js 新增

const COVERAGE_ENABLED = !!process.env.YIHAI_COVERAGE;
const COVERAGE_RAW_DIR = path.join(__dirname, '..', 'coverage', 'raw');

async function startCoverage(page) {
  if (!COVERAGE_ENABLED) return;
  await page.coverage.startJSCoverage({
    reportAnonymousScripts: true,
    resetOnNavigation: false,
  });
}

async function stopAndCollectCoverage(page, suiteName) {
  if (!COVERAGE_ENABLED) return;
  const coverage = await page.coverage.stopJSCoverage();
  fs.mkdirSync(COVERAGE_RAW_DIR, { recursive: true });
  // 过滤：只保留 index.html 内的 inline script + 直接 .js（不收 supabase-js CDN 等第三方）
  const filtered = coverage.filter(entry => {
    if (!entry.url) return false;
    if (entry.url.includes('/index.html')) return true;
    if (entry.url.includes('localhost:8080') && entry.url.endsWith('.js')) return true;
    return false;
  });
  const outPath = path.join(COVERAGE_RAW_DIR, `${suiteName}.json`);
  fs.writeFileSync(outPath, JSON.stringify(filtered, null, 2));
}
```

**多 page / 多 newPage 套件**：如 `_pw_cross_device.js`（设备 A + 设备 B），需要每个 page 独立采集，suiteName 加后缀如 `cross_device_pageA` / `cross_device_pageB`。

---

## 5. 套件改造模板

每个 `_pw_*.js`：

```diff
   const page = await browser.newPage({ viewport: { ... } });
+  await startCoverage(page);

   try {
     // ...测试逻辑不变...
   } finally {
+    await stopAndCollectCoverage(page, '_pw_consent_checkbox');
     await browser.close();
   }
```

多 page 套件：

```diff
   const pageA = await browser.newPage({ ... });
+  await startCoverage(pageA);
   const pageB = await browser.newPage({ ... });
+  await startCoverage(pageB);
   try {
     // ...
   } finally {
+    await stopAndCollectCoverage(pageA, '_pw_cross_device_A');
+    await stopAndCollectCoverage(pageB, '_pw_cross_device_B');
     await browser.close();
   }
```

可以用 node 脚本批量 sed-style 修改，但每个套件结构略不同（newPage 出现位置、close 出现位置），更稳是人工逐文件修。

---

## 6. 报告脚本（精简）

```javascript
// scripts/build-coverage-report.js
const { MCR } = require('monocart-coverage-reports');
const fs = require('fs');
const path = require('path');

const rawDir = path.join(__dirname, '..', 'coverage', 'raw');
const outDir = path.join(__dirname, '..', 'coverage');

const reporter = MCR({
  name: '忆海拾光 - Playwright 覆盖率 baseline',
  outputDir: outDir,
  reports: [
    'v8',          // HTML for V8 inline scripts
    'console-summary',
    'lcovonly',
  ],
  cleanCache: true,
  // 让 monocart 在 inline script 上识别原 HTML
  entryFilter: (entry) => {
    return entry.url && (entry.url.includes('/index.html') || entry.url.endsWith('.js'));
  },
});

(async () => {
  const files = fs.readdirSync(rawDir).filter(f => f.endsWith('.json'));
  for (const f of files) {
    const raw = JSON.parse(fs.readFileSync(path.join(rawDir, f), 'utf8'));
    await reporter.add(raw);
  }
  await reporter.generate();
  console.log(`报告已生成：${outDir}/index.html`);
})();
```

---

## 7. 运行流程

```powershell
# 一次性
npm install --save-dev monocart-coverage-reports

# 启动 HTTP server（如未启）
python -m http.server 8080 --directory C:\code

# 跑全套 Playwright with coverage（含登录）
$env:YIHAI_COVERAGE = "1"
$env:TEST_PASSWORD = "667788"
node scripts/run-all-pw.js

# 生成报告
node scripts/build-coverage-report.js

# 看报告
start coverage/index.html  # 默认浏览器打开
```

---

## 8. 已知 risk + 不确定

| 风险 | 等级 | 缓解 |
|---|---|---|
| monocart 对 inline `<script>` in HTML 的支持需实测 | 中 | 先跑 mini baseline（3 套件）验证 |
| 多 page 套件 coverage 收集时序复杂 | 中 | startCoverage 必须在 navigate 前；stopAndCollectCoverage 必须在 close 前 |
| Supabase SDK CDN script 会污染 raw → 过滤掉 | 低 | helper 中 `filtered` 已处理 |
| 登录套件失败（密码错 / 网络）导致 stopAndCollectCoverage 跳过 | 低 | 用 try/finally 兜底，stop 失败不抛 |
| index.html 大文件 inline JS coverage 报告渲染慢 | 低 | 接受首次加载 ~5s 慢 |
| 覆盖率 baseline 数字可能很低（如 < 50%）激发"补测试"冲动 | 低 | 一次性 baseline 不设门槛，看清形势再决定是否补 |
| `_pw_easy.js` / `_pw_idb_*.js` 等套件不通过 `_playwright_helper.js` 公共 newPage | 中 | helper 暴露 startCoverage / stopAndCollectCoverage，套件主动调即可 |

---

## 9. 实施顺序（plan 草稿）

1. **脚手架**：装包 + helper.js 加 2 函数 + .gitignore + scripts/build-coverage-report.js
2. **Mini baseline 验证**：选 `_pw_ui_smoke` + `_pw_srs_e2e` + `_pw_consent_lang_url` 3 套件改造 → 跑 → 看 HTML 报告渲染是否正常
3. **决策点**：如 monocart 报告对 inline JS 支持 OK → 进入 Step 4；否则评估替代工具或放弃
4. **全量套件改造**：其余 ~17 套件批量加 2 行
5. **跑全套 + 生成报告**：30-40 分钟
6. **分析 baseline**：
   - 总体 line/branch/function %
   - 列出 < 30% 覆盖的函数 / 区域
   - 总结到本 spec 末尾「baseline 数据」章节
7. **TODO 输出**：哪些核心函数 / 路径未被覆盖，是否补测试（推 P3）

---

## 10. 下次 session 接手指引

1. 读 `docs/superpowers/specs/2026-06-16-test-coverage-baseline-design.md`（本文件）
2. 写 plan 到 `docs/superpowers/plans/YYYY-MM-DD-test-coverage-baseline.md`
3. 实施时遵守 [test-subagent](memory) — 跑 Playwright 用 sonnet subagent，主上下文只看汇总
4. Step 2 Mini baseline 验证后再决定全量
5. 报告生成后把 baseline 数字 + 主要发现 append 回本 spec「baseline 数据」章节，作为后续工作依据

---

## 11. 输出物

- 代码：`scripts/build-coverage-report.js` / `scripts/run-all-pw.js` / `_playwright_helper.js` 改动 / 20 套件改动 / `package.json` dep
- 数据：`coverage/raw/*.json`（不入 git）/ `coverage/html/index.html`（不入 git）/ `coverage/lcov.info`（不入 git）
- 文档：本 spec 末尾 append 「baseline 数据」章节

---

## 12. Baseline 数据

**采集日期**：2026-06-16
**APP_VERSION 时点**：v5.13.17
**Playwright 套件**：23 / 23（全部改造完成）
**通过 / 失败**：22 / 4（4 个失败均预先存在环境问题，与 coverage 改造无关；其 coverage 也成功采集）
**总耗时**：~13 分钟（777s，含登录套件）

### 总体覆盖率（23 套件 baseline）

| 维度 | % | 数字 |
|---|---|---|
| Bytes | **65.62%** | 281,931 / 429,624 |
| Statements | **55.09%** | 3,543 / 6,431 |
| Branches | **40.93%** | 1,677 / 4,097 |
| Functions | **53.49%** | 536 / 1,002 |
| Lines | **61.17%** | 5,530 / 9,041 |

### 演化轨迹

| 阶段 | 套件数 | Statements | Lines | Branches | Functions |
|---|---|---|---|---|---|
| Mini baseline | 3 | 18.09% | 33.02% | 10.16% | 17.66% |
| 简单套件补全 | 15 | 48.48% | 56.10% | 34.15% | 46.51% |
| 复杂模式补全 | 23 | **55.09%** | **61.17%** | **40.93%** | **53.49%** |

补全 8 个复杂套件后：
- Statements +6.6 / Lines +5.1 / Branches +6.8 / Functions +7.0

Branches 提升最显著（更多 if/else 分支被两侧覆盖）。

### 已覆盖套件清单

无登录（11）：`_pw_ui_smoke` `_pw_srs_e2e` `_pw_consent_lang_url` `_pw_consent_checkbox` `_pw_easy` `_pw_featured_tab` `_pw_feedback` `_pw_flip_card` `_pw_idb_helpers` `_pw_idb_migration` `_pw_idb_resilience` `_pw_js_error_report` `_pw_user_mgmt`

需登录（2）：`_pw_cloud_sync` `_pw_config_sync`

### 改造完成情况

所有 23 个 Playwright 套件均已改造（newPage 后 startCoverage + browser.close 前 stopAndCollectFromBrowser）。

**4 个失败套件**（与 coverage 改造无关，预先环境问题）：

| 套件 | 失败原因 |
|---|---|
| `_pw_media_upload` | 缺测试文件 `C:\code\家人.yhspack`（gitignored，本地需手工放置） |
| `_pw_easy_sync` | 测试账号 zyhaff@gmail.com 缺「家人」测试牌组 |
| `_pw_media_recovery` | 云端 media.img.url 状态不一致 |
| `_pw_sync_scenarios` | 云端 decks 行清理状态不一致 |

这些套件的 coverage 仍部分采集到了（_pw_easy_sync_0 / _pw_sync_scenarios_0+_1 等 raw 文件存在），因此 23 套件 baseline 包含了它们触及的代码路径。

### 主要未覆盖区域

23 套件 baseline：Branches 40.93% / Functions 53.49% 是关注重点。未覆盖的 466 个 functions 大致分布（HTML 报告 → grep 估算）：

- **预期不可达**（约 15-20%）：
  - iOS PWA-only 路径（standalone 检测、Home Indicator、TTS unlock）— Playwright chromium 不模拟
  - Network offline / IDB quota / Supabase 401 异常 fallback — 难通过测试构造
  - `archive/` 历史版本 + `yh_diag.js` 诊断面板代码
  - 多 locale 部分文本即使切换也未渲染（es/ja 部分页面在 zh-CN 测试场景未触发）
- **疑似业务缺口**（待 HTML 报告精确定位）：
  - 部分 voice 模块函数（语音 phrases / slot 录制 / TTS 异步链）
  - 部分 SRS auto_suspend / daily_remove_lapses 边界
  - Settings 内嵌套子函数（如 typography 微调）
  - 部分 deck 编辑 / 复制 / 重命名路径

具体函数清单见 `coverage/index.html` HTML 报告（不入 git）。

### 关键发现

1. **URL 规范化必须**：V8 coverage 把 `index.html?v=1` 和 `?v=2` 视为独立 entry，monocart 不 dedup。helper.js 写 raw 前 `.split('?')[0]` 修复后 baseline 数字才正确（修复前虚低 17% statements，实际 48%）。
2. **monocart 配合 inline `<script>` in HTML**：原生支持，行号正确映射 HTML。spec §8「monocart 对 inline `<script>` 支持需实测」风险已验证通过。
3. **单元套件不贡献覆盖**：本次 baseline 仅来自 Playwright；单元从 index.html eval 函数路径 V8 不归属 index.html，故 0% 贡献。
4. **stopAndCollectFromBrowser 简化多 page 套件**：每个 newPage 后 startCoverage + browser.close 前 stopAndCollectFromBrowser 自动遍历所有 active page。循环 ctx.close() 模式（session_restore 等）的 page 在 ctx 关闭前未单独收集，但 baseline 仍捕获到主要路径。

### 后续 TODO

- [ ] HTML 报告 → 列出 0% 覆盖业务核心函数清单
- [ ] 分类：dead code / 已废弃 → 删除；iOS-only → 接受；业务核心未测 → 写测试
- [ ] 修 4 个失败套件的环境依赖（家人.yhspack / 测试账号牌组）→ 提升 baseline 精度
- [ ] 决定是否补测试 / 是否设 CI 门槛（推 P3）
