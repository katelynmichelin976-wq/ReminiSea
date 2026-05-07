-- ═══════════════════════════════════════════
-- Migration 004: sync_trials add device_info jsonb column
-- ═══════════════════════════════════════════

alter table sync_trials
  add column if not exists device_info jsonb default null;
