// 查询妈妈账号当日卡片状态，模拟三种练习模式出牌顺序
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL      = 'https://juzkonrzfyvchqxzmlpr.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_gKEnRcaiEI9eP00jJivbOA_xQ2Z1cCD';
const EMAIL    = 'chenlian@263.net';
const PASSWORD = '896896';

const TODAY = new Date().toISOString().slice(0, 10);
const NOW   = Date.now();

// ── 与 app 相同的难度算法 ────────────────────────────────────────
function difficultyScore(s) {
  const efScore    = Math.max(0, 2.5 - (s.ease_factor || 2.5));
  const lapseScore = Math.min(s.lapses_total || 0, 20) / 20;
  const stagBonus  = (s.srs_stage === 'relearning' || s.srs_stage === 'learning') ? 0.5 : 0;
  return efScore + lapseScore + stagBonus;
}

function applyCurve(list) {
  if (list.length < 4) return list;
  const sorted = [...list].sort((a, b) => difficultyScore(a) - difficultyScore(b));
  const result = new Array(sorted.length);
  let lo = 0, hi = sorted.length - 1;
  for (let i = 0; i < sorted.length; i++) {
    if (i % 2 === 0) result[lo++] = sorted[i];
    else             result[hi--] = sorted[i];
  }
  return result;
}

function isDue(s) {
  if (s.suspended) return false;
  if (s.srs_stage === 'review')     return s.due_date && s.due_date <= TODAY;
  if (s.srs_stage === 'relearning') return s.due_ts   && s.due_ts   <= NOW;
  if (s.srs_stage === 'learning')   return s.due_ts   && s.due_ts   <= NOW;
  return false;
}

function byDue(a, b) {
  return (a.due_date || '').localeCompare(b.due_date || '') ||
         (a.due_ts || 0) - (b.due_ts || 0);
}

function printQueue(label, queue, maxRows = 30) {
  console.log(`\n${'─'.repeat(50)}`);
  console.log(`${label}  (${queue.length} 张)`);
  console.log(`${'─'.repeat(50)}`);
  console.log(`  #   难度    ef     lapses  stage       名称`);
  const show = queue.slice(0, maxRows);
  show.forEach((s, i) => {
    const diff  = difficultyScore(s).toFixed(2);
    const ef    = (s.ease_factor || 2.5).toFixed(2);
    const lap   = String(s.lapses_total || 0).padStart(2);
    const stage = s.srs_stage.padEnd(11);
    const name  = (s.name || s.card_id || '').slice(0, 20);
    console.log(`  ${String(i+1).padStart(2)}  ${diff}  ${ef}  ${lap}      ${stage} ${name}`);
  });
  if (queue.length > maxRows) console.log(`  ... 还有 ${queue.length - maxRows} 张`);
}

(async () => {
  const c = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { error: authErr } = await c.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
  if (authErr) { console.error('登录失败:', authErr.message); process.exit(1); }

  // 拉 CardState
  const { data: states, error: stErr } = await c.from('sync_card_states').select('*');
  if (stErr) { console.error('查询失败:', stErr.message); process.exit(1); }

  // 拉卡片名称（cards_pool）
  const { data: pool } = await c.from('cards_pool').select('card_id, card_name');
  const nameMap = {};
  if (pool) pool.forEach(p => { nameMap[p.card_id] = p.card_name; });

  // 合并名称
  const cards = states.map(s => ({ ...s, name: nameMap[s.card_id] || s.card_id }));

  // 统计概况
  const due    = cards.filter(isDue);
  const newC   = cards.filter(s => !s.suspended && s.srs_stage === 'new');
  const susp   = cards.filter(s => s.suspended);
  const review = cards.filter(s => !s.suspended && s.srs_stage === 'review');

  console.log(`\n${'═'.repeat(50)}`);
  console.log(`  妈妈账号卡片状态  (${TODAY})`);
  console.log(`${'═'.repeat(50)}`);
  console.log(`  总卡片:   ${cards.length}`);
  console.log(`  到期今天: ${due.length}  (review到期: ${cards.filter(s=>!s.suspended&&s.srs_stage==='review'&&s.due_date<=TODAY).length})`);
  console.log(`  新卡:     ${newC.length}`);
  console.log(`  挂起:     ${susp.length}`);
  console.log(`  review阶段ef分布:`);
  const efBuckets = { '≥2.3':0, '1.8-2.3':0, '1.3-1.8':0, '<1.3':0 };
  review.forEach(s => {
    const ef = s.ease_factor || 2.5;
    if (ef >= 2.3)      efBuckets['≥2.3']++;
    else if (ef >= 1.8) efBuckets['1.8-2.3']++;
    else if (ef >= 1.3) efBuckets['1.3-1.8']++;
    else                efBuckets['<1.3']++;
  });
  Object.entries(efBuckets).forEach(([k,v]) => console.log(`    ef ${k}: ${v} 张`));

  // ── 生存模式：全量到期卡 + 曲线 ──────────────────────────────
  const survivalQueue = applyCurve([...due].sort(byDue));
  printQueue('🔴 生存模式（全量积压）', survivalQueue);

  // ── 困难模式：前30张 + 曲线 ──────────────────────────────────
  const hardBase  = [...due].sort(byDue).slice(0, 30);
  const hardQueue = applyCurve(hardBase);
  printQueue('🟡 困难模式（≤30张）', hardQueue);

  // ── 普通模式：hard≤35%，共20张 + 曲线 ────────────────────────
  const SESSION_SIZE = 20;
  const HARD_RATIO   = 0.25;
  const hardCap = Math.floor(SESSION_SIZE * HARD_RATIO);
  const hardDue = due.filter(s => difficultyScore(s) >= 0.4).sort(byDue);
  const easyDue = due.filter(s => difficultyScore(s) <  0.4).sort(byDue);
  const selHard = hardDue.slice(0, hardCap);
  const selEasy = easyDue.slice(0, SESSION_SIZE - selHard.length);
  const selNew  = newC.slice(0, Math.max(0, SESSION_SIZE - selHard.length - selEasy.length));
  const normalQueue = applyCurve([...selEasy, ...selHard, ...selNew]);
  printQueue('🟢 普通模式（≤20张，hard≤35%）', normalQueue);

  console.log(`\n${'═'.repeat(50)}`);
  console.log('  验证提示');
  console.log(`${'═'.repeat(50)}`);
  console.log('  1. 打开 app → 设置 → 通用 → 选对应模式');
  console.log('  2. 点「练习」，观察前几张和后几张是否为上表中的"容易"卡');
  console.log('  3. 中间出现的应是 ef 最低 / lapses 最多的卡');
  console.log('  注：首尾 ef 应 > 中间 ef\n');

  await c.auth.signOut();
})();
