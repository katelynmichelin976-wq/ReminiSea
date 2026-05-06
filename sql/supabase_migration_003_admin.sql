-- ═══════════════════════════════════════════
-- Migration 003: 管理看板支持
-- 创建 admin_users 表 + 管理员查询所需性能索引
-- ═══════════════════════════════════════════

-- 1. 管理员用户表
-- 只有在此表中的用户才能调用管理 Edge Functions。
-- RLS 在此不适用，因为 Edge Functions 使用 service_role key；
-- 权限检查在每个 Edge Function 内部完成。
create table if not exists admin_users (
  id            bigint generated always as identity primary key,
  user_id       uuid not null references auth.users(id) on delete cascade,
  role          text not null default 'doctor',
                -- 'doctor' | 'caregiver' | 'superadmin'
  display_name  text not null,
  notes         text default '',
  created_at    timestamptz default now(),
  updated_at    timestamptz default now(),
  unique(user_id)
);

-- 2. sync_trials 增加 trial_date 生成列（按日期聚合查询的性能关键）
alter table sync_trials
  add column if not exists trial_date date
  generated always as (to_timestamp(timestamp::double precision / 1000)::date) stored;

-- 3. 管理查询性能索引
-- 重要：sync_trials 可能快速增长，管理查询主要按日期范围和 user_id 过滤

-- 按日期扫描（看板概览：今日/本周聚合）
create index if not exists idx_sync_trials_trial_date
  on sync_trials(trial_date);

-- 按用户+日期（患者详情：每日趋势，正确率计算）
create index if not exists idx_sync_trials_user_trial_date
  on sync_trials(user_id, trial_date);

-- 按用户+时间戳（最后活跃时间查询）
create index if not exists idx_sync_trials_user_timestamp
  on sync_trials(user_id, timestamp desc);

-- 卡片级聚合（困难卡片分析）
create index if not exists idx_sync_trials_card_deck
  on sync_trials(card_id, deck_key);

-- 按牌组查询患者状态
create index if not exists idx_sync_card_states_user_deck
  on sync_card_states(user_id, deck_key);

-- 仅查询挂起卡片（挂起卡片列表）
create index if not exists idx_sync_card_states_suspended
  on sync_card_states(suspended) where suspended = true;

-- 4. 管理查询辅助函数
-- 高效 COUNT(DISTINCT user_id) 用于看板概览
create or replace function count_distinct_user_ids(
  since_date date default current_date - interval '30 days',
  until_date date default current_date
)
returns integer
language sql
stable
as $$
  select count(distinct user_id)::integer
  from sync_trials
  where trial_date >= since_date and trial_date <= until_date;
$$;

-- 每日聚合查询：每个用户每张卡首次评分 + 复习量统计
-- 用于患者详情页的每日趋势
create or replace function get_patient_daily_stats(
  p_user_id uuid,
  since_date date default current_date - interval '30 days',
  until_date date default current_date
)
returns table(
  trial_date date,
  reviews bigint,
  first_good bigint,
  first_hard bigint,
  first_again bigint,
  avg_response_ms numeric,
  new_cards bigint
)
language sql
stable
as $$
  with first_ratings as (
    select distinct on (trial_date, card_id)
      trial_date, card_id, rating,
      response_time_ms,
      srs_stage_before
    from sync_trials
    where user_id = p_user_id
      and trial_date >= since_date
      and trial_date <= until_date
    order by trial_date, card_id, timestamp asc
  )
  select
    fr.trial_date,
    count(*)::bigint as reviews,
    count(*) filter (where fr.rating in ('good', 'easy'))::bigint as first_good,
    count(*) filter (where fr.rating = 'hard')::bigint as first_hard,
    count(*) filter (where fr.rating = 'again')::bigint as first_again,
    round(avg(fr.response_time_ms) filter (where fr.response_time_ms is not null))::numeric as avg_response_ms,
    count(*) filter (where fr.srs_stage_before = 'new')::bigint as new_cards
  from first_ratings fr
  group by fr.trial_date
  order by fr.trial_date asc;
$$;

-- 患者牌组分解统计
create or replace function get_patient_deck_stats(
  p_user_id uuid
)
returns table(
  deck_key text,
  total_reviews bigint,
  accuracy_pct numeric,
  cards_total bigint,
  cards_learning bigint,
  cards_mastered bigint,
  cards_suspended bigint
)
language sql
stable
as $$
  select
    cs.deck_key,
    coalesce(tr.review_count, 0)::bigint as total_reviews,
    coalesce(tr.accuracy, 0)::numeric as accuracy_pct,
    count(*)::bigint as cards_total,
    count(*) filter (
      where cs.srs_stage in ('learning', 'relearning') and not cs.suspended
    )::bigint as cards_learning,
    count(*) filter (
      where cs.srs_stage = 'review' and cs.interval >= 7 and not cs.suspended
    )::bigint as cards_mastered,
    count(*) filter (where cs.suspended)::bigint as cards_suspended
  from sync_card_states cs
  left join lateral (
    select
      count(*) as review_count,
      round(
        count(*) filter (where fr2.rating in ('good', 'easy')) * 100.0 /
        nullif(count(*), 0), 1
      ) as accuracy
    from (
      select distinct on (st.card_id) st.card_id, st.rating
      from sync_trials st
      where st.user_id = p_user_id
        and st.deck_key = cs.deck_key
      order by st.card_id, st.timestamp desc
    ) fr2
  ) tr on true
  where cs.user_id = p_user_id
  group by cs.deck_key, tr.review_count, tr.accuracy
  order by tr.review_count desc;
$$;

-- ═══════════════════════════════════════════
-- 插入第一个管理员
-- 用法：先在 App 中用医生邮箱注册，获得 user_id 后执行：
-- insert into admin_users (user_id, role, display_name)
-- values ('<auth.users.id>', 'doctor', '管理员姓名');
-- ═══════════════════════════════════════════
