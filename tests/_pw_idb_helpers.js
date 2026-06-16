/**
 * IDB helper Playwright 测试 — v5.13.10 P1
 *
 * 依赖：python -m http.server 8080 --directory C:\code
 * 运行：node tests/_pw_idb_helpers.js
 *
 * 覆盖：idbGet / idbPut / idbDelete / idbGetAll / idbCount / idbClear round-trip
 *       idbPutWithKey / idbGetByKey（外部 key 形式，mediaBlobs 用）
 *       idbTx 批量事务原子性
 */
const { chromium } = require('playwright');
const { pass, section, wait, run, getCounts, getBaseUrl, startCoverage, stopAndCollectCoverage } = require('./_playwright_helper');

const URL = getBaseUrl() + '?v=' + Date.now();

(async () => {
  const browser = await chromium.launch({ headless: !process.env.HEADED });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await startCoverage(page);

  try {
    await page.goto(URL, { waitUntil: 'networkidle', timeout: 30000 });
    await wait(page, 800);

    // ════ PHASE 1: 注册表运行时可用 ════
    section('PHASE 1: 注册表运行时可用');
    pass('IDB_DBS 全局可访问',    await run(page, () => typeof IDB_DBS === 'object' && !!IDB_DBS.srs));
    pass('IDB_STORES 全局可访问', await run(page, () => typeof IDB_STORES === 'object' && !!IDB_STORES.syncTrials));

    // ════ PHASE 2: helper 函数存在 ════
    section('PHASE 2: helper 函数存在');
    for (const fn of ['idbGet','idbPut','idbDelete','idbGetAll','idbCount','idbClear','idbPutWithKey','idbGetByKey','idbGetAllKeys','idbTx']) {
      pass(`${fn} 全局函数存在`, await run(page, (n) => typeof window[n] === 'function', fn));
    }

    // ════ PHASE 3: idbPut + idbGet round-trip（appEvents 用 keyPath 形式）════
    section('PHASE 3: idbPut + idbGet round-trip');
    const TEST_EVT = { event_id: 'test_p1_evt_1', ts: 1234567890, type: 'test', payload: { foo: 'bar' } };
    await run(page, async (ev) => { await idbPut('appEvents', ev); }, TEST_EVT);
    const got = await run(page, async () => await idbGet('appEvents', 'test_p1_evt_1'));
    pass('idbGet 返回 record',         got && got.event_id === 'test_p1_evt_1');
    pass('idbGet 返回 payload 完整',   got && got.payload && got.payload.foo === 'bar');
    pass('idbGet 不存在 key 返回 null', null === await run(page, async () => await idbGet('appEvents', 'nonexistent_p1')));

    // ════ PHASE 4: idbGetAll + idbCount ════
    section('PHASE 4: idbGetAll + idbCount');
    await run(page, async () => {
      await idbPut('appEvents', { event_id: 'test_p1_evt_2', ts: 1, type: 'a' });
      await idbPut('appEvents', { event_id: 'test_p1_evt_3', ts: 2, type: 'b' });
    });
    const all = await run(page, async () => await idbGetAll('appEvents'));
    pass('idbGetAll 返回数组',          Array.isArray(all));
    pass('idbGetAll 含 3 条测试 record', all.filter(r => r.event_id && r.event_id.startsWith('test_p1_')).length === 3);
    const cnt = await run(page, async () => await idbCount('appEvents'));
    pass('idbCount 返回数字 >= 3',      typeof cnt === 'number' && cnt >= 3);

    // ════ PHASE 5: idbDelete ════
    section('PHASE 5: idbDelete');
    await run(page, async () => { await idbDelete('appEvents', 'test_p1_evt_1'); });
    pass('idbDelete 后 idbGet 返回 null', null === await run(page, async () => await idbGet('appEvents', 'test_p1_evt_1')));

    // ════ PHASE 6: idbPutWithKey + idbGetByKey（mediaBlobs 外部 key 形式）════
    section('PHASE 6: idbPutWithKey + idbGetByKey');
    await run(page, async () => {
      const blob = new Blob(['hello'], { type: 'text/plain' });
      await idbPutWithKey('mediaBlobs', 'test_p1_blob_1', blob);
    });
    const blobBack = await run(page, async () => {
      const b = await idbGetByKey('mediaBlobs', 'test_p1_blob_1');
      return b ? await b.text() : null;
    });
    pass('idbPutWithKey + idbGetByKey round-trip', blobBack === 'hello');
    pass('idbGetByKey 不存在 key 返回 null',       null === await run(page, async () => await idbGetByKey('mediaBlobs', 'nonexistent_p1')));

    // ════ PHASE 6.5: idbGetAllKeys（mediaBlobs 外部 key 列表）════
    section('PHASE 6.5: idbGetAllKeys');
    await run(page, async () => {
      const b1 = new Blob(['a'], { type: 'text/plain' });
      const b2 = new Blob(['b'], { type: 'text/plain' });
      await idbPutWithKey('mediaBlobs', 'test_p3_keys_1', b1);
      await idbPutWithKey('mediaBlobs', 'test_p3_keys_2', b2);
    });
    const keys = await run(page, async () => await idbGetAllKeys('mediaBlobs'));
    pass('idbGetAllKeys 返回数组',          Array.isArray(keys));
    pass('idbGetAllKeys 含 test_p3_keys_1', keys.includes('test_p3_keys_1'));
    pass('idbGetAllKeys 含 test_p3_keys_2', keys.includes('test_p3_keys_2'));
    await run(page, async () => {
      await idbDelete('mediaBlobs', 'test_p3_keys_1').catch(() => {});
      await idbDelete('mediaBlobs', 'test_p3_keys_2').catch(() => {});
    });

    // ════ PHASE 7: idbTx 批量事务原子性 ════
    section('PHASE 7: idbTx 批量事务原子性');
    await run(page, async () => {
      await idbTx(['appEvents'], 'readwrite', async (tx) => {
        tx.objectStore(IDB_STORES.appEvents.name).put({ event_id: 'test_p1_tx_ok_1', ts: 1, type: 'tx' });
        tx.objectStore(IDB_STORES.appEvents.name).put({ event_id: 'test_p1_tx_ok_2', ts: 2, type: 'tx' });
      });
    });
    pass('idbTx 成功 → 两条都写入', 2 === await run(page, async () => {
      const a = await idbGet('appEvents', 'test_p1_tx_ok_1');
      const b = await idbGet('appEvents', 'test_p1_tx_ok_2');
      return (a ? 1 : 0) + (b ? 1 : 0);
    }));

    // 故意 throw → 整体回滚
    let threw = false;
    try {
      await run(page, async () => {
        await idbTx(['appEvents'], 'readwrite', async (tx) => {
          tx.objectStore(IDB_STORES.appEvents.name).put({ event_id: 'test_p1_tx_rollback', ts: 1, type: 'tx' });
          throw new Error('intentional rollback');
        });
      });
    } catch (e) {
      threw = e.message && e.message.includes('intentional');
    }
    pass('idbTx 内 throw 后 reject', threw);
    pass('idbTx 内 throw 后 record 未写入',
      null === await run(page, async () => await idbGet('appEvents', 'test_p1_tx_rollback')));

    // ════ Cleanup ════
    await run(page, async () => {
      for (const k of ['test_p1_evt_1','test_p1_evt_2','test_p1_evt_3','test_p1_tx_ok_1','test_p1_tx_ok_2','test_p1_tx_rollback']) {
        await idbDelete('appEvents', k);
      }
      await idbDelete('mediaBlobs', 'test_p1_blob_1').catch(() => {});
    });

  } finally {
    await stopAndCollectCoverage(page, '_pw_idb_helpers');
    await browser.close();
  }

  const { passed, failed, errors } = getCounts();
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  结果: ${passed} 通过, ${failed} 失败`);
  console.log('═'.repeat(60));
  if (failed) { errors.forEach(e => console.log(e)); process.exit(1); }
})();
