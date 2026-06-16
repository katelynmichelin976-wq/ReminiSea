/**
 * IDB Migration Playwright 测试 — v5.13.10 P2
 *
 * 依赖：python -m http.server 8080 --directory C:\code
 * 运行：node tests/_pw_idb_migration.js
 *
 * 覆盖：
 *   - 模拟老版本 IDB（v9 srs + v1 media，含老 store 名）
 *   - 触发 app 启动 → onupgradeneeded 跑迁移
 *   - 验证老 store 已删，新 store 已建，schema version 已 bump
 */
const { chromium } = require('playwright');
const { pass, section, wait, run, getCounts, getBaseUrl, startCoverage, stopAndCollectCoverage } = require('./_playwright_helper');

const URL = getBaseUrl() + '?v=' + Date.now();

async function deleteAllDbs(page) {
  await run(page, async () => {
    // 先关闭 app 持有的 IDB 连接，避免 deleteDatabase 被 block
    if (typeof _srsDb !== 'undefined' && _srsDb) { try { _srsDb.close(); } catch(e){} _srsDb = null; }
    if (typeof _srsDbPromise !== 'undefined') _srsDbPromise = null;
    if (typeof _mediaDb !== 'undefined' && _mediaDb) { try { _mediaDb.close(); } catch(e){} _mediaDb = null; }
    await new Promise((res) => {
      const req = indexedDB.deleteDatabase('yihai_srs');
      req.onsuccess = () => res();
      req.onerror = () => res();
      req.onblocked = () => { console.warn('[test] yihai_srs delete blocked, continuing'); res(); };
    });
    await new Promise((res) => {
      const req = indexedDB.deleteDatabase('yihai_media');
      req.onsuccess = () => res();
      req.onerror = () => res();
      req.onblocked = () => { console.warn('[test] yihai_media delete blocked, continuing'); res(); };
    });
  });
}

async function seedOldSchema(page) {
  await run(page, async () => {
    // 手动建 v9 yihai_srs with old store names
    await new Promise((res, rej) => {
      const req = indexedDB.open('yihai_srs', 9);
      req.onupgradeneeded = e => {
        const db = e.target.result;
        db.createObjectStore('trials',         { keyPath: 'trial_id' });
        db.createObjectStore('card_states',    { keyPath: 'state_key' });
        db.createObjectStore('app_events',     { keyPath: 'event_id' });
        db.createObjectStore('voiceSlots',     { keyPath: 'slotName' });
        db.createObjectStore('easyCardStates', { keyPath: ['deck_key','card_id'] });
      };
      req.onsuccess = e => { e.target.result.close(); res(); };
      req.onerror = () => rej();
    });
    // 手动建 v1 yihai_media with old 'blobs' store
    await new Promise((res, rej) => {
      const req = indexedDB.open('yihai_media', 1);
      req.onupgradeneeded = e => e.target.result.createObjectStore('blobs');
      req.onsuccess = e => { e.target.result.close(); res(); };
      req.onerror = () => rej();
    });
  });
}

