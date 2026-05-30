# 语音辅助系统设计文档

**日期：** 2026-05-30  
**版本：** v1.0  
**状态：** 待实现

---

## 一、目标

为不熟悉移动设备的用户（老人、儿童）提供全面的语音引导体验，同时支持家属录制个性化声音作为情感陪伴。设计原则：

- TTS 兜底，家属录音优先覆盖
- 功能性提示用 TTS，情感性陪伴支持家属录音
- 内容即开关：文案为空且无录音 → 不播报
- 不新增 UI 开关，降低设置复杂度

---

## 二、核心架构

### 统一语音入口 `playVoiceSlot(slotName, ttsText, ttsLang?)`

所有语音触发点统一调用此函数：

```
playVoiceSlot(slotName, ttsText, ttsLang?)
  → 查 IDB voiceSlots[slotName].audioBlob
  → 有录音：HTMLAudioElement 播放 Blob
  → 无录音：检查 ttsText 是否非空
    → 非空：speak(ttsText, 0, null, ttsLang)
    → 空：静默，不播报
```

**功能性槽位**（`quiz_prompt`、`opt_hint`）：根据 `card.cardType` 自动选择 ttsText，不支持录音。  
**情感性槽位**（其余 8 个）：TTS 兜底，家属可录音覆盖。

---

## 三、语音槽位（10 个）

### 3.1 固定节点（2 个）

| 槽位名 | 中文标签 | English | Español | 触发时机 | 默认文案（中） |
|--------|----------|---------|---------|----------|----------------|
| `session_start` | 开始练习 | Session Start | Inicio de práctica | `_launch()` 进入练习 | 加油，你可以的 |
| `session_finish` | 完成庆祝 | Session Complete | Sesión completada | finish 屏出现 | 太棒了，今天练习完成了 |

### 3.2 情绪触发（1 个）

| 槽位名 | 中文标签 | English | Español | 触发条件 | 默认文案（中） |
|--------|----------|---------|---------|----------|----------------|
| `streak_correct` | 连对表扬 | Correct Streak | Racha de aciertos | 同 session 连对 3 次（每种最多触发一次） | 真厉害，连续答对了 |

### 3.3 辅助引导（3 个）

仅「启用语音辅助」开启时生效，每次触发后冷却 60s。

| 槽位名 | 中文标签 | English | Español | 触发条件 | 默认文案（中） |
|--------|----------|---------|---------|----------|----------------|
| `idle_home` | 首页引导 | Home Nudge | Guía de inicio | 首页停留 8s 无操作 | 点一下牌组，开始今天的练习 |
| `idle_quiz` | 练习引导 | Quiz Nudge | Guía de práctica | 题目停留 15s 未答题 | 看看图片，选择你觉得对的答案 |
| `idle_browse` | 浏览引导 | Browse Nudge | Guía de exploración | 浏览停留 10s 未翻页 | 左右滑动，可以看更多照片 |

### 3.4 现有提示迁移（4 个）

原语音 Tab 中的提示统一迁移至新入口管理。

| 槽位名 | 中文标签 | English | Español | 触发时机 | choice 默认文案 | recognize 默认文案 |
|--------|----------|---------|---------|----------|-----------------|-------------------|
| `quiz_prompt` | 答题提示 | Question Prompt | Indicación de pregunta | 进题后 进题朗读延迟 到时 | 请选择答案 | 认识这个人吗 |
| `opt_hint` | 读出选项 | Read Options | Leer opciones | 选项出现后 选项朗读延迟 到时 | 请在{A}{B}中选择 | ❌ 不触发 |
| `wrong_hint` | 答错安慰 | Wrong Answer Support | Apoyo en error | 答错时 | 不要着急，再试一次 | — |
| `correct_hint` | 答对鼓励 | Correct Answer Praise | Elogio por acierto | 答对时 | 太棒了 | — |

`quiz_prompt` 和 `opt_hint` 为功能性槽位，不支持录音，按 `card.cardType` 自动选文案。

---

## 四、语音辅助页 UI

### 4.1 入口

设置 Sheet → 语音 Tab → 「语音辅助 ›」跳转进入独立页面。

### 4.2 全局参数区（7 个）

| 中文 | English | Español | 类型 | 默认值 | i18n key |
|------|---------|---------|------|--------|----------|
| 启用语音辅助 | Voice Assistance | Asistencia de voz | 开关 | 关 | `voice_assist_enable` |
| 语速 | Speech Rate | Velocidad | 滑块 0.5–2 | 0.85 | `settings_tts_rate`（复用） |
| 音调 | Pitch | Tono | 滑块 0.5–2 | 1.0 | `settings_tts_pitch`（复用） |
| 音色 | Voice | Voz | 下拉 | 自动 | `settings_tts_voice`（复用） |
| 进题朗读延迟 | Entry Read Delay | Retardo de lectura inicial | 滑块 0.5–5s | 1.5s | `voice_entry_read_delay` |
| 选项朗读延迟 | Option Read Delay | Retardo de lectura de opciones | 滑块 0.5–10s | 5s | `voice_opt_read_delay` |
| 答案朗读延迟 | Answer Read Delay | Retardo de lectura de respuesta | 滑块 0.5–5s | 1.2s | `voice_ans_read_delay` |

