/**
 * 网络 / Session 日志诊断脚本
 * 用法：在 App 页面打开 F12 控制台，粘贴执行：
 *   fetch('/tests/_dump_network_log.js').then(r=>r.text()).then(eval)
 *
 * 输出：
 *   1. 最近 48h app_events（session_restore / login / logout / sync）
 *   2. 最近 48h yh_logs（warn / error 级别，v4.11.16+）
 */
(async () => {
  const L = s => console.log(s);
  const cutoff = Date.now() - 48 * 60 * 60 * 1000;

  const db = await new Promise((res, rej) => {
    const r = indexedDB.open('yihai_srs', 6);
    r.onsuccess = e => res(e.target.result);
    r.onerror   = e => rej(e.target.error);
  });

  // ── 1. app_events（session / sync 埋点）──
  const allEvents = await new Promise(res => {
    const tx = db.transaction('app_events', 'readonly');
    tx.objectStore('app_events').getAll().onsuccess = e => res(e.target.result);
  });

  // ── 2. yh_logs（warn / error 诊断日志，v4.11.16+）──
  let yhLogs = [];
  if (db.objectStoreNames.contains('yh_logs')) {
    yhLogs = await new Promise(res => {
      const tx = db.transaction('yh_logs', 'readonly');
      tx.objectStore('yh_logs').getAll().onsuccess = e => res(e.target.result);
    });
  }
  db.close();

  // ── Session / Sync 事件 ──
  const SESSION_TYPES = {
    session_restore_start:1, session_restore_l1_ok:1, session_restore_l1_fail:1,
    session_restore_l2_ok:1, session_restore_l2_offline:1, session_restore_l2_real_logout:1,
    session_restore_l3_ok:1, session_restore_l3_fail:1, session_restore_offline_fallback:1,
    session_restore_catch:1, session_restore_token_refreshed:1, session_restore_sdk_signout:1,
    login:1, logout:1, sync_started:1, sync_done:1
  };
  const sessionLogs = allEvents
    .filter(e => SESSION_TYPES[e.event_type] && e.timestamp >= cutoff)
    .sort((a, b) => a.timestamp - b.timestamp);

  L('══════════ 网络 / Session 日志（最近 48h）══════════');
  L(`当前时间：${new Date().toLocaleString('zh-CN')}`);
  L(`_syncEnabled: ${typeof _syncEnabled !== 'undefined' ? _syncEnabled : 'N/A'}`);
  L(`_sessionOffline: ${typeof _sessionOffline !== 'undefined' ? _sessionOffline : 'N/A'}`);
  L(`_cloudUserEmail: ${typeof _cloudUserEmail !== 'undefined' ? _cloudUserEmail || '(空)' : 'N/A'}`);
  L('');

  L('── Session / Sync 埋点 ──');
  if (sessionLogs.length === 0) {
    L('  （无记录）');
  } else {
    sessionLogs.forEach(e => {
      const t    = new Date(e.timestamp).toLocaleString('zh-CN');
      const p    = e.payload ? JSON.stringify(e.payload) : '';
      const ok   = e.event_type.indexOf('ok') >= 0 || e.event_type === 'login' || e.event_type === 'sync_done';
      const fail = e.event_type.indexOf('fail') >= 0 || e.event_type.indexOf('offline') >= 0
                || e.event_type.indexOf('catch') >= 0 || e.event_type === 'logout'
                || e.event_type === 'real_logout';
      const flag = ok ? '[OK]' : fail ? '[!!]' : '[  ]';
      L(`  ${flag} ${t}  ${e.event_type}  ${p}`);
    });
  }

  // ── yh_logs warn/error ──
  L('');
  L('── yh_logs（warn / error，v4.11.16+）──');
  const warnErrors = yhLogs
    .filter(e => (e.level === 'warn' || e.level === 'error') && e.timestamp >= cutoff)
    .sort((a, b) => a.timestamp - b.timestamp);
  if (!db.objectStoreNames || !yhLogs.length && !db.objectStoreNames.contains) {
    // store 不存在时已是空数组
  }
  if (warnErrors.length === 0) {
    L('  （无 warn/error 记录，或运行版本 < v4.11.16）');
  } else {
    warnErrors.forEach(e => {
      const t    = new Date(e.timestamp).toLocaleString('zh-CN');
      const flag = e.level === 'error' ? '[ERR]' : '[WRN]';
      const ctx  = e.context ? `[${e.context}]` : '';
      const p    = e.payload ? ' ' + JSON.stringify(e.payload) : '';
      L(`  ${flag} ${t}  ${ctx} ${e.message}${p}`);
    });
  }

  L('');
  L('══════════ 诊断结束 ══════════');
  L('将此输出完整复制发给我即可。');
})().catch(e => console.error('网络日志脚本执行失败:', e.message));
