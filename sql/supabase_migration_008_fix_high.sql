-- Migration 008: 修复两个 HIGH 问题
-- 1. RLS WITH CHECK 补全（sync_config / app_events / card_state_log / device_registry）
-- 2. 触发器 fn_trial_to_card_state：ON CONFLICT DO UPDATE 补全漏掉的 4 个字段
-- 日期: 2026-05-17

begin;

-- ── Part 1: RLS WITH CHECK ─────────────────────────────────────────
-- Migration 005 只修了 sync_trials / sync_card_states，以下四张表同类漏洞未修

drop policy if exists "individual_access" on sync_config;
create policy "individual_access" on sync_config
  for all using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "individual_access" on app_events;
create policy "individual_access" on app_events
  for all using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "individual_access" on card_state_log;
create policy "individual_access" on card_state_log
  for all using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "individual_access" on device_registry;
create policy "individual_access" on device_registry
  for all using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ── Part 2: 触发器修复 ─────────────────────────────────────────────
-- 原函数 ON CONFLICT DO UPDATE 遗漏了 lapses_streak / lapses_total /
-- step_index / review_mode，导致这四个字段在卡片第二次答题后永远不更新。
--
-- 注意：sync_trials 只存 _before 值，触发器写入的是答题前的快照（差一步）。
-- 根治需在 sync_trials 补存 _after 列，留待后续 migration。

create or replace function fn_trial_to_card_state()
returns trigger as $$
begin
  insert into sync_card_states (
    user_id, device_id, state_key, card_id, deck_key,
    srs_stage, interval, ease_factor,
    due_ts, due_date,
    step_index, review_mode,
    lapses_streak, lapses_total,
    suspended,
    updated_at, app_version
  ) values (
    NEW.user_id,
    NEW.device_id,
    NEW.deck_key || '::' || NEW.card_id,
    NEW.card_id,
    NEW.deck_key,
    NEW.srs_stage_after,
    NEW.interval_after,
    NEW.ease_after,
    NEW.due_ts,
    NEW.due_date,
    0,
    coalesce(NEW.review_mode_before, 'T1'),
    coalesce(NEW.lapses_streak_before, 0),
    coalesce(NEW.lapses_total_before, 0),
    NEW.suspended,
    NEW.timestamp,
    NEW.app_version
  )
  on conflict (user_id, state_key) do update set
    srs_stage     = excluded.srs_stage,
    interval      = excluded.interval,
    ease_factor   = excluded.ease_factor,
    due_ts        = excluded.due_ts,
    due_date      = excluded.due_date,
    suspended     = excluded.suspended,
    updated_at    = excluded.updated_at,
    app_version   = excluded.app_version,
    device_id     = excluded.device_id,
    lapses_streak = excluded.lapses_streak,
    lapses_total  = excluded.lapses_total,
    step_index    = excluded.step_index,
    review_mode   = excluded.review_mode
  where excluded.updated_at > sync_card_states.updated_at;

  return NEW;
end;
$$ language plpgsql;

commit;
