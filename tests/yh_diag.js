/**
 * 忆海拾光 浏览器诊断面板 yh_diag.js
 *
 * 用法：
 *   1. 书签加载（推荐）：将 _bookmarklet_diagnose.html 中的"诊断面板"书签拖到收藏栏
 *      在 App 页面点击书签即可注入；再次点击切换显示/隐藏
 *   2. F12 控制台：
 *      fetch('/tests/yh_diag.js').then(r=>r.text()).then(eval)
 *
 * 覆盖维度（5 Tab）：
 *   📊 状态  — session/sync 健康指标速览
 *   📋 事件  — app_events 完整查看（过滤 + 未同步高亮）
 *   ⚠️ 日志  — yh_logs warn/error（v4.11.16+）
 *   🃏 卡片  — CardState 分组 + 异常检测
 *   ⚙️ 设置  — SRS 配置 + 日志等级切换
 */
(function () {
  if (window._yhDiag) { window._yhDiag.toggle(); return; }

  const DB_NAME = 'yihai_srs', DB_VER = 6;
  const TABS = ['📊 状态', '📋 事件', '⚠️ 日志', '🃏 卡片', '⚙️ 设置'];

  // ── 面板骨架 ──────────────────────────────────────────────
  const panel = document.createElement('div');
  panel.style.cssText = [
    'position:fixed', 'top:0', 'right:0', 'width:min(680px,100vw)', 'height:100vh',
    'background:#0f172a', 'color:#e2e8f0', 'font:13px/1.5 "SF Mono",Menlo,monospace',
    'z-index:2147483647', 'display:flex', 'flex-direction:column',
    'box-shadow:-4px 0 24px rgba(0,0,0,0.6)', 'border-left:1px solid #1e293b'
  ].join(';');

  panel.innerHTML = `
    <div id="_yh_hdr" style="display:flex;align-items:center;padding:10px 14px;background:#1e293b;gap:8px;flex-shrink:0">
      <span style="color:#38bdf8;font-weight:bold;font-size:14px">🔍 忆海诊断</span>
      <span id="_yh_ver" style="color:#475569;font-size:11px"></span>
      <div style="flex:1"></div>
      <button id="_yh_refresh" style="background:#1d4ed8;color:#fff;border:none;padding:3px 10px;border-radius:4px;cursor:pointer;font-size:12px">↺ 刷新</button>
      <button id="_yh_close" style="background:#374151;color:#fff;border:none;padding:3px 8px;border-radius:4px;cursor:pointer;font-size:12px">✕</button>
    </div>
    <div id="_yh_tabs" style="display:flex;background:#1e293b;border-bottom:2px solid #0f172a;flex-shrink:0"></div>
    <div id="_yh_body" style="flex:1;overflow:auto;padding:12px 14px"></div>`;
  document.body.appendChild(panel);

  const $ = id => document.getElementById(id);
  const body = $('_yh_body');
  let currentTab = 0;

  // 生成 Tab 按钮
  const tabBar = $('_yh_tabs');
  TABS.forEach((name, i) => {
    const b = document.createElement('button');
    b.textContent = name;
    b.dataset.i = i;
    b.style.cssText = 'flex:1;padding:8px 2px;border:none;background:transparent;color:#64748b;cursor:pointer;font-size:11px;border-bottom:2px solid transparent;margin-bottom:-2px';
    b.onclick = () => switchTab(i);
    tabBar.appendChild(b);
  });

  $('_yh_close').onclick = () => { panel.remove(); delete window._yhDiag; };
  $('_yh_refresh').onclick = () => RENDERS[currentTab]();

  // ── 工具函数 ─────────────────────────────────────────────
  function el(tag, css, html) {
    const e = document.createElement(tag);
    if (css) e.style.cssText = css;
    if (html !== undefined) e.innerHTML = html;
    return e;
  }
  function sec(title) {
    return el('div', 'margin:14px 0 4px;font-weight:bold;color:#38bdf8;font-size:11px;letter-spacing:.08em;text-transform:uppercase', title);
  }
  function kv(k, v, vc) {
    const d = el('div', 'display:flex;justify-content:space-between;padding:3px 0;border-bottom:1px solid #1e293b');
    d.innerHTML = `<span style="color:#64748b;flex-shrink:0;margin-right:8px">${k}</span><span style="color:${vc||'#e2e8f0'};text-align:right;word-break:break-all">${v}</span>`;
    return d;
  }
  function badge(t, bg) {
    return `<span style="background:${bg};color:#fff;border-radius:3px;padding:0 4px;font-size:10px;margin-left:3px">${t}</span>`;
  }
  function fmtTs(ts) { return new Date(ts).toLocaleTimeString('zh-CN', {hour12:false}); }
  function fmtDt(ts) { return new Date(ts).toLocaleString('zh-CN', {hour12:false,month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit'}); }
  function shortId(u) { return u ? u.substring(0, 8) : '—'; }

  async function openDb() {
    return new Promise((res, rej) => {
      const r = indexedDB.open(DB_NAME, DB_VER);
      r.onsuccess = e => res(e.target.result);
      r.onerror = e => rej(e.target.error);
      // 版本低于当前时仍可读
      r.onupgradeneeded = () => {};
    });
  }
  async function readStore(db, name) {
    if (!db.objectStoreNames.contains(name)) return [];
    return new Promise(res => {
      const r = db.transaction(name, 'readonly').objectStore(name).getAll();
      r.onsuccess = e => res(e.target.result || []);
      r.onerror = () => res([]);
    });
  }

  // ── Tab 0：状态 ──────────────────────────────────────────
  async function renderStatus() {
    body.innerHTML = '<div style="color:#475569;font-size:12px">加载中…</div>';
    try {
      const db = await openDb();
      const [states, trials, events, logs] = await Promise.all([
        readStore(db, 'card_states'),
        readStore(db, 'trials'),
        readStore(db, 'app_events'),
        readStore(db, 'yh_logs'),
      ]);
      db.close();

      body.innerHTML = '';

      // App / Session
      body.appendChild(sec('App & Session'));
      const ver = typeof APP_VERSION !== 'undefined' ? APP_VERSION : '(未知)';
      body.appendChild(kv('App 版本', ver));
      body.appendChild(kv('IDB 版本', DB_VER + ' ✓'));

      const se  = typeof _syncEnabled    !== 'undefined' ? _syncEnabled    : null;
      const so  = typeof _sessionOffline !== 'undefined' ? _sessionOffline : null;
      const sr  = typeof _sessionRestoring !== 'undefined' ? _sessionRestoring : null;
      const em  = typeof _cloudUserEmail !== 'undefined' ? _cloudUserEmail : null;
      const uid = typeof _cloudUserId    !== 'undefined' ? _cloudUserId    : null;
      const did = typeof _deviceId       !== 'undefined' ? _deviceId       : localStorage.getItem('yihai_device_id');

      let sText = '未登录', sColor = '#64748b';
      if (se === true)  { sText = '✓ 在线已登录'; sColor = '#22c55e'; }
      else if (so)      { sText = '📵 离线模式（有凭证）'; sColor = '#f59e0b'; }
      else if (sr)      { sText = '⏳ Session 恢复中'; sColor = '#60a5fa'; }
      body.appendChild(kv('连接状态', sText, sColor));
      body.appendChild(kv('邮箱', em || '—'));
      body.appendChild(kv('user_id', uid ? shortId(uid) + '…' : '—'));
      body.appendChild(kv('device_id', did ? shortId(did) + '…' : '—'));
      body.appendChild(kv('_syncEnabled', String(se)));
      body.appendChild(kv('_sessionOffline', String(so)));

      // IDB 计数
      body.appendChild(sec('本地 IDB 数据'));
      const unsyncedEvt  = events.filter(e => !e.synced_at).length;
      const unsyncedLogs = logs.filter(l => !l.synced_at && (l.level==='warn'||l.level==='error')).length;
      const errLogs      = logs.filter(l => l.level==='error').length;
      const warnLogs     = logs.filter(l => l.level==='warn').length;

      body.appendChild(kv('card_states', states.length + ' 条'));
      body.appendChild(kv('trials', trials.length + ' 条'));
      body.appendChild(kv('app_events',
        events.length + ' 条' + (unsyncedEvt ? badge('未同步 ' + unsyncedEvt, '#7c3aed') : badge('全已同步','#15803d'))));
      body.appendChild(kv('yh_logs',
        logs.length + ' 条 ' + badge('W'+warnLogs,'#d97706') + badge('E'+errLogs,'#dc2626') +
        (unsyncedLogs ? badge('未同步 '+unsyncedLogs,'#7c3aed') : '')));

      // 同步
      body.appendChild(sec('同步'));
      const gst = localStorage.getItem('yihai_global_sync_ts');
      body.appendChild(kv('上次同步', gst ? fmtDt(parseInt(gst)) : '(无记录)'));

      // 最近一条 session_restore_start
      const lastRestore = [...events]
        .filter(e => e.event_type === 'session_restore_start')
        .sort((a,b) => b.timestamp - a.timestamp)[0];
      if (lastRestore) {
        body.appendChild(kv('最近一次恢复', fmtTs(lastRestore.timestamp) + '  app:' + (lastRestore.payload?.app||'?')));
      }

      // 日志等级
      body.appendChild(sec('日志等级'));
      const lvl = localStorage.getItem('yihai_log_level') || 'warn (默认)';
      body.appendChild(kv('当前等级', lvl));
      body.appendChild(kv('调整方式', '⚙️ 设置 Tab，或控制台 yhLog.setLevel("debug")'));

    } catch (e) {
      body.innerHTML = '<div style="color:#ef4444">加载失败：' + e.message + '</div>';
    }
  }

  // ── Tab 1：事件 ──────────────────────────────────────────
  async function renderEvents() {
    body.innerHTML = '<div style="color:#475569;font-size:12px">加载中…</div>';

    const SESSION_T = new Set(['session_restore_start','session_restore_l1_ok','session_restore_l1_fail','session_restore_l2_ok','session_restore_l2_offline','session_restore_l2_real_logout','session_restore_l3_ok','session_restore_l3_fail','session_restore_offline_fallback','session_restore_catch','session_restore_token_refreshed','session_restore_sdk_signout','login','logout']);
    const SYNC_T    = new Set(['sync_started','sync_done','cloud_state_merge']);
    const PRAC_T    = new Set(['start_practice','build_queue','go_home','show_finish']);
    const FILTERS   = [['全部','all'],['Session','session'],['Sync','sync'],['练习','practice'],['未同步','unsynced'],['log:*','logtype']];

    let filterKey = 'all';

    try {
      const db = await openDb();
      const all = await readStore(db, 'app_events');
      db.close();
      all.sort((a,b) => b.timestamp - a.timestamp);

      function render() {
        body.innerHTML = '';

        // 过滤条
        const fb = el('div', 'display:flex;gap:4px;flex-wrap:wrap;margin-bottom:8px');
        FILTERS.forEach(([label, key]) => {
          const b = el('button',
            `background:${filterKey===key?'#1d4ed8':'#1e293b'};color:${filterKey===key?'#fff':'#94a3b8'};border:1px solid #334155;padding:2px 8px;border-radius:4px;cursor:pointer;font-size:11px`);
          b.textContent = label;
          b.onclick = () => { filterKey = key; render(); };
          fb.appendChild(b);
        });
        body.appendChild(fb);

        const filtered = all.filter(e => {
          if (filterKey === 'session')  return SESSION_T.has(e.event_type);
          if (filterKey === 'sync')     return SYNC_T.has(e.event_type);
          if (filterKey === 'practice') return PRAC_T.has(e.event_type);
          if (filterKey === 'unsynced') return !e.synced_at;
          if (filterKey === 'logtype')  return e.event_type.startsWith('log:');
          return true;
        });

        body.appendChild(el('div','color:#475569;font-size:11px;margin-bottom:6px',
          `显示 ${Math.min(filtered.length,150)} / ${filtered.length} 条（时间倒序）`));

        filtered.slice(0, 150).forEach(e => {
          const ok   = e.event_type.includes('_ok') || e.event_type==='login' || e.event_type==='sync_done';
          const fail = e.event_type.includes('_fail') || e.event_type.includes('offline') || e.event_type.includes('catch') || e.event_type==='logout' || e.event_type==='session_restore_sdk_signout';
          const flag = ok ? '✓' : fail ? '✗' : '·';
          const fc   = ok ? '#22c55e' : fail ? '#ef4444' : '#475569';
          const unsync = !e.synced_at ? badge('未同步','#7c3aed') : '';

          const d = el('div','padding:4px 0;border-bottom:1px solid #1e293b;display:flex;gap:5px;align-items:baseline');
          const payload = e.payload ? JSON.stringify(e.payload) : '';
          d.innerHTML =
            `<span style="color:${fc};width:10px;flex-shrink:0">${flag}</span>` +
            `<span style="color:#475569;font-size:11px;min-width:58px;flex-shrink:0">${fmtTs(e.timestamp)}</span>` +
            `<span style="color:#cbd5e1;flex-shrink:0">${e.event_type}</span>` +
            `<span style="color:#475569;font-size:11px;flex:1;word-break:break-all">${payload}</span>` +
            unsync;
          body.appendChild(d);
        });

        if (filtered.length > 150) {
          body.appendChild(el('div','color:#475569;font-size:11px;margin-top:6px',`…还有 ${filtered.length-150} 条`));
        }
      }
      render();
    } catch (e) {
      body.innerHTML = '<div style="color:#ef4444">加载失败：' + e.message + '</div>';
    }
  }

  // ── Tab 2：日志 ──────────────────────────────────────────
  async function renderLogs() {
    body.innerHTML = '<div style="color:#475569;font-size:12px">加载中…</div>';
    try {
      const db = await openDb();
      const logs = await readStore(db, 'yh_logs');
      db.close();

      body.innerHTML = '';

      if (!logs.length) {
        body.appendChild(el('div','color:#475569;margin-top:8px',
          'yh_logs 为空。当前日志等级仅 warn/error 写入 IDB。\n如需 info 级别请在「⚙️ 设置」调整等级。'));
        return;
      }

      const sorted = [...logs].sort((a,b) => b.timestamp - a.timestamp);
      body.appendChild(el('div','color:#475569;font-size:11px;margin-bottom:6px',
        `共 ${sorted.length} 条，显示最近 100 条`));

      sorted.slice(0,100).forEach(l => {
        const isErr = l.level === 'error';
        const lc    = isErr ? '#ef4444' : '#f59e0b';
        const unsync = !l.synced_at && (l.level==='warn'||l.level==='error') ? badge('未同步','#7c3aed') : '';

        const d = el('div','padding:4px 0;border-bottom:1px solid #1e293b');
        d.innerHTML =
          `<div style="display:flex;gap:5px;align-items:baseline">` +
          `<span style="color:${lc};width:38px;flex-shrink:0;font-size:11px">[${l.level}]</span>` +
          `<span style="color:#475569;min-width:58px;flex-shrink:0;font-size:11px">${fmtTs(l.timestamp)}</span>` +
          `<span style="color:#94a3b8;min-width:44px;flex-shrink:0">[${l.module||'?'}]</span>` +
          `<span style="color:#e2e8f0;flex:1">${l.msg||''}</span>${unsync}</div>` +
          (l.data ? `<div style="color:#475569;font-size:11px;padding-left:12px;word-break:break-all">${l.data}</div>` : '');
        body.appendChild(d);
      });
    } catch (e) {
      body.innerHTML = '<div style="color:#ef4444">加载失败：' + e.message + '</div>';
    }
  }

  // ── Tab 3：卡片 ──────────────────────────────────────────
  async function renderCards() {
    body.innerHTML = '<div style="color:#475569;font-size:12px">加载中…</div>';
    try {
      const db = await openDb();
      const states = await readStore(db, 'card_states');
      db.close();

      body.innerHTML = '';
      if (!states.length) {
        body.appendChild(el('div','color:#475569','无 CardState 数据')); return;
      }

      const uid   = typeof _cloudUserId !== 'undefined' ? _cloudUserId : null;
      const today = new Date().toISOString().slice(0,10);
      const now   = Date.now();
      const SC    = {review:'#22c55e',learning:'#60a5fa',relearning:'#f59e0b',new:'#94a3b8'};

      const groups = {};
      states.forEach(s => {
        const k = s.deck_key || '(无 deck_key)';
        (groups[k] = groups[k]||[]).push(s);
      });

      for (const [dk, cards] of Object.entries(groups)) {
        body.appendChild(sec('📂 ' + dk));

        const st = {total:cards.length,review:0,learning:0,relearning:0,new:0,suspended:0,due:0,anomaly:[]};
        cards.forEach(s => {
          if (s.suspended) { st.suspended++; return; }
          st[s.srs_stage] = (st[s.srs_stage]||0) + 1;
          const isDue = s.srs_stage==='review'
            ? (!s.due_date || s.due_date<=today)
            : (!s.due_ts   || s.due_ts<=now);
          if (isDue) st.due++;
          if ((s.srs_stage==='learning'||s.srs_stage==='relearning') && s.due_ts===0)
            st.anomaly.push(shortId(s.card_id)+':due_ts=0');
          if (uid && s.user_id && s.user_id!==uid)
            st.anomaly.push(shortId(s.card_id)+':uid不匹配');
        });

        // 摘要行
        const sumParts = [`<span style="color:#e2e8f0">${st.total}张</span>`];
        ['review','learning','relearning','new'].forEach(sg => {
          if (st[sg]) sumParts.push(`<span style="color:${SC[sg]}">${sg[0].toUpperCase()}${st[sg]}</span>`);
        });
        if (st.suspended) sumParts.push(`<span style="color:#475569">S${st.suspended}</span>`);
        sumParts.push(`<span style="color:#38bdf8">到期:${st.due}</span>`);
        body.appendChild(el('div','font-size:12px;margin-bottom:4px', sumParts.join(' ')));

        if (st.anomaly.length) {
          body.appendChild(el('div','color:#ef4444;font-size:11px;margin-bottom:4px','⚠️ '+st.anomaly.join('  ')));
        }

        // 卡片胶囊列表
        const wrap = el('div','display:flex;flex-wrap:wrap;gap:3px;margin-bottom:4px');
        cards.forEach(s => {
          const isDue = s.suspended ? false : s.srs_stage==='review'
            ? (!s.due_date||s.due_date<=today) : (!s.due_ts||s.due_ts<=now);
          const bg   = s.suspended ? '#374151' : isDue ? '#1e3a8a' : '#1e293b';
          const tc   = s.suspended ? '#64748b' : SC[s.srs_stage]||'#e2e8f0';
          const abbr = {review:'R',learning:'L',relearning:'RL',new:'N'}[s.srs_stage]||'?';
          const pill = el('span',
            `background:${bg};color:${tc};border:1px solid #334155;border-radius:3px;padding:1px 5px;font-size:10px;cursor:default`);
          pill.textContent = shortId(s.card_id) + '·' + abbr + (isDue?'*':'');
          pill.title = JSON.stringify({
            stage:s.srs_stage, ef:s.ease_factor, lapses:s.lapses_total,
            due_date:s.due_date, due_ts:s.due_ts?fmtDt(s.due_ts):null,
            uid:s.user_id?shortId(s.user_id):null
          },null,2);
          wrap.appendChild(pill);
        });
        body.appendChild(wrap);
      }
    } catch (e) {
      body.innerHTML = '<div style="color:#ef4444">加载失败：' + e.message + '</div>';
    }
  }

  // ── Tab 4：设置 ──────────────────────────────────────────
  function renderSettings() {
    body.innerHTML = '';

    // SRS 配置
    body.appendChild(sec('SRS 配置（localStorage）'));
    [
      'srs_new_cards_per_day','srs_maximum_reviews_per_day',
      'srs_learn_ahead_limit','srs_session_mode',
      'srs_learning_hard_counts_lapse','srs_new_cards_ignore_review_limit'
    ].forEach(k => body.appendChild(kv(k.replace('srs_',''), localStorage.getItem(k)||'(默认)')));

    // 每日进度
    body.appendChild(sec('每日进度'));
    const dp = localStorage.getItem('yihai_daily_progress');
    if (dp) {
      try { Object.entries(JSON.parse(dp)).forEach(([k,v]) => body.appendChild(kv(k, JSON.stringify(v)))); }
      catch(e) { body.appendChild(kv('raw', dp.substring(0,120))); }
    } else {
      body.appendChild(el('div','color:#475569;font-size:12px','(无记录)'));
    }

    // session_backup
    body.appendChild(sec('Session Backup'));
    const bk = localStorage.getItem('yihai_session_backup');
    if (bk) {
      try {
        const p = JSON.parse(bk);
        body.appendChild(kv('email', p.user?.email||'—'));
        body.appendChild(kv('expires_at', p.expires_at ? fmtDt(p.expires_at*1000) : '—'));
      } catch(e) { body.appendChild(kv('raw', bk.substring(0,80)+'…')); }
    } else {
      body.appendChild(el('div','color:#475569;font-size:12px','(无备份，未登录过)'));
    }

    // 日志等级控制
    body.appendChild(sec('日志等级'));
    const cur = localStorage.getItem('yihai_log_level') || 'warn';
    const lvlRow = el('div','display:flex;gap:6px;margin-bottom:6px');
    ['debug','info','warn','error'].forEach(lvl => {
      const b = el('button',
        `background:${cur===lvl?'#1d4ed8':'#1e293b'};color:${cur===lvl?'#fff':'#94a3b8'};border:1px solid #334155;padding:4px 12px;border-radius:4px;cursor:pointer;font-size:12px`);
      b.textContent = lvl;
      b.onclick = () => {
        if (typeof yhLog !== 'undefined') yhLog.setLevel(lvl);
        else localStorage.setItem('yihai_log_level', lvl);
        renderSettings();
      };
      lvlRow.appendChild(b);
    });
    body.appendChild(lvlRow);
    body.appendChild(el('div','color:#475569;font-size:11px',
      'debug/info → 仅 console；warn/error → 写 IDB + 上传 Supabase'));

    // 复制摘要
    body.appendChild(sec('快速操作'));
    const cpBtn = el('button','background:#1e293b;color:#94a3b8;border:1px solid #334155;padding:5px 12px;border-radius:4px;cursor:pointer;font-size:12px');
    cpBtn.textContent = '📋 复制诊断摘要';
    cpBtn.onclick = () => {
      const lines = [
        'APP_VERSION: ' + (typeof APP_VERSION!=='undefined'?APP_VERSION:'?'),
        '_syncEnabled: '    + (typeof _syncEnabled!=='undefined'?_syncEnabled:'?'),
        '_sessionOffline: ' + (typeof _sessionOffline!=='undefined'?_sessionOffline:'?'),
        '_cloudUserEmail: ' + (typeof _cloudUserEmail!=='undefined'?_cloudUserEmail:'?'),
        'device_id: '       + (typeof _deviceId!=='undefined'?_deviceId:localStorage.getItem('yihai_device_id')||'?'),
        'log_level: '       + (localStorage.getItem('yihai_log_level')||'warn(默认)'),
        'last_sync: '       + (localStorage.getItem('yihai_global_sync_ts')?fmtDt(+localStorage.getItem('yihai_global_sync_ts')):'无'),
      ];
      navigator.clipboard.writeText(lines.join('\n')).catch(()=>{});
      cpBtn.textContent = '✓ 已复制';
      setTimeout(()=>cpBtn.textContent='📋 复制诊断摘要', 2000);
    };
    body.appendChild(cpBtn);
  }

  // ── Tab 切换 ─────────────────────────────────────────────
  const RENDERS = [renderStatus, renderEvents, renderLogs, renderCards, renderSettings];

  function switchTab(i) {
    currentTab = i;
    tabBar.querySelectorAll('button').forEach((b, idx) => {
      const active = idx === i;
      b.style.color = active ? '#38bdf8' : '#64748b';
      b.style.borderBottomColor = active ? '#38bdf8' : 'transparent';
      b.style.background = active ? '#0f172a' : 'transparent';
    });
    RENDERS[i]();
  }

  // 显示版本号
  if (typeof APP_VERSION !== 'undefined') $('_yh_ver').textContent = 'v' + APP_VERSION;

  window._yhDiag = {
    toggle: () => { panel.style.display = panel.style.display==='none'?'flex':'none'; },
    panel
  };

  switchTab(0);
})();
