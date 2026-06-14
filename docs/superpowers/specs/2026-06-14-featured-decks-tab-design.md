# 精选牌组 Tab 实现 + 同步按钮去耦合设计

**日期：** 2026-06-14
**作者：** chenlian + Claude
**关联：** 上线前清理工作（[no-medical-terms](../../../memory/project-no-medical-terms.md) 同期已收尾的 admin SQL 重命名是另一项）

---

## 1. 背景

牌组管理（`screen-decks`）有三个段：本地 / 云端 / 精选。前两个已实现：

| 段 | 实现 | 数据源 |
|---|---|---|
| 本地 | `renderLocalDecksTab` | `DECKS_META` 全部 |
| 云端 | `renderCloudDecksTab` → `showCloudDecks` | Supabase `decks` 表 `deck_type=personal` |
| **精选** | **未实现**（i18n 文案 `精选牌组即将上线`）| 应为 `deck_type=preset` |

「精选牌组」实际下载入口在两处：
- `doAccountLogin`（账户屏登录成功后） → `runSync({ decks: true, ... })`
- `doAccountSync`（账户屏「同步」按钮）→ `runSync({ decks: true, ... })`

`runSync` 内的 `if (options.decks)` 分支（`index.html:3968-3989`）：
1. `_sb.from('decks').select('id,name,name_lang').eq('deck_type','preset')` 拉所有 preset 牌组
2. 本地已有 → `syncDeckFromCloud`（merge）
3. 本地没有 → `downloadDeckFromCloud`（全新下载，可能含 N 张卡 + 媒体）

这造成两个问题：
- **职责混淆**：「同步」按钮做了两件事 — 同步进度（trials/states/events）+ 下载牌组。modal 时间被牌组拉取拉长
- **用户无感知**：登录后悄悄下载 preset 牌组，用户不知道发生了什么、不能选择跳过

## 2. 目标与非目标

### 2.1 目标

- 把 preset 牌组下载入口集中到 `screen-decks` 的「精选」段
- 「同步」按钮 + 登录后回流路径**不再自动拉 preset**，只做 trial / card_state / event / config 同步
- 「精选」段提供：列表展示 + 下载 / 同步 / 已下载状态识别 + 进度反馈
- 已有用户的本地 preset 牌组不动（保留 + 可继续同步进度）

### 2.2 非目标

- ❌ 删除 `runSync` 内 `if (options.decks)` 分支（保留代码，仅切断 UI 触发，几个 release 后再删）
- ❌ 改 `downloadDeckFromCloud` / `syncDeckFromCloud` 实现（沿用现有，已稳定）
- ❌ 精选 tab 加搜索 / 排序 / 分类（YAGNI，后续按需）
- ❌ 强制用户登录后第一次必看精选（不弹窗、不引导）

## 3. 设计

### 3.1 「精选」段实现

新函数 `renderFeaturedDecksTab`，调用 `showFeaturedDecks` 渲染列表。

仿 `showCloudDecks` 结构（`index.html:6750-6816`）：

```js
async function showFeaturedDecks() {
  if (!_syncEnabled || !_sb) { /* 显示"请先登录"占位 */ return; }
  const listEl = document.getElementById('featured-decks-list');
  listEl.innerHTML = '<div ...>加载中…</div>';
  try {
    const { data: presetDecks, error } = await _sb.from('decks')
      .select('id,name,name_lang,card_count,updated_at')
      .eq('deck_type', 'preset')
      .order('updated_at', { ascending: false });
    // 渲染列表：
    // - 本地无 → 「下载」按钮 → downloadDeckFromCloud
    // - 本地有 → 「同步」按钮 → syncDeckFromCloud
    // - 进度条同 cloud 段（_downloading map / dl-prog-{deckId}）
  } catch(e) { /* 错误占位 */ }
}
```

DOM 结构：在 `#screen-decks` 内 `#decks-panel-featured`（已存在）下加 `<div id="featured-decks-list">`。

按钮调用现有 `downloadDeckFromCloud(deckId, deckName, btnEl, noToast, nameLang)` / `syncDeckFromCloud(...)` — 不改实现。

### 3.2 `switchDecksTab` 路由

`switchDecksTab` 增加 `featured` 分支：

