# 术语统一：牌组 + 卡片 Design

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 将 app 内所有用户可见文字统一为「牌组／卡片」，消除「相册」混用带来的歧义。

**决策依据：**
- 「牌组」对齐国际 SRS 工具（Anki）的 Deck 概念：用户自制、含媒体（图片/音频）、配合间隔重复练习的卡片集合
- 「卡片」是最日常的中文词（无游戏联想），对应英文 Card
- 代码内部标识符（`deck`、`DECKS`、`deck_key`、CSS class）**不变**，仅改用户可见字符串

---

## 现状问题

| 位置 | 现在显示 | 问题 |
|------|----------|------|
| 首页牌组区标题 | 我的相册 | 与「相册」App 混淆，不体现学习功能 |
| 新建按钮 aria-label | 新建牌组 | ✓ 已正确 |
| 统计 Tab | 牌组 | ✓ 已正确 |
| 登录提示、高级模式说明 | 牌组 | ✓ 已正确 |
| 英文 `home_album_section` | My Albums | 应改为 My Decks |
| 西文 `home_album_section` | Mis Álbumes | 应改为 Mis Mazos |

**结论：唯一需要修改的用户可见术语是首页标题「我的相册」及其对应 i18n key 的英文/西文值。**

---

## 术语对照表（最终）

| 概念 | 中文 | English | Español |
|------|------|---------|---------|
| 集合（Deck） | 牌组 | Deck | Mazo |
| 单张（Card） | 卡片 | Card | Tarjeta |
| 首页区块标题 | 我的牌组 | My Decks | Mis Mazos |

---

## 变更范围

### 仅改 i18n 字符串，不改代码结构

**`home_album_section` key（3 个语言）：**

```
zh-CN: 我的相册  →  我的牌组
en:    My Albums  →  My Decks
es:    Mis Álbumes →  Mis Mazos
```

**HTML 默认文本（fallback）：**

```html
<!-- 旧 -->
<span id="album-section-lbl" data-i18n="home_album_section">我的相册</span>

<!-- 新 -->
<span id="album-section-lbl" data-i18n="home_album_section">我的牌组</span>
```

### 不变的部分

- CSS class 名：`.album-section-lbl`、`.album-nav-btn`（内部标识符）
- JS 变量：`DECKS`、`currentDeck`、`deck_key` 等
- DB 字段：`deck_id`、`deck_type`、`deck_cards` 等
- i18n key 名称本身：`home_album_section` 保留（key 名不影响用户）
- 其他已正确使用「牌组」的文字

---

## 验收标准

1. 首页牌组区标题显示「我的牌组」
2. 切换到英文显示「My Decks」
3. 切换到西班牙文显示「Mis Mazos」
4. 其他所有「牌组」文字保持不变
5. 无「相册」字样出现在用户界面

---

## 实施文件

- `yihai_v5.1.html`：单文件 HTML，修改 i18n 对象内 `home_album_section` 的 3 处值 + HTML fallback 文本 1 处
