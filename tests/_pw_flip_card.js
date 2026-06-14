/**
 * 翻转卡 Playwright 测试
 * 依赖：python -m http.server 8080 --directory C:\code
 * 运行：node tests/_pw_flip_card.js
 */
const { chromium } = require('playwright');
const JSZip = require('jszip');
const fs = require('fs');
const path = require('path');
const { pass, check, section, wait, run, getCounts, getBaseUrl } = require('./_playwright_helper');

const CFG = { url: getBaseUrl() + '?v=' + Date.now() };
const YHPACK_PATH = path.join(__dirname, 'test_data', '_flip_card_test.yhspack');
const DECK_ID = '__flip_card_test__';

async function createFlipYhspack() {
  const zip = new JSZip();
  zip.file('deck.json', JSON.stringify({
    version: '1.0',
    exportedAt: new Date().toISOString(),
    deck: {
      id: DECK_ID,
      name: 'Flip Card Test',
      cards: [
        {
          id: 'flip_001',
          name: 'example',
          cardType: 'flip',
          image: '',
          audio: '',
          ext: {
            phonetic: '/ɪɡˈzɑːmpl/',
            definition: '例子；范例',
            example: 'This is a good example of teamwork.',
            enDefinition: 'a thing characteristic of its kind',
            partOfSpeech: 'n.'
          }
        },
        {
          id: 'flip_002',
          name: 'benefit',
          cardType: 'flip',
          image: '',
          audio: '',
          ext: {
            phonetic: '/ˈbenɪfɪt/',
            definition: '好处；利益',
            example: 'Exercise has many health benefits.',
            enDefinition: 'an advantage or profit gained from something'
          }
        }
      ]
    }
  }));
  const buf = await zip.generateAsync({ type: 'nodebuffer' });
  fs.mkdirSync(path.dirname(YHPACK_PATH), { recursive: true });
  fs.writeFileSync(YHPACK_PATH, buf);
}

