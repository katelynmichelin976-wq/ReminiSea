(async function() {
  var db = await new Promise(function(res, rej) {
    var r = indexedDB.open('yihai_srs', 6);
    r.onsuccess = function(e) { res(e.target.result); };
    r.onerror   = function(e) { rej(e.target.error); };
  });
  var events = await new Promise(function(res) {
    var tx = db.transaction('app_events', 'readonly');
    tx.objectStore('app_events').getAll().onsuccess = function(e) { res(e.target.result); };
  });
  db.close();

  var SESSION_TYPES = {
    'session_restore_start':1,'session_restore_l1_ok':1,'session_restore_l1_fail':1,
    'session_restore_l2_ok':1,'session_restore_l2_offline':1,'session_restore_l2_real_logout':1,
    'session_restore_l3_ok':1,'session_restore_l3_fail':1,'session_restore_offline_fallback':1,
    'session_restore_catch':1,'session_restore_token_refreshed':1,'session_restore_sdk_signout':1,
    'login':1,'logout':1,'sync_started':1,'sync_done':1
  };

  var cutoff = Date.now() - 24 * 60 * 60 * 1000;
  var filtered = events
    .filter(function(e) { return SESSION_TYPES[e.event_type] && e.timestamp >= cutoff; })
    .sort(function(a, b) { return a.timestamp - b.timestamp; });

  console.log('====== session/sync 日志（最近 24h，共 ' + filtered.length + ' 条）======');
  filtered.forEach(function(e) {
    var t = new Date(e.timestamp).toLocaleTimeString('zh-CN');
    var p = e.payload ? JSON.stringify(e.payload) : '';
    var ok   = e.event_type.indexOf('ok') >= 0 || e.event_type === 'login' || e.event_type === 'sync_done';
    var fail = e.event_type.indexOf('fail') >= 0 || e.event_type.indexOf('offline') >= 0 || e.event_type.indexOf('catch') >= 0;
    var flag = ok ? '[OK]' : fail ? '[!!]' : '[  ]';
    console.log(flag + ' ' + t + '  ' + e.event_type + '  ' + p);
  });
  console.log('====== 结束 ======');
})();
