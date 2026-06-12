# Per-Locale Voice Phrases — Design Spec

**Date:** 2026-06-12
**Status:** Approved

## Background

语音辅助有 8 个提示词槽位，每个槽位支持自定义 TTS 脚本文字。当前所有脚本存在 `yh:v1:config:voice` 的扁平字段里（`phraseWrong`、`phraseCorrect` 等）。

**问题：** `setLocale()` 切换语言时会清空所有 phrase 字段并覆盖新语言默认值，用户自定义内容永久丢失。功能性槽位（`quiz_prompt`）因有内存变量 `PHRASE_SELECT` 而感知明显；情绪槽位（`wrong_hint` 等）列表视图只显示录制状态，用户不易察觉已被覆盖。

**目标：** 每种 UI 语言独立保存一套提示词脚本，切换语言时自动加载对应语言的自定义内容，互不干扰。

## Scope

- **包含：** 8 个 phrase 字段的 TTS 脚本文字，按 locale 分组存储
- **不包含：** IDB 录音音频（各语言共用同一录音）、云端 sync_config schema 变更（保持现有扁平格式不变）

## Data Structure

`yh:v1:config:voice` 内新增 `phrases` 子对象，非 phrase 字段原地不动：

```json
{
  "ttsRate": "0.85",
  "voiceMuted": "0",
  "voiceAssistEnabled": "1",
  "phrases": {
    "zh-CN": {
      "phraseWrong": "没关系，再来一次！",
      "phraseCorrect": "太棒了！",
      "phraseStreakCorrect": "连续答对！",
      "phraseSessionFinish": "今天练习完了！",
      "phraseIdleBrowse": "来练一练吧",
      "phraseOptHint": "提示：选项在下方",
      "phraseQuizPrompt": "选一个答案",
      "phraseQuizPromptRecognize": "认识这个人吗"
    },
    "en": {
      "phraseWrong": "Don't worry, try again!",
      "phraseCorrect": "Great job!"
    }
  }
}
```

**规范符合性：**
- 无新 LS key；`yh:v1:config:voice` 已注册且合规
- `phrases` 字段名 camelCase ✓；`zh-CN` 等是 JSON 子键，非 LS key 段，不适用 camelCase 规则
- 5 locale × 8 phrase 约 40 条短字符串，总量远 < 5KB，符合聚合阈值
- 所有访问继续走 `getVoiceField` / `setVoiceField` helper ✓

## Constants

```js
const PHRASE_VOICE_FIELDS = [
  'phraseWrong', 'phraseCorrect', 'phraseStreakCorrect', 'phraseSessionFinish',
  'phraseIdleBrowse', 'phraseOptHint', 'phraseQuizPrompt', 'phraseQuizPromptRecognize'
];
```

## Helper Changes

### `getVoiceField(name, def)`

对 `PHRASE_VOICE_FIELDS` 内的字段路由至 `cfg.phrases[getLocale()]`，其余字段走原扁平路径：

```js
function getVoiceField(name, def = null) {
  const cfg = getVoiceConfig();
  if (PHRASE_VOICE_FIELDS.includes(name)) {
    const v = (cfg.phrases?.[getLocale()] || {})[name];
    return v == null ? def : v;
  }
  const v = cfg[name];
  return v == null ? def : v;
}
```

### `setVoiceField(name, value)`

对 phrase 字段写入 `cfg.phrases[getLocale()]`：

```js
function setVoiceField(name, value) {
  const cfg = getVoiceConfig();
  if (PHRASE_VOICE_FIELDS.includes(name)) {
    if (!cfg.phrases) cfg.phrases = {};
    if (!cfg.phrases[getLocale()]) cfg.phrases[getLocale()] = {};
    if (value == null) delete cfg.phrases[getLocale()][name];
    else cfg.phrases[getLocale()][name] = String(value);
  } else {
    if (value == null) delete cfg[name];
    else cfg[name] = String(value);
  }
  lsSetJSON('yh:v1:config:voice', cfg);
}
```

调用方（`openRecordingOverlay`、`onSlotRowTap`、`playVoiceSlot`、`cloudPullConfig` 等）零改动。

## setLocale Changes

