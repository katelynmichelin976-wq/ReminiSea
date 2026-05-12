# Anki 牌组与卡片结构设计分析

从 [ankitects/anki](https://github.com/ankitects/anki) v25.09.2 源码分析，聚焦数据结构设计、扩展机制和对忆海拾光的借鉴意义。

---

## 目录

1. [核心设计理念：Note/Card 分离](#1-核心设计理念notecard-分离)
2. [Notetype：可编程的卡片 Schema](#2-notetype可编程的卡片-schema)
3. [Card：生成物而非源数据](#3-card生成物而非源数据)
4. [Deck：层级树与双态设计](#4-deck层级树与双态设计)
5. [扩展机制](#5-扩展机制)
6. [对忆海拾光的借鉴](#6-对忆海拾光的借鉴)

---

## 1. 核心设计理念：Note/Card 分离

### 1.1 数据模型

```
Notetype (笔记类型)          Note (笔记/数据)            Card (卡片/生成物)
┌─────────────────┐      ┌─────────────────┐      ┌─────────────────┐
│ id              │      │ id              │      │ id              │
│ name            │      │ guid            │      │ note_id  ←── FK │
│ fields[] ───────┼───►  │ notetype_id ─┐  │      │ deck_id        │
│ templates[] ────┼──┐   │ fields[]      │  │      │ template_idx   │
│ config          │  │   │ tags[]        │  │      │ ctype/queue/due│
└─────────────────┘  │   └───────────────┼──┘      │ interval/ease  │
                     │                   │         │ reps/lapses    │
                     │   一个 Notetype   │          └────────────────┘
                     │   有多个 Note     │
                     │                   │         一个 Note 通过
                     │   模板引用字段:    │         多个 Template
                     │   {{FieldName}}   │         生成多个 Card
                     │                   │
                     └───────────────────┘
```

这是 Anki 最核心的设计决策：**Note 是数据，Card 是数据的呈现**。一个 Note 通过 Notetype 的 Templates 可以生成 1~N 张 Card。

### 1.2 源码中的体现

```rust
// notes/mod.rs
pub struct Note {
    pub id: NoteId,
    pub guid: String,              // 全局唯一 ID（跨设备）
    pub notetype_id: NotetypeId,   // 所属笔记类型
    pub mtime: TimestampSecs,
    pub usn: Usn,
    pub tags: Vec<String>,
    fields: Vec<String>,           // 字段值数组，按 Notetype.fields 顺序
}

// cards.proto
message Card {
    int64 id = 1;
    int64 note_id = 2;            // 反向引用 Note
    int64 deck_id = 3;            // 所属牌组
    uint32 template_idx = 4;      // 由 Notetype 的第几个模板生成
    // ... 调度状态字段
}
```

**关键关系**：
- `Card.note_id` → `Note.id`：每张卡知道自己来自哪个笔记
- `Card.template_idx` → `Notetype.templates[ord]`：每张卡知道自己是哪个模板生成的
- `Note.notetype_id` → `Notetype.id`：每个笔记知道自己的字段结构

### 1.3 与忆海拾光的对比

| 维度 | Anki | 忆海拾光 |
|------|------|----------|
| 基本单元 | Note（笔记）→ N 张 Card | Card（卡片）1:1 |
| 内容与调度 | 分离（Note 存内容，Card 存调度） | 耦合（一张卡同时存内容和调度） |
| 多卡片生成 | 一个 Note 可通过多个模板生成多张卡 | 不支持 |
| 内容复用 | 改一次 Note，所有 Card 自动更新 | 改一张卡只影响这一张 |
| 灵活性 | 极高（可自定义字段和模板） | 固定（正反面） |

---

## 2. Notetype：可编程的卡片 Schema

### 2.1 数据结构

```rust
// notetype/mod.rs
pub struct Notetype {
    pub id: NotetypeId,
    pub name: String,
    pub fields: Vec<NoteField>,       // 字段定义
    pub templates: Vec<CardTemplate>, // 卡片模板
    pub config: NotetypeConfig,       // 类型级配置
}

pub struct NoteField {
    pub ord: Option<u32>,    // 原始序号（用于跨版本重命名追踪）
    pub name: String,        // 字段名（在模板中通过 {{name}} 引用）
    pub config: NoteFieldConfig,  // 字段级配置
}

pub struct CardTemplate {
    pub ord: Option<u32>,
    pub name: String,
    pub config: CardTemplateConfig {
        q_format: String,       // 问题面模板 "{{Front}}"
        a_format: String,       // 答案面模板 "{{FrontSide}}<hr>{{Back}}"
        q_format_browser: String,  // 浏览器中的问题面（可选）
        a_format_browser: String,  // 浏览器中的答案面（可选）
        target_deck_id: i64,       // 生成的卡片放入哪个牌组（0=默认）
    },
}
```

### 2.2 模板语法

Anki 使用 `{{FieldName}}` 模板语法，支持条件渲染：

| 语法 | 含义 | 示例 |
|------|------|------|
| `{{Field}}` | 字段替换 | `{{Front}}` |
| `{{#Field}}...{{/Field}}` | 条件：字段非空时显示 | `{{#Notes}}Extra{{/Notes}}` |
| `{{^Field}}...{{/Field}}` | 否定条件：字段为空时显示 | `{{^Notes}}No notes{{/Notes}}` |
| `{{cloze:Field}}` | 挖空字段（仅 Cloze 类型） | `{{cloze:Text}}` |
| `{{type:Field}}` | 输入验证字段 | `{{type:Back}}` |
| `<hr id=answer>` | 正反面分隔符 | |
| `{{FrontSide}}` | 特殊字段：引用问题面内容 | |

### 2.3 六种内置 Notetype

```rust
// stock.rs — all_stock_notetypes()
pub fn all_stock_notetypes(tr: &I18n) -> Vec<Notetype> {
    vec![
        basic(tr),                     // 基础型：1 字段→1 卡
        basic_forward_reverse(tr),     // 正反型：2 字段→2 卡（正→反，反→正）
        basic_optional_reverse(tr),    // 可选反转型：2 字段 + {{#Add Reverse}}→1-2 卡
        basic_typing(tr),              // 输入型：{{type:Back}} 输入验证
        cloze(tr),                     // 填空型：{{c1::text}} 自动生成多卡
        image_occlusion_notetype(tr),  // 图像遮挡型
    ]
}
```

**Basic 示例**（最简）：
```
Fields: [Front, Back]
Templates: [{
    name: "Card 1",
    qfmt: "{{Front}}",
    afmt: "{{FrontSide}}<hr id=answer>{{Back}}"
}]
→ 每 1 个 Note 生成 1 张 Card
```

**Basic (and reversed card)** 示例：
```
Fields: [Front, Back]
Templates: [
    { name: "Card 1", qfmt: "{{Front}}", afmt: "{{FrontSide}}<hr>{{Back}}" },
    { name: "Card 2", qfmt: "{{Back}}",  afmt: "{{FrontSide}}<hr>{{Front}}" }
]
→ 每 1 个 Note 生成 2 张 Card（正→反 和 反→正）
```

### 2.4 Card Requirements：智能卡片生成

每个 Notetype 的 `config.reqs` 字段记录了每个模板的字段依赖：

```rust
// proto — CardRequirement
message CardRequirement {
    uint32 card_ord = 1;          // 哪个模板
    Kind kind = 2;                // Any / All / None
    repeated uint32 field_ords = 3;  // 依赖哪些字段
}

enum Kind {
    NONE = 0;  // 不需要任何字段（模板解析失败 → 永不生成）
    ANY  = 1;  // 任意一个字段非空即生成卡片
    ALL  = 2;  // 所有字段非空才生成卡片
}
```

**生成逻辑**（cardgen.rs）：

```rust
// 判断模板是否应该为当前 note 生成卡片
fn is_nonempty(&self, card_ord: usize, nonempty_fields: &HashSet<&str>) -> bool {
    let template = self.cards[card_ord].template;
    template.renders_with_fields(nonempty_fields)
    // 模板解析了 {{#Field}} 条件 → 根据字段内容判断是否会渲染
}

// 为 note 生成需要的卡片
fn new_cards_required_normal(&self, note: &Note, existing: &[CardInfo]) -> Vec<CardToGenerate> {
    self.cards.iter().enumerate().filter_map(|(ord, card)| {
        // 跳过已存在的卡片
        if !existing.contains(ord) && self.is_nonempty(ord, &note.nonempty_fields()) {
            Some(CardToGenerate { ord, did, due })
        } else {
            None
        }
    }).collect()
}
```

**关键行为**：
- 当 Note 的字段被编辑后，自动重新计算哪些卡片应该存在
- `{{#Field}}` 条件为空 → 不生成对应卡片（可选反转卡的核心机制）
- 兜底：如果 Note 没有任何卡片，强制生成 ord=0 的卡片

### 2.5 Cloze 的特殊处理

```rust
// cardgen.rs — new_cards_required_cloze()
fn new_cards_required_cloze(&self, note: &Note, existing: &[CardInfo]) -> Vec<CardToGenerate> {
    let set = cloze_number_in_fields(note.fields());  // 扫描 {{c1::...}}, {{c2::...}}
    set.into_iter().filter_map(|cloze_ord| {
        // c1 → ord=0, c2 → ord=1, ... c501 → ord=499 (最多 500 张卡)
        let card_ord = cloze_ord.saturating_sub(1).min(499);
        if !existing.contains(card_ord) {
            Some(CardToGenerate { ord: card_ord, ... })
        } else {
            None
        }
    }).collect()
}
```

**设计要点**：Cloze 类型只有 1 个 Template，但可以通过 `{{c1::}}`, `{{c2::}}` 动态生成多张卡片（每个编号一张）。模板中 `{{cloze:Field}}` 会根据当前卡片编号自动显示/隐藏内容。

---

## 3. Card：生成物而非源数据

### 3.1 Card 的调度状态

```rust
// cards.proto
message Card {
    // === 身份 ===
    int64 id = 1;
    int64 note_id = 2;          // 指向 Note
    int64 deck_id = 3;          // 当前所属牌组
    uint32 template_idx = 4;    // 由哪个模板生成

    // === 调度状态 ===
    uint32 ctype = 7;           // 0=New, 1=Learn, 2=Review, 3=Relearn
    sint32 queue = 8;           // 队列类型（-1=Suspended, 0=New, 1=Review, 2=Learn...）
    sint32 due = 9;             // 到期时间/位置
    uint32 interval = 10;       // 当前间隔（天）
    uint32 ease_factor = 11;    //  ease 因子（×1000 存储）
    uint32 reps = 12;           // 总复习次数
    uint32 lapses = 13;         // 遗忘次数
    uint32 remaining_steps = 14; // 剩余学习步数

    // === 过滤牌组支持 ===
    sint32 original_due = 15;       // 进入过滤牌组前的 due
    int64 original_deck_id = 16;     // 原始牌组 ID

    // === 扩展 ===
    optional FsrsMemoryState memory_state = 20;  // FSRS 状态
    string custom_data = 19;                      // 自定义数据
}
```

### 3.2 卡片生命周期

```
创建 Note
  │
  ├─ add_note()
  │   ├─ note.prepare_for_update()    // 规范化字段、计算 sort_field 和 checksum
  │   ├─ add_note_only()              // 写入 notes 表
  │   └─ generate_cards_for_new_note() // CardGenContext → 生成 1~N 张 Card
  │
更新 Note（字段内容改变）
  │
  ├─ update_note()
  │   ├─ 对比 note vs existing_note（checksum 比较）
  │   ├─ prepare_for_update()
  │   ├─ update_note_undoable()
  │   └─ generate_cards_for_existing_note()
  │       ├─ 读取现有卡片（existing_cards_for_note）
  │       ├─ 计算需要的卡片（new_cards_required）
  │       ├─ 跳过已存在的（ord in existing_ords）
  │       └─ 生成新卡片或删除多余的
  │
删除 Note
  │
  ├─ remove_notes()
  │   ├─ 删除所有关联 Card → 移入 graves
  │   └─ 删除 Note → 移入 graves
```

### 3.3 重复检测

Anki 用 **第一个字段的 SHA1 前 4 字节** 作为 checksum 来检测重复：

```rust
// notes/mod.rs
pub fn field_checksum(text: &str) -> u32 {
    let mut hash = Sha1::new();
    hash.update(text);
    let digest = hash.finalize();
    u32::from_be_bytes(digest[..4].try_into().unwrap())
}

// 检查重复：同 notetype + 同 checksum + first_field 内容完全匹配
fn is_duplicate(&self, first_field: &str, note: &Note) -> Result<bool> {
    let csum = field_checksum(first_field);
    self.storage.note_fields_by_checksum(note.notetype_id, csum)?
        .into_iter()
        .any(|(nid, field)| nid != note.id && field == first_field)
}
```

---

## 4. Deck：层级树与双态设计

### 4.1 数据结构

```rust
// decks/mod.rs
pub struct Deck {
    pub id: DeckId,
    pub name: NativeDeckName,   // 内部用 \x1f 分隔层级
    pub mtime_secs: TimestampSecs,
    pub usn: Usn,
    pub common: DeckCommon,     // 通用属性
    pub kind: DeckKind,         // Normal | Filtered
}
```

### 4.2 两种牌组类型

```
DeckKind
├── Normal            标准牌组（用户创建和管理）
│   ├── config_id      引用的 DeckConfig ID
│   ├── extend_new     每日新卡限额
│   ├── extend_review  每日复习限额
│   ├── description    牌组描述
│   ├── review_limit   复习上限（覆盖 config）
│   ├── new_limit      新卡上限（覆盖 config）
│   └── desired_retention  期望保持率（覆盖 config）
│
└── Filtered          过滤牌组（动态，基于搜索条件）
    ├── reschedule     是否重新调度
    ├── search_terms[]  搜索条件（query + limit + order）
    └── preview_delay   预览延迟
```

### 4.3 层级树实现

```
存储（平铺）:
  "Default"
  "语文"
  "语文\x1f古诗"
  "语文\x1f古诗\x1f唐诗"
  "数学"

构建树（tree.rs — deck_names_to_tree()）:
  默认
  语文
  ├── 古诗
  │   └── 唐诗
  数学
```

- 内部存储用 `\x1f`（ASCII 单元分隔符），用户界面用 `::`
- `NativeDeckName::from_human_name("语文::古诗")` → `"语文\x1f古诗"`
- 树结构在读取时动态构建（`deck_tree()`），不在 DB 中存储嵌套

**重命名级联**（name.rs）：
```rust
// 重命名父牌组 → 自动更新所有子牌组的前缀
fn rename_child_decks(old_parent, new_parent) {
    // "语文\x1f古诗" → "Language\x1f古诗"（前缀替换）
}
```

### 4.4 DeckConfig 分离

牌组的调度参数（学习步进、间隔乘数、每日限额等）存在独立的 `DeckConfig` 中，多个牌组可以共享同一个 Config：

```
Deck A ──► DeckConfig 1
Deck B ──► DeckConfig 1   ← 共享
Deck C ──► DeckConfig 2
```

---

## 5. 扩展机制

### 5.1 核心模式：`bytes other = 255`

每个 protobuf 配置消息的最后一个字段都是：

```protobuf
message Field.Config {
    bool sticky = 1;
    bool rtl = 2;
    string font_name = 3;
    // ...
    bytes other = 255;  // ← 扩展槽
}
```

**用途**：
- 新版本添加字段时，不需要修改数据库 schema
- 旧客户端读取新数据时，不认识的字段被序列化到 `other` 中保留
- 旧客户端写回时 `other` 原样保留，不会丢失新版本的字段

**Rust 侧实现**（字段配置的反序列化）：
```rust
// 已知字段 → 结构体成员
// 未知字段 → 序列化成 JSON 存入 other
// 序列化时 → other 中的 JSON 也作为字段输出
```

### 5.2 `original_stock_kind`：追踪来源

```rust
// 记录这个 Notetype 最初是从哪个 Stock 类型创建的
enum OriginalStockKind {
    UNKNOWN = 0;
    BASIC = 1;
    BASIC_AND_REVERSED = 2;
    // ...
    IMAGE_OCCLUSION = 6;
}
```

**用途**：
- 用户可能自定义了 Basic 类型（添加字段、修改模板）
- 版本升级时，知道原始类型才能正确迁移（如添加新特性）
- "恢复为默认"功能依赖此标记

### 5.3 `ord` 字段：跨重命名追踪

每个 Field 和 Template 都有 `ord: Option<u32>`：

```rust
pub struct NoteField {
    pub ord: Option<u32>,    // 原始序号
    pub name: String,        // 可能被用户重命名
}
```

**用途**：
- 用户重命名字段 → `ord` 不变 → 现有 Card 的 `template_idx` 仍然有效
- 导入/合并 Notetype 时，用 `ord` 匹配字段而不是 `name`
- 字段被删除后重新添加 → `ord` 可用于恢复关联

### 5.4 模板中的特殊字段

```rust
static SPECIAL_FIELDS: LazyLock<HashSet<&'static str>> = LazyLock::new(|| {
    HashSet::from_iter(vec![
        "FrontSide",  // 引用问题面内容
        "Card",       // 卡片类型名
        "CardFlag",   // 卡片标记
        "Deck",       // 牌组名
        "Subdeck",    // 子牌组名
        "Tags",       // 标签
        "Type",       // 笔记类型名
        "CardID",     // 卡片 ID（用于唯一标识）
    ])
});
```

这些是模板引擎提供的**虚拟字段**，不由用户定义，而是由系统在渲染时注入。

### 5.5 `custom_data`：卡片级扩展

```protobuf
message Card {
    // ... 固定字段 ...
    string custom_data = 19;  // 任意 JSON，供插件/扩展使用
}
```

这是一个完全自由的扩展点，不会被 Anki 核心代码解析或修改。

---

## 6. 对忆海拾光的借鉴

### 6.1 现状分析

忆海拾光当前的卡片模型：

```javascript
// 当前结构（简化）
card = {
    id: "...",          // 卡片 ID
    deckKey: "...",    // 牌组名（扁平）
    front: "...",      // 正面内容
    back: "...",       // 背面内容
    image: "...",      // 图片 URL
    audio: "...",      // 音频 URL
    // SRS 状态...
}
```

**问题**：
1. 内容和调度耦合在一张卡上
2. 不支持"一张数据多种问法"
3. 不支持层级牌组
4. 无法扩展字段（如添加"备注"、"来源"等）
5. 没有模板系统，所有卡片正反面结构相同

### 6.2 建议的渐进式改进

#### 阶段 1（v5.0）：结构化卡片数据

```typescript
// 引入 Note/Card 分离的思想，但不引入模板引擎
interface CardData {
    id: string;
    // 内容字段（相当于 Note 的角色）
    front: string;
    back: string;
    hint?: string;       // 提示字段
    source?: string;     // 来源字段
    notes?: string;      // 备注字段
    // 调度状态
    srs: CardState;
}
```

**变化**：将固定字段扩展到可选字段，但不需要模板系统。认知训练场景的卡片类型有限（图文卡、问答卡、回忆卡），不需要 Anki 的完全可编程模板。

#### 阶段 2：层级牌组

```typescript
interface Deck {
    id: string;
    name: string;           // 显示名
    parentId?: string;      // 父牌组
    // 扁平存储 + 即时构建树
}

// 牌组名称规则（参考 Anki 的 :: 分隔符）
// "日常生活::厨房" → 构建为 日常生活/厨房/
function buildDeckTree(decks: Deck[]): DeckTreeNode[] { ... }
```

**变化**：引入层级，存储保持扁平，UI 按需构建树。

#### 阶段 3：卡片类型（如需要）

```typescript
// 不引入 Anki 的完整模板引擎，但允许预定义的卡片类型
type CardKind = 'basic' | 'qa' | 'recall' | 'image';

interface CardType {
    kind: CardKind;
    fields: FieldDefinition[];
    // 无模板语法 → 渲染逻辑在代码中按 kind 分派
}
```

#### 6.3 不应采用的模式

| 模式 | 原因 |
|------|------|
| 完整模板引擎（`{{Field}}` 语法） | 过度工程。认知训练卡的结构固定，不需要用户自定义模板 |
| Cloze 删除系统 | 对认知训练场景价值有限 |
| Filtered Deck（搜索驱动） | 不必要的复杂度 |
| `other` bytes 扩展槽 | 适用于二进制协议。JSON/MongoDB 天然支持动态字段，不需要 |
| DeckConfig 分离 | 当前每牌组独立设置即可，不需要共享配置 |
| 多 Card 一 Note | 当前每卡片独立管理更简单，认知训练无此需求 |

#### 6.4 推荐采用的模式

| 模式 | 优先级 | 说明 |
|------|--------|------|
| **卡片类型枚举** | 高 | 替代 Anki 的 Notetype，预定义 3-5 种认知训练卡片类型 |
| **层级牌组** | 中 | `::` 分隔符 + 扁平存储 + 即时建树 |
| **`ord` 追踪字段** | 中 | 字段重命名时保持数据关联 |
| **`original_stock_kind`** | 低 | 追踪卡片类型来源，便于未来升级迁移 |
| **checksum 重复检测** | 低 | SHA1 前 4 字节比较，比全字段比对快 |
| **`custom_data` 扩展槽** | 低 | JSON 字段供未来扩展，不影响核心逻辑 |

### 6.5 具体实施方案（v5.0）

考虑到 v5.0 迁移到 uni-app + CloudBase，建议：

1. **卡片类型系统**：定义 4 种基础类型替代当前的统一结构
   ```typescript
   enum CardKind {
       IMAGE_TEXT = 'image_text',    // 图文卡（图片+文字）
       QUESTION = 'question',         // 问答卡
       MEMORY = 'memory',             // 回忆卡
       AUDIO = 'audio',               // 听力卡
   }
   ```

2. **字段定义按类型**：
   ```typescript
   type CardFields = {
       [CardKind.IMAGE_TEXT]: { image: string; text: string };
       [CardKind.QUESTION]:   { question: string; answer: string; hint?: string };
       [CardKind.MEMORY]:     { prompt: string; detail: string };
       [CardKind.AUDIO]:      { audio: string; transcript: string };
   }
   ```

3. **牌组层级**：用 `parentId` 字段实现，API 返回平铺列表，客户端构建树
4. **保留 `updated_at`/`usn` 时间戳**用于增量同步（已有）
5. **每卡片类型固定的渲染逻辑**（代码中，不需要模板引擎）
