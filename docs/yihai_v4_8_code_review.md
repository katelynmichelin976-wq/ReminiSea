# 忆海拾光 v4.8 — Code Review

> 审查范围：架构、安全、性能、健壮性、可维护性  
> 文件：`yihai_v4_8.html`（5340 行，单文件 PWA）

---

## 总体评价

整体完成度很高，SRS 引擎、IndexedDB 媒体缓存、Supabase 云同步、多屏幕导航、TTS 语音链路均有清晰的设计思路。代码风格一致，面向目标用户（老人认知训练）的 UX 细节处理得好。

主要问题集中在三个方向：**安全（XSS）**、**资源泄漏**、**单文件超长的可维护性**。

---

## 🔴 高优先级问题

### 1. XSS 漏洞 — innerHTML 拼接未转义

**位置：** `renderDeckList()`、`checkMedia()`、`showConfirmDialog()`

```js
// renderDeckList — deck.name 直接拼入 innerHTML
`<div class="deck-name">${m.name}</div>`

// showConfirmDialog — msg 只做了 < 转义，& " ' 均未转义
mask.innerHTML = `<div class="yh-dialog-msg">${msg.replace(/</g,'&lt;')}</div>`

// checkMedia — 拼 HTML 字符串时 orphans.length 等是数字无害，
// 但 fmt() 返回的字符串若 blob 名含特殊字符就有问题
```

**影响：** 用户导入恶意 `.yhspack`，`deck.name` 包含 `<script>` 即可执行任意代码。

**修复方案：**

```js
// 统一使用 textContent 或封装 esc()
function esc(s) {
  return String(s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;')
    .replace(/'/g,'&#39;');
}

// 渲染卡片名时
`<div class="deck-name">${esc(m.name)}</div>`
```

> 注意：文件末尾已有 `esc()` 函数定义（`checkMedia` 内部使用），
> 但 `renderDeckList` 等函数没有调用它，需要统一补全。

---

### 2. `deleteDeck` 使用原生 `confirm()`，与 PWA 环境不一致

**位置：** `deleteDeck()` 第 3006 行

```js
if (!confirm(`删除牌组「${meta.name}」？`)) return;
```

项目其他地方已经用 `showConfirmDialog()` 替代 iOS PWA 下被屏蔽的 `confirm()`，
但 `deleteDeck` 还在用原生 `confirm`，在 iOS PWA 模式下会**静默失败**（直接返回 false）导致删除功能不可用。

**修复：**

```js
async function deleteDeck(e, key) {
  e.stopPropagation();
  const meta = DECKS_META.find(m => m.key === key);
  if (!meta || meta.builtin) return;
  const ok = await showConfirmDialog(`删除牌组「${esc(meta.name)}」？`);
  if (!ok) return;
  // ...
}
```

同时 `onclick="deleteDeck(event,'${m.key}')"` 需要改成异步调用方式（移除 inline onclick，改用 `addEventListener`）。

---

### 3. ObjectURL 泄漏

**位置：** `restoreDecks()`、`importYhspack()`

```js
card.img = URL.createObjectURL(imgBlob);
card.audioUrl = URL.createObjectURL(audBlob);
```

每次 `restoreDecks()` 调用都会创建新的 ObjectURL，但旧的从不 `revokeObjectURL()`。
用户多次刷新或切换牌组，内存会持续增长，在低端 Android 平板上尤为明显。

**修复：**

```js
// 在替换前先释放旧的
if (card.img && card.img.startsWith('blob:')) URL.revokeObjectURL(card.img);
card.img = URL.createObjectURL(imgBlob);
```

或者改用 `indexedDB` 存储的 Blob 每次按需创建 ObjectURL，用完即 revoke。

---

## 🟡 中优先级问题

### 4. CSS 重复定义

```css
/* 第 317 行 */
.img-zone { width:100%; max-width:500px; flex-shrink:0; padding:0 16px; }

/* 第 344 行 */
.img-zone { flex-shrink:0; padding:0 16px; }

/* 第 350 行 */
.mid-zone { flex:1; min-height:0; padding:0 16px 8px; ... }

/* 第 328 行 */
.mid-zone { flex:1; min-height:0; width:100%; max-width:500px; padding:0 16px; ... }
```

`.img-zone` 和 `.mid-zone` 各被定义了两次，后面的定义覆盖前面的部分属性，逻辑容易混淆。
建议合并为单一规则块。

---

### 5. `syncPendingData` 中逐条写入没有并发控制

**位置：** 第 1906 行

```js
for (const t of pending) {
  try { await syncTrialLog(t); } catch(e) { ... }
}
```

如果 `pending` 有 100 条记录，会串行发 100 次网络请求。补传场景通常在重连后批量执行，建议改为并发批次：

