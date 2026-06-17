const path = require('path');
const fs = require('fs');

const rawDir = path.join(__dirname, '..', 'coverage', 'raw');
// 输出到子目录，避免 monocart generate() 清掉同级的 coverage/raw
const outDir = path.join(__dirname, '..', 'coverage', 'report');

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
