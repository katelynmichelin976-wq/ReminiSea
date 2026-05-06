-- ═══════════════════════════════════════════
-- Migration 002: sync_trials add srs_stage_after / interval_after / ease_after
-- ═══════════════════════════════════════════

alter table sync_trials
  add column if not exists srs_stage_after  text,
  add column if not exists interval_after   integer,
  add column if not exists ease_after       real;