```js
const BATCH = 10;
for (let i = 0; i < pending.length; i += BATCH) {
  await Promise.allSettled(pending.slice(i, i + BATCH).map(t => syncTrialLog(t)));
}
```

---

### 6. `buildOptions` 选项顺序可预测

**位置：** 第 2635 行

```js
const options = [{ name: card.name, cardId: card.id }, ...distractors];
return { options, correct: 0 };  // correct 永远是 0（第一个）
```

正确答案**始终放在第 0 位**，然后在 `renderOpts` 里再 shuffle。
这本身没有 bug，但依赖外部 shuffle，如果 shuffle 逻辑有一天被省略，答案位置就会泄漏。
建议直接在 `buildOptions` 里完成随机，返回的 `correct` 也随机化，避免隐式依赖。

---

### 7. 全局变量过多，容易污染和难以追踪

文件中有大量顶层 `let`/`const`，包括：

```js
let currentDeck, currentMode, Qs, qIdx, sel, revealed, wrongCount;
let nRaf, nStart, NDUR, BDUR, SPEAK_DELAY;
let QUIZ_PROMPT_ON, QUIZ_PROMPT_DELAY, PHRASE_SELECT;
// ...约 30+ 个全局变量
```

这些状态高度耦合，任何函数都可以静默修改它们。建议将练习 session 相关状态封装成一个对象：

```js
const session = {
  deckKey: null, mode: 'quiz', questions: [],
  qIdx: 0, sel: null, revealed: false, wrongCount: 0,
  // ...
};
```

---

### 8. `importYhspack` 中图片 MIME 类型硬编码为 `image/jpeg`

**位置：** 第 2866 行

```js
const blob = new Blob([buf], { type: 'image/jpeg' });
```

`.yhspack` 中可能包含 PNG、WebP 等格式，统一用 `image/jpeg` 会导致部分图片在某些浏览器渲染异常（尤其是带透明通道的 PNG）。

**修复：**

```js
const imgExt = (c.image.split('.').pop() || 'jpg').toLowerCase();
const imgMime = { jpg:'image/jpeg', jpeg:'image/jpeg', png:'image/png',
                  webp:'image/webp', gif:'image/gif' }[imgExt] || 'image/jpeg';
const blob = new Blob([buf], { type: imgMime });
```

---

## 🟢 低优先级 / 建议

### 9. `cloudPushConfig` 的 localStorage key 列表与 `SRS_CONFIG` 不同步

`cloudPushConfig` 里硬编码了 `NUM_KEYS` 数组，与 `SRS_CONFIG` 对象的实际 key 列表是两份维护。
新增 SRS 参数时容易漏掉同步。建议改为从 `SRS_CONFIG` 动态提取 key：

```js
Object.keys(SRS_CONFIG).forEach(k => {
  const v = localStorage.getItem('srs_' + k);
  if (v !== null) srs[k] = typeof SRS_CONFIG[k] === 'boolean' ? v === '1' : parseFloat(v);
});
```

---

### 10. Service Worker 被注释掉，但 manifest.json 仍存在

```js
// Service Worker 暂未启用（GitHub Pages App-Bound Domain 限制）
// 待绑定独立域名后恢复
```

没有 Service Worker 的 PWA 在离线时完全不可用，首次加载也无缓存加速。
注释里提到"待绑定独立域名后恢复"，这是合理的，但建议在 manifest 中也注明，
或者用一个最简单的 SW（只缓存 HTML 本身）先让 PWA 安装可用。

---

### 11. `minsToLabel` 函数重复定义

`syncSrsSettingsUI` 和 `onSrsStepsInput` 里各自定义了一次相同逻辑的 `minsToLabel`：

```js
// 第 5191 行（syncSrsSettingsUI 内部）
function minsToLabel(n) { ... }

// 第 5116 行（onSrsStepsInput 内部）
const labels = arr.map(n => {
  if (n >= 1440 && n % 1440 === 0) return ...  // 同样的逻辑
```

提取为模块级函数即可消除重复。

---

## 总结

| 优先级 | 问题 | 数量 |
|--------|------|------|
| 🔴 高  | XSS 漏洞、iOS PWA `confirm` 失效、ObjectURL 泄漏 | 3 |
| 🟡 中  | CSS 重复、批量同步串行、选项顺序隐式依赖、全局变量、图片 MIME 类型 | 5 |
| 🟢 低  | 配置 key 双份维护、SW 缺失、函数重复 | 3 |

**最紧急修复顺序：**
1. 补全 `esc()` 调用，修复 XSS（影响安全）
2. `deleteDeck` 改用 `showConfirmDialog`（影响 iOS 功能可用性）
3. 补加 `revokeObjectURL`（影响低端设备内存）