(async () => {
  const browser = await chromium.launch({ headless: !process.env.HEADED });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await startCoverage(page);

  try {
    // ════ PHASE 1: 清空 IDB ════
    section('PHASE 1: 清空 IDB');
    await page.goto(URL, { waitUntil: 'networkidle', timeout: 30000 });
    await wait(page, 500);
    await deleteAllDbs(page);
    pass('IDB 已清空', true);

    // ════ PHASE 2: 种入老版本 schema ════
    section('PHASE 2: 种入老版本 schema');
    await seedOldSchema(page);
    pass('老版本 schema 已种入', true);

    const oldStores = await run(page, async () => {
      return new Promise((res) => {
        const req = indexedDB.open('yihai_srs', 9);
        req.onsuccess = e => {
          const names = Array.from(e.target.result.objectStoreNames);
          e.target.result.close();
          res(names.sort());
        };
      });
    });
    pass('种入后含 trials/card_states/easyCardStates',
      oldStores.includes('trials') && oldStores.includes('card_states') && oldStores.includes('easyCardStates'));

    // ════ PHASE 3: 重新加载页面，触发升级 ════
    section('PHASE 3: 重新加载页面，触发升级');
    await page.goto(URL + '&reload=' + Date.now(), { waitUntil: 'networkidle', timeout: 30000 });
    await wait(page, 1500);
    await run(page, async () => { await idbCount('appEvents'); });
    await run(page, async () => { await idbGetByKey('mediaBlobs', '__nonexistent__').catch(() => {}); });

    // ════ PHASE 4: 验证升级结果 ════
    section('PHASE 4: 验证升级结果');
    const newSrsStores = await run(page, async () => {
      return new Promise((res) => {
        const req = indexedDB.open('yihai_srs');
        req.onsuccess = e => {
          const names = Array.from(e.target.result.objectStoreNames);
          const ver = e.target.result.version;
          e.target.result.close();
          res({ names: names.sort(), version: ver });
        };
      });
    });
    pass('yihai_srs version == 10',                    newSrsStores.version === 10);
    pass('新 store sync_trials 存在',                   newSrsStores.names.includes('sync_trials'));
    pass('新 store sync_card_states 存在',              newSrsStores.names.includes('sync_card_states'));
    pass('新 store easy_card_states 存在',              newSrsStores.names.includes('easy_card_states'));

    const easyIdxNames = await run(page, async () => {
      return new Promise((res) => {
        const req = indexedDB.open('yihai_srs');
        req.onsuccess = e => {
          const store = e.target.result.transaction('easy_card_states', 'readonly').objectStore('easy_card_states');
          const names = Array.from(store.indexNames);
          e.target.result.close();
          res(names);
        };
      });
    });
    pass('easy_card_states 含 deck_key 索引', easyIdxNames.includes('deck_key'));

    pass('新 store app_events 存在',                    newSrsStores.names.includes('app_events'));
    pass('新 store voice_slots 存在',                   newSrsStores.names.includes('voice_slots'));
    pass('老 store trials 已删',                        !newSrsStores.names.includes('trials'));
    pass('老 store card_states 已删',                   !newSrsStores.names.includes('card_states'));
    pass('老 store easyCardStates 已删',                !newSrsStores.names.includes('easyCardStates'));
    pass('老 store voiceSlots 已删',                    !newSrsStores.names.includes('voiceSlots'));

    const newMediaStores = await run(page, async () => {
      return new Promise((res) => {
        const req = indexedDB.open('yihai_media');
        req.onsuccess = e => {
          const names = Array.from(e.target.result.objectStoreNames);
          const ver = e.target.result.version;
          e.target.result.close();
          res({ names: names.sort(), version: ver });
        };
      });
    });
    pass('yihai_media version == 2',                   newMediaStores.version === 2);
    pass('新 store media_blobs 存在',                   newMediaStores.names.includes('media_blobs'));
    pass('老 store blobs 已删',                         !newMediaStores.names.includes('blobs'));

    // ════ PHASE 5: 升级后 helper 可正常 round-trip ════
    section('PHASE 5: 升级后 helper round-trip');
    await run(page, async () => {
      await idbPut('appEvents', { event_id: 'mig_p2_evt_1', ts: 1, type: 'migrated' });
    });
    const got = await run(page, async () => await idbGet('appEvents', 'mig_p2_evt_1'));
    pass('升级后 idbPut + idbGet 仍工作', got && got.event_id === 'mig_p2_evt_1');

    await run(page, async () => { await idbDelete('appEvents', 'mig_p2_evt_1'); });

  } finally {
    await stopAndCollectCoverage(page, '_pw_idb_migration');
    await browser.close();
  }

  const { passed, failed, errors } = getCounts();
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  结果: ${passed} 通过, ${failed} 失败`);
  console.log('═'.repeat(60));
  if (failed) { errors.forEach(e => console.log(e)); process.exit(1); }
})();
