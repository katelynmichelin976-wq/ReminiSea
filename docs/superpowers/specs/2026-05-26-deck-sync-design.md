# 牌组云端同步设计文档

**日期**：2026-05-26  
**状态**：待实施  
**范围**：云端 schema 统一、个人牌组同步、预置牌组更新机制、本地 key 清理

---

## 一、背景与目标

当前云端使用 `server_decks` + `cards_pool` 两张表存储管理员上传的预置牌组，两者通过 `deck_name` 文本字段关联（弱关联，非 FK）。用户无法将自建牌组同步到云端，本地 deck key 靠前缀（`cloud_`、`deck_`）编码业务语义。

本次设计目标：
1. 统一云端 schema（`decks` + `deck_cards`），替代现有两张表
2. 支持用户个人牌组的跨设备同步
3. 引入草稿/发布双状态，让学习者（小孩/老人）自动获得更新
4. 清理本地 key 的前缀业务语义问题

---

## 二、使用场景

**单账号双模式**（已实现）：
- 同一账号，管理者用管理模式建/编辑牌组，学习者用普通模式练习
- 典型场景：家长手机（管理模式）建好牌组 → 孩子平板（普通模式）自动获得更新
- 无需两个账号，无需跨账号分享

---

## 三、三种牌组类型

| deck_type | 创建者 | 可见范围 | 更新方式 |
|-----------|------|------|------|
| `preset` | 管理员账号 | 所有登录用户 | 用户手动同步 |
| `personal` | 账号内创建者 | 同账号所有设备 | 发布后自动推送 |
| `shared` | 任意用户 | 所有登录用户 | 预留，暂不实现 |

**预置牌组类比**：类似词典/导航 app 的语音包，常驻云端，用户按需下载到本地，可本地删除（释放空间），随时重新下载。

---

## 四、云端 Schema

### 4.1 `decks` 表（替代 `server_decks`）

```sql
CREATE TABLE decks (
  id           TEXT PRIMARY KEY,           -- UUID，本地 deck key 直接用此值
  user_id      UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  deck_type    TEXT NOT NULL DEFAULT 'personal',
                 -- 'preset'   : 管理员官方预置
                 -- 'personal' : 用户自建
                 -- 'shared'   : 预留
  card_count   INTEGER DEFAULT 0,
  published_at TIMESTAMPTZ,               -- NULL = 草稿；有值 = 最近发布时间
  shared_at    TIMESTAMPTZ,               -- 预留：shared 时填写
  updated_at   TIMESTAMPTZ DEFAULT NOW(),
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_decks_user_id   ON decks(user_id);
CREATE INDEX idx_decks_deck_type ON decks(deck_type);
```

### 4.2 `deck_cards` 表（替代 `cards_pool`）

```sql
CREATE TABLE deck_cards (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  deck_id    TEXT NOT NULL REFERENCES decks(id) ON DELETE CASCADE,  -- 强 FK，替代 deck_name 文本关联
  card_id    TEXT NOT NULL,
  name       TEXT NOT NULL,
  image_url  TEXT,
  audio_url  TEXT,
  sort_order INTEGER DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_deck_cards_deck_id ON deck_cards(deck_id);
```

### 4.3 RLS 策略

```sql
-- decks
ALTER TABLE decks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "decks_read" ON decks FOR SELECT
  USING (
    deck_type IN ('preset', 'shared')   -- 预置和共享所有人可读
    OR user_id = auth.uid()             -- 自己的牌组可读
  );

CREATE POLICY "decks_write" ON decks FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- deck_cards
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
```

---

## 五、数据迁移

### 5.1 迁移原则

**`server_decks.id` 必须原样保留**，不可重新生成。现有用户本地 deck key 为 `'cloud_' + server_decks.id`，迁移后本地 key 规则改为直接使用 `decks.id`（见第七节），但需通过一次性迁移脚本更新已有本地数据。