```js
if (tab === 'local')    renderLocalDecksTab();
if (tab === 'cloud')    renderCloudDecksTab();
if (tab === 'featured') renderFeaturedDecksTab();   // 新增
```

### 3.3 同步按钮去耦合

两处 `runSync({ decks: true })` 调用改为 `decks: false`：

| 行号 | 调用方 | 旧 | 新 |
|---|---|---|---|
| 6287 | `doAccountLogin` | `runSync({ modal: true, decks: true, events: true, ... })` | `runSync({ modal: true, decks: false, events: true, ... })` |
| 6546 | `doAccountSync` | `runSync({ modal: true, decks: true, events: true, showToast: true, ... })` | `runSync({ modal: true, decks: false, events: true, showToast: true, ... })` |

`runSync` 内的 `if (options.decks)` 分支保留不动（防止其他场景误伤，几个 release 后可清理）。

### 3.4 用户视角变化

| 场景 | v5.13.11 | v5.13.12（本设计）|
|---|---|---|
| 登录账号 | 自动下载所有 preset 牌组 + 同步 SRS | 只同步 SRS（trial/state/event/config）|
| 「同步」按钮 | modal 显示进度，含 preset 拉取 | modal 显示进度，仅 SRS 同步（更快）|
| 已下载 preset 牌组 | 在「本地」段显示，正常练习 | **不变**，在「本地」段显示，可在「精选」段同步进度 |
| 想下载新 preset | 必须点同步按钮（盲下） | 进牌组管理→精选→点对应牌组下载 |
| 离线 / 未登录 | 精选 tab 不可用 | 精选 tab 显示"请先登录"占位 |

### 3.5 i18n

新增 4 语种文案（en/zh-CN/zh-Hant/es/ja）：

| key | 含义 |
|---|---|
| `featured_loading` | "加载中…" |
| `featured_empty` | "云端暂无精选牌组" |
| `featured_load_fail` | "加载失败：{msg}" |
| `featured_login_required` | "请先登录后查看精选牌组" |

废弃 `decks_featured_coming`（"精选牌组即将上线"）— 实际上线了。

### 3.6 错误处理

- 网络错误：显示"加载失败"+ retry 按钮（手动 retry，不自动）
- 单牌组下载失败：保持原 `downloadDeckFromCloud` 行为（toast + 退出），不影响列表其它牌组
- 未登录：占位文案

## 4. 不在本设计内

- ❌ 删除 `runSync({ decks: true })` 内部分支（保留代码以防其他调用，未来清理）
- ❌ 精选 tab 的搜索 / 排序 / 标签
- ❌ 强制引导用户首登后看精选
- ❌ 精选牌组本身的元数据（描述 / 封面图 / 难度），DB schema 不动

## 5. 测试

### 5.1 Playwright 新增

`tests/_pw_featured_tab.js`：

| Phase | 内容 |
|---|---|
| PHASE 1 | 登录 zyhaff，进牌组管理 → 切到精选 tab，验证列表加载并含至少 1 个 preset 牌组 |
| PHASE 2 | 本地未下载的 preset 显示「下载」按钮；点击 → 进度 → 完成后转「同步」按钮 |
| PHASE 3 | 本地已下载的 preset 显示「同步」按钮；点击 → `syncDeckFromCloud` 调用，无下载新卡 |
| PHASE 4 | 未登录时切到精选 tab → 显示「请先登录」占位 |
| PHASE 5 | 同步按钮不再下载 preset：在精选 tab 删一个本地 preset，回到账户屏点同步，验证该 preset 仍**不在**本地（确认 `decks: false` 切断） |

约 12-15 断言。

### 5.2 回归

- `run_all`（单元，14 套件 667）
- `_pw_ui_smoke`（68）
- `_pw_deck_mgmt`（15） — 验证 tab 路由没破坏
- `_pw_cloud_sync`（32） — 验证 `runSync` 修改后流程正确
- `_pw_cross_device`（39） — 验证跨设备同步不被影响

## 6. 关联

- 现有 `showCloudDecks` (`index.html:6750`) 是参考模板
- 现有 `downloadDeckFromCloud` / `syncDeckFromCloud` 不动
- `getActiveSyncJob` / `_downloading` map 复用进度反馈机制
