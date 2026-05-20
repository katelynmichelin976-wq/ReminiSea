// 模拟普通模式 applyNormalMode + applyCurve，输出预期出题顺序
import { createClient } from '@supabase/supabase-js';
const c = createClient('https://juzkonrzfyvchqxzmlpr.supabase.co', 'sb_publishable_gKEnRcaiEI9eP00jJivbOA_xQ2Z1cCD');
const { error: ae } = await c.auth.signInWithPassword({ email: 'chenlian@263.net', password: '896896' });
if (ae) { console.error('auth fail:', ae.message); process.exit(1); }

// 中国今日日期
const chinaOffset = 8 * 3600 * 1000;
const chinaDate = new Date(Date.now() + chinaOffset).toISOString().slice(0, 10);
const now = Date.now();
console.log('中国今日日期:', chinaDate, '  Unix now:', now);

// 获取全量 card states
const { data: states, error: se } = await c.from('sync_card_states')
  .select('card_id, ease_factor, srs_stage, lapses_total, due_date, due_ts, suspended');
if (se) { console.error('states error:', se.message); process.exit(1); }

// 获取卡片名
const cardIds = states.map(s => s.card_id);
const { data: pool } = await c.from('cards_pool').select('card_id, card_name').in('card_id', cardIds);
const nameMap = {};
pool?.forEach(p => { nameMap[p.card_id] = p.card_name; });

// 过滤到期卡（不含 suspended / 已排除）
const due = states.filter(s => {
  if (s.suspended) return false;
  if (s.srs_stage === 'review')     return s.due_date && s.due_date <= chinaDate;
  if (s.srs_stage === 'relearning') return s.due_ts && s.due_ts <= now;
  if (s.srs_stage === 'learning')   return s.due_ts && s.due_ts <= now;
  return false;
});

console.log('\n到期卡总数:', due.length);

// difficultyScore（修复后：使用 lapses_total）
function difficultyScore(s) {
  if (!s) return 0;
  const efScore    = Math.max(0, 2.5 - (s.ease_factor || 2.5));
  const lapseScore = Math.min(s.lapses_total || 0, 20) / 20;
  const stagBonus  = (s.srs_stage === 'relearning' || s.srs_stage === 'learning') ? 0.5 : 0;
  return efScore + lapseScore + stagBonus;
}

// applyNormalMode 选牌（SESSION_SIZE=20, HARD_RATIO=0.25）
const SESSION_SIZE = 20;
const HARD_RATIO   = 0.25;
const hardCap      = Math.floor(SESSION_SIZE * HARD_RATIO); // 5

const byDue = (a, b) =>
  (a.due_date || '').localeCompare(b.due_date || '') ||
  (a.due_ts || 0) - (b.due_ts || 0);

const hard = due.filter(s => difficultyScore(s) >= 0.4).sort(byDue);
const easy = due.filter(s => difficultyScore(s) <  0.4).sort(byDue);

const selHard = hard.slice(0, hardCap);
const selEasy = easy.slice(0, SESSION_SIZE - selHard.length);
const selected = [...selEasy, ...selHard];

console.log(`hard(ds≥0.4): ${hard.length} 张，选 ${selHard.length} 张`);
console.log(`easy(ds<0.4): ${easy.length} 张，选 ${selEasy.length} 张`);
console.log(`总选牌: ${selected.length} 张`);

// applyCurve（升序 sort，i%2偶→lo++，奇→hi--）
const sorted = [...selected].sort((a, b) => difficultyScore(a) - difficultyScore(b));
const result = new Array(sorted.length);
let lo = 0, hi = sorted.length - 1;
for (let i = 0; i < sorted.length; i++) {
  if (i % 2 === 0) result[lo++] = sorted[i];
  else             result[hi--] = sorted[i];
}

console.log('\n── 普通模式预期出题顺序（applyCurve 后）──');
console.log('  位置  卡名              ef     stage       ds      due_date');
result.forEach((s, i) => {
  const name  = (nameMap[s.card_id] || s.card_id).slice(0, 16).padEnd(16);
  const pos   = String(i + 1).padStart(2);
  const ef    = (s.ease_factor || 2.5).toFixed(2);
  const stage = (s.srs_stage || '').padEnd(10);
  const ds    = difficultyScore(s).toFixed(3);
  const dueStr = s.due_date || (s.due_ts ? new Date(s.due_ts + chinaOffset).toISOString().slice(0,16).replace('T',' ') : '?');
  console.log(`  ${pos}    ${name}  ${ef}  ${stage}  ${ds}  ${dueStr}`);
});

// 补充：未入选但到期的卡
if (hard.length > hardCap) {
  console.log('\n⚠ hard 卡超过上限，以下到期 hard 卡本次未入队:');
  hard.slice(hardCap).forEach(s => {
    console.log(`  ${(nameMap[s.card_id]||s.card_id).slice(0,16).padEnd(16)}  ds=${difficultyScore(s).toFixed(3)}`);
  });
}

await c.auth.signOut();