### 5.2 迁移 SQL（migration 009）

```sql
-- 1. 插入 preset 牌组（保留原 id）
INSERT INTO decks (id, user_id, name, deck_type, card_count, updated_at, created_at)
SELECT
  id,
  '<admin_user_uuid>',   -- 管理员账号 UUID
  name,
  'preset',
  COALESCE(card_count, 0),
  COALESCE(updated_at, NOW()),
  COALESCE(created_at, NOW())
FROM server_decks;

-- 2. 插入卡片（通过 deck_name 文本查 deck id）
INSERT INTO deck_cards (deck_id, card_id, name, image_url, audio_url, updated_at)
SELECT
  d.id,
  cp.card_id,
  cp.card_name,
  cp.image_url,
  cp.audio_url,
  COALESCE(cp.updated_at, NOW())
FROM cards_pool cp
JOIN server_decks sd ON sd.name = cp.deck_name
JOIN decks d ON d.id = sd.id;
```

---

## 六、草稿与发布机制

### 6.1 状态定义

| `published_at` | 含义 |
|------|------|
| `NULL` | 草稿，仅管理模式可见 |
| 有值 | 已发布，普通模式自动同步 |

### 6.2 流程

```
管理者（管理模式）
  编辑牌组 → 保存（本地 + 自动推送草稿到云端）
           → 点击「发布」→ decks.published_at = NOW()

学习者（普通模式，同一账号，不同设备）
  打开 app → session 恢复 → 检查 published_at > yihai_sync_at_{id}
           → 有新发布 → 自动下载全量卡片 → 无需任何操作
```

### 6.3 自动更新判断逻辑

```javascript
// session 就绪后
async function checkPersonalDeckUpdates() {
  const { data: decks } = await _sb.from('decks')
    .select('id, name, published_at')
    .eq('user_id', _cloudUserId)
    .eq('deck_type', 'personal')
    .not('published_at', 'is', null);

  for (const deck of decks) {
    const lastSync = localStorage.getItem('yihai_sync_at_' + deck.id) || '';
    if (deck.published_at > lastSync) {
      await downloadDeckFromCloud(deck.id, deck.name);  // 全量下载
    }
  }
}
```

---

## 七、本地 Key 与 ID 清理

### 7.1 现有问题

| 问题 | 位置 | 说明 |
|------|------|------|
| `'cloud_' + deckId` | 第 7285 行 | 前缀编码来源语义 |
| `'deck_' + Date.now()` | 第 4155/4585/4680 行 | 非稳定，跨用户可能冲突 |
| `'c_' + Date.now() + random(4)` | 第 4604 行 | 非全局唯一，多用户同毫秒可冲突 |
| source 靠 sync_at 推断 | 第 4088 行 | 非显式存储，容易漂移 |

### 7.2 ID 唯一性设计原则

- **Deck ID**：`crypto.randomUUID()`，全局唯一，一旦分配永久不变
- **Card ID**：`crypto.randomUUID()`，全局唯一，一旦分配永久不变
- **state_key**：`deck_id::card_id`，两个 UUID 组合，跨用户天然唯一
- **历史存量**：旧格式（`c_xxx`、`deck_xxx`）ID 不变，只有新建对象改用 UUID

### 7.3 修正方案

```javascript
// 云端下载：直接用 decks.id，无前缀
const key = deckId;                    // 原：'cloud_' + deckId

// 本地新建牌组：UUID
const key = crypto.randomUUID();       // 原：'deck_' + Date.now()

// 新建卡片：UUID
const id = crypto.randomUUID();        // 原：'c_' + Date.now() + '_' + random(4)

// DECKS_META：显式存 deck_type
{ key, name, deck_type: 'personal' }   // 原：source 从 sync_at 推断
```

### 7.3 本地存量数据迁移