三个朗读延迟在 UI 中按时序顺序排列：进题 → 选项 → 答案。

### 4.3 槽位列表区

槽位按分组展示：固定节点 / 情绪触发 / 辅助引导 / 提示反馈。

每个槽位一行：

**无录音状态：**
```
[emoji] 槽位标签    默认文案（灰色）    [✏️ 改文案]  [🎙️ 录制]
```

**已录音状态（绿色边框）：**
```
[emoji] 槽位标签    ✓ 家人声音 Xs      [▶ 试听]  [🗑 删除]  [🎙️ 重录]
```

功能性槽位（`quiz_prompt`、`opt_hint`）只显示 `[✏️ 改文案]`，不显示录制按钮。

每个文案输入框旁有「恢复默认」按钮，防止用户清空后找不回默认文案（尤其是 `opt_hint` 的 `{A}{B}{C}` 模板语法）。

### 4.4 录制浮层

1. 显示槽位名 + 参考脚本（默认文案）
2. 「按住说话」大圆按钮，松开停止，最长 30s
3. 录制完自动试听回放
4. 底部「重录」/「保存」（录制前保存按钮禁用）

---

## 五、数据存储

### 5.1 IDB 新增 store：`voiceSlots`

```js
{
  slotName:   string,   // 槽位名，主键
  audioBlob:  Blob,     // 录音数据
  mimeType:   string,   // audio/webm 或 audio/mp4
  duration:   number,   // 秒
  recordedAt: number    // timestamp
}
```

**不上传云端**，纯本地存储（与卡片 audioUrl 策略一致）。

### 5.2 localStorage 新增键

| 键名 | 含义 | 默认值 |
|------|------|--------|
| `voiceAssistEnabled` | 语音辅助总开关 | `'0'` |
| `entryReadDelay` | 进题朗读延迟（ms） | `1500` |
| `optReadDelay` | 选项朗读延迟（ms） | `5000` |
| `ansReadDelay` | 答案朗读延迟（ms） | `1200` |

---

## 六、卡片类型扩展

### 6.1 本地卡片对象新增字段

```js
{
  // 现有字段...
  cardType: 'choice',   // 'choice' | 'recognize' | 'family' | 'riddle' | 'math' | 'clock'
  ext: {}               // 各类型专属扩展数据
}
```

默认值 `'choice'`，向后兼容。

### 6.2 云端 cards_pool 表新增字段

```sql
ALTER TABLE cards_pool ADD COLUMN card_type text NOT NULL DEFAULT 'choice';
ALTER TABLE cards_pool ADD COLUMN ext jsonb NOT NULL DEFAULT '{}'::jsonb;
```

### 6.3 卡牌类型说明

| card_type | 说明 | 交互 | ext 示例 |
|-----------|------|------|----------|
| `choice` | 标准多选一 | 2–4 选项 | `{}` |
| `recognize` | 识别类（亲人卡） | 「我认识」+ 下一题 | `{ description_audio_url: "..." }` |
| `family` | 家庭照片/短视频 | 自动播描述音频 | `{ people: ["小华", "小联"] }` |
| `riddle` | 猜谜（线索选答） | 多选一 | `{}` |
| `math` | 数量估算/计算 | 多选一 | `{ auto_distractors: true }` |
| `clock` | 时间定向 | 多选一 | `{}` |

---

## 七、术语变更对照表

### 7.1 代码变量

| 旧变量 | 新变量 | 处理 |
|--------|--------|------|
| `QUIZ_PROMPT_DELAY` | `ENTRY_READ_DELAY` | 重命名，开放 UI |
| `OPT_HINT_DELAY` | `OPT_READ_DELAY` | 重命名，开放 UI |
| `SPEAK_DELAY` | `ANS_READ_DELAY` | 重命名，开放 UI |
| `BROWSE_SPEAK_DELAY` | `ANS_READ_DELAY`（合并） | 与 SPEAK_DELAY 统一 |
| `QUIZ_PROMPT_ON` | —— | 删除布尔变量 |
| `OPT_HINT_ON` | —— | 删除 |
| `WRONG_HINT_ON` | —— | 删除 |
| `CORRECT_HINT_ON` | —— | 删除 |
| `READ_HINT` | —— | 删除，改为判断 `q.details` 非空 |

### 7.2 i18n 键变更

