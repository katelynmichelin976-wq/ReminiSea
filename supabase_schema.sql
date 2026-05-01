-- ═══════════════════════════════════════════
-- 忆海拾光 · Supabase 数据库初始化
-- 在 Supabase SQL Editor 中执行此文件
-- ═══════════════════════════════════════════

-- 1. 卡池表（所有上传的原始卡片）
create table if not exists cards_pool (
  id            bigint generated always as identity primary key,
  card_id       text not null,            -- simpleHash(deckName + '::' + cardName)
  card_name     text not null,
  deck_name     text not null,            -- 来源牌组名（冗余，方便筛选）
  source_file   text not null,            -- 原始 .yhspack 文件名
  image_url     text,                     -- Storage 图片路径
  audio_url     text,                     -- Storage 录音路径
  category      text default '',          -- 用户自定义分类
  notes         text default '',          -- 用户备注
  created_at    timestamptz default now(),
  updated_at    timestamptz default now(),
  unique(card_id, deck_name, source_file) -- 防同一文件重复上传
);

create index if not exists idx_cards_pool_deck_name on cards_pool(deck_name);
create index if not exists idx_cards_pool_card_id on cards_pool(card_id);

-- 2. 服务端题库表
create table if not exists server_decks (
  id            text primary key,         -- simpleHash(name)
  name          text not null unique,
  description   text default '',
  card_count    integer default 0,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

-- 3. 题库-卡片关联表（多对多，含排序）
create table if not exists server_deck_cards (
  id            bigint generated always as identity primary key,
  deck_id       text not null references server_decks(id) on delete cascade,
  card_id       text not null,
  sort_order    integer default 0,
  added_at      timestamptz default now(),
  unique(deck_id, card_id)
);

create index if not exists idx_sdc_deck_id on server_deck_cards(deck_id);
create index if not exists idx_sdc_card_id on server_deck_cards(card_id);

-- 4. 上传日志
create table if not exists upload_log (
  id            bigint generated always as identity primary key,
  source_file   text not null,
  deck_name     text not null,
  card_count    integer not null,
  merge_rule    text not null,            -- 'local_first' | 'server_first' | 'keep_both'
  cards_added   integer default 0,
  cards_skipped integer default 0,
  uploaded_at   timestamptz default now()
);

-- 5. 训练端同步 — 答题记录
create table if not exists sync_trials (
  id                  bigint generated always as identity primary key,
  device_id           text not null,
  trial_id            text not null unique,
  card_id             text not null,
  deck_key            text not null,
  session_id          text not null,
  question_type       text not null,
  rating              text not null,
  is_correct          boolean,
  attempt_number      integer,
  options_shown       text[],
  correct_option      text,
  distractor_chosen   text,
  response_time_ms    integer,
  srs_stage_before    text,
  interval_before     integer,
  ease_before         real,
  lapses_streak_before integer,
  lapses_total_before  integer,
  review_mode_before  text,
  timestamp           bigint not null,
  synced_at           timestamptz default now(),
  created_at          timestamptz default now()
);

create index if not exists idx_sync_trials_device on sync_trials(device_id);
create index if not exists idx_sync_trials_timestamp on sync_trials(timestamp);

-- 6. 训练端同步 — SRS 状态
create table if not exists sync_card_states (
  id            bigint generated always as identity primary key,
  device_id     text not null,
  state_key     text not null,
  card_id       text not null,
  deck_key      text not null,
  srs_stage     text not null,
  interval      integer not null default 0,
  ease_factor   real not null default 2.5,
  due_date      text not null default '',
  due_ts        bigint not null default 0,
  step_index    integer not null default 0,
  review_mode   text not null default 'T1',
  lapses_streak integer not null default 0,
  lapses_total  integer not null default 0,
  suspended     boolean not null default false,
  updated_at    bigint not null,
  synced_at     timestamptz default now(),
  created_at    timestamptz default now(),
  unique(device_id, state_key)
);

-- ═══════════════════════════════════════════
-- RLS 策略（单用户，authenticated 角色全权限）
-- ═══════════════════════════════════════════

alter table cards_pool enable row level security;
alter table server_decks enable row level security;
alter table server_deck_cards enable row level security;
alter table upload_log enable row level security;
alter table sync_trials enable row level security;
alter table sync_card_states enable row level security;

create policy "authenticated_access" on cards_pool
  for all using (auth.role() = 'authenticated');

create policy "authenticated_access" on server_decks
  for all using (auth.role() = 'authenticated');

create policy "authenticated_access" on server_deck_cards
  for all using (auth.role() = 'authenticated');

create policy "authenticated_access" on upload_log
  for all using (auth.role() = 'authenticated');

create policy "authenticated_access" on sync_trials
  for all using (auth.role() = 'authenticated');

create policy "authenticated_access" on sync_card_states
  for all using (auth.role() = 'authenticated');
