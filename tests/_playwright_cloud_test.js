/**
 * 忆海拾光 v4.9 网络版回归测试（云端同步）
 *
 * 依赖：
 *   python -m http.server 8080 --directory /c/code
 *   TEST_PASSWORD=xxx node _playwright_cloud_test.js
 *
 * 测试账号：zyhacl@gmail.com（测试专用，不污染妈妈数据）
 * 覆盖：登录 → 下载网络版牌组 → 练习同步 → 配置同步 → 退出
 */
const { chromium } = require('playwright');

const CFG = { url: 'http://localhost:8080/yihai_v4.10.html?v=' + Date.now() };
const TEST_EMAIL = 'zyhacl@gmail.com';
const TEST_PASSWORD = process.env.TEST_PASSWORD || '';
const TEST_DECK_NAME = '蔬菜水果';            // 原名网络版，hash 不变 01edbdfd
const CLOUD_DECK_KEY = 'cloud_01edbdfd';
const CARD_COUNT = 33;

let passed = 0, failed = 0, errors = [];
const pass = (l, v) => { if (v) { passed++; console.log(`  ✓ ${l}`); } else { failed++; errors.push(`✗ ${l}`); console.log(`  ✗ ${l}`); } };
const check = (l, a, e) => pass(l, a === e);
const section = t => console.log(`\n${'═'.repeat(60)}\n  ${t}\n${'═'.repeat(60)}`);
const run = (page, fn, arg) => page.evaluate(fn, arg);
const wait = (page, ms) => page.waitForTimeout(ms);
const waitWrite = (pg) => pg.evaluate(async () => { if (_lastSrsWrite) await _lastSrsWrite; });

// 设置齿轮按钮（第三个 .home-gear-btn，onclick="openSettingsWithSrs()"）
const SETTINGS_SEL = '[aria-label="设置"]';

