// tests/_cache.js
// 测试通过缓存：记录 (test_file, sha, ts) 到 .cache/test-state.json
// 发布时检查能否跳过：sha == HEAD 或 cache.sha..HEAD 之间只动了文档

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const REPO_ROOT = path.resolve(__dirname, '..');
const CACHE_FILE = path.join(REPO_ROOT, '.cache', 'test-state.json');

// 这些路径变化不影响测试结果，可视为"安全变更"
const SAFE_PATTERNS = [
  /^docs\//,
  /^CLAUDE\.md$/,
  /^README\.md$/,
  /^MEMORY\.md$/,
  /^\.cache\//,
  /^\.gitignore$/,
  /^tests\/(_cache|run_test)\.js$/,  // 缓存基础设施本身
];

function git(cmd) {
  return execSync(`git ${cmd}`, { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
}

function getHeadSha() {
  return git('rev-parse HEAD');
}

function loadCache() {
  try { return JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8')); }
  catch (e) { return {}; }
}

function saveCache(cache) {
  const dir = path.dirname(CACHE_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));
}

function normTest(testFile) {
  return path.basename(testFile);
}

function markPassed(testFile) {
  const test = normTest(testFile);
  const cache = loadCache();
  cache[test] = { sha: getHeadSha(), ts: Date.now() };
  saveCache(cache);
}

function isAncestor(sha, headSha) {
  try {
    execSync(`git merge-base --is-ancestor ${sha} ${headSha}`,
             { cwd: REPO_ROOT, stdio: 'pipe' });
    return true;
  } catch (e) { return false; }
}

function changedFiles(fromSha, toSha) {
  const out = git(`diff --name-only ${fromSha} ${toSha}`);
  return out ? out.split('\n').filter(Boolean) : [];
}

function isSafeOnly(files) {
  return files.length > 0 && files.every(f => SAFE_PATTERNS.some(p => p.test(f)));
}

function shouldSkip(testFile) {
  const test = normTest(testFile);
  const cache = loadCache();
  const entry = cache[test];
  if (!entry) return { skip: false, reason: 'no cache entry' };

  const head = getHeadSha();
  if (entry.sha === head) {
    return { skip: true, reason: 'HEAD 与缓存一致', sha: entry.sha };
  }
  if (!isAncestor(entry.sha, head)) {
    return { skip: false, reason: '缓存 SHA 不是 HEAD 祖先', cachedSha: entry.sha };
  }
  const files = changedFiles(entry.sha, head);
  if (isSafeOnly(files)) {
    return { skip: true, reason: `仅文档变更（${files.length} 文件）`, sha: entry.sha, files };
  }
  return { skip: false, reason: '存在代码变更', files };
}

// ── CLI ─────────────────────────────────────────────────────────
if (require.main === module) {
  const [cmd, arg] = process.argv.slice(2);
  if (cmd === 'check' && arg) {
    const r = shouldSkip(arg);
    if (r.skip) {
      console.log(`[cache] SKIP ${normTest(arg)} (${r.reason}, sha ${r.sha.slice(0,7)})`);
      process.exit(0);
    } else {
      console.log(`[cache] RUN  ${normTest(arg)} (${r.reason})`);
      if (r.files && r.files.length <= 8) {
        r.files.forEach(f => console.log(`  ~ ${f}`));
      } else if (r.files) {
        console.log(`  ~ ${r.files.length} files changed`);
      }
      process.exit(1);
    }
  } else if (cmd === 'mark' && arg) {
    markPassed(arg);
    console.log(`[cache] MARK ${normTest(arg)} @ ${getHeadSha().slice(0,7)}`);
  } else if (cmd === 'list') {
    const cache = loadCache();
    const head = getHeadSha();
    const entries = Object.entries(cache).sort((a,b) => b[1].ts - a[1].ts);
    if (entries.length === 0) {
      console.log('(empty cache)');
    } else {
      console.log(`HEAD: ${head.slice(0,7)}`);
      entries.forEach(([t, e]) => {
        const mins = Math.round((Date.now() - e.ts) / 60000);
        const marker = e.sha === head ? '=' : (isAncestor(e.sha, head) ? '<' : '?');
        console.log(`  ${marker} ${t}  ${e.sha.slice(0,7)}  ${mins}m ago`);
      });
    }
  } else if (cmd === 'clear') {
    if (fs.existsSync(CACHE_FILE)) fs.unlinkSync(CACHE_FILE);
    console.log('[cache] cleared');
  } else {
    console.log('Usage:');
    console.log('  node tests/_cache.js check <test-file>   # exit 0=skip, 1=run');
    console.log('  node tests/_cache.js mark  <test-file>   # mark as passed at HEAD');
    console.log('  node tests/_cache.js list                # show cache');
    console.log('  node tests/_cache.js clear               # delete cache');
    process.exit(2);
  }
}

module.exports = { markPassed, shouldSkip, normTest };
