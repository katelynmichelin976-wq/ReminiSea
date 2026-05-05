// ═══════════════════════════════════════════════
// 从 yihai_app.html 抽取的 SRS 核心逻辑
// ═══════════════════════════════════════════════

const SRS_CONFIG = {
  learning_steps          : [1, 10],
  graduating_interval     : 1,
  easy_interval           : 2,
  relearning_steps        : [10],
  minimum_interval        : 1,
  new_interval            : 0.0,
  new_cards_per_day               : 5,
  maximum_reviews_per_day         : 50,
  maximum_interval        : 36500,
  starting_ease           : 2.50,
  easy_bonus              : 1.30,
  interval_modifier       : 1.00,
  hard_interval           : 1.20,
  ease_min                : 1.30,
  hard_step_multiplier    : 1.0,
  daily_remove_lapses     : 3,
  auto_suspend_lapses     : 8,
};

function todayStr(offsetDays = 0) {
  const d = new Date(Date.UTC(2026, 2, 28)); // March 28, 2026 UTC
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

function addDays(dateStr, n) {
  const p = dateStr.split('-').map(Number);
  const d = new Date(Date.UTC(p[0], p[1] - 1, p[2]));
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function minsToTs(mins) {
  return Math.round(mins * 60 * 1000);
}

function newCardState(deckKey, cardId) {
  return {
    state_key       : `${deckKey}::${cardId}`,
    card_id         : cardId,
    deck_key        : deckKey,
    srs_stage       : 'new',
    interval        : 0,
    ease_factor     : SRS_CONFIG.starting_ease,
    due_date        : '',
    due_ts          : 0,
    step_index      : 0,
    review_mode       : 'T1',
    review_mode_count : 0,
    lapses_streak   : 0,
    lapses_total    : 0,
    suspended       : false,
    suspended_reason: '',
  };
}

// now 参数化，方便测试控制时间
function processAnswer(state, rating, today, nowMs) {
  const now = nowMs || Date.now();
  const cfg = SRS_CONFIG;

  function _graduate(isEasy) {
    state.srs_stage         = 'review';
    state.interval          = isEasy ? cfg.easy_interval : cfg.graduating_interval;
    state.due_date          = addDays(today, state.interval);
    state.due_ts            = 0;
    state.step_index        = 0;
    state.review_mode       = 'T1';
    state.review_mode_count = 0;
  }

  if (state.srs_stage === 'new' || state.srs_stage === 'learning') {
    const steps = cfg.learning_steps;
    if (rating === 'again') {
      state.srs_stage  = 'learning';
      state.step_index = 0;
      state.due_ts     = now + minsToTs(steps[0]);
      state.lapses_streak++;
      state.lapses_total++;
    } else if (rating === 'hard') {
      state.srs_stage = 'learning';
      state.due_ts = now + minsToTs(steps[state.step_index] * cfg.hard_step_multiplier);
    } else if (rating === 'good') {
      state.lapses_streak = 0;
      state.step_index++;
      if (state.step_index >= steps.length) {
        _graduate(false);
      } else {
        state.srs_stage = 'learning';
        state.due_ts    = now + minsToTs(steps[state.step_index]);
      }
    } else if (rating === 'easy') {
      state.lapses_streak = 0;
      _graduate(true);
    }

  } else if (state.srs_stage === 'review') {
    if (rating === 'again') {
      state.lapses_streak++;
      state.lapses_total++;
      state.ease_factor = Math.max(cfg.ease_min, state.ease_factor - 0.20);
      state.interval  = Math.max(cfg.minimum_interval,
        Math.ceil(state.interval * cfg.new_interval * cfg.interval_modifier));
      state.srs_stage = 'relearning';
      state.step_index = 0;
      state.due_ts    = now + minsToTs(cfg.relearning_steps[0]);
      state.due_date  = '';
    } else if (rating === 'hard') {
      state.ease_factor = Math.max(cfg.ease_min, state.ease_factor - 0.15);
      state.interval = Math.min(cfg.maximum_interval,
        Math.max(cfg.minimum_interval,
          Math.ceil(state.interval * cfg.hard_interval * cfg.interval_modifier)));
      state.due_date = addDays(today, state.interval);
      state.due_ts   = 0;
    } else if (rating === 'good') {
      state.lapses_streak = 0;
      state.interval = Math.min(cfg.maximum_interval,
        Math.max(cfg.minimum_interval,
          Math.ceil(state.interval * state.ease_factor * cfg.interval_modifier)));
      state.due_date = addDays(today, state.interval);
      state.due_ts   = 0;
    } else if (rating === 'easy') {
      state.ease_factor = Math.min(3.0, state.ease_factor + 0.15);
      state.interval = Math.min(cfg.maximum_interval,
        Math.max(cfg.minimum_interval,
          Math.ceil(state.interval * state.ease_factor * cfg.easy_bonus * cfg.interval_modifier)));
      state.due_date = addDays(today, state.interval);
      state.due_ts   = 0;
    }

  } else if (state.srs_stage === 'relearning') {
    const steps = cfg.relearning_steps;
    if (rating === 'again') {
      state.step_index = 0;
      state.due_ts     = now + minsToTs(steps[0]);
      state.lapses_streak++;
      state.lapses_total++;
    } else if (rating === 'hard') {
      state.due_ts = now + minsToTs(steps[state.step_index] * cfg.hard_step_multiplier);
    } else {
      state.lapses_streak = 0;
      state.step_index++;
      if (state.step_index >= steps.length) {
        state.srs_stage  = 'review';
        state.interval   = Math.max(cfg.minimum_interval,
                           Math.min(state.interval, cfg.maximum_interval));
        state.due_date   = addDays(today, state.interval);
        state.due_ts     = 0;
        state.step_index = 0;
      } else {
        state.due_ts = now + minsToTs(steps[state.step_index]);
      }
    }
  }
  return state;
}

// ─── 测试工具 ───────────────────────────────────
let passed = 0, failed = 0;
const errors = [];

function check(label, actual, expected, tolerance) {
  const ok = tolerance !== undefined
    ? Math.abs(actual - expected) <= tolerance
    : actual === expected;
  if (ok) {
    passed++;
    console.log(`  ✓ ${label}: ${JSON.stringify(actual)}`);
  } else {
    failed++;
    const msg = `  ✗ ${label}: got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`;
    console.log(msg);
    errors.push(msg);
  }
}

function section(title) {
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  ${title}`);
  console.log('═'.repeat(60));
}

function clone(s) { return JSON.parse(JSON.stringify(s)); }

const NOW = new Date('2026-03-28T10:00:00').getTime();
const DAY = 86400 * 1000;
const MIN = 60 * 1000;
const TODAY = '2026-03-28';

// ═══════════════════════════════════════════════
// SUITE 1：新卡学习路径
// ═══════════════════════════════════════════════
section('SUITE 1 — 新卡学习路径（learning_steps=[1,10]）');

// 1-A: 新卡 → Good → 到步骤1（10分钟后）
{
  const s = newCardState('deck', 'c1');
  processAnswer(s, 'good', TODAY, NOW);
  check('1-A stage=learning', s.srs_stage, 'learning');
  check('1-A step_index=1', s.step_index, 1);
  check('1-A due_ts=now+10min', s.due_ts, NOW + 10 * MIN, 100);
  check('1-A lapses_streak=0', s.lapses_streak, 0);
}

// 1-B: 步骤1 → Good → 毕业
{
  const s = newCardState('deck', 'c1');
  processAnswer(s, 'good', TODAY, NOW);          // 步骤0→1
  processAnswer(s, 'good', TODAY, NOW + 10*MIN); // 步骤1→毕业
  check('1-B stage=review', s.srs_stage, 'review');
  check('1-B interval=1', s.interval, 1);
  check('1-B due_date=3/29', s.due_date, '2026-03-29');
  check('1-B ease_factor=2.50', s.ease_factor, 2.50);
  check('1-B step_index=0', s.step_index, 0);
}

// 1-C: 新卡 → Again → 退回步骤0
{
  const s = newCardState('deck', 'c1');
  processAnswer(s, 'again', TODAY, NOW);
  check('1-C stage=learning', s.srs_stage, 'learning');
  check('1-C step_index=0', s.step_index, 0);
  check('1-C due_ts=now+1min', s.due_ts, NOW + 1 * MIN, 100);
  check('1-C lapses_streak=1', s.lapses_streak, 1);
  check('1-C lapses_total=1', s.lapses_total, 1);
}

// 1-D: 新卡 → Again → Good → Good → 毕业（穿越重置再毕业）
{
  const s = newCardState('deck', 'c1');
  processAnswer(s, 'again', TODAY, NOW);
  processAnswer(s, 'good', TODAY, NOW + 1*MIN);   // 步骤0→1
  processAnswer(s, 'good', TODAY, NOW + 11*MIN);  // 步骤1→毕业
  check('1-D stage=review', s.srs_stage, 'review');
  check('1-D lapses_streak cleared', s.lapses_streak, 0);
  check('1-D lapses_total persists', s.lapses_total, 1);
}

// 1-E: 新卡 → Good → Hard（步骤不推进，等待时间=步骤1×1.0=10min）
{
  const s = newCardState('deck', 'c1');
  processAnswer(s, 'good', TODAY, NOW);   // 步骤0→1
  processAnswer(s, 'hard', TODAY, NOW + 10*MIN); // Hard at 步骤1
  check('1-E stage=learning', s.srs_stage, 'learning');
  check('1-E step_index still 1', s.step_index, 1);
  check('1-E due_ts=+10min', s.due_ts, NOW + 10*MIN + 10*MIN, 100);
}

// 1-F: Easy 直接毕业，interval=2
{
  const s = newCardState('deck', 'c1');
  processAnswer(s, 'easy', TODAY, NOW);
  check('1-F stage=review', s.srs_stage, 'review');
  check('1-F interval=2', s.interval, 2);
  check('1-F due_date=3/30', s.due_date, '2026-03-30');
}

// ═══════════════════════════════════════════════
// SUITE 2：Review 阶段
// ═══════════════════════════════════════════════
section('SUITE 2 — Review 阶段（起点 interval=1, ef=2.50）');

function makeReviewCard(interval, ef) {
  const s = newCardState('deck', 'c2');
  s.srs_stage   = 'review';
  s.interval    = interval;
  s.ease_factor = ef;
  s.due_date    = TODAY;
  return s;
}

// 2-A: Good，interval=1,ef=2.50
{
  const s = makeReviewCard(1, 2.50);
  processAnswer(s, 'good', TODAY, NOW);
  // ceil(1 × 2.50 × 1.00) = 3
  check('2-A interval=3', s.interval, 3);
  check('2-A due_date=3/31', s.due_date, '2026-03-31');
  check('2-A ef unchanged', s.ease_factor, 2.50);
}

// 2-B: Hard，interval=1,ef=2.50
{
  const s = makeReviewCard(1, 2.50);
  processAnswer(s, 'hard', TODAY, NOW);
  // ceil(1 × 1.20 × 1.00) = 2
  check('2-B interval=2', s.interval, 2);
  check('2-B due_date=3/30', s.due_date, '2026-03-30');
  check('2-B ef=2.35', s.ease_factor, 2.35);
}

// 2-C: Easy，interval=1,ef=2.50
{
  const s = makeReviewCard(1, 2.50);
  processAnswer(s, 'easy', TODAY, NOW);
  // ef_new = min(3.0, 2.50+0.15) = 2.65
  // ceil(1 × 2.65 × 1.30 × 1.00) = ceil(3.445) = 4
  check('2-C ef=2.65', s.ease_factor, 2.65);
  check('2-C interval=4', s.interval, 4);
  check('2-C due_date=4/01', s.due_date, '2026-04-01');
}

// 2-D: Again，interval=1,ef=2.50 → relearning
{
  const s = makeReviewCard(1, 2.50);
  processAnswer(s, 'again', TODAY, NOW);
  // new_interval=0.0 → ceil(1×0×1)=0 → max(1,0)=1
  check('2-D stage=relearning', s.srs_stage, 'relearning');
  check('2-D interval=1', s.interval, 1);
  check('2-D ef=2.30', s.ease_factor, 2.30);
  check('2-D due_ts=+10min', s.due_ts, NOW + 10*MIN, 100);
  check('2-D due_date cleared', s.due_date, '');
  check('2-D lapses_streak=1', s.lapses_streak, 1);
}

// 2-E: 连续 Good 多步验证 interval 增长
{
  const s = makeReviewCard(1, 2.50);
  const steps_expected = [
    // [interval_before, rating, expected_interval_after]
    [1, 'good', 3],   // ceil(1×2.50)=3 (起点1，但good后是ceil不是加1)
    // 注意：2-A已验证 interval=1 good→3
  ];
  // 多轮连续 Good
  processAnswer(s, 'good', TODAY, NOW);           // 1→3
  processAnswer(s, 'good', addDays(TODAY,3), NOW+3*DAY); // 3→ceil(3×2.50)=8
  check('2-E round2 interval=8', s.interval, 8);
  processAnswer(s, 'good', addDays(TODAY,11), NOW+11*DAY); // 8→ceil(8×2.50)=20
  check('2-E round3 interval=20', s.interval, 20);
}

// 2-F: 连续 Hard 压低 ef，验证 ef 下限 ease_min=1.30
{
  const s = makeReviewCard(3, 2.50);
  // 每次 Hard: ef -= 0.15
  for (let i = 0; i < 10; i++) {
    processAnswer(s, 'hard', TODAY, NOW);
    s.due_date = TODAY; // 重置日期方便连续测试
  }
  check('2-F ef floor=1.30', s.ease_factor, 1.30);
}

// 2-G: 验证截图数据（interval=3, ef=2.00）
{
  const s = makeReviewCard(3, 2.00);
  const sg = clone(s); processAnswer(sg, 'good', TODAY, NOW);
  // ceil(3 × 2.00 × 1.00) = 6
  check('2-G Good interval=6', sg.interval, 6);
  check('2-G Good date=04/03', sg.due_date, '2026-04-03');

  const sh = clone(s); processAnswer(sh, 'hard', TODAY, NOW);
  // ceil(3 × 1.20 × 1.00) = ceil(3.6) = 4
  check('2-G Hard interval=4', sh.interval, 4);
  check('2-G Hard date=04/01', sh.due_date, '2026-04-01');
  check('2-G Hard ef=1.85', sh.ease_factor, 1.85);

  const sa = clone(s); processAnswer(sa, 'again', TODAY, NOW);
  check('2-G Again stage=relearning', sa.srs_stage, 'relearning');
  check('2-G Again 10min', sa.due_ts, NOW + 10*MIN, 100);
}

// ═══════════════════════════════════════════════
// SUITE 3：Relearning 阶段
// ═══════════════════════════════════════════════
section('SUITE 3 — Relearning 阶段');

function makeRelearningCard(interval, ef) {
  const s = newCardState('deck', 'c3');
  s.srs_stage   = 'relearning';
  s.interval    = interval;
  s.ease_factor = ef;
  s.step_index  = 0;
  s.due_ts      = NOW;
  return s;
}

// 3-A: relearning Good → 重新毕业，保持 interval
{
  const s = makeRelearningCard(2, 2.20);
  processAnswer(s, 'good', TODAY, NOW);
  // step_index 0→1 >= relearning_steps.length(1) → 毕业
  check('3-A stage=review', s.srs_stage, 'review');
  check('3-A interval preserved=2', s.interval, 2);
  check('3-A due_date=3/30', s.due_date, '2026-03-30');
  check('3-A lapses_streak=0', s.lapses_streak, 0);
}

// 3-B: relearning Again → 退回步骤0
{
  const s = makeRelearningCard(2, 2.20);
  s.lapses_streak = 1;
  processAnswer(s, 'again', TODAY, NOW);
  check('3-B stage=relearning', s.srs_stage, 'relearning');
  check('3-B step_index=0', s.step_index, 0);
  check('3-B lapses_streak=2', s.lapses_streak, 2);
  check('3-B lapses_total=1', s.lapses_total, 1);
}

// 3-C: relearning Hard
{
  const s = makeRelearningCard(2, 2.20);
  processAnswer(s, 'hard', TODAY, NOW);
  // steps[0] × 1.0 = 10min
  check('3-C due_ts=+10min', s.due_ts, NOW + 10*MIN, 100);
  check('3-C step_index=0', s.step_index, 0);
}

// ═══════════════════════════════════════════════
// SUITE 4：保护机制
// ═══════════════════════════════════════════════
section('SUITE 4 — lapses 保护机制');

// 4-A: lapses_total 累计，lapses_streak 答对清零
{
  const s = makeReviewCard(3, 2.50);
  processAnswer(s, 'again', TODAY, NOW);  // total=1, streak=1
  s.srs_stage='review'; s.due_date=TODAY; // 模拟重学完成回来
  processAnswer(s, 'again', TODAY, NOW);  // total=2, streak=2
  s.srs_stage='review'; s.due_date=TODAY;
  processAnswer(s, 'good', TODAY, NOW);   // streak 清零
  check('4-A lapses_total=2', s.lapses_total, 2);
  check('4-A lapses_streak=0 after good', s.lapses_streak, 0);
}

// 4-B: 连续失败3次，streak=3 达到 daily_remove_lapses
{
  const s = makeReviewCard(3, 2.50);
  processAnswer(s, 'again', TODAY, NOW);
  s.srs_stage='review'; s.due_date=TODAY;
  processAnswer(s, 'again', TODAY, NOW);
  s.srs_stage='review'; s.due_date=TODAY;
  processAnswer(s, 'again', TODAY, NOW);
  check('4-B lapses_streak=3', s.lapses_streak, 3);
  check('4-B should trigger daily_remove', s.lapses_streak >= SRS_CONFIG.daily_remove_lapses, true);
}

// 4-C: ef 下限保护
{
  const s = makeReviewCard(1, 1.35);
  processAnswer(s, 'again', TODAY, NOW); // ef = max(1.30, 1.35-0.20) = 1.30
  check('4-C ef floors at 1.30', s.ease_factor, 1.30);
}

// 4-D: ef 上限 3.0
{
  const s = makeReviewCard(1, 2.95);
  processAnswer(s, 'easy', TODAY, NOW); // ef = min(3.0, 2.95+0.15) = 3.0
  check('4-D ef caps at 3.0', s.ease_factor, 3.0);
}

// ═══════════════════════════════════════════════
// SUITE 5：完整场景模拟（一张卡的全生命周期）
// ═══════════════════════════════════════════════
section('SUITE 5 — 完整生命周期模拟');

{
  const s = newCardState('deck', 'lifecycle');
  let t = NOW;
  const log = [];
  function step(rating, days=0) {
    t += days * DAY;
    const today = new Date('2026-03-28T00:00:00');
    today.setDate(today.getDate() + days);
    const todayS = today.toISOString().slice(0, 10);
    const before = `${s.srs_stage}[${s.step_index}] ef=${s.ease_factor.toFixed(2)} iv=${s.interval}`;
    processAnswer(s, rating, todayS, t);
    const after = `${s.srs_stage}[${s.step_index}] ef=${s.ease_factor.toFixed(2)} iv=${s.interval} due=${s.due_date||Math.round((s.due_ts-t)/MIN)+'min'}`;
    log.push(`  ${rating.padEnd(5)} | ${before.padEnd(35)} → ${after}`);
  }

  step('again');   // 新卡答错
  step('good');    // 退回0→答对→步骤0→1
  step('hard');    // 步骤1不推进
  step('good');    // 步骤1→毕业
  step('good',1);  // review Good: 1→3
  step('hard',3);  // review Hard: 3→4, ef-=0.15
  step('again',4); // review Again: →relearning
  step('good');    // relearning Good → 重新毕业
  step('good',2);  // review Good: interval保持值后继续
  step('again',0); // 连续失败
  step('again',0);
  step('again',0); // streak=3，触发 daily_remove 阈值

  console.log('\n  生命周期步骤日志：');
  log.forEach(l => console.log(l));

  check('lifecycle final lapses_streak=3', s.lapses_streak, 3);
  check('lifecycle lapses_total>=3', s.lapses_total >= 3, true);
  check('lifecycle srs_stage=relearning', s.srs_stage, 'relearning');
}

// ═══════════════════════════════════════════════
// 结果汇总
// ═══════════════════════════════════════════════
console.log('\n' + '═'.repeat(60));
console.log(`  结果：${passed} 通过  ${failed} 失败`);
if (errors.length) {
  console.log('\n  失败详情：');
  errors.forEach(e => console.log(e));
}
console.log('═'.repeat(60));