(async () => {
  if (!TEST_PASSWORD) { console.error('FATAL: 请设置 TEST_PASSWORD 环境变量'); process.exit(1); }

  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const consoleLogs = [];
  page.on('console', msg => consoleLogs.push(`[${msg.type()}] ${msg.text()}`));
  page.on('pageerror', err => consoleLogs.push(`[PAGE ERROR] ${err.message}`));

  try {
    // ═══════════════════ PHASE 1: 登录 ═══════════════════
    section('PHASE 1: 登录');

    await page.goto(CFG.url, { waitUntil: 'networkidle', timeout: 30000 });
    await wait(page, 2000);

    // 打开设置面板（必须用 [aria-label="设置"]，否则会点到统计页齿轮）
    await run(page, (sel) => { const b = document.querySelector(sel); if (b) b.click(); }, SETTINGS_SEL);
    await wait(page, 500);

    // 云端 Tab
    await run(page, () => {
      const tabs = document.querySelectorAll('.sheet-tab');
      for (const t of tabs) { if (t.textContent.includes('云端')) { t.click(); return; } }
    });
    await wait(page, 300);

    pass('显示登录表单', await run(page, () => {
      const sec = document.getElementById('cloud-login-section');
      return sec && window.getComputedStyle(sec).display !== 'none';
    }));

    // 填入邮箱密码并登录
    const emailEl = await page.$('#cloud-email');
    if (emailEl) { await emailEl.fill(''); await emailEl.fill(TEST_EMAIL); }
    await page.fill('#cloud-password', TEST_PASSWORD);
    await wait(page, 200);

    await run(page, () => { const b = document.getElementById('cloud-login-btn'); if (b) b.click(); });
    await wait(page, 3000);

    let connected = false;
    for (let i = 0; i < 30; i++) {
      connected = await run(page, () => {
        const sec = document.getElementById('cloud-connected-section');
        return sec && window.getComputedStyle(sec).display !== 'none';
      });
      if (connected) break;
      await wait(page, 500);
    }
    pass('登录成功，显示已连接界面', connected);

    pass('显示登录邮箱', (await run(page, () => {
      const el = document.getElementById('cloud-user-email');
      return el ? el.textContent : '';
    })).includes(TEST_EMAIL));

    // ═══════════════════ PHASE 2: 下载云端牌组 ═══════════════════
    section('PHASE 2: 下载云端牌组');

    // 关闭设置面板回到首页
    await run(page, () => {
      const overlay = document.getElementById('settings-overlay');
      if (overlay) overlay.classList.remove('open');
    });
    await wait(page, 300);

    // 下载云端牌组
    await run(page, async (name) => {
      try {
        const { data: decks, error } = await _sb.from('server_decks').select('id,name').order('name');
        if (error || !decks) return;
        const sd = decks.find(function(d) { return d.name === name; });
        if (sd) {
          const existing = DECKS_META.find(function(m) { return m.name === sd.name; });
          if (existing) {
            await syncDeckFromCloud(sd.id, sd.name);
          } else {
            await downloadDeckFromCloud(sd.id, sd.name);
          }
        }
      } catch(e) { console.warn('[test] deck sync error:', e.message); }
    }, TEST_DECK_NAME);
    await wait(page, 10000);

    // 等待牌组出现在首页
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

    // 验证数据
    const deckData = await run(page, (name) => {
      const meta = (DECKS_META || []).find(m => m.name === name);
      if (!meta) return null;
      const cards = DECKS[meta.key] || [];
      return { key: meta.key, cardCount: cards.length };
    }, TEST_DECK_NAME);
    pass('DECKS_META 包含牌组', deckData !== null);
    pass(`${CARD_COUNT} 张卡片`, deckData && deckData.cardCount === CARD_COUNT);
    console.log(`  key: ${deckData ? deckData.key : 'N/A'}, 卡片: ${deckData ? deckData.cardCount : 0}`);

    // 切换到云端牌组
    await run(page, (key) => {
      const c = document.querySelector(`.deck-card[data-deck="${key}"]`);
      if (c) c.click();
    }, CLOUD_DECK_KEY);
    await wait(page, 300);

    const curDeck = await run(page, () => currentDeck);
    pass('currentDeck 为云端牌组', curDeck === CLOUD_DECK_KEY);
    console.log(`  currentDeck: ${curDeck}`);

    // ═══════════════════ PHASE 3: 练习并验证同步 ═══════════════════
    section('PHASE 3: 练习并验证同步');

    // 清理旧 CardState（确保 buildSessionQueue 有可用新卡）
    await run(page, async (uid, dk) => {
      await _sb.from('sync_card_states').delete().eq('user_id', uid).eq('deck_key', dk);
    }, await run(page, () => _cloudUserId), CLOUD_DECK_KEY);
    // 也清理本地
    await run(page, (dk) => {
      return new Promise((res) => {
        const r = indexedDB.open('yihai_srs', 5);
        r.onsuccess = e => {
          const db = e.target.result;
          const tx = db.transaction('card_states', 'readwrite');
          const req = tx.objectStore('card_states').getAll();
          req.onsuccess = () => {
            const states = req.result.filter(s => s.deck_key === dk);
            states.forEach(s => tx.objectStore('card_states').delete(s.state_key));
            res(states.length);
          };
        };
      });
    }, CLOUD_DECK_KEY);
    console.log('  旧状态已清理');

    // 重置每日进度（避免 daily_new_today 已达上限导致 buildSessionQueue 返回空队列）
    await run(page, () => { localStorage.removeItem('yihai_daily_progress'); });
    console.log('  daily_progress 已重置');

    await run(page, () => {
      const btns = document.querySelectorAll('button');
      for (const b of btns) { if (b.textContent.includes('开始练习')) { b.click(); return; } }
    });
    await wait(page, 5000);

    pass('进入练习屏', await run(page, () =>
      document.getElementById('screen-quiz').classList.contains('active')));

    // 练习 3 张卡: good, good, hard
    let practiced = 0;
    for (let ci = 0; ci < 5; ci++) {
      const quizActive = await run(page, () => document.getElementById('screen-quiz').classList.contains('active'));
      if (!quizActive) break;

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

      // 回答：前2张 good，后面 hard
      const strat = ci < 2 ? 'good' : 'hard';
      if (strat === 'good') {
        await run(page, () => {
          const btns = document.querySelectorAll('.opt');
          for (const b of btns) if (parseInt(b.dataset.idx) === 0) { onSel(new MouseEvent('mouseup',{bubbles:true}), 0, b); return; }
        });
        await wait(page, 50);
        await waitWrite(page);
      }
      if (strat === 'hard') {
        // 先选一个错误答案
        const wrongs = await run(page, () => {
          const btns = document.querySelectorAll('.opt');
          const avail = [];
          for (const b of btns) { const idx = parseInt(b.dataset.idx); if (idx !== 0 && !b.style.pointerEvents) avail.push(idx); }
          return avail;
        });
        if (wrongs.length > 0) {
          await run(page, (idx) => {
            const btns = document.querySelectorAll('.opt');
            for (const b of btns) if (parseInt(b.dataset.idx) === idx) { onSel(new MouseEvent('mouseup',{bubbles:true}), idx, b); return; }
          }, wrongs[0]);
          await wait(page, 400);
        }
        // 再选正确答案
        await run(page, () => {
          const btns = document.querySelectorAll('.opt');
          for (const b of btns) if (parseInt(b.dataset.idx) === 0) { onSel(new MouseEvent('mouseup',{bubbles:true}), 0, b); return; }
        });
        await wait(page, 50);
        await waitWrite(page);
      }

      // 点击"下一张"
      let done = false;
      for (let t = 0; t < 20; t++) {
        const r = await run(page, () => {
          const nxt = document.getElementById('nxtbtn');
          if (nxt && nxt.classList.contains('show') && !nxt.disabled) { nxt.click(); return 'ok'; }
          const fin = document.getElementById('screen-finish');
          if (fin && fin.classList.contains('active')) return 'finish';
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

    // 回到首页
    await run(page, () => {
      const btns = document.querySelectorAll('button');
      for (const b of btns) { if (b.textContent.includes('返回首页')) { b.click(); return; } }
    });
    await wait(page, 500);

    // 验证 IndexedDB 本地数据
    const localData = await run(page, (key) => new Promise(res => {
      const r = indexedDB.open('yihai_srs', 5);
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

    await run(page, (sel) => { const b = document.querySelector(sel); if (b) b.click(); }, SETTINGS_SEL);
    await wait(page, 300);

    await run(page, () => {
      const tabs = document.querySelectorAll('.sheet-tab');
      for (const t of tabs) { if (t.textContent.includes('SRS')) { t.click(); return; } }
    });
    await wait(page, 300);

    const origNewPerDay = await run(page, () => SRS_CONFIG.new_cards_per_day);
    console.log(`  原 new_cards_per_day = ${origNewPerDay}`);

    const testNewVal = origNewPerDay === 5 ? 3 : 5;
    await run(page, ({ key, val }) => { saveSrsConfigKey(key, val); }, { key: 'new_cards_per_day', val: testNewVal });
    await wait(page, 1500);

    check('本地配置已更新', await run(page, () => SRS_CONFIG.new_cards_per_day), testNewVal);
    await run(page, () => syncAll(currentDeck, false, true).catch(e => console.warn('[test] sync cfg:', e.message)));
    await wait(page, 4000);
    console.log(`  已推送配置 (new_cards_per_day: ${testNewVal})`);

    // 改回
    await run(page, ({ key, val }) => { saveSrsConfigKey(key, val); }, { key: 'new_cards_per_day', val: origNewPerDay });
    await wait(page, 1500);

    // ═══════════════════ PHASE 5: 多设备同步测试 ═══════════════════
    section('PHASE 5: 多设备同步（深色模式）');

    // Device A 当前主题
    const deviceAThemeBefore = await run(page, () => {
      return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
    });
    console.log(`  Device A 当前主题: ${deviceAThemeBefore}`);
    const targetTheme = deviceAThemeBefore === 'dark' ? 'light' : 'dark';

    // 先创建 Device B 并登录（此时 Device A 尚未修改主题，避免 Device B 登录 syncAll 覆盖）
    const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page2 = await ctx2.newPage();

    await page2.goto(CFG.url, { waitUntil: 'networkidle', timeout: 30000 });
    await wait(page2, 2000);

    await run(page2, (sel) => { const b = document.querySelector(sel); if (b) b.click(); }, SETTINGS_SEL);
    await wait(page2, 500);
    await run(page2, () => {
      const tabs = document.querySelectorAll('.sheet-tab');
      for (const t of tabs) { if (t.textContent.includes('云端')) { t.click(); return; } }
    });
    await wait(page2, 300);

    const emailEl2 = await page2.$('#cloud-email');
    if (emailEl2) { await emailEl2.fill(''); await emailEl2.fill(TEST_EMAIL); }
    await page2.fill('#cloud-password', TEST_PASSWORD);
    await run(page2, () => { const b = document.getElementById('cloud-login-btn'); if (b) b.click(); });
    await wait(page2, 5000); // 等待登录后的 syncAll 完成

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

    // 等待登录同步完成（runSync 模态消失）
    for (let i = 0; i < 40; i++) {
      const done = await run(page2, () => {
        const m = document.getElementById('sync-modal');
        return m && m.style.display === 'none';
      });
      if (done) break;
      await wait(page2, 500);
    }

    // Device B 初始主题
    const deviceBThemeBefore = await run(page2, () => {
      return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
    });
    console.log(`  Device B 初始主题: ${deviceBThemeBefore}`);

    // Device A: 切换深色模式并推送（在 Device B 登录完成之后）
    await run(page, () => {
      const tog = document.getElementById('dark-toggle');
      if (tog) tog.checked = !tog.checked;
      toggleTheme(document.getElementById('dark-toggle'));
    });
    await wait(page, 1500); // 等 debouncePushConfig 完成
    console.log(`  Device A 切换为: ${targetTheme}`);

    const pushed = await run(page, async () => {
      try {
        await cloudPushConfig();
        return true;
      } catch(e) { return false; }
    });
    pass('Device A 配置推送成功', pushed);

    // Device B: 拉取配置（此时 Device A 的修改已在服务器上）
    await run(page2, () => cloudPullConfig().catch(e => console.warn('[test] B pull:', e.message)));
    await wait(page2, 2000);

    const deviceBTheme = await run(page2, () => {
      return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
    });
    pass(`Device B 主题已同步为 ${targetTheme}`, deviceBTheme === targetTheme);
    console.log(`  Device B 主题: ${deviceBTheme}`);

    // 关闭 Device B
    await page2.close();
    await ctx2.close();

    // Device A: 恢复原主题
    await run(page, () => {
      const tog = document.getElementById('dark-toggle');
      if (tog) tog.checked = !tog.checked;
      toggleTheme(document.getElementById('dark-toggle'));
    });
    await wait(page, 1000);
    console.log(`  Device A 恢复为: ${deviceAThemeBefore}`);

    // ═══════════════════ PHASE 6: 退出 ═══════════════════
    section('PHASE 6: 退出登录');

    // 确保设置面板打开并切到云端 Tab
    await run(page, (sel) => { const b = document.querySelector(sel); if (b) b.click(); }, SETTINGS_SEL);
    await wait(page, 300);

    await run(page, () => {
      const tabs = document.querySelectorAll('.sheet-tab');
      for (const t of tabs) { if (t.textContent.includes('云端')) { t.click(); return; } }
    });
    await wait(page, 300);

    // 点退出按钮
    await run(page, () => {
      const btns = document.querySelectorAll('button');
      for (const b of btns) { if (b.getAttribute('onclick') === 'doCloudLogout()') { b.click(); return; } }
    });

    // 轮询等待退出完成
    let loggedOut = false;
    let syncDisabled = false;
    for (let i = 0; i < 30; i++) {
      loggedOut = await run(page, () => {
        const sec = document.getElementById('cloud-login-section');
        return sec && window.getComputedStyle(sec).display !== 'none';
      });
      syncDisabled = await run(page, () => !_syncEnabled);
      if (loggedOut && syncDisabled) break;
      await wait(page, 200);
    }
    pass('退出后显示登录表单', loggedOut);
    pass('_syncEnabled 为 false', syncDisabled);

    // ═══════════════════ 结果 ═══════════════════
    section('结果');
    console.log(`  通过: ${passed}  失败: ${failed}`);
    if (failed > 0) console.log(`  失败详情: ${errors.join(' | ')}`);

  } catch (err) {
    console.error('\nFATAL:', err.message);
  }

  await page.close();
  await browser.close();
  process.exit(failed > 0 ? 1 : 0);
})();
