/**
 * 本地数据库诊断脚本
 * 用法：在 App 页面打开 F12 控制台，粘贴执行：
 *   fetch('/tests/_dump_idb.js').then(r=>r.text()).then(eval)
 *
 * 然后把控制台输出发给我，帮你定位问题。
 */
(async () => {
  const DB = 'yihai_srs', VER = 5;
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

  // ── 输出 ──
  const L = s => console.log(s);
  L('══════════ 本地数据库诊断 ══════════');
  L(`当前 user_id: ${shortUid(uid)}`);
  L(`_syncEnabled: ${typeof _syncEnabled !== 'undefined' ? _syncEnabled : 'N/A'}`);
  L(`_cloudUserEmail: ${typeof _cloudUserEmail !== 'undefined' ? _cloudUserEmail : 'N/A'}`);
  L(`card_states: ${states.length} 条 | trials: ${trials.length} 条`);

  // ── 按 deck_key 分组 ──
  const anomalies = [];
  L('');
  L('── 各牌组 CardState 详情 ──');
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
    if (g.noUid > 0) flags.push(`无user_id=${g.noUid}`);
    if (g.wrongUid > 0) flags.push(`user_id不匹配=${g.wrongUid}`);
    const flagStr = flags.length > 0 ? ` ⚠️ ${flags.join(', ')}` : '';
    L(`【${key}】${g.total}条 | review=${g.review} L=${g.learning} RL=${g.relearning} new=${g.new} suspend=${g.suspended} | 到期=${g.due}${flagStr}`);
    const uidShow = Object.entries(g.uidMap).map(([k, v]) => `${shortUid(k)}×${v}`).join(', ');
    L(`  user_id: ${uidShow}${g.noUid > 0 ? `, (无)×${g.noUid}` : ''}`);

    // 列出所有 card_id 简况（仅显示 card_id 和 stage）
    const entries = states.filter(s => s.deck_key === key).map(s =>
      `${s.card_id}=${s.srs_stage}${s.suspended?'(SUS)':''}${!s.user_id?'(?)':s.user_id!==uid?'(!)':''}`
    ).join(' ');
    L(`  卡片: ${entries}`);

    if (g.total > 0 && g.due === 0 && g.new === 0 && g.suspended === 0 && key !== '__builtin_test__') {
      anomalies.push(`${key}: 全部非待开始但到期=0（可能 due_date 都在未来或 user_id 不匹配导致不可见）`);
    }
    if (g.noUid > 0) anomalies.push(`${key}: ${g.noUid} 条无 user_id（旧版本遗留，登录后会被过滤）`);
    if (g.wrongUid > 0) anomalies.push(`${key}: ${g.wrongUid} 条 user_id 不匹配（非当前用户，登录后不可见）`);
  }

  // ── localStorage ──
  L('');
  L('── localStorage ──');
  const srsKeys = ['srs_new_cards_per_day','srs_maximum_reviews_per_day','srs_new_cards_ignore_review_limit'];
  srsKeys.forEach(k => L(`  ${k} = ${localStorage.getItem(k) || '(未设置=默认值)'}`));
  const dp = localStorage.getItem('yihai_daily_progress');
  L(`  yihai_daily_progress = ${dp || '无'}`);
  const gst = localStorage.getItem('yihai_global_sync_ts');
  L(`  yihai_global_sync_ts = ${gst ? new Date(parseInt(gst)).toLocaleString('zh-CN') : '无'}`);
  const decks = localStorage.getItem('yihai_decks_index');
  if (decks) {
    try {
      const d = JSON.parse(decks);
      L(`  yihai_decks_index: ${d.map(m => `${m.key}(${m.name})`).join(', ')}`);
    } catch(e) { L(`  yihai_decks_index: (解析失败) ${decks.substring(0,100)}`); }
  }

  // ── 异常汇总 ──
  if (anomalies.length > 0) {
    L('');
    L('── 发现异常 ──');
    anomalies.forEach(a => L(`  ⚠️ ${a}`));
  }

  L('');
  L('══════════ 诊断结束 ══════════');
  L('将此输出完整复制发给我即可。');
})().catch(e => console.error('诊断脚本执行失败:', e.message));
