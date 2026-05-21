/**
 * 忆海拾光 云端同步回归测试（登录 → 练习 → 配置同步 → 刷新恢复 → 退出）
 *
 * 依赖：
 *   python -m http.server 8080 --directory /c/code
 *   TEST_PASSWORD=xxx node tests/_playwright_cloud_test.js
 *
 * 覆盖：登录 → 下载牌组 → 练习 → 配置 → 刷新恢复 → 多设备 → 退出
 * 合并自：原 _playwright_cloud_test.js + _playwright_session_restore_test.js（v4.10.1）
 */
const { chromium } = require('playwright');
const helper = require('./_playwright_helper');
const { pass, check, section, wait, run, getBaseUrl } = helper;
// cloud_test & session_restore 共 17+8=25 断言

const CFG = { url: getBaseUrl() + '?v=' + Date.now() };
const TEST_EMAIL = 'zyhacl@gmail.com';
const TEST_PASSWORD = process.env.TEST_PASSWORD || '';
const TEST_DECK_NAME = '蔬菜水果';
const CLOUD_DECK_KEY = 'cloud_01edbdfd';
const CARD_COUNT = 33;

(async () => {
  if (!TEST_PASSWORD) { console.error('FATAL: 请设置 TEST_PASSWORD 环境变量'); process.exit(1); }

  const browser = await chromium.launch({ headless: !process.env.HEADED });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.on('console', msg => { /* ignore */ });
  page.on('pageerror', err => console.log(`  [PAGE ERROR] ${err.message}`));

  try {
    // ═══════════════════ PHASE 1: 登录 ═══════════════════
    section('PHASE 1: 登录');
    await page.goto(CFG.url, { waitUntil: 'networkidle', timeout: 30000 });
    await wait(page, 2000);

    pass('登录成功，显示已连接界面', await helper.cloudLogin(page, TEST_EMAIL, TEST_PASSWORD));

    pass('显示登录邮箱', (await run(page, () => {
      const el = document.getElementById('cloud-user-email');
      return el ? el.textContent : '';
    })).includes(TEST_EMAIL));

    // ═══════════════════ PHASE 2: 下载云端牌组 ═══════════════════
    section('PHASE 2: 下载云端牌组');
    await helper.closeSettings(page);

    await run(page, async (name) => {
      try {
        const { data: decks } = await _sb.from('server_decks').select('id,name').order('name');
        if (!decks) return;
        const sd = decks.find(d => d.name === name);
        if (sd) {
          if (DECKS_META.find(m => m.name === sd.name)) await syncDeckFromCloud(sd.id, sd.name);
          else await downloadDeckFromCloud(sd.id, sd.name);
        }
      } catch(e) { console.warn('[test] deck sync error:', e.message); }
    }, TEST_DECK_NAME);
    await wait(page, 10000);

    let deckFound = false;
    for (let i = 0; i < 30; i++) {
      deckFound = await run(page, (name) => {
        const cards = document.querySelectorAll('.deck-card');
        for (const c of cards) {
          const el = c.querySelector('.deck-name');
          if (el && el.textContent.includes(name)) return true;
        }
        return false;
      }, TEST_DECK_NAME);
      if (deckFound) break;
      await wait(page, 500);
    }
    pass('云端牌组出现在首页列表', deckFound);

    const deckData = await run(page, (name) => {
      const meta = (DECKS_META || []).find(m => m.name === name);
      if (!meta) return null;
      return { key: meta.key, cardCount: (DECKS[meta.key] || []).length };
    }, TEST_DECK_NAME);
    pass('DECKS_META 包含牌组', deckData !== null);
    check(`${CARD_COUNT} 张卡片`, deckData && deckData.cardCount, CARD_COUNT);
    console.log(`  key: ${deckData ? deckData.key : 'N/A'}, 卡片: ${deckData ? deckData.cardCount : 0}`);

    await run(page, (key) => {
      const c = document.querySelector(`.deck-card[data-deck="${key}"]`);
      if (c) c.click();
    }, CLOUD_DECK_KEY);
    await wait(page, 300);

    check('currentDeck 为云端牌组', await run(page, () => currentDeck), CLOUD_DECK_KEY);

    // ═══════════════════ PHASE 3: 练习并验证同步 ═══════════════════
    section('PHASE 3: 练习并验证同步');

    const uid = await run(page, () => _cloudUserId);
    await run(page, async (u, dk) => {
      await _sb.from('sync_card_states').delete().eq('user_id', u).eq('deck_key', dk);
    }, uid, CLOUD_DECK_KEY);
    await run(page, (dk) => new Promise((res) => {
      const r = indexedDB.open('yihai_srs', 6);
      r.onsuccess = e => {
        const db = e.target.result;
        const tx = db.transaction('card_states', 'readwrite');
        const req = tx.objectStore('card_states').getAll();
        req.onsuccess = () => {
          (req.result || []).filter(s => s.deck_key === dk).forEach(s => tx.objectStore('card_states').delete(s.state_key));
          res();
        };
      };
    }), CLOUD_DECK_KEY);
    await run(page, () => localStorage.removeItem('yihai_daily_progress'));
    console.log('  旧状态+DP 已清理');

    await run(page, () => {
      for (const b of document.querySelectorAll('button')) { if (b.textContent.includes('开始练习')) { b.click(); return; } }
    });
    await wait(page, 5000);

    pass('进入练习屏', await run(page, () =>
      document.getElementById('screen-quiz').classList.contains('active')));

    let practiced = 0;
    for (let ci = 0; ci < 5; ci++) {
      if (!await run(page, () => document.getElementById('screen-quiz').classList.contains('active'))) break;

      let ready = false;
      for (let t = 0; t < 20; t++) {
        const r = await run(page, () => {
          if (document.getElementById('screen-finish').classList.contains('active')) return 'finish';
          return document.querySelectorAll('.opt').length > 0 ? 'ready' : null;
        });
        if (r === 'finish' || r === 'ready') { ready = true; break; }
        await wait(page, 100);
      }
      if (!ready) break;

      const strat = ci < 2 ? 'good' : 'hard';
      if (strat === 'good') {
        await run(page, () => {
          for (const b of document.querySelectorAll('.opt')) if (parseInt(b.dataset.idx) === 0) { onSel(new MouseEvent('mouseup',{bubbles:true}), 0, b); return; }
        });
        await wait(page, 50);
        await run(page, async () => { if (_lastSrsWrite) await _lastSrsWrite; });
      } else {
        const wrongs = await run(page, () => {
          const avail = [];
          for (const b of document.querySelectorAll('.opt')) { const idx = parseInt(b.dataset.idx); if (idx !== 0 && !b.style.pointerEvents) avail.push(idx); }
          return avail;
        });
        if (wrongs.length > 0) {
          await run(page, (idx) => { for (const b of document.querySelectorAll('.opt')) if (parseInt(b.dataset.idx) === idx) { onSel(new MouseEvent('mouseup',{bubbles:true}), idx, b); return; } }, wrongs[0]);
          await wait(page, 400);
        }
        await run(page, () => {
          for (const b of document.querySelectorAll('.opt')) if (parseInt(b.dataset.idx) === 0) { onSel(new MouseEvent('mouseup',{bubbles:true}), 0, b); return; }
        });
        await wait(page, 50);
        await run(page, async () => { if (_lastSrsWrite) await _lastSrsWrite; });
      }

      let done = false;
      for (let t = 0; t < 20; t++) {
        const r = await run(page, () => {
          const nxt = document.getElementById('nxtbtn');
          if (nxt && nxt.classList.contains('show') && !nxt.disabled) { nxt.click(); return 'ok'; }
          if (document.getElementById('screen-finish').classList.contains('active')) return 'finish';
          return null;
        });
        if (r === 'ok') { done = true; break; }
        if (r === 'finish') { practiced++; done = true; break; }
        await wait(page, 100);
      }
      if (!done) break;
      practiced++;
    }
    pass('练习了卡片', practiced >= 2);
    console.log(`  完成 ${practiced} 张`);

    await run(page, () => {
      for (const b of document.querySelectorAll('button')) { if (b.textContent.includes('返回首页')) { b.click(); return; } }
    });
    await wait(page, 500);

    const localData = await run(page, (key) => new Promise(res => {
      const r = indexedDB.open('yihai_srs', 6);
      r.onsuccess = e => {
        const db = e.target.result;
        const g1 = db.transaction('card_states', 'readonly').objectStore('card_states').getAll();
        g1.onsuccess = () => {
          const states = (g1.result || []).filter(s => s.deck_key === key);
          const g2 = db.transaction('trials', 'readonly').objectStore('trials').getAll();
          g2.onsuccess = () => {
            const trials = (g2.result || []).filter(t => t.deck_key === key);
            res({ states: states.length, trials: trials.length });
          };
        };
      };
    }), CLOUD_DECK_KEY);
    pass('本地有 CardState', localData.states > 0);
    pass('本地有 TrialLog', localData.trials > 0);
    console.log(`  CardState: ${localData.states} 条, TrialLog: ${localData.trials} 条`);

    // ═══════════════════ PHASE 4: 配置同步 ═══════════════════
    section('PHASE 4: 参数配置同步');
    await helper.openSettingsTab(page, 'SRS');

    const origNewPerDay = await run(page, () => SRS_CONFIG.new_cards_per_day);
    console.log(`  原 new_cards_per_day = ${origNewPerDay}`);
    const testNewVal = origNewPerDay === 5 ? 3 : 5;
    await run(page, ({ key, val }) => { saveSrsConfigKey(key, val); }, { key: 'new_cards_per_day', val: testNewVal });
    await wait(page, 1500);
    check('本地配置已更新', await run(page, () => SRS_CONFIG.new_cards_per_day), testNewVal);
    await run(page, () => runSync({ deckKey: currentDeck, modal: false, decks: false, showToast: false }).catch(e => console.warn('[test] sync cfg:', e.message)));
    await wait(page, 4000);
    console.log(`  已推送配置 (new_cards_per_day: ${testNewVal})`);
    await run(page, ({ key, val }) => { saveSrsConfigKey(key, val); }, { key: 'new_cards_per_day', val: origNewPerDay });
    await wait(page, 1500);

    // ═══════════════════ PHASE 5: 刷新后登录恢复 ═══════════════════
    // 合并自 _playwright_session_restore_test.js — 放在多设备之前，避免多设备干扰 session
    section('PHASE 5: 刷新后登录恢复');
    console.log('  正在 reload...');
    await page.reload({ waitUntil: 'networkidle', timeout: 30000 });
    await wait(page, 1000);

    pass('刷新后 UI 已渲染', !!await run(page, () => {
      const v = document.querySelector('.home-version');
      return v ? v.textContent : null;
    }));

    // 打开设置 → 云端 Tab 触发 updateCloudTabUI()（session restore 仅在切换到云端 Tab 时更新 UI）
    await run(page, () => {
      const b = document.querySelector('[aria-label="设置"]');
      if (b) b.click();
    });
    await wait(page, 500);
    await run(page, () => {
      const tabs = document.querySelectorAll('.sheet-tab');
      for (const t of tabs) { if (t.textContent.includes('云端')) { t.click(); return; } }
    });
    await wait(page, 500);

    let restored = false;
    for (let i = 0; i < 30; i++) {
      restored = await run(page, () => {
        const s = document.getElementById('cloud-connected-section');
        return s && window.getComputedStyle(s).display !== 'none';
      });
      if (restored) break;
      await wait(page, 500);
    }
    pass('刷新后自动恢复登录，显示已连接界面', restored);

    pass('刷新后邮箱显示正确', (await run(page, () => {
      const el = document.getElementById('cloud-user-email');
      return el ? el.textContent : '';
    })).includes(TEST_EMAIL));

    pass('刷新后牌组列表不为空', await run(page, () => document.querySelectorAll('.deck-card').length > 0));

    pass('刷新后不显示空状态占位', !await run(page, () => {
      const el = document.querySelector('.empty-state');
      return el && window.getComputedStyle(el).display !== 'none';
    }));

    // ═══════════════════ PHASE 6: 多设备 ═══════════════════
    section('PHASE 6: 多设备同步（深色模式）');

    const deviceAThemeBefore = await run(page, () => document.documentElement.classList.contains('dark') ? 'dark' : 'light');
    console.log(`  Device A 当前主题: ${deviceAThemeBefore}`);
    const targetTheme = deviceAThemeBefore === 'dark' ? 'light' : 'dark';

    const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page2 = await ctx2.newPage();
    await page2.goto(CFG.url, { waitUntil: 'networkidle', timeout: 30000 });
    await wait(page2, 2000);

    await helper.openSettingsTab(page2, '云端');
    const e2 = await page2.$('#cloud-email');
    if (e2) { await e2.fill(''); await e2.fill(TEST_EMAIL); }
    await page2.fill('#cloud-password', TEST_PASSWORD);
    await run(page2, () => { const b = document.getElementById('cloud-login-btn'); if (b) b.click(); });
    await wait(page2, 5000);
    let connected2 = false;
    for (let i = 0; i < 30; i++) {
      connected2 = await run(page2, () => {
        const sec = document.getElementById('cloud-connected-section');
        return sec && window.getComputedStyle(sec).display !== 'none';
      });
      if (connected2) break;
      await wait(page2, 500);
    }
    pass('Device B 登录成功', connected2);
    await helper.waitSyncModal(page2, 40);

    console.log(`  Device B 初始主题: ${await run(page2, () => document.documentElement.classList.contains('dark') ? 'dark' : 'light')}`);

    await run(page, () => {
      const tog = document.getElementById('dark-toggle');
      if (tog) tog.checked = !tog.checked;
      toggleTheme(document.getElementById('dark-toggle'));
    });
    await wait(page, 1500);
    console.log(`  Device A 切换为: ${targetTheme}`);

    pass('Device A 配置推送成功', await run(page, async () => { try { await cloudPushConfig(); return true; } catch(e) { return false; } }));
    await run(page2, () => cloudPullConfig().catch(e => console.warn('[test] B pull:', e.message)));
    await wait(page2, 2000);

    const deviceBTheme = await run(page2, () => document.documentElement.classList.contains('dark') ? 'dark' : 'light');
    pass(`Device B 主题已同步为 ${targetTheme}`, deviceBTheme === targetTheme);
    console.log(`  Device B 主题: ${deviceBTheme}`);
    await page2.close();
    await ctx2.close();

    await run(page, () => {
      const tog = document.getElementById('dark-toggle');
      if (tog) tog.checked = !tog.checked;
      toggleTheme(document.getElementById('dark-toggle'));
    });
    await wait(page, 1000);

    // ═══════════════════ PHASE 7: 退出 ═══════════════════
    section('PHASE 7: 退出登录');
    const { loggedOut, syncDisabled } = await helper.cloudLogout(page);
    pass('退出后显示登录表单', loggedOut);
    pass('_syncEnabled 为 false', syncDisabled);

    // ═══════════════════ 结果 ═══════════════════
    section('结果');
    const { passed, failed, errors } = helper.getCounts();
    console.log(`  通过: ${passed}  失败: ${failed}`);
    if (failed > 0) console.log(`  失败: ${errors.join(' | ')}`);

  } catch (err) {
    console.error('\nFATAL:', err.message);
  }

  await page.close();
  await browser.close();
  const { failed } = helper.getCounts();
  process.exit(failed > 0 ? 1 : 0);
})();
