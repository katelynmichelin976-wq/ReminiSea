const { createClient } = require('@supabase/supabase-js');
const SUPABASE_URL = 'https://juzkonrzfyvchqxzmlpr.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_gKEnRcaiEI9eP00jJivbOA_xQ2Z1cCD';

async function check(email, password, label) {
  const c = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  await c.auth.signInWithPassword({ email, password });
  const { data } = await c.from('sync_card_states').select('*');
  console.log(`\n${label} (${email}): ${data ? data.length : 0} 条 CardState`);
  if (data && data.length > 0) {
    const today = new Date().toISOString().slice(0, 10);
    const now = Date.now();
    let review = 0, learning = 0, relearning = 0, newS = 0, suspended = 0;
    let dueReview = 0, dueLearning = 0;
    data.forEach(s => {
      if (s.suspended) { suspended++; return; }
      if (s.srs_stage === 'new') { newS++; return; }
      if (s.srs_stage === 'review') {
        review++;
        if (s.due_date && s.due_date <= today) dueReview++;
      }
      if (s.srs_stage === 'learning' || s.srs_stage === 'relearning') {
        if (s.srs_stage === 'learning') learning++;
        else relearning++;
        if (s.due_ts && s.due_ts <= now) dueLearning++;
      }
    });
    const totalDue = dueReview + dueLearning;
    console.log(`  review: ${review}, learning: ${learning}, relearning: ${relearning}, new: ${newS}, suspend: ${suspended}`);
    console.log(`  到期(服务器计算): ${totalDue} (review到期:${dueReview}, learning到期:${dueLearning})`);
    // 也看下 config
    const { data: cfg } = await c.from('sync_config').select('*').maybeSingle();
    if (cfg) console.log(`  配置: ${JSON.stringify(cfg.config_json).slice(0, 200)}`);
    const { data: uds } = await c.from('user_deck_stats').select('*');
    if (uds) console.log(`  牌组统计: ${JSON.stringify(uds)}`);
  }
  await c.auth.signOut();
}

(async () => {
  await check('chenlian@263.net', '896896', '妈妈');
  await check('zyhacl@gmail.com', '667788', '测试');
  // 查多余那条
  const mom = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  await mom.auth.signInWithPassword({ email: 'chenlian@263.net', password: '896896' });
  const { data: momStates } = await mom.from('sync_card_states').select('card_id,deck_key,srs_stage,due_date');
  const momCardIds = new Set(momStates.map(s => s.card_id));
  const test = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  await test.auth.signInWithPassword({ email: 'zyhacl@gmail.com', password: '667788' });
  const { data: testStates } = await test.from('sync_card_states').select('card_id,deck_key,srs_stage,due_date');
  console.log('\n差异分析:');
  testStates.forEach(s => { if (!momCardIds.has(s.card_id)) console.log('  测试多出:', JSON.stringify(s)); });
  await mom.auth.signOut();
  await test.auth.signOut();
})();
