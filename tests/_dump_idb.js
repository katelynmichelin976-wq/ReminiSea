/**
 * æœ¬åœ°æ•°æ®åº“è¯Šæ–­è„šæœ¬
 * ç”¨æ³•ï¼šåœ¨ App é¡µé¢æ‰“å¼€ F12 æŽ§åˆ¶å°ï¼Œç²˜è´´æ‰§è¡Œï¼š
 *   fetch('/tests/_dump_idb.js').then(r=>r.text()).then(eval)
 *
 * ç„¶åŽæŠŠæŽ§åˆ¶å°è¾“å‡ºå‘ç»™æˆ‘ï¼Œå¸®ä½ å®šä½é—®é¢˜ã€‚
 */
(async () => {
  const DB = 'yihai_srs', VER = 6;
  const db = await new Promise((res, rej) => {
    const r = indexedDB.open(DB, VER);
    r.onsuccess = e => res(e.target.result);
    r.onerror = e => rej(e.target.error);
  });

  const states = await new Promise(res => {
    const tx = db.transaction('card_states', 'readonly');
    tx.objectStore('card_states').getAll().onsuccess = e => res(e.target.result);
  });
  const trials = await new Promise(res => {
    const tx = db.transaction('trials', 'readonly');
    tx.objectStore('trials').getAll().onsuccess = e => res(e.target.result);
  });
  db.close();

  const uid = typeof _cloudUserId !== 'undefined' ? _cloudUserId : localStorage.getItem('yihai_device_id');
  const today = new Date().toISOString().slice(0, 10);
  const now = Date.now();
  const shortUid = u => u ? u.substring(0, 8) : 'N/A';

  // â”€â”€ è¾“å‡º â”€â”€
  const L = s => console.log(s);
  L('â•â•â•â•â•â•â•â•â•â• æœ¬åœ°æ•°æ®åº“è¯Šæ–­ â•â•â•â•â•â•â•â•â•â•');
  L(`å½“å‰ user_id: ${shortUid(uid)}`);
  L(`_syncEnabled: ${typeof _syncEnabled !== 'undefined' ? _syncEnabled : 'N/A'}`);
  L(`_cloudUserEmail: ${typeof _cloudUserEmail !== 'undefined' ? _cloudUserEmail : 'N/A'}`);
  L(`card_states: ${states.length} æ¡ | trials: ${trials.length} æ¡`);

  // â”€â”€ æŒ‰ deck_key åˆ†ç»„ â”€â”€
  const anomalies = [];
  L('');
  L('â”€â”€ å„ç‰Œç»„ CardState è¯¦æƒ… â”€â”€');
  const groups = {};
  states.forEach(s => {
    if (!groups[s.deck_key]) groups[s.deck_key] = { total: 0, review: 0, learning: 0, relearning: 0, new: 0, suspended: 0, due: 0, uidMap: {}, noUid: 0, wrongUid: 0 };
    const g = groups[s.deck_key];
    g.total++;
    if (s.user_id) {
      g.uidMap[s.user_id] = (g.uidMap[s.user_id] || 0) + 1;
      if (uid && s.user_id !== uid) g.wrongUid++;
    } else {
      g.noUid++;
    }
    if (s.suspended) { g.suspended++; return; }
    g[s.srs_stage]++;
    if (s.srs_stage === 'review' && (!s.due_date || s.due_date <= today)) g.due++;
    else if ((s.srs_stage === 'learning' || s.srs_stage === 'relearning') && (!s.due_ts || s.due_ts <= now)) g.due++;
  });

  for (const [key, g] of Object.entries(groups)) {
    const flags = [];
    if (g.noUid > 0) flags.push(`æ— user_id=${g.noUid}`);
    if (g.wrongUid > 0) flags.push(`user_idä¸åŒ¹é…=${g.wrongUid}`);
    const flagStr = flags.length > 0 ? ` âš ï¸ ${flags.join(', ')}` : '';
    L(`ã€${key}ã€‘${g.total}æ¡ | review=${g.review} L=${g.learning} RL=${g.relearning} new=${g.new} suspend=${g.suspended} | åˆ°æœŸ=${g.due}${flagStr}`);
    const uidShow = Object.entries(g.uidMap).map(([k, v]) => `${shortUid(k)}Ã—${v}`).join(', ');
    L(`  user_id: ${uidShow}${g.noUid > 0 ? `, (æ— )Ã—${g.noUid}` : ''}`);

    // åˆ—å‡ºæ‰€æœ‰ card_id ç®€å†µï¼ˆä»…æ˜¾ç¤º card_id å’Œ stageï¼‰
    const entries = states.filter(s => s.deck_key === key).map(s =>
      `${s.card_id}=${s.srs_stage}${s.suspended?'(SUS)':''}${!s.user_id?'(?)':s.user_id!==uid?'(!)':''}`
    ).join(' ');
    L(`  å¡ç‰‡: ${entries}`);

    if (g.total > 0 && g.due === 0 && g.new === 0 && g.suspended === 0 && key !== '__builtin_test__') {
      anomalies.push(`${key}: å…¨éƒ¨éžå¾…å¼€å§‹ä½†åˆ°æœŸ=0ï¼ˆå¯èƒ½ due_date éƒ½åœ¨æœªæ¥æˆ– user_id ä¸åŒ¹é…å¯¼è‡´ä¸å¯è§ï¼‰`);
    }
    if (g.noUid > 0) anomalies.push(`${key}: ${g.noUid} æ¡æ—  user_idï¼ˆæ—§ç‰ˆæœ¬é—ç•™ï¼Œç™»å½•åŽä¼šè¢«è¿‡æ»¤ï¼‰`);
    if (g.wrongUid > 0) anomalies.push(`${key}: ${g.wrongUid} æ¡ user_id ä¸åŒ¹é…ï¼ˆéžå½“å‰ç”¨æˆ·ï¼Œç™»å½•åŽä¸å¯è§ï¼‰`);
  }

  // â”€â”€ localStorage â”€â”€
  L('');
  L('â”€â”€ localStorage â”€â”€');
  const srsKeys = ['srs_new_cards_per_day','srs_maximum_reviews_per_day','srs_new_cards_ignore_review_limit'];
  srsKeys.forEach(k => L(`  ${k} = ${localStorage.getItem(k) || '(æœªè®¾ç½®=é»˜è®¤å€¼)'}`));
  const dp = localStorage.getItem('yihai_daily_progress');
  L(`  yihai_daily_progress = ${dp || 'æ— '}`);
  const gst = localStorage.getItem('yihai_global_sync_ts');
  L(`  yihai_global_sync_ts = ${gst ? new Date(parseInt(gst)).toLocaleString('zh-CN') : 'æ— '}`);
  const decks = localStorage.getItem('yihai_decks_index');
  if (decks) {
    try {
      const d = JSON.parse(decks);
      L(`  yihai_decks_index: ${d.map(m => `${m.key}(${m.name})`).join(', ')}`);
    } catch(e) { L(`  yihai_decks_index: (è§£æžå¤±è´¥) ${decks.substring(0,100)}`); }
  }

  // â”€â”€ å¼‚å¸¸æ±‡æ€» â”€â”€
  if (anomalies.length > 0) {
    L('');
    L('â”€â”€ å‘çŽ°å¼‚å¸¸ â”€â”€');
    anomalies.forEach(a => L(`  âš ï¸ ${a}`));
  }

  // â”€â”€ session / sync äº‹ä»¶æ—¥å¿—ï¼ˆæœ€è¿‘ 24hï¼‰â”€â”€
  L('');
  L('â”€â”€ session / sync äº‹ä»¶æ—¥å¿—ï¼ˆæœ€è¿‘ 24hï¼‰â”€â”€');
  const db2 = await new Promise((res, rej) => {
    const r = indexedDB.open('yihai_srs', 6);
    r.onsuccess = e => res(e.target.result);
    r.onerror   = e => rej(e.target.error);
  });
  const allEvents = await new Promise(res => {
    const tx = db2.transaction('app_events', 'readonly');
    tx.objectStore('app_events').getAll().onsuccess = e => res(e.target.result);
  });
  db2.close();
  const SESSION_TYPES = {
    session_restore_start:1, session_restore_l1_ok:1, session_restore_l1_fail:1,
    session_restore_l2_ok:1, session_restore_l2_offline:1, session_restore_l2_real_logout:1,
    session_restore_l3_ok:1, session_restore_l3_fail:1, session_restore_offline_fallback:1,
    session_restore_catch:1, session_restore_token_refreshed:1, session_restore_sdk_signout:1,
    login:1, logout:1, sync_started:1, sync_done:1
  };
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  const sessionLogs = allEvents
    .filter(e => SESSION_TYPES[e.event_type] && e.timestamp >= cutoff)
    .sort((a, b) => a.timestamp - b.timestamp);
  if (sessionLogs.length === 0) {
    L('  ï¼ˆæ— è®°å½•ï¼‰');
  } else {
    sessionLogs.forEach(e => {
      const t = new Date(e.timestamp).toLocaleTimeString('zh-CN');
      const p = e.payload ? JSON.stringify(e.payload) : '';
      const ok   = e.event_type.indexOf('ok') >= 0 || e.event_type === 'login' || e.event_type === 'sync_done';
      const fail = e.event_type.indexOf('fail') >= 0 || e.event_type.indexOf('offline') >= 0 || e.event_type.indexOf('catch') >= 0;
      const flag = ok ? '[OK]' : fail ? '[!!]' : '[  ]';
      L(`  ${flag} ${t}  ${e.event_type}  ${p}`);
    });
  }

  L('');
  L('â•â•â•â•â•â•â•â•â•â• è¯Šæ–­ç»“æŸ â•â•â•â•â•â•â•â•â•â•');
  L('å°†æ­¤è¾“å‡ºå®Œæ•´å¤åˆ¶å‘ç»™æˆ‘å³å¯ã€‚');
})().catch(e => console.error('è¯Šæ–­è„šæœ¬æ‰§è¡Œå¤±è´¥:', e.message));

