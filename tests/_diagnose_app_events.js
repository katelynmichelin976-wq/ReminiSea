/**
 * App Events diagnostic script.
 * Paste this file into the browser console to inspect app_events in IndexedDB.
 *
 * Notes:
 * 1. logAppEvent() only writes to IndexedDB and does not upload immediately.
 * 2. Events are uploaded by syncAppEvents(), either manually or during sync flows.
 * 3. synced_at should be written after a successful upload.
 * 4. sync_done payload.stats.events is the main upload-count sanity check.
 */

async function openAppEventsDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('yihai_srs', 6);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function readAllAppEvents() {
  const db = await openAppEventsDb();
  const tx = db.transaction('app_events', 'readonly');
  return new Promise((resolve, reject) => {
    const req = tx.objectStore('app_events').getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function formatTime(ts) {
  return new Date(ts).toLocaleTimeString('zh-CN');
}

function shortId(value, length) {
  return (value || '').substring(0, length);
}

async function showAllAppEvents() {
  const logs = await readAllAppEvents();
  console.log(`Total events: ${logs.length}`);
  console.table(logs.map((log) => ({
    id: shortId(log.event_id, 15),
    time: formatTime(log.timestamp),
    type: log.event_type,
    deck: log.deck_key || '-',
    device: shortId(log.device_id, 10),
    uploaded: log.synced_at ? 'yes' : 'pending',
  })));
}

async function showUnsyncedEvents() {
  const logs = await readAllAppEvents();
  const unsynced = logs.filter((log) => !log.synced_at).sort((a, b) => a.timestamp - b.timestamp);

  console.log(`\nUnsynced events\n${'='.repeat(60)}`);
  console.log(`Count: ${unsynced.length}\n`);

  const grouped = {};
  unsynced.forEach((log) => {
    grouped[log.event_type] = grouped[log.event_type] || [];
    grouped[log.event_type].push(log);
  });

  console.log('By type:');
  Object.entries(grouped)
    .sort((a, b) => b[1].length - a[1].length)
    .forEach(([type, items]) => console.log(`  ${type}: ${items.length}`));

  console.log(`\nDetails\n${'='.repeat(60)}`);
  console.table(unsynced.map((log) => ({
    time: formatTime(log.timestamp),
    type: log.event_type,
    deck: log.deck_key || '-',
    device: shortId(log.device_id, 10),
    payload: JSON.stringify(log.payload).substring(0, 30),
  })));

  console.log(`\nPending uploads: ${unsynced.length}`);
  if (unsynced.length > 0) console.log('Upload command: await syncAppEvents()');
}

async function showSyncHistory() {
  const logs = await readAllAppEvents();
  const syncDones = logs.filter((log) => log.event_type === 'sync_done').sort((a, b) => a.timestamp - b.timestamp);

  console.log(`\nSync history (${syncDones.length})\n${'='.repeat(70)}`);
  syncDones.forEach((log, index) => {
    const stats = log.payload.stats || {};
    console.log(
      `[${index}] ${formatTime(log.timestamp)} | trials:${stats.trials} events:${stats.events} states_merged:${stats.states_merged} config:${stats.config} decks:${stats.decks}`
    );
  });

  const totalEvents = syncDones.reduce((sum, log) => sum + (log.payload.stats?.events || 0), 0);
  console.log(`\nTotal uploaded events: ${totalEvents}`);
}

async function filterEventsByType(eventType) {
  const logs = await readAllAppEvents();
  const filtered = logs.filter((log) => log.event_type.includes(eventType)).sort((a, b) => a.timestamp - b.timestamp);

  console.log(`\nEvent type "${eventType}" (${filtered.length})\n${'='.repeat(70)}`);
  console.table(filtered.map((log) => ({
    time: formatTime(log.timestamp),
    type: log.event_type,
    deck: log.deck_key || '-',
    uploaded: log.synced_at ? 'yes' : 'pending',
    payload: JSON.stringify(log.payload),
  })));
}

async function showTodayEvents() {
  const logs = await readAllAppEvents();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayLogs = logs.filter((log) => log.timestamp >= today.getTime()).sort((a, b) => a.timestamp - b.timestamp);

  console.log(`\nToday events (${todayLogs.length})\n${'='.repeat(70)}`);
  console.log(`Date: ${today.toLocaleDateString('zh-CN')}`);
  console.table(todayLogs.map((log) => ({
    time: formatTime(log.timestamp),
    type: log.event_type,
    deck: log.deck_key || '-',
    uploaded: log.synced_at ? 'yes' : 'pending',
  })));
}

async function showEventStats() {
  const logs = await readAllAppEvents();
  const synced = logs.filter((log) => log.synced_at).length;
  const unsynced = logs.filter((log) => !log.synced_at).length;
  const typeCount = {};

  logs.forEach((log) => {
    typeCount[log.event_type] = (typeCount[log.event_type] || 0) + 1;
  });

  console.log(`\nEvent stats\n${'='.repeat(60)}`);
  console.log(`Total: ${logs.length}`);
  console.log(`Uploaded: ${synced}`);
  console.log(`Pending: ${unsynced}`);
  console.log('\nBy type:');
  Object.entries(typeCount)
    .sort((a, b) => b[1] - a[1])
    .forEach(([type, count]) => console.log(`  ${type}: ${count}`));
}

console.log(`
Quick commands:

showAllAppEvents()            // list all events
showUnsyncedEvents()          // list unsynced events
showSyncHistory()             // summarize sync_done history
filterEventsByType('session') // filter by type substring
showTodayEvents()             // show today's events
showEventStats()              // summarize counts
await syncAppEvents()         // manually upload pending events
`);
