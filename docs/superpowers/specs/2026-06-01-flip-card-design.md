# Flip Card 设计文档

**日期：** 2026-06-01  
**状态：** 待实现  
**目标版本：** v5.5.0

---

## 背景

当前卡片类型（`choice` / `recognize`）基于图片 + 随机干扰选项，适合看图识物，但不适合英语单词学习：无法展示单词文本、音标、释义、例句，且选项模式对文字卡片意义不大。

本设计引入 `flip`（翻转卡）类型，同时通过**渲染器分派模式**保护已上线的 `choice` 类型，使新增卡片类型不影响现有业务逻辑。

---

## 设计原则

1. **已上线 choice 类型零改动**：现有 choice 逻辑整体封装进独立 renderer，不修改任何现有行为。
2. **SRS 算法零改动**：flip 类型自评按钮直接映射到现有 `processAnswer` grade 1-4。
3. **导入格式向后兼容**：`importYhspack` 无需修改，`cardType` 缺省仍为 `'choice'`。

---

## 一、数据结构

### 卡片字段（`.yhspack` 中的 `deck.cards` 条目）

```json
{
  "id": "word_example",
  "name": "example",
  "cardType": "flip",
  "img": "（可选，背面展示）",
  "audioUrl": "（可选，音频文件 blob URL，正面读音按钮用）",
  "ext": {
    "phonetic": "/ɪɡˈzɑːmpl/",
    "definition": "例子；范例",
    "example": "This is a good example of teamwork.",
    "enDefinition": "a thing characteristic of its kind or illustrating a general rule",
    "partOfSpeech": "n."
  }
}
```

### 字段说明

| 字段 | 来源 | 用途 | 必填 |
|------|------|------|------|
| `name` | 现有字段 | 正面大字 + TTS 朗读 | ✅ |
| `cardType` | 现有字段 | 路由到 flip renderer | ✅（值为 `"flip"`） |
| `audioUrl` | 现有字段 | 正面读音按钮（音频优先/TTS 兜底） | 可选 |
| `img` | 现有字段 | 背面图片 | 可选 |
| `ext.phonetic` | 新增 | 正面音标展示 | 可选 |
| `ext.definition` | 新增 | 背面中文释义 | 可选 |
| `ext.example` | 新增 | 背面英文例句 | 可选 |
| `ext.enDefinition` | 新增 | 背面英英释义 | 可选 |
| `ext.partOfSpeech` | 新增 | 背面词性（占位，当前导入文件无此字段） | 可选 |

`options` / `correct` 字段在 flip 类型下保留但忽略，不影响 choice 逻辑。

---

## 二、架构：渲染器分派模式

### 动机

直接在 `showQ()` 堆 `if/else` 分支会导致：
- 每加一个卡片类型，`showQ`、`onSel`、`onNext`、CSS 同时膨胀
- 修改新类型时有机会引入 choice 回归
- 已上线用户每次发布都有稳定性风险

### 结构

```
screen-quiz（共享 chrome — 不变）
  .bar              进度条 / 计数 / 返回按钮
  #quiz-render      渲染区，由当前 renderer 完全接管
  .btm              通过 setBtmButtons() 设置，renderer 调用
```

**`#quiz-render`** 替换现有 `#content`（一处 id 变更）。`img-zone` / `mid-zone` / `opts-zone` 由 choice renderer 内部生成，不再是全局 DOM 结构。

### 接口

```js
const CARD_RENDERERS = {
  choice: {
    mount(q, containerEl) { /* 现有 showQ 逻辑原封不动 */ },
    unmount() { /* 清理事件监听 */ }
  },
  flip: {
    mount(q, containerEl) { /* 全新，不触碰 choice 代码 */ },
    unmount() {}
  }
};

// showQ 变为纯分派器
function showQ(q) {
  updateProgressBar();
  updateCounters();
  const type = q.cardType ?? 'choice';
  const renderer = CARD_RENDERERS[type] ?? CARD_RENDERERS.choice;
  renderer.mount(q, document.getElementById('quiz-render'));
}
```

共享 chrome 负责：进度条、计数器、返回按钮、`sessionId` 递增、SRS write 入口。  
各 renderer 负责：该类型的全部 DOM 渲染、事件绑定、动画、TTS 时序。

---

## 三、Flip Renderer UI

### 正面（翻转前）

- 大字显示 `name`（英文单词）
- 小字显示 `ext.phonetic`（无值则不渲染）
- 🔊 读音按钮：调用现有 `playAnswer(q)`（音频文件优先，TTS 兜底）
- 底部：「翻转」按钮（单一按钮，替换 opts-zone）

### 背面（翻转后）

- 图片区：`q.img` 有值则展示，无值不占位
- 词性（`ext.partOfSpeech`，可选，有值显示）
- 中文释义（`ext.definition`）
- 英文例句（`ext.example`，斜体）
- 英英释义（`ext.enDefinition`，小字灰色）
- 底部：4 个自评按钮

### 自评按钮 → SRS grade 映射

| 按钮 | grade | SRS 行为 |
|------|-------|---------|
| Again | 1 | 重入学习队列 |
| Hard | 2 | 缩短间隔 |
| Good | 3 | 正常推进 |
| Easy | 4 | 加速推进 |

直接调用现有 `_writeSrs(q, grade)` + `onNext()`，SRS 算法零改动。

### 翻转动画

CSS 3D flip（`rotateY`），正面/背面用 `backface-visibility: hidden` 隔离，翻转耗时 300ms。

---

## 四、.yhspack 导入兼容

`importYhspack` 无需修改。现有逻辑：
```js
card.cardType = card.cardType || card.card_type || 'choice';
card.ext = card.ext || {};
```
flip 卡在导入文件中声明 `cardType: "flip"` 和 `ext` 字段即自动通过，缺省仍为 `'choice'`。

---

## 五、实现边界（不做的事）

- **不新增 screen**：`screen-quiz` 复用，仅 `#content` → `#quiz-render` id 变更
- **不改 SRS 算法**：`processAnswer` 零修改
- **不改导入器**：`importYhspack` 零修改
- **不做制卡 UI**：当前阶段 flip 卡仅通过 `.yhspack` 导入，不扩展制卡界面
- **不做模板系统**：flip 字段固定，不引入模板渲染引擎

---

## 六、测试策略

- **重构 choice → renderer**：跑现有 `_pw_srs_e2e.js`（含 .yhspack 导入 + 5天练习），确认 choice 行为不变
- **flip 基础流程**：新增 Playwright 测试，导入含 flip 卡的 .yhspack，验证正背面渲染、翻转动画、自评按钮触发 SRS 写入
- **单元测试**：`run_all.js` 无需新增（flip renderer 是 DOM 层，不涉及纯函数）