删除切换语言时的清空循环，改为从新 locale 的 phrases 读取内存变量：

```js
// 删除（共 3 行）：
// ['phraseQuizPrompt', 'phraseOptHint', 'phraseWrong',
//  'phraseCorrect', 'phraseStreakCorrect',
//  'phraseSessionFinish', 'phraseIdleBrowse'].forEach(k => setVoiceField(k, null));

// 替换为：
PHRASE_SELECT   = getVoiceField('phraseQuizPrompt') || t('quiz_select_hint');
PHRASE_OPT_HINT = getVoiceField('phraseOptHint')    || t('default_opt_hint');
```

切换后 `getVoiceField` 自动读新 locale 的数据，无自定义时 fallback `t(key)`。

## loadSettings Simplification

`loadPhraseOrDefault` 原本用于检测"存储值是否为某语言默认值，防止跨设备污染"。改用 per-locale 存储后，跨语言污染路径消失，该函数可删除：

```js
// 替换 loadPhraseOrDefault 的两处调用：
PHRASE_SELECT   = getVoiceField('phraseQuizPrompt') || t('quiz_select_hint');
PHRASE_OPT_HINT = getVoiceField('phraseOptHint')    || t('default_opt_hint');
```

## Migration

新增 `migrateLangPhrases()`，在现有 `migrateVoiceConfig()` 之后、`loadSettings()` 之前调用：

```js
function migrateLangPhrases() {
  const cfg = getVoiceConfig();
  if (cfg.phrases) return; // 幂等：已迁移
  const localeData = {};
  for (const k of PHRASE_VOICE_FIELDS) {
    if (cfg[k] != null) { localeData[k] = cfg[k]; delete cfg[k]; }
  }
  cfg.phrases = Object.keys(localeData).length
    ? { [getLocale()]: localeData }
    : {};
  lsSetJSON('yh:v1:config:voice', cfg);
}
```

启动期包 try/catch，migrate 失败不阻塞启动。

## Cloud Sync

**原则：云端 `sync_config` schema 不变，保持扁平格式，已部署版本无缝兼容。**

- **`cloudPushConfig`：** 展开当前 locale 的 phrase 字段为扁平格式上传（与现有云端字段名一致）。原 `...getVoiceConfig()` 展开需排除 `phrases` 对象，改为手动展开 `cfg.phrases?.[getLocale()] || {}`。
- **`cloudPullConfig`：** 无需改动。pull 时 `setVoiceField(k, v)` 自动将 phrase 字段写入当前 locale 的 `phrases[locale]`。

跨设备行为：设备 A（中文）push 中文脚本 → 云端存 `phraseWrong` 等扁平字段 → 设备 B（英文）pull → 写入设备 B 当前 locale（英文）的 phrases，不污染设备 B 的中文脚本。

## Change Summary

| 文件 | 改动 |
|------|------|
| `index.html` | 新增 `PHRASE_VOICE_FIELDS` 常量 |
| `index.html` | `getVoiceField` / `setVoiceField` 加路由（约 +10 行）|
| `index.html` | `setLocale`：删 3 行清空循环，改 2 行读取 |
| `index.html` | `loadSettings`：删 `loadPhraseOrDefault` 两处调用，改直读 |
| `index.html` | 删除 `loadPhraseOrDefault` 函数 |
| `index.html` | 新增 `migrateLangPhrases`（约 12 行），启动期调用 |
| `index.html` | `cloudPushConfig`：修改 phrases 展开逻辑 |

所有 voice assist 录制/编辑 UI、`playVoiceSlot`、`cloudPullConfig` 等调用方：**零改动**。

## Testing

**单元测试（`tests/yihai_v5.15_lang_phrases_test.js`）：**
- `setVoiceField` 写 phrase 字段存入正确 locale
- `getVoiceField` 读取当前 locale 的值，未设置时 fallback null
- 切换 locale 后读取返回新 locale 的值
- 非 phrase 字段不受影响（继续走扁平路径）
- `migrateLangPhrases` 幂等，将旧扁平 phrase 字段迁移至当前 locale

**Playwright 回归：**
- `_pw_ui_smoke.js`（语言切换流程）
- `_pw_config_sync.js`（云同步 phrase 字段）
