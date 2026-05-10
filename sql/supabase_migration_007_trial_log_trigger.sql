-- Migration 007: TrialLog → CardState trigger
-- 前端不再直接写 sync_card_states，由 sync_trials INSERT 的 trigger 自动维护
-- 日期: 2026-05-10  版本: v4.9.1

begin;

-- 1. 新增字段：TrialLog 承载完整卡牌状态快照
alter table sync_trials
  add column if not exists due_ts             bigint not null default 0,
  add column if not exists due_date           text not null default '',
  add column if not exists suspended          boolean not null default false,
  add column if not exists suspended_reason   text not null default '';

-- 2. 兼容旧数据：从已存在的 sync_card_states 回填
update sync_trials t
set
  due_ts    = coalesce(s.due_ts, 0),
  due_date  = coalesce(s.due_date, ''),
  suspended = coalesce(s.suspended, false)
from sync_card_states s
where t.user_id = s.user_id
  and t.card_id = s.card_id
  and t.deck_key = s.deck_key
  and t.timestamp = (  -- 只更新每个 card 的最新 trial
    select max(t2.timestamp) from sync_trials t2
    where t2.user_id = t.user_id and t2.card_id = t.card_id and t2.deck_key = t.deck_key
  );

-- 3. 触发器：TrialLog INSERT → 自动 UPSERT sync_card_states
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
    device_id     = excluded.device_id
  where excluded.updated_at > sync_card_states.updated_at;  -- 只在新数据更新时覆盖

  return NEW;
end;
$$ language plpgsql;

drop trigger if exists trg_trial_to_card_state on sync_trials;
create trigger trg_trial_to_card_state
  after insert on sync_trials
  for each row
  execute function fn_trial_to_card_state();

commit;
