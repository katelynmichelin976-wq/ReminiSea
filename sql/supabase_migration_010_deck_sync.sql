-- Migration 010: decks + deck_cards — 统一牌组云端 schema
-- 日期：2026-05-27
-- 替代：server_decks、cards_pool、server_deck_cards（三表保留不动，待验证稳定后删除）
-- 删除：card_state_log、upload_log（废弃表）
-- 管理员账号：zyhacl@gmail.com (5358bfeb-d0d7-4a6e-894c-652bc1533d70)

-- ── 1. decks 表 ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS decks (
  id           TEXT PRIMARY KEY,
  user_id      UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  deck_type    TEXT NOT NULL DEFAULT 'personal',
  card_count   INTEGER DEFAULT 0,
  shared_at    TIMESTAMPTZ,
  updated_at   TIMESTAMPTZ DEFAULT NOW(),
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_decks_user_id   ON decks(user_id);
CREATE INDEX IF NOT EXISTS idx_decks_deck_type ON decks(deck_type);

-- ── 2. deck_cards 表 ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS deck_cards (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  deck_id    TEXT NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
  card_id    TEXT NOT NULL,
  name       TEXT NOT NULL,
  image_url  TEXT,
  audio_url  TEXT,
  sort_order INTEGER DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_deck_cards_deck_id ON deck_cards(deck_id);

-- ── 3. RLS ────────────────────────────────────────────────────────────
ALTER TABLE decks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "decks_read" ON decks FOR SELECT
  USING (
    deck_type IN ('preset', 'shared')
    OR user_id = auth.uid()
  );

CREATE POLICY "decks_write" ON decks FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

ALTER TABLE deck_cards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "deck_cards_read" ON deck_cards FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM decks
      WHERE id = deck_id
        AND (deck_type IN ('preset', 'shared') OR user_id = auth.uid())
    )
  );

CREATE POLICY "deck_cards_write" ON deck_cards FOR ALL
  USING (
    EXISTS (SELECT 1 FROM decks WHERE id = deck_id AND user_id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM decks WHERE id = deck_id AND user_id = auth.uid())
  );

-- ── 4. 迁移 preset 牌组（保留原 id）────────────────────────────────────
INSERT INTO decks (id, user_id, name, deck_type, card_count, updated_at, created_at)
SELECT
  sd.id,
  '5358bfeb-d0d7-4a6e-894c-652bc1533d70',
  sd.name,
  'preset',
  COALESCE(sd.card_count, 0),
  COALESCE(sd.updated_at, NOW()),
  COALESCE(sd.created_at, NOW())
FROM server_decks sd
ON CONFLICT (id) DO NOTHING;

-- ── 5. 迁移卡片（通过 server_deck_cards 关联 deck_id） ────────────────
INSERT INTO deck_cards (deck_id, card_id, name, image_url, audio_url, sort_order, updated_at)
SELECT
  sdc.deck_id,
  sdc.card_id,
  cp.card_name,
  cp.image_url,
  cp.audio_url,
  COALESCE(sdc.sort_order, 0),
  COALESCE(cp.updated_at, NOW())
FROM server_deck_cards sdc
JOIN cards_pool cp ON cp.card_id = sdc.card_id
ON CONFLICT DO NOTHING;

-- ── 6. 删除废弃表 ─────────────────────────────────────────────────────
DROP TABLE IF EXISTS card_state_log;
DROP TABLE IF EXISTS upload_log;
