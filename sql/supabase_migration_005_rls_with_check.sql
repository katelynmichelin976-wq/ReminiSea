-- ═══════════════════════════════════════════
-- Migration 005: RLS policies add explicit WITH CHECK
--
-- 背景：sync_card_states 的上传（upsert）时出现
--   "new row violates row-level security policy"
-- 虽然 FOR ALL USING 应默认下推 WITH CHECK，
-- 但 upsert 场景需显式声明。
-- ═══════════════════════════════════════════

drop policy if exists "individual_access" on sync_trials;
create policy "individual_access" on sync_trials
  for all using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "individual_access" on sync_card_states;
create policy "individual_access" on sync_card_states
  for all using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
