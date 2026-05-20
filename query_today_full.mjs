import { createClient } from '@supabase/supabase-js';
const c = createClient('https://juzkonrzfyvchqxzmlpr.supabase.co', 'sb_publishable_gKEnRcaiEI9eP00jJivbOA_xQ2Z1cCD');
await c.auth.signInWithPassword({ email: 'chenlian@263.net', password: '896896' });

// 中国今日 00:00 对应的 UTC epoch（UTC+8，今日 = 昨日16:00 UTC）
const chinaDate = new Date(Date.now() + 8*3600*1000).toISOString().slice(0,10);
const chinaToday0h = new Date(chinaDate + 'T00:00:00+08:00').getTime();
console.log('中国今日:', chinaDate, '对应 epoch:', chinaToday0h);

// 无 limit，按 timestamp 升序（出题顺序）
const { data: trials, error } = await c
  .from('sync_trials')
  .select('trial_id, card_id, rating, timestamp, app_version')
  .gte('timestamp', chinaToday0h)
  .order('timestamp', { ascending: true });

if (error) { console.error(error.message); process.exit(1); }

const { data: pool } = await c.from('cards_pool').select('card_id, card_name');
const nameMap = {};
pool?.forEach(p => { nameMap[p.card_id] = p.card_name; });

console.log('\n今日 sync_trials 总计:', trials?.length, '条');
console.log('\n── 出题顺序（升序）──');
const uniqueCards = new Set();
trials?.forEach((t, i) => {
  const isFirst = !uniqueCards.has(t.card_id);
  if (isFirst) uniqueCards.add(t.card_id);
  const ts = new Date(t.timestamp).toISOString().slice(11,19);
  const name = (nameMap[t.card_id]||t.card_id).slice(0,10).padEnd(10);
  const mark = isFirst ? '  ' : '↩ ';
  console.log(`  ${String(i+1).padStart(2)}  ${ts}  ${mark}${name}  ${t.rating}`);
});

console.log('\n唯一卡数:', uniqueCards.size);

// 练习时长
if (trials?.length >= 2) {
  const start = trials[0].timestamp;
  const end   = trials[trials.length-1].timestamp;
  const mins  = Math.round((end - start) / 60000);
  const startCN = new Date(start + 8*3600*1000).toISOString().slice(11,19);
  const endCN   = new Date(end   + 8*3600*1000).toISOString().slice(11,19);
  console.log(`\n练习时间：${startCN}—${endCN}（中国时间），约 ${mins} 分钟`);
}

await c.auth.signOut();
