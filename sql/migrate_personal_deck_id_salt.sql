-- 个人牌组 deck id 加盐迁移：bare id -> id~user_id
-- 背景：decks.id 是全局单列 PK，不同用户导入同一 .yhspack（同 deck_key）会撞主键。
-- 仅迁移 personal；preset/shared 不动。sync_trials / easy_card_states 的 deck_key（本地 key）不动。
-- deck_cards.media.url（含本地 key 的 Storage 路径）不动。
-- deck_cards.deck_id FK 只有 ON DELETE CASCADE（无 ON UPDATE），故先 drop FK、重定向子表、再改父表、重建 FK。
--
-- 执行时机：必须与新代码发布在同一维护窗口（先发布代码，紧接着跑本 SQL）。
-- 幂等：position('~' in id)=0 守卫，重复执行安全（已加盐的跳过）。

BEGIN;

ALTER TABLE deck_cards DROP CONSTRAINT deck_cards_deck_id_fkey;

-- 1) 先用当前（旧）decks 映射，把 deck_cards.deck_id 指向新 id（此刻 decks 还是旧 id）
UPDATE deck_cards dc
SET deck_id = dc.deck_id || '~' || d.user_id::text
FROM decks d
WHERE d.id = dc.deck_id
  AND d.deck_type = 'personal'
  AND position('~' in dc.deck_id) = 0;

-- 2) 再把 decks.id 改成新 id
UPDATE decks
SET id = id || '~' || user_id::text
WHERE deck_type = 'personal'
  AND position('~' in id) = 0;

-- 3) 重建外键
ALTER TABLE deck_cards
  ADD CONSTRAINT deck_cards_deck_id_fkey
  FOREIGN KEY (deck_id) REFERENCES decks(id) ON DELETE CASCADE;

COMMIT;

-- ── 迁移后验证（手动执行，期望均 0 行 / 数据一致）──────────────────
-- 所有 personal 牌组 id 应含 ~：
--   SELECT id, user_id FROM decks WHERE deck_type='personal' AND position('~' in id)=0;   -- 期望 0 行
-- deck_cards 不应有孤儿（指向不存在的 decks.id）：
--   SELECT dc.deck_id FROM deck_cards dc LEFT JOIN decks d ON d.id = dc.deck_id WHERE d.id IS NULL;  -- 期望 0 行
-- 抽查妈妈账号：id 形如 3e85da18~b5b1343e-…，media.url 仍是旧本地 key 路径：
--   SELECT id, card_count FROM decks WHERE user_id='b5b1343e-b619-4008-b0f2-7cc9790fea75';