| 旧 key | 新 key | 变更类型 |
|--------|--------|----------|
| `settings_quiz_prompt_delay` | `voice_entry_read_delay` | 重命名 |
| `settings_opt_hint_delay` | `voice_opt_read_delay` | 重命名 |
| `settings_answer_delay` | —— | 删除 |
| `settings_browse_answer_delay` | —— | 删除（移入通用设置已有项） |
| `settings_read_hint` | —— | 删除（toggle 移除） |
| `settings_quiz_prompt`（toggle label） | —— | 删除 toggle 行 |
| `settings_opt_hint`（toggle label） | —— | 删除 toggle 行 |
| `settings_wrong_hint`（toggle label） | —— | 删除 toggle 行 |
| `settings_correct_hint`（toggle label） | —— | 删除 toggle 行 |
| `settings_opt_hint`（section/slot label） | `voice_slot_opt_hint` | 重命名，含义改为「读出选项」 |
| `settings_wrong_hint`（slot label） | `voice_slot_wrong_hint` | 重命名，含义改为「答错安慰」 |
| `settings_correct_hint`（slot label） | `voice_slot_correct_hint` | 重命名，含义改为「答对鼓励」 |
| `settings_quiz_prompt`（slot label） | `voice_slot_quiz_prompt` | 重命名，含义改为「答题提示」 |

### 7.3 槽位标签三语对照

| 槽位 | 中文 | English | Español |
|------|------|---------|---------|
| `session_start` | 开始练习 | Session Start | Inicio de práctica |
| `session_finish` | 完成庆祝 | Session Complete | Sesión completada |
| `streak_correct` | 连对表扬 | Correct Streak | Racha de aciertos |
| `idle_home` | 首页引导 | Home Nudge | Guía de inicio |
| `idle_quiz` | 练习引导 | Quiz Nudge | Guía de práctica |
| `idle_browse` | 浏览引导 | Browse Nudge | Guía de exploración |
| `quiz_prompt` | 答题提示 | Question Prompt | Indicación de pregunta |
| `opt_hint` | 读出选项 | Read Options | Leer opciones |
| `wrong_hint` | 答错安慰 | Wrong Answer Support | Apoyo en error |
| `correct_hint` | 答对鼓励 | Correct Answer Praise | Elogio por acierto |

### 7.4 localStorage 迁移

启动时执行一次性迁移：

```js
// 旧 toggle 为关闭 → 清空对应文案（内容即开关）
if (localStorage.getItem('quizPromptOn') === '0') localStorage.removeItem('phraseSelect');
if (localStorage.getItem('optHintOn')   === '0') localStorage.removeItem('phraseOptHint');
if (localStorage.getItem('wrongHintOn') === '0') localStorage.removeItem('phraseWrong');
if (localStorage.getItem('correctHintOn') === '0') localStorage.removeItem('phraseCorrect');
// 清理旧键
['quizPromptOn','optHintOn','wrongHintOn','correctHintOn','readHint',
 'speakDelay','browseDelay','qpDelay','ohDelay'].forEach(k => localStorage.removeItem(k));
```

---

## 八、实现注意事项

### 8.1 iOS MediaRecorder 兼容
- 优先 `audio/webm;codecs=opus`，iOS 不支持时降级 `audio/mp4`
- 录制前必须在用户手势内调用 `warmupSpeech()`
- 录制最长 30s，超时自动停止

### 8.2 Idle 计时器管理
- 每个 idle 槽位独立计时器，屏幕切换时必须 `clearTimeout` 防内存泄漏
- 触发后设置 60s 冷却，同一屏幕内不重复播
- 辅助引导仅在 `voiceAssistEnabled === true` 时启动计时器

### 8.3 连对计数器（streak_correct）
- `_correctStreak` 计数器随答题递增，答错或 session 结束时归零
- 达到 3 次触发一次，之后计数器继续但不再触发（同 session 最多一次）

### 8.4 功能性槽位分型
- `playVoiceSlot` 读取当前卡片 `card.cardType`
- `quiz_prompt`：`cardType === 'recognize'` 使用识别文案，否则默认文案
- `opt_hint`：`cardType === 'recognize'` 直接 return，不播报

---

## 九、规划（本次不实现）

- **家人陪伴模式**：交互流程不自动翻牌，等待口头回答
- **亲人卡完整交互**：`family` 类型卡片自动播放 `ext.description_audio_url` 描述音频
- **排序题**：全新数据结构 + UI 组件
- **admin 端医疗术语清理**：参见 `no-medical-terms` 记忆

---

## 十、实现拆分建议

**PR 1 — 基础架构**（可独立测试）
- `playVoiceSlot()` 函数 + IDB `voiceSlots` store
- 录制浮层组件
- 4 个现有触发点迁移
- localStorage 迁移脚本
- 旧布尔变量删除

**PR 2 — 语音辅助完整页**
- 独立页面 + 入口
- 全局参数 7 个
- 槽位列表 + 录制/试听/删除
- 6 个新触发点（session_start/finish、streak_correct、3 个 idle）
- `card_type` + `ext` 字段
- i18n 三语（中/英/西）