首次加载时一次性执行：
```javascript
// 将旧的 'cloud_xxx' key 迁移为 'xxx'
DECKS_META.forEach(m => {
  if (m.key.startsWith('cloud_')) {
    const newKey = m.key.slice(6);  // 去掉 'cloud_'
    // 迁移 localStorage sync_at
    const syncAt = localStorage.getItem('yihai_sync_at_' + m.key);
    if (syncAt) {
      localStorage.setItem('yihai_sync_at_' + newKey, syncAt);
      localStorage.removeItem('yihai_sync_at_' + m.key);
    }
    // 迁移 IndexedDB media keys（_img / _aud）
    migrateMediaKeys(m.key, newKey);
    m.key = newKey;
  }
});
```

---

## 八、预置牌组本地删除

- **本地删除** = 卸载（释放 IndexedDB 空间），云端 `decks` 行不变
- **操作**：移除 DECKS_META 条目，清除 IndexedDB 卡片 + 媒体，清除 `yihai_sync_at_{id}`
- **不删除** `sync_card_states`（云端 SRS 历史）——保证重新下载后练习记录续上
- **重新下载**：预留入口，当前不实现；预置牌组常驻云端，随时可重新下载

---

## 九、复制预置牌组

同一套表操作：

```javascript
async function copyPresetDeck(presetDeckId) {
  const newId = crypto.randomUUID();
  // 1. 新建 personal deck 行
  await _sb.from('decks').insert({
    id: newId, user_id: _cloudUserId,
    name: originalName + '（副本）',
    deck_type: 'personal'
  });
  // 2. 复制 deck_cards
  const { data: cards } = await _sb.from('deck_cards')
    .select('card_id,name,image_url,audio_url,sort_order')
    .eq('deck_id', presetDeckId);
  await _sb.from('deck_cards').insert(
    cards.map(c => ({ ...c, deck_id: newId }))
  );
}
```

---

## 十、SRS 历史连续性保障

**条件**：
1. `deck key = decks.id`（稳定 UUID，不随名称变化）
2. `card_id` 在 deck_cards 中不变（迁移时原样保留）
3. 本地删除时不删除云端 `sync_card_states`

**结果**：`state_key = deck_id::card_id` 在删除再下载前后保持不变，SRS 历史完整续上。

---

## 十一、同步触发时机

| 场景 | 触发 | 逻辑 |
|------|------|------|
| 打开 app | session 就绪后 | 检查 personal 牌组 published_at，有更新自动下载 |
| 编辑/保存牌组 | saveDeck() 末尾 | `_syncEnabled` 时静默推送草稿到云端 |
| 点击发布 | publishDeck() | 更新 published_at，触发其他设备自动拉取 |
| 预置牌组更新 | 用户手动同步 | 复用现有 deck_cards.updated_at 增量逻辑 |

---

## 十二、后续预留（不在本期范围）

- `deck_type = 'shared'`：社区共享，`decks` 加 `shared_at` 字段即可扩展
- 预置牌组重新下载入口 UI
- 发布历史/版本号

---

## 十三、实施依赖与注意事项

- **管理员 UUID**：迁移 SQL 中 `<admin_user_uuid>` 需填入实际管理员账号 UUID
- **`server_deck_cards` 表**：当前代码查询此表（`downloadDeckFromCloud` 第 7265 行），迁移后改查 `deck_cards`；需确认该表实际名称（CLAUDE.md 中写作 `srv_deck_crd`）
- **`downloadDeckFromCloud` 需拆分**：现有函数读 `server_deck_cards` + `cards_pool`；迁移后 preset 和 personal 均改读 `deck_cards`，函数逻辑需同步更新
- **IndexedDB media key 迁移**：媒体存储 key 为 `{deck_key}_{card_id}_img/aud`，deck key 去掉 `cloud_` 前缀后需同步迁移 IndexedDB 中的媒体条目
- **deck_manager 上传工具**：迁移后需改向 `decks` + `deck_cards` 写入，或由训练 app 管理模式内化替代
