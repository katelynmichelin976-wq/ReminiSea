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
  user_id             uuid not null references auth.users(id) on delete cascade,
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
  srs_stage_after     text,
  interval_after      integer,
  ease_after          real,
  timestamp           bigint not null,
  synced_at           timestamptz default now(),
  created_at          timestamptz default now(),
  device_info         jsonb default null,
  app_version         text not null default ''
);

create index if not exists idx_sync_trials_user on sync_trials(user_id);
create index if not exists idx_sync_trials_timestamp on sync_trials(timestamp);

-- ═══════════════════════════════════════════
-- 已删除的遗留表（v4.7 清理）
-- card_srs_state, sync_session, training_records
-- 这三张表是早期遗留，RLS 策略为 USING(true)，已删除
-- ═══════════════════════════════════════════

-- 6. 训练端同步 — SRS 状态
create table if not exists sync_card_states (
  id            bigint generated always as identity primary key,
  user_id       uuid not null references auth.users(id) on delete cascade,
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
  app_version   text not null default '',
  unique(user_id, state_key)
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

create policy "individual_access" on sync_trials
  for all using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "individual_access" on sync_card_states
  for all using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ═══════════════════════════════════════════
-- v4.8: 参数配置云端同步
-- ═══════════════════════════════════════════

create table if not exists sync_config (
  id            bigint generated always as identity primary key,
  user_id       uuid not null references auth.users(id) on delete cascade,
  config_json   jsonb not null default '{}'::jsonb,
  updated_at    bigint not null default extract(epoch from now())::bigint,
  synced_at     timestamptz default now(),
  created_at    timestamptz default now(),
  unique(user_id)
);

alter table sync_config enable row level security;

create policy "individual_access" on sync_config
  for all using (auth.uid() = user_id);

-- ═══════════════════════════════════════════
-- v1.0: 管理看板
-- ═══════════════════════════════════════════

create table if not exists admin_users (
  id            bigint generated always as identity primary key,
  user_id       uuid not null references auth.users(id) on delete cascade,
  role          text not null default 'doctor',
  display_name  text not null,
  notes         text default '',
  created_at    timestamptz default now(),
  updated_at    timestamptz default now(),
  unique(user_id)
);

alter table admin_users enable row level security;

create policy "service_role_only" on admin_users
  for all using (auth.role() = 'service_role');

-- ═══════════════════════════════════════════
-- v4.9+: 数据埋点（app_events / card_state_log / device_registry）
-- ═══════════════════════════════════════════

-- 应用事件表
create table if not exists app_events (
  event_id    text primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  event_type  text not null,
  deck_key    text default '',
  payload     jsonb default '{}'::jsonb,
  device_id   text not null,
  timestamp   bigint not null,
  created_at  timestamptz default now()
);

create index if not exists idx_app_events_user_ts
  on app_events(user_id, timestamp desc);

create index if not exists idx_app_events_type
  on app_events(event_type);

alter table app_events enable row level security;

create policy "individual_access" on app_events
  for all using (auth.uid() = user_id);

-- CardState 变更日志
create table if not exists card_state_log (
  log_id          text primary key,
  user_id         uuid not null references auth.users(id) on delete cascade,
  state_key       text not null,
  card_id         text not null,
  deck_key        text not null,
  change_type     text not null,
  stage_before    text default '',
  interval_before integer default 0,
  ease_before     real default 2.5,
  stage_after     text not null,
  interval_after  integer not null default 0,
  ease_after      real not null default 2.5,
  device_id       text not null,
  timestamp       bigint not null,
  created_at      timestamptz default now()
);

create index if not exists idx_card_state_log_user_ts
  on card_state_log(user_id, timestamp desc);

create index if not exists idx_card_state_log_state_key
  on card_state_log(state_key);

alter table card_state_log enable row level security;

create policy "individual_access" on card_state_log
  for all using (auth.uid() = user_id);

-- 设备注册表
create table if not exists device_registry (
  user_id     uuid not null references auth.users(id) on delete cascade,
  device_id   text not null,
  device_info jsonb default '{}'::jsonb,
  first_seen  timestamptz default now(),
  last_seen   timestamptz default now(),
  primary key (user_id, device_id)
);

alter table device_registry enable row level security;

create policy "individual_access" on device_registry
  for all using (auth.uid() = user_id);

-- voice assistance: card type extensibility (added v5.2)
ALTER TABLE cards_pool ADD COLUMN IF NOT EXISTS card_type text NOT NULL DEFAULT 'choice';
ALTER TABLE cards_pool ADD COLUMN IF NOT EXISTS ext jsonb NOT NULL DEFAULT '{}'::jsonb;

-- personal deck card type extensibility (added v5.7.3, backfill v5.2 omission)
ALTER TABLE deck_cards ADD COLUMN IF NOT EXISTS card_type text NOT NULL DEFAULT 'choice';
ALTER TABLE deck_cards ADD COLUMN IF NOT EXISTS ext jsonb NOT NULL DEFAULT '{}'::jsonb;

-- media slot JSONB（added v5.9）: { img: {url, v}, aud: {url, v} }
-- image_url / audio_url 列保留向后兼容，后续版本清理
ALTER TABLE deck_cards ADD COLUMN IF NOT EXISTS media jsonb DEFAULT '{}'::jsonb;
UPDATE deck_cards
SET media = jsonb_strip_nulls(jsonb_build_object(
  'img', CASE WHEN image_url IS NOT NULL AND image_url != ''
              THEN jsonb_build_object('url', image_url, 'v', 0)
              ELSE NULL END,
  'aud', CASE WHEN audio_url IS NOT NULL AND audio_url != ''
              THEN jsonb_build_object('url', audio_url, 'v', 0)
              ELSE NULL END
))
WHERE (media IS NULL OR media = '{}'::jsonb)
  AND ((image_url IS NOT NULL AND image_url != '')
       OR (audio_url IS NOT NULL AND audio_url != ''));

-- ── feedback 表（意见反馈，anon+authenticated 可写，无读权限）──────
CREATE TABLE IF NOT EXISTS feedback (
  id            uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at    timestamptz DEFAULT now(),
  app_version   text        NOT NULL,
  feedback_type text        NOT NULL DEFAULT 'general',
  user_desc     text        NOT NULL,
  device_id     text,
  locale        text,
  device_info   jsonb,
  diagnostics   jsonb
);
ALTER TABLE feedback ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon_insert"  ON feedback FOR INSERT TO anon          WITH CHECK (true);
CREATE POLICY "auth_insert"  ON feedback FOR INSERT TO authenticated WITH CHECK (true);

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'deck_cards_deck_card_uk'
  ) THEN
    ALTER TABLE deck_cards ADD CONSTRAINT deck_cards_deck_card_uk UNIQUE (deck_id, card_id);
  END IF;
END $$;

-- ═══════════════════════════════════════════
-- v5.11: Easy 模式跨设备同步
-- ═══════════════════════════════════════════

create table if not exists easy_card_states (
  id          bigint generated always as identity primary key,
  user_id     uuid    not null references auth.users(id) on delete cascade,
  deck_key    text    not null,
  card_id     text    not null,
  seen        integer not null default 0,
  history     integer[] not null default '{}',
  last_seen   bigint  not null default 0,
  updated_at  timestamptz not null default now(),
  unique(user_id, deck_key, card_id)
);

create index if not exists idx_easy_card_states_user_updated
  on easy_card_states(user_id, updated_at);

alter table easy_card_states enable row level security;

create policy "users select own easy states"
  on easy_card_states for select using (auth.uid() = user_id);
