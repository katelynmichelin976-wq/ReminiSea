/**
 * IDB write resilience 测试 — v5.13.11
 *
 * 依赖：python -m http.server 8080 --directory C:\code
 * 运行：node tests/_pw_idb_resilience.js
 *
 * 覆盖：mock idbPut 抛错时，5 个写入函数仍 resolve + log.error/logAppEvent 被写
 */
const { chromium } = require('playwright');
const { pass, section, wait, run, getCounts, getBaseUrl } = require('./_playwright_helper');

const URL = getBaseUrl() + '?v=' + Date.now();

(async () => {
  const browser = await chromium.launch({ headless: !process.env.HEADED });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });

  try {
    await page.goto(URL, { waitUntil: 'networkidle', timeout: 30000 });
    await wait(page, 800);

    // ════ PHASE 1: 准备 — hijack idbPut 抛 quota 错 ════
    section('PHASE 1: hijack idbPut 抛 QuotaExceededError');
    await run(page, () => {
      window._origIdbPut = idbPut;
      window.idbPut = async () => { throw new Error('TEST_QUOTA_EXCEEDED'); };
      while (LOCAL_LOG.length) LOCAL_LOG.pop();
    });
    pass('hijack 完成', true);

    // ════ PHASE 2: saveCardState 失败不抛 ════
    section('PHASE 2: saveCardState');
    const e1 = await run(page, async () => {
      try { await saveCardState({ state_key: 'k1', card_id: 'c1', deck_key: 'd1' }); return null; }
      catch (e) { return e.message; }
    });
    pass('saveCardState 失败不抛', e1 === null);

    // ════ PHASE 3: saveCardStateLocal 失败不抛 ════
    section('PHASE 3: saveCardStateLocal');
    const e2 = await run(page, async () => {
      try { await saveCardStateLocal({ state_key: 'k2', card_id: 'c2', deck_key: 'd2' }); return null; }
      catch (e) { return e.message; }
    });
    pass('saveCardStateLocal 失败不抛', e2 === null);

    // ════ PHASE 4: writeTrialLog 失败不抛 ════
    section('PHASE 4: writeTrialLog');
    const e3 = await run(page, async () => {
      try { await writeTrialLog({ trial_id: 't1', card_id: 'c3', deck_key: 'd1', timestamp: Date.now(), rating: 'good' }); return null; }
      catch (e) { return e.message; }
    });
    pass('writeTrialLog 失败不抛', e3 === null);

    // ════ PHASE 5: putEasyState 失败不抛 ════
    section('PHASE 5: putEasyState');
    const e4 = await run(page, async () => {
      try { await putEasyState({ deck_key: 'd1', card_id: 'c4', seen: 1, history: [1], last_seen: Date.now(), last_warmup: 0 }); return null; }
      catch (e) { return e.message; }
    });
    pass('putEasyState 失败不抛', e4 === null);

    // ════ PHASE 6: log.error 写入 LOCAL_LOG ════
    section('PHASE 6: log.error 通道');
    const localLogCount = await run(page, () =>
      LOCAL_LOG.filter(x => x.m === 'idb' && x.e === 'write_fail').length
    );
    pass(`LOCAL_LOG 含 4 条 idb/write_fail（实际 ${localLogCount}）`, localLogCount === 4);

    const localLogFns = await run(page, () =>
      LOCAL_LOG.filter(x => x.m === 'idb' && x.e === 'write_fail').map(x => x.d && x.d.fn).sort()
    );
    pass('log payload 含 fn 字段（4 个函数都覆盖）', JSON.stringify(localLogFns) === '["putEasyState","saveCardState","saveCardStateLocal","writeTrialLog"]');

    // ════ PHASE 7: _writeSrs 不掐断（仍 hijack 状态）════
    section('PHASE 7: _writeSrs 不掐断');
    const e5 = await run(page, async () => {
      try {
        await _writeSrs(
          { id: 'cx', _srsState: {
            state_key: 'k5', card_id: 'c5', deck_key: 'd1',
            srs_stage: 'review', interval: 1, ease_factor: 2.5,
            lapses_streak: 0, lapses_total: 0, review_mode: 'normal', step_index: 0,
            due_ts: Date.now(), due_date: '2026-06-14', suspended: false
          }},
          'good',
          { attemptNumber: 1, isCorrect: true }
        );
        return null;
      } catch (e) { return e.message; }
    });
    pass('_writeSrs 失败不抛（外层 wrap 兜底）', e5 === null);

    // Cleanup
    await run(page, () => { window.idbPut = window._origIdbPut; });

  } finally {
    await browser.close();
  }

  const { passed, failed, errors } = getCounts();
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  结果: ${passed} 通过, ${failed} 失败`);
  console.log('═'.repeat(60));
  if (failed) { errors.forEach(e => console.log(e)); process.exit(1); }
})();
