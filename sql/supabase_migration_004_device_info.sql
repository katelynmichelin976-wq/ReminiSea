-- ═══════════════════════════════════════════
-- Migration 004: sync_trials add device_info + app_version
--               sync_card_states add app_version
-- ═══════════════════════════════════════════

alter table sync_trials
  add column if not exists device_info  jsonb  default null,
  add column if not exists app_version  text   not null default '';

alter table sync_card_states
  add column if not exists app_version  text   not null default '';