(async () => {
  await createFlipYhspack();

  const browser = await chromium.launch({ headless: !process.env.HEADED });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.on('pageerror', err => console.log(`  [PAGE ERROR] ${err.message}`));
  page.on('console', msg => {
    if (msg.type() === 'warn' || msg.text().startsWith('[srs]')) {
      console.log(`  [BROWSER ${msg.type()}] ${msg.text()}`);
    }
  });

  try {
    // ════ PHASE 1: 导入 flip .yhspack ════
    section('PHASE 1: 导入 flip .yhspack');
    await page.goto(CFG.url, { waitUntil: 'networkidle', timeout: 30000 });
    await wait(page, 1000);

    await run(page, async () => {
      localStorage.clear();
      try {
        const dbs = await indexedDB.databases();
        for (const db of dbs) indexedDB.deleteDatabase(db.name);
      } catch(e) {}
    });
    await page.reload({ waitUntil: 'networkidle' });
    await wait(page, 800);

    const yhpackBuf = fs.readFileSync(YHPACK_PATH);
    const yhpackB64 = yhpackBuf.toString('base64');
    await run(page, async (b64) => {
      const raw = atob(b64);
      const bytes = new Uint8Array(raw.length);
      for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
      const blob = new Blob([bytes], { type: 'application/zip' });
      const file = new File([blob], '_flip_card_test.yhspack', { type: 'application/zip' });
      await importYhspack(file);
    }, yhpackB64);
    await wait(page, 1500);

    const deckFound = await run(page, (id) =>
      !!document.querySelector(`.deck-card[data-deck="${id}"]`), DECK_ID
    );
    pass('导入牌组出现在列表', deckFound);

    // ════ PHASE 2: 进入练习 ════
    section('PHASE 2: 进入练习（flip 卡）');
    await run(page, (id) => { currentDeck = id; }, DECK_ID);
    await run(page, () => { _launchBusy = false; onFabTap(); });
    await wait(page, 1500);

    const inQuiz = await run(page, () =>
      document.getElementById('screen-quiz')?.classList.contains('active')
    );
    pass('进入练习屏', inQuiz);

    // ════ PHASE 3: 翻转卡正面渲染 ════
    section('PHASE 3: 翻转卡正面渲染');

    const wordVisible = await run(page, () =>
      !!document.querySelector('.flip-word') &&
      getComputedStyle(document.getElementById('flip-zone')).display !== 'none'
    );
    pass('正面 flip-word 可见', wordVisible);

    const notFlipped = await run(page, () =>
      !document.getElementById('flip-inner')?.classList.contains('flipped')
    );
    pass('背面初始未翻转', notFlipped);

    const revealBtnExists = await run(page, () =>
      !!document.getElementById('flip-reveal-btn')
    );
    pass('翻转按钮存在', revealBtnExists);

    const imgZoneHidden = await run(page, () =>
      document.querySelector('.img-zone')?.style.display === 'none'
    );
    pass('img-zone 已隐藏（flip 渲染器接管）', imgZoneHidden);

    // ════ PHASE 4: 翻转后背面渲染 ════
    section('PHASE 4: 翻转后背面渲染');
    await run(page, () => document.getElementById('flip-reveal-btn').click());
    await wait(page, 500);

    const isFlipped = await run(page, () =>
      document.getElementById('flip-inner')?.classList.contains('flipped')
    );
    pass('卡片已翻转', isFlipped);

    const gradeBtns = await run(page, () =>
      document.querySelectorAll('.flip-grade-btn').length
    );
    pass('4 个自评按钮出现', gradeBtns === 4);

    const definitionExists = await run(page, () =>
      !!document.querySelector('.flip-definition')
    );
    pass('中文释义元素存在', definitionExists);

    const exampleExists = await run(page, () =>
      !!document.querySelector('.flip-example')
    );
    pass('例句元素存在', exampleExists);

    // ════ PHASE 5: 自评触发 SRS 写入 ════
    section('PHASE 5: 自评 Good → SRS 写入');
    await run(page, () => document.querySelector('.flip-grade-good').click());
    await wait(page, 1500);

    const cardStates = await run(page, async (deckId) => {
      const db = await new Promise((res, rej) => {
        const r = indexedDB.open('yihai_srs');
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
      });
      return new Promise(res => {
        const tx = db.transaction('sync_card_states', 'readonly');
        const req = tx.objectStore('sync_card_states').getAll();
        req.onsuccess = () => res(req.result.filter(s => s.deck_key === deckId));
      });
    }, DECK_ID);
    pass('SRS CardState 已写入', cardStates.length > 0);
    pass('flip_001 卡有 SRS 状态', cardStates.some(s => s.card_id === 'flip_001'));

    // ════ PHASE 6: 第二张卡 + Again grade ════
    section('PHASE 6: 第二张卡 + Again grade');
    const word2 = await run(page, () =>
      !!document.querySelector('.flip-word')
    );
    pass('第二张卡正面可见', word2);

    await run(page, () => document.getElementById('flip-reveal-btn')?.click());
    await wait(page, 400);
    await run(page, () => document.querySelector('.flip-grade-again')?.click());
    await wait(page, 1500);

    const statesAfter = await run(page, async (deckId) => {
      const db = await new Promise((res, rej) => {
        const r = indexedDB.open('yihai_srs');
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
      });
      return new Promise(res => {
        const tx = db.transaction('sync_card_states', 'readonly');
        const req = tx.objectStore('sync_card_states').getAll();
        req.onsuccess = () => res(req.result.filter(s => s.deck_key === deckId));
      });
    }, DECK_ID);
    pass('Again 后两张卡均有 CardState', statesAfter.length >= 2);

    // ════ 清理 ════
    await run(page, async () => {
      localStorage.clear();
      try {
        const dbs = await indexedDB.databases();
        for (const db of dbs) indexedDB.deleteDatabase(db.name);
      } catch(e) {}
    });

  } finally {
    if (fs.existsSync(YHPACK_PATH)) fs.unlinkSync(YHPACK_PATH);
    const { passed, failed } = getCounts();
    section('结果');
    console.log(`  通过: ${passed}  失败: ${failed}`);
    await browser.close();
    process.exit(failed > 0 ? 1 : 0);
  }
})();
