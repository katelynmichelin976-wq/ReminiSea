-- ═══════════════════════════════════════════
-- Migration 006: 数据埋点增强
-- 新增 app_events / card_state_log / device_registry 三张表
-- 用于跨设备场景完整回溯，不依赖记忆定位 bug
-- ═══════════════════════════════════════════

-- 1. 应用事件表（login / logout / sync / config 变更等）
create table if not exists app_events (
  event_id    text primary key,          -- evt_{timestamp}_{random}
  user_id     uuid not null references auth.users(id) on delete cascade,
  event_type  text not null,             -- login | logout | build_queue | sync_started | sync_done | config_changed | start_practice | go_home | cloud_state_merge
  deck_key    text default '',           -- 关联牌组
  payload     jsonb default '{}'::jsonb, -- 自由荷载，按事件类型约定
  device_id   text not null,
  timestamp   bigint not null,           -- Date.now()
  created_at  timestamptz default now()
);

create index if not exists idx_app_events_user_ts
  on app_events(user_id, timestamp desc);

create index if not exists idx_app_events_type
  on app_events(event_type);

alter table app_events enable row level security;

create policy "individual_access" on app_events
  for all using (auth.uid() = user_id);

-- 2. CardState 变更日志（每次 _writeSrs 记录前后快照）
create table if not exists card_state_log (
  log_id          text primary key,       -- csl_{timestamp}_{random}
  user_id         uuid not null references auth.users(id) on delete cascade,
  state_key       text not null,          -- deckKey::cardId
  card_id         text not null,
  deck_key        text not null,
  change_type     text not null,          -- processAnswer | saveCardStateLocal | sync_from_cloud | reset
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

-- 3. 设备注册表（新设备首次连接时写入，记录型号/分辨率/首次时间）
create table if not exists device_registry (
  user_id     uuid not null references auth.users(id) on delete cascade,
  device_id   text not null,
  device_info jsonb default '{}'::jsonb,  -- UA / screen / language / app_version
  first_seen  timestamptz default now(),
  last_seen   timestamptz default now(),
  primary key (user_id, device_id)
);

alter table device_registry enable row level security;

create policy "individual_access" on device_registry
  for all using (auth.uid() = user_id);
