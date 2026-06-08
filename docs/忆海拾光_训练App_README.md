# 忆海拾光 · 训练 App

> 家庭记忆与学习卡片 PWA — 看图识字、睡前故事、方言传承，一人制作，家人使用  
> 妈妈的生日刻在每一张卡片里：MID `1948020901972`

---

## 项目结构

```
gemi 仓库（GitHub Pages）
├── index.html          # 训练 App 主文件（当前版本即此文件）
├── manifest.json       # PWA manifest
├── icon-192.png
├── icon-512.png
└── sw.js               # Service Worker（暂未启用，见下方说明）

anki-maker 仓库（GitHub Pages）
└── index_v49.html      # 制卡工具（重命名为 index.html 部署）
```

**工作文件：** `/home/claude/yihai_app.html`（固定文件名，输出为 `yihai_v{版本}.html`）

---

## 快速部署

1. 将当前版本文件重命名为 `index.html`
2. 推送到 `gemi` 仓库的 `main` 分支
3. GitHub Pages 自动发布

**Service Worker 说明：** 当前暂未注册 SW。GitHub Pages 的 App-Bound Domain 限制导致 SW 在 PWA standalone 模式下行为异常，待绑定独立域名后恢复。

---

## 数据格式

### .yhspack（制卡工具导出 / 训练 App 导入）

```
{deckName}.yhspack  （ZIP 格式）
├── deck.json
└── media/
    ├── {cardId}.jpg
    └── {cardId}.m4a
```

### deck.json 结构

```json
{
  "version": "1.0",
  "exportedAt": "ISO8601",
  "deck": {
    "id": "hash8",
    "name": "蔬菜",
    "cards": [
      {
        "id": "hash8",
        "name": "苹果",
        "image": "media/abc12345.jpg",
        "audio": "media/abc12345.m4a"
      }
    ]
  }
}
```

---

## 本地存储架构

| 存储 | 内容 | 键名 |
|------|------|------|
| localStorage | 牌组索引（id+name）| `yihai_decks_index` |
| localStorage | 卡片元数据（id+name，无媒体）| `yihai_deck_{key}` |
| localStorage | 所有设置参数 | 各参数独立键名 |
| localStorage | SRS 配置覆盖 | `srs_{paramName}` |
| localStorage | 每日进度 | `yihai_daily_progress` |
| IndexedDB `yihai_media` | 图片 blob | `{deckKey}_{cardId}_img` |
| IndexedDB `yihai_media` | 录音 blob | `{deckKey}_{cardId}_aud` |
| localStorage | 会员标记（是否曾登录）| `yihai_has_ever_logged_in` |
| IndexedDB `yihai_srs` v4 | CardState（SRS 状态）| `card_states` store，key=`{deckKey}::{cardId}` |
| IndexedDB `yihai_srs` v4 | TrialLog（答题记录）| `trials` store |
| IndexedDB `yihai_srs` v4 | 应用事件日志 | `app_events` store（会员完整记录/非会员限50条）|
| IndexedDB `yihai_srs` v4 | CardState 变更日志 | `card_state_log` store（仅会员）|

---

## SRS 系统说明

### 算法：AD 改良版 SM-2

| 参数 | Anki 默认 | AD 建议值 | 说明 |
|------|---------|---------|------|
| `learning_steps` | `[1, 10]` | `[1, 5, 10, 30]` | 分钟，支持 m/h/d 输入 |
| `relearning_steps` | `[10]` | `[10, 60, 180]` | 分钟，支持 m/h/d 输入 |
| `graduating_interval` | 1天 | 1天 | 毕业后首次间隔 |
| `maximum_interval` | 36500天 | 7天 | 超过此值视为「已掌握」|
| `starting_ease` | 2.50 | 1.30 | 初始易度 |
| `interval_modifier` | 1.00 | 0.80 | 全局间隔乘数 |
| `learn_ahead_limit` | 1200s | 1200s | 提前出题窗口，对应 Anki 同名参数 |
| `daily_remove_lapses` | - | 3次 | 连续失败当日移出阈值 |
| `auto_suspend_lapses` | - | 8次 | 累计失败自动挂起阈值 |
| `learning_hard_counts_lapse` | false | true | learning/relearning 阶段 Hard 计入连失 |

