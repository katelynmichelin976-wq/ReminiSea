# 语音辅助参数同步回归测试设计

**文件**：`tests/_pw_config_sync.js`  
**触发时机**：语音参数或 config 同步相关改动 → 加跑此文件  
**依赖**：`python -m http.server 8080`、`$env:TEST_PASSWORD="xxx"`

---

## 测试原则

凡涉及存储操作（localStorage、IDB、Supabase 表），每一层都要直接读库核对：
- 写操作后 → 直接查对应存储层，断言值存在且正确
- 跨设备场景 → push 后先验云端，pull 后验本地 == 云端

---

## 覆盖范围

### 语音文字参数全集（13 个 key，全部在 `cloudPushConfig` 的 `localUi` 里）

| 分类 | key |
|------|-----|
| 文案提示 | `phraseQuizPrompt`、`phraseQuizPromptRecognize`、`phraseWrong`、`phraseOptHint`、`phraseCorrect` |
| 延迟数值 | `ansReadDelay`、`optReadDelay`、`browseAnsDelay` |
| TTS 参数 | `ttsRate`、`ttsPitch`、`ttsVoiceName` |
| 开关 | `voiceMuted`、`voiceAssistEnabled` |

### 废弃 key（cloudPushConfig 合并后必须删除）

`phrase_quiz_prompt`、`phrase_quiz_prompt_recognize`、`phrase_opt_hint`、`phraseSelect`

---

## PHASE 0：初始化 + 登录

- 清空 localStorage / IDB
- 登录测试账号
- `waitSyncDone()` 等待首次同步完成

---

## PHASE 1：全量语音文字参数 push→pull 一致性

**目标**：验证 13 个 voice 参数能完整经由 `cloudPushConfig` 推送到云端，再经由 `cloudPullConfig` 还原到本地，且运行时全局变量映射正确。

**步骤**：

1. 向 localStorage 写入全部 13 个 key（使用 `pw-test-` 前缀值便于识别）
2. 调用 `cloudPushConfig()`
3. **直接读 Supabase `sync_config.config_json.ui`**，断言以下 key 值与写入值一致：
   - `phraseQuizPrompt`（文案类）
   - `phraseWrong`（文案类）
   - `ansReadDelay`（数值类）
   - `voiceMuted`（布尔开关）
   - `ttsRate`（TTS 类）
4. 从 localStorage 清除全部 13 个 key
5. 调用 `cloudPullConfig()`
6. **读 localStorage**，断言值 == 步骤 3 中云端读到的值（全部 13 个 key）
7. 断言运行时全局变量映射正确：
   - `PHRASE_SELECT === "pw-test-问题提示"`
   - `ANS_READ_DELAY === 3500`（3.5 × 1000）
   - `VOICE_MUTED === true`

**断言数**：约 10 个

---

## PHASE 2：废弃 snake_case key 清理

**目标**：验证即使云端 config_json 中残留废弃 key，经过一次 `cloudPushConfig` 后也会被彻底清除。

**步骤**：

1. 直接通过 `_sb.from('sync_config').upsert(...)` 向云端写入含废弃 key 的 config_json：
   ```json
   { "ui": { "phrase_quiz_prompt": "old", "phrase_opt_hint": "old", "phraseSelect": "old" } }
   ```
2. 调用 `cloudPushConfig()`
3. **直接读 Supabase `sync_config.config_json.ui`**，断言以下 4 个 key 全部不存在：
   - `phrase_quiz_prompt`
   - `phrase_quiz_prompt_recognize`
   - `phrase_opt_hint`
   - `phraseSelect`

**断言数**：2 个（存在性检查 × 4 合为 1 个断言；再断言合法 key 仍在）

---

## PHASE 3：跨设备语音参数传播

**目标**：验证设备 A 的 voice 参数经云端后，设备 B 登录后能完整接收，且本地值 == 云端值。

**步骤**：

1. **设备 A**：向 localStorage 写入代表性 voice params（`phraseWrong`、`optReadDelay`、`voiceAssistEnabled`、`phraseQuizPromptRecognize`）→ 调用 `cloudPushConfig()`
2. **设备 A**：直接读 Supabase `sync_config.config_json.ui`，断言 4 个 key 云端值正确
3. **设备 B**（新 BrowserContext）：清空本地 → 登录同账号 → `waitSyncDone()`
4. **设备 B**：读 localStorage，断言每个 key 值 == 步骤 2 中读到的云端值
5. **设备 B**：断言运行时变量 `PHRASE_WRONG` / `OPT_READ_DELAY` 映射正确

**断言数**：约 6 个

---

## PHASE 4：语音录音 URL 同步（骨架，待实现）

> **前提**：依赖「语音录音上传 Supabase Storage」功能，该功能有独立设计文档，实现后填充此 PHASE。

**预计测试逻辑**：

1. 设备 A 录制语音槽 → 上传 Supabase Storage → 写入 URL/路径到 localStorage → `cloudPushConfig()`
2. 直接读 Supabase Storage，通过 `createSignedUrl` 断言文件可访问
3. 设备 B 登录 → pull → 下载录音写入 IDB
4. 断言设备 B IDB `voiceSlots` 中对应 blob 有效（`URL.createObjectURL` 可生成 `blob:` URL）

---

## 断言汇总

| PHASE | 内容 | 断言数 |
|-------|------|--------|
| 1 | push→pull 全量 13 key 一致性 + 运行时变量 | ~10 |
| 2 | 废弃 key 清理 | 2 |
| 3 | 跨设备传播 + 本地 == 云端核对 | ~6 |
| 4 | 语音录音 URL（骨架） | 0（待填充） |
| **合计** | | **~18** |

---

## CLAUDE.md 补充

测试范围规则新增一条：
> 语音参数或 config 同步改动 → 加跑 `_pw_config_sync.js`
