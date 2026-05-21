/**
 * App Events æ—¥å¿—è¯Šæ–­è„šæœ¬
 * ç”¨é€”ï¼šæŸ¥çœ‹ã€è¿‡æ»¤ã€åˆ†æžåº”ç”¨äº‹ä»¶æ—¥å¿—
 * ä½¿ç”¨ï¼šç²˜è´´åˆ°æµè§ˆå™¨ F12 > Console ä¸­æ‰§è¡Œ
 *
 * ç»éªŒæ€»ç»“ï¼ˆ2026-05-21ï¼‰ï¼š
 * 1. logAppEvent() åªå†™ IndexedDBï¼Œä¸ç«‹å³ä¸Šä¼ 
 * 2. æ—¥å¿—éœ€è¦é€šè¿‡ syncAppEvents() ä¸Šä¼ åˆ° Supabaseï¼ˆæ‰‹åŠ¨è°ƒç”¨æˆ–åŒæ­¥æ—¶è‡ªåŠ¨ï¼‰
 * 3. ä¸Šä¼ æˆåŠŸåŽåº”æ ‡è®° synced_atï¼Œä½†æœ‰æ—¶æ ‡è®°å¯èƒ½ä¸æŒä¹…åŒ–ï¼ˆIndexedDB äº‹åŠ¡æ—¶åºé—®é¢˜ï¼‰
 * 4. æŸ¥çœ‹ sync_done æ—¥å¿—ä¸­çš„ stats.events å¯ä»¥éªŒè¯ä¸Šä¼ æ•°é‡
 */

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// 1. æŸ¥çœ‹æ‰€æœ‰æ—¥å¿—ï¼ˆåˆ†é¡µæ˜¾ç¤ºï¼‰
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
async function showAllAppEvents() {
  const db = await new Promise((resolve, reject) => {
    const req = indexedDB.open('yihai_srs', 6);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

  const tx = db.transaction('app_events', 'readonly');
  const logs = await new Promise((resolve, reject) => {
    const req = tx.objectStore('app_events').getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

  console.log(`ðŸ“‹ Total events: ${logs.length}`);
  console.table(logs.map(log => ({
    'ID': log.event_id.substring(0, 15),
    'æ—¶é—´': new Date(log.timestamp).toLocaleTimeString('zh-CN'),
    'äº‹ä»¶': log.event_type,
    'ç‰Œç»„': log.deck_key || '-',
    'è®¾å¤‡': (log.device_id || '').substring(0, 10),
    'ä¸Šä¼ ': log.synced_at ? 'âœ…' : 'â³'
  })));
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// 2. æŸ¥çœ‹æœªä¸Šä¼ çš„æ—¥å¿—
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
async function showUnsyncedEvents() {
  const db = await new Promise((resolve, reject) => {
    const req = indexedDB.open('yihai_srs', 6);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

  const tx = db.transaction('app_events', 'readonly');
  const logs = await new Promise((resolve, reject) => {
    const req = tx.objectStore('app_events').getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

  const unsynced = logs.filter(log => !log.synced_at).sort((a, b) => a.timestamp - b.timestamp);

  console.log(`\nðŸ“Š æœªä¸Šä¼ æ—¥å¿—ç»Ÿè®¡\n${'='.repeat(60)}`);
  console.log(`æ€»æ•°: ${unsynced.length} æ¡\n`);

  // æŒ‰äº‹ä»¶ç±»åž‹åˆ†ç»„ç»Ÿè®¡
  const grouped = {};
  unsynced.forEach(log => {
    if (!grouped[log.event_type]) grouped[log.event_type] = [];
    grouped[log.event_type].push(log);
  });

  console.log('æŒ‰ç±»åž‹åˆ†å¸ƒ:');
  Object.entries(grouped).sort((a, b) => b[1].length - a[1].length).forEach(([type, items]) => {
    console.log(`  ${type}: ${items.length} æ¡`);
  });

  console.log(`\nè¯¦ç»†åˆ—è¡¨:\n${'='.repeat(60)}`);
  console.table(unsynced.map(log => ({
    'æ—¶é—´': new Date(log.timestamp).toLocaleTimeString('zh-CN'),
    'äº‹ä»¶': log.event_type,
    'ç‰Œç»„': log.deck_key || '-',
    'è®¾å¤‡': (log.device_id || '').substring(0, 10),
    'æ•°æ®': JSON.stringify(log.payload).substring(0, 30)
  })));

  console.log(`\nðŸ’¾ æ€»è®¡: ${unsynced.length} æ¡æ—¥å¿—å¾…ä¸Šä¼ `);
  if (unsynced.length > 0) {
    console.log('ä¸Šä¼ å‘½ä»¤: await syncAppEvents()');
  }
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// 3. æŸ¥çœ‹åŒæ­¥åŽ†å²ï¼ˆsync_done æ—¥å¿—ç»Ÿè®¡ï¼‰
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
async function showSyncHistory() {
  const db = await new Promise((resolve, reject) => {
    const req = indexedDB.open('yihai_srs', 6);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

  const tx = db.transaction('app_events', 'readonly');
  const logs = await new Promise((resolve, reject) => {
    const req = tx.objectStore('app_events').getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

  const syncDones = logs.filter(l => l.event_type === 'sync_done').sort((a, b) => a.timestamp - b.timestamp);

  console.log(`\nðŸ“ˆ åŒæ­¥åŽ†å² (${syncDones.length} æ¬¡)\n${'='.repeat(70)}`);

  const stats = {};
  syncDones.forEach((log, i) => {
    const time = new Date(log.timestamp).toLocaleTimeString('zh-CN');
    const { trials, events, states_merged, config, decks } = log.payload.stats || {};
    console.log(`[${i}] ${time} | ç­”é¢˜:${trials} æ—¥å¿—:${events} å¡çŠ¶æ€åˆå¹¶:${states_merged} é…ç½®:${config} ç‰Œç»„:${decks}`);
  });

  const totalEvents = syncDones.reduce((sum, log) => sum + (log.payload.stats?.events || 0), 0);
  console.log(`\næ€»ä¸Šä¼ æ—¥å¿—æ•°: ${totalEvents}`);
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// 4. æŸ¥çœ‹ç‰¹å®šäº‹ä»¶ç±»åž‹çš„æ—¥å¿—
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
async function filterEventsByType(eventType) {
  const db = await new Promise((resolve, reject) => {
    const req = indexedDB.open('yihai_srs', 6);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

  const tx = db.transaction('app_events', 'readonly');
  const logs = await new Promise((resolve, reject) => {
    const req = tx.objectStore('app_events').getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

  const filtered = logs.filter(log => log.event_type.includes(eventType)).sort((a, b) => a.timestamp - b.timestamp);

  console.log(`\nðŸ” äº‹ä»¶ç±»åž‹: "${eventType}" (${filtered.length} æ¡)\n${'='.repeat(70)}`);
  console.table(filtered.map(log => ({
    'æ—¶é—´': new Date(log.timestamp).toLocaleTimeString('zh-CN'),
    'äº‹ä»¶': log.event_type,
    'ç‰Œç»„': log.deck_key || '-',
    'ä¸Šä¼ ': log.synced_at ? 'âœ…' : 'â³',
    'æ•°æ®': JSON.stringify(log.payload)
  })));
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// 5. æŸ¥çœ‹ä»Šå¤©çš„æ—¥å¿—
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
async function showTodayEvents() {
  const db = await new Promise((resolve, reject) => {
    const req = indexedDB.open('yihai_srs', 6);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

  const tx = db.transaction('app_events', 'readonly');
  const logs = await new Promise((resolve, reject) => {
    const req = tx.objectStore('app_events').getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayTs = today.getTime();

  const todayLogs = logs.filter(log => log.timestamp >= todayTs).sort((a, b) => a.timestamp - b.timestamp);

  console.log(`\nðŸ“… ä»Šå¤©çš„æ—¥å¿— (${todayLogs.length} æ¡)\n${'='.repeat(70)}`);
  console.log(`æ—¥æœŸ: ${today.toLocaleDateString('zh-CN')}`);
  console.table(todayLogs.map(log => ({
    'æ—¶é—´': new Date(log.timestamp).toLocaleTimeString('zh-CN'),
    'äº‹ä»¶': log.event_type,
    'ç‰Œç»„': log.deck_key || '-',
    'ä¸Šä¼ ': log.synced_at ? 'âœ…' : 'â³'
  })));
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// 6. ç»Ÿè®¡ä¿¡æ¯
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
async function showEventStats() {
  const db = await new Promise((resolve, reject) => {
    const req = indexedDB.open('yihai_srs', 6);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

  const tx = db.transaction('app_events', 'readonly');
  const logs = await new Promise((resolve, reject) => {
    const req = tx.objectStore('app_events').getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

  const synced = logs.filter(log => log.synced_at).length;
  const unsynced = logs.filter(log => !log.synced_at).length;

  const typeCount = {};
  logs.forEach(log => {
    typeCount[log.event_type] = (typeCount[log.event_type] || 0) + 1;
  });

  console.log(`\nðŸ“Š æ—¥å¿—ç»Ÿè®¡\n${'='.repeat(60)}`);
  console.log(`æ€»æ•°: ${logs.length}`);
  console.log(`âœ… å·²ä¸Šä¼ : ${synced}`);
  console.log(`â³ å¾…ä¸Šä¼ : ${unsynced}`);
  console.log(`\näº‹ä»¶ç±»åž‹åˆ†å¸ƒ:`);
  Object.entries(typeCount).sort((a, b) => b[1] - a[1]).forEach(([type, count]) => {
    console.log(`  ${type}: ${count}`);
  });
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// å¿«é€Ÿå‘½ä»¤å‚è€ƒ
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
console.log(`
âœ… å¿«é€Ÿè¯Šæ–­å‘½ä»¤ï¼š

showAllAppEvents()           // æ˜¾ç¤ºæ‰€æœ‰æ—¥å¿—
showUnsyncedEvents()          // æ˜¾ç¤ºæœªä¸Šä¼ çš„æ—¥å¿—ï¼ˆé‡ç‚¹ï¼‰
showSyncHistory()             // æ˜¾ç¤ºåŒæ­¥åŽ†å²ç»Ÿè®¡
filterEventsByType('session') // æŒ‰ç±»åž‹è¿‡æ»¤ï¼ˆå¦‚: session_restoreï¼‰
showTodayEvents()             // æ˜¾ç¤ºä»Šå¤©çš„æ—¥å¿—
showEventStats()              // æ˜¾ç¤ºç»Ÿè®¡ä¿¡æ¯
await syncAppEvents()         // æ‰‹åŠ¨ä¸Šä¼ å¾…åŒæ­¥æ—¥å¿—

ä¾‹å¦‚: filterEventsByType('session_restore')
`);