**参数命名规范：** 所有 SRS 参数与 Anki 同名对齐，不加任何后缀。

### 卡片状态流转

```
new → learning（学习中）→ review（复习中/已掌握）
                             ↓ Again
                         relearning（重学中）→ review
```

### 卡片状态显示规则

| srs_stage | interval | 显示标签 | 颜色 |
|---|---|---|---|
| new | - | 待开始 | 灰 |
| learning | - | 学习中 | 橙 |
| relearning | - | 重学中 | 红 |
| review | < maximum_interval | 复习中 | 蓝 |
| review | ≥ maximum_interval | 已掌握 | 绿 |
| suspended | - | 待确认 | 紫 |

---

## 版本历史

详细变更见 [`docs/yihai_变更记录_CLAUDE参考.md`](yihai_变更记录_CLAUDE参考.md)。

---

## 已知问题

| 问题 | 状态 | 说明 |
|------|------|------|
| PWA standalone 模式底部按钮下沉 | 未解决 | `position:absolute;inset:0` 在 PWA 下高度包含 Home Indicator，待重构布局时解决 |
| Service Worker 缓存 | 暂停 | GitHub Pages App-Bound Domain 限制，待绑定独立域名后恢复 |
| 单张卡片牌组边界 | 未验证 | 理论上循环正常，未专项测试 |
| maximum_interval 触顶时 Hard=Good | 遗留 | 结构性问题，Anki 同样存在；建议使用 AD 建议值 7 |
| 答案朗读开关关闭后 TTS 仍发音 | 待修复 | `playAnswer` 缺开关控制 |
| 离线练习后登录 CardState user_id 不更新 | 待修复 | 离线下 user_id=deviceId，登录后 `syncCardStatesFromCloud` 因本地 updated_at 更新跳过覆盖，导致进度消失（Issue #26） |

---

## 关键技术决策备忘

| 决策 | 结论 | 原因 |
|------|------|------|
| sessionId 机制 | 每次 `_launch` / `goHome` 自增 | 阻断跨页面异步语音链 |
| answer-panel transition | show 前恢复，翻页时禁用 | 翻页 transition 淡出会导致新内容闪现 |
| warmupSpeech | 必须在用户手势内调用 | iOS 同时解锁 TTS 和 Audio 权限 |
| 录音播放降级 | audioBlob → TTS | 制卡工具可选录音，训练 App 需兼容无录音卡片 |
| 停顿符 `.` | 每个 100ms，可叠加 | 选项提示需要自然节奏，避免机械连读 |
| SRS 参数命名 | 与 Anki 同名对齐，不加后缀 | 跨工具一致性，便于文档对照 |
| _lastSrsWrite | 追踪最近写入 Promise | 防止 IndexedDB 写入竞争导致统计页读到旧数据 |
| showConfirmDialog | 自制弹窗替代 confirm() | iOS PWA standalone 模式屏蔽系统弹窗 |
| learn_ahead_limit | 主队列耗尽时限制追加窗口 | 防止 1d 步骤被绕过，与 Anki 行为一致 |

---

## 相关文档

| 文档 | 用途 |
|------|------|
| `忆海拾光_训练App发布检查清单.md` | 每次发版前执行 |
| `忆海拾光_训练App布局问题复盘.md` | safe area / 底部按钮问题历史记录 |
| `患者端_功能需求文档.md` | 功能设计意图和参数说明 |
| `00_导航索引.md` | 项目整体导航，跨会话恢复上下文入口 |
| `srs_design_v6_9.md` | SRS 设计规格文档 |
