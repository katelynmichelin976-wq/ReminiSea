/**
 * 忆海拾光 媒体上传/下载端到端测试
 *
 * 覆盖三条必须通过的路径（CLAUDE.md 规则 17）：
 *   路径 A：导入 .yhspack → card.media slot 正确初始化（url 空 + _blob 有值）
 *   路径 B：同步后 → Supabase deck_cards.media.img.url 非空（真实上传到 Storage）
 *   路径 C：另一设备登录 → DOM 中出现 <img src="blob:...">（图片实际渲染）
 *
 * 依赖：
 *   python -m http.server 8080 --directory C:\code（PowerShell 启动）
 *   $env:TEST_PASSWORD="667788"; node tests/_pw_media_upload.js
 *
 * 使用 家人.yhspack（10 张，含图片+音频）作为测试文件
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const helper = require('./_playwright_helper');
const { pass, section, wait, run, getCounts, getBaseUrl, cloudLogin, cloudLogout } = helper;

const CFG = { url: getBaseUrl() + '?v=' + Date.now() };
const TEST_EMAIL    = 'zyhaff@gmail.com';
const TEST_PASSWORD = process.env.TEST_PASSWORD || '';
const YHSPACK_PATH  = path.join(__dirname, '..', '家人.yhspack');
const TEST_DECK_NAME = '家人';

async function waitSyncDone(page, maxWait) {
  for (let i = 0; i < Math.ceil((maxWait || 60000) / 500); i++) {
    const done = await run(page, () => typeof _syncInFlight === 'undefined' || !_syncInFlight);
    if (done) return true;
    await wait(page, 500);
  }
  return false;
}

(async () => {
  if (!TEST_PASSWORD) { console.error('FATAL: 请设置 TEST_PASSWORD 环境变量'); process.exit(1); }
  if (!fs.existsSync(YHSPACK_PATH)) { console.error('FATAL: 找不到测试文件', YHSPACK_PATH); process.exit(1); }

  const browser = await chromium.launch({ headless: !process.env.HEADED });
  const tStart = Date.now();

  // 设备 A
  const ctxA = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const pageA = await ctxA.newPage();
  pageA.on('pageerror', e => console.log(`  [A PAGE ERROR] ${e.message}`));
  pageA.on('console', m => { if (m.type() === 'warn' || (m.text().includes('[sync]') && m.type() !== 'debug')) console.log(`  [A] ${m.text()}`); });

  // 设备 B
  const ctxB = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const pageB = await ctxB.newPage();
  pageB.on('pageerror', e => console.log(`  [B PAGE ERROR] ${e.message}`));

  try {
    // ════ PHASE 0: 设备 A 登录 + 清理 ════
    section('PHASE 0: 设备 A 登录 + 清理旧数据');
    await pageA.goto(CFG.url, { waitUntil: 'networkidle', timeout: 30000 });
    await wait(pageA, 2000);
    await run(pageA, async () => {
      localStorage.clear();
      try { const dbs = await indexedDB.databases(); for (const db of dbs) indexedDB.deleteDatabase(db.name); } catch(e) {}
    });
    await pageA.reload({ waitUntil: 'networkidle' });
    await wait(pageA, 2000);
    // 停用 runSync，防止 30s watchdog 干扰媒体上传路径测试
    await run(pageA, () => { window.runSync = async () => {}; });
    pass('设备 A 登录成功', await cloudLogin(pageA, TEST_EMAIL, TEST_PASSWORD));

    // 清理云端旧测试数据（同名牌组）
    const oldDeckKey = await run(pageA, (name) => {
      const m = DECKS_META.find(d => d.name === name);
      return m ? m.key : null;
    }, TEST_DECK_NAME);
    if (oldDeckKey) {
      await run(pageA, async (key) => {
        const sid = toServerDeckId(key, 'personal', _cloudUserId);
        try { await _sb.from('deck_cards').delete().eq('deck_id', sid); } catch(e) {}
        try { await _sb.from('decks').delete().eq('id', sid); } catch(e) {}
      }, oldDeckKey);
    }

    // ════ PHASE 1: 路径 A — 导入 + 验证 card.media slot 初始化 ════
    section('PHASE 1: 路径 A — importYhspack → card.media slot 正确初始化');

    // 通过 file input 上传 .yhspack 文件
    const fileInput = await pageA.$('#action-sheet-import-input');
    if (!fileInput) {
      // 若 input 隐藏，先点击导入按钮触发显示
      await run(pageA, () => { showImportSheet && showImportSheet(); });
      await wait(pageA, 500);
    }
    await pageA.setInputFiles('#action-sheet-import-input', YHSPACK_PATH);
    // 等待导入完成（toast 消失 or deck 出现）
    await wait(pageA, 5000);

    const deckKey = await run(pageA, (name) => {
      const m = DECKS_META.find(d => d.name === name);
      return m ? m.key : null;
    }, TEST_DECK_NAME);
    pass('路径A: 导入后牌组出现在 DECKS_META', !!deckKey);

    if (deckKey) {
      const cardCount = await run(pageA, (key) => (DECKS[key] || []).length, deckKey);
      pass('路径A: 卡片数量为 10', cardCount === 10);

      const mediaState = await run(pageA, (key) => {
        const cards = DECKS[key] || [];
        const withImg = cards.filter(c => c.media?.img).length;
        const imgUrlEmpty = cards.filter(c => c.media?.img && c.media.img.url === '').length;
        const imgBlobSet  = cards.filter(c => c.media?.img && c.media.img._blob.startsWith('blob:')).length;
        const withCardImg = cards.filter(c => c.img && c.img.startsWith('blob:')).length;
        return { withImg, imgUrlEmpty, imgBlobSet, withCardImg };
      }, deckKey);

      pass('路径A: 所有卡片 media.img slot 已初始化', mediaState.withImg === 10);
      pass('路径A: media.img.url 为空（待上传）', mediaState.imgUrlEmpty === 10);
      pass('路径A: media.img._blob 有值（blob URL）', mediaState.imgBlobSet === 10);
      pass('路径A: card.img 同步渲染字段有值', mediaState.withCardImg === 10);

      // ════ PHASE 2: 路径 B — 同步上传 + 验证 Supabase media.img.url 非空 ════
      section('PHASE 2: 路径 B — 同步 → Storage 上传 → Supabase media.img.url 非空');

      // 等待 importYhspack 自动触发的 syncDeck 完成，再显式同步确保媒体上传
      await wait(pageA, 5000);
      await run(pageA, async (key) => { await syncDeck(key); }, deckKey);
      await wait(pageA, 2000);

      // 验证云端 decks.id 已加盐（localKey~userId），且可被 fromServerDeckId 还原；本地 key 不变
      const idCheck = await run(pageA, async (key) => {
        const sid = toServerDeckId(key, 'personal', _cloudUserId);
        const { data } = await _sb.from('decks').select('id').eq('id', sid).maybeSingle();
        return { found: !!data, salted: sid.includes('~') && fromServerDeckId(sid) === key };
      }, deckKey);
      pass('加盐: 云端 decks.id = localKey~userId（可被 fromServerDeckId 还原）', idCheck.found && idCheck.salted);

      // 验证 Supabase deck_cards.media 已有 url（查询用 server id）
      const cloudMedia = await run(pageA, async (key) => {
        const sid = toServerDeckId(key, 'personal', _cloudUserId);
        const { data } = await _sb.from('deck_cards')
          .select('card_id,media')
          .eq('deck_id', sid)
          .limit(3);
        return (data || []).map(r => ({ id: r.card_id, url: r.media?.img?.url || '' }));
      }, deckKey);

      const uploadedCount = cloudMedia.filter(r => r.url && r.url.length > 0).length;
      pass('路径B: Supabase deck_cards.media.img.url 非空（已上传到 Storage）', uploadedCount === cloudMedia.length && cloudMedia.length > 0);

      // 验证本地 card.media.img.url 也已回写
      const localUrlSet = await run(pageA, (key) => {
        const cards = DECKS[key] || [];
        return cards.filter(c => c.media?.img?.url && c.media.img.url.length > 0).length;
      }, deckKey);
      pass('路径B: 本地 card.media.img.url 已回写（upsertSingleCard）', localUrlSet === 10);

      // ════ PHASE 3: 路径 C — 设备 B 登录 + 同步 + DOM 渲染验证 ════
      section('PHASE 3: 路径 C — 设备 B 登录 → 同步 → <img src="blob:..."> 实际渲染');

      await pageB.goto(CFG.url, { waitUntil: 'networkidle', timeout: 30000 });
      await wait(pageB, 2000);
      await run(pageB, () => { window.runSync = async () => {}; });
      pass('设备 B 登录成功', await cloudLogin(pageB, TEST_EMAIL, TEST_PASSWORD));
      await wait(pageB, 2000);

      // 设备 B：发现并同步个人牌组（模拟跨设备拉取）
      await run(pageB, async (key, name) => {
        if (DECKS_META.find(m => m.key === key)) return; // 已有则跳过
        DECKS_META.push({ key, name, deck_type: 'personal', nameLang: 'zh-CN', mod: 0 });
        saveDeckIndex();
        await syncDeck(key);
        renderDeckList();
      }, deckKey, TEST_DECK_NAME);
      await wait(pageB, 3000);

      // 验证 DOM 中真实渲染了 <img>（不只是 JS 内存有值）
      const hasImgInDOM = await pageB.evaluate((deckName) => {
        const deckCards = document.querySelectorAll('.deck-card');
        for (const el of deckCards) {
          const nameEl = el.querySelector('.deck-name, [class*="name"]');
          if (nameEl && nameEl.textContent.includes(deckName)) {
            const img = el.querySelector('img[src^="blob:"]');
            return !!img;
          }
        }
        return false;
      }, TEST_DECK_NAME);
      pass('路径C: 首页卡片列表出现 <img src="blob:...">（图片实际渲染）', hasImgInDOM === true);

      // 验证 JS 层 card.img 和 card.media._blob 也都有值
      const deviceBState = await run(pageB, (name) => {
        const m = DECKS_META.find(d => d.name === name);
        if (!m) return null;
        const cards = DECKS[m.key] || [];
        return {
          total: cards.length,
          imgSet: cards.filter(c => c.img && c.img.startsWith('blob:')).length,
          blobSet: cards.filter(c => c.media?.img?._blob?.startsWith('blob:')).length,
        };
      }, TEST_DECK_NAME);
      pass('路径C: 设备 B card.img 有 blob URL', deviceBState && deviceBState.imgSet === deviceBState.total);
      pass('路径C: 设备 B media.img._blob 有值', deviceBState && deviceBState.blobSet === deviceBState.total);

      // ════ 清理 ════
      section('清理云端测试数据');
      await run(pageA, async (key) => {
        const sid = toServerDeckId(key, 'personal', _cloudUserId);
        try { await _sb.from('deck_cards').delete().eq('deck_id', sid); } catch(e) {}
        try { await _sb.from('decks').delete().eq('id', sid); } catch(e) {}
        // Storage 文件保留（清理较复杂，测试后不影响）
      }, deckKey);
      pass('清理: 完成', true);
    }

    console.log(`\n  总耗时: ${((Date.now() - tStart) / 1000).toFixed(1)}s`);

  } finally {
    const { passed, failed } = getCounts();
    section('结果');
    console.log(`  通过: ${passed}  失败: ${failed}`);
    await browser.close();
    process.exit(failed > 0 ? 1 : 0);
  }
})();
