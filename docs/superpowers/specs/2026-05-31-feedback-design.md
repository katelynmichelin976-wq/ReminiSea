# 忆海拾光 — 意见反馈模块设计文档

**日期：** 2026-05-31  
**状态：** 待实现  
**版本：** 设计 v1.0，目标实装版本 v5.3.x

---

## 一、背景与目标

单人开发者测试能力有限，需要建立用户反馈通道以快速发现问题、收集需求。反馈机制是 App 长期稳定运行的基础。

**核心目标：**
- 用户（家庭成员）在 App 内一步发出反馈，附带足够的诊断信息
- 开发者在统一后台查收所有反馈，无需依赖用户主动描述技术细节
- 反馈通道独立于 App 主业务逻辑，主 Supabase 出问题时仍可用（长期目标）

---

## 二、架构

```
忆海 App
  └─ 「意见反馈」入口（screen-mine 账号区）
       └─ 底部弹层 sheet
            ├─ collectDiagnostics()   ← IDB yh_logs + app_events + localStorage
            └─ submitFeedback()
                 ├─ 主通道：POST → feedback 表（Supabase，anon insert）
                 └─ 降级：复制到剪贴板 + toast 提示发到 FEEDBACK_EMAIL
```

**测试阶段：** `FB_SUPABASE_URL` / `FB_SUPABASE_ANON_KEY` 与主项目相同，`feedback` 表建在主项目内。  
**正式阶段：** 迁移至独立 Supabase 项目，只需更换两个常量，代码不变。

---

## 三、数据库表结构

建在 Supabase `feedback` 表：

```sql
CREATE TABLE feedback (
  id            uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at    timestamptz DEFAULT now(),
  app_version   text        NOT NULL,   -- schema 锚点，"5.2.0"
  feedback_type text        NOT NULL DEFAULT 'general',  -- 保留字段，UI 暂不暴露
  user_desc     text        NOT NULL,   -- 用户描述，必填
  device_id     text,                   -- 随机 UUID，非账号信息
  locale        text,                   -- zh / en / es
  device_info   jsonb,                  -- UA、屏幕尺寸、平台、网络类型
  diagnostics   jsonb                   -- 结构见下节，随版本演进
);

ALTER TABLE feedback ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon_insert" ON feedback
  FOR INSERT TO anon WITH CHECK (true);
-- 无 SELECT policy：anon key 不可读，只有 service_role 可查
```

---

## 四、diagnostics JSON 结构

`app_version` 字段即 schema 版本标识。字段只增不删，旧版本缺省字段为 `null`。

```jsonc
{
  // ── 固定字段（任何版本必有）──────────────────────
  "app_version": "5.2.0",
  "collected_at": 1717123456789,

  // ── 运行时状态 ───────────────────────────────────
  "idb_version": 7,
  "sync_enabled": false,
  "has_session_backup": true,
  "last_sync_ts": 1717000000000,
  "deck_count": 3,

  // ── 日志（IDB 可用时，最近 30 条 warn/error）──────
  "logs": [ { "level": "error", "module": "idb", "msg": "...", "ts": 0 } ],
  "log_source": "idb",   // "idb" | null（IDB 不可用时为 null）

  // ── 事件（IDB 可用时，最近 10 条）────────────────
  "events": [ { "type": "session_restore_error", "payload": {}, "ts": 0 } ]

  // 未来版本在此追加新字段
}
```

**隐私原则：**
- `yihai_session_backup`（含 JWT token）不采集
- `yihai_last_cloud_email` 不采集
- `device_id` 是随机 UUID，与 Supabase 账号无关联

---

## 五、UI 设计

**入口：** `screen-mine` 账号区底部菜单组，样式与现有 `.mine-menu-item` 一致。

```
图标（对话气泡）| 意见反馈 | 遇到问题或有功能建议 | ›
```

**底部弹层（sheet）：**

```
────────────────────────────────
  [拖动条]                    [×]
  意见反馈
  ────────────────────────────
  [ 请填写问题描述以便我们          ]
  [ 提供更好的帮助                  ]
  [ （textarea，5行，maxlength=200）]
  [                       0 / 200 ]
  ────────────────────────────
  [        发  送         ]（主按钮，ocean blue，46px）
  ────────────────────────────
  🔒 附带 App 版本、设备型号与错误日志，不含账号信息
────────────────────────────────
```

**交互规则：**
- 描述框必填；为空点发送 → 输入框红色边框，无文字提示
- 用户开始输入 → 红色边框立即消失
- 字数达到 180 → 计数器变蓝色预警
- 发送中：按钮禁用，文字「发送中…」
- 发送成功：按钮变绿「✓ 已发送，感谢反馈！」→ 1.5s 后关闭 sheet
- 发送失败（降级）：toast「发送失败，内容已复制，请粘贴发到 zyhacl@gmail.com」

原型文件：`docs/superpowers/feedback-prototype.html`

---

## 六、提交逻辑

```js
// 常量（正式上线前可独立化）
const FB_SUPABASE_URL  = SUPABASE_URL;   // 测试期间复用主项目
const FB_SUPABASE_ANON_KEY = SUPABASE_ANON_KEY;
const FEEDBACK_EMAIL   = 'zyhacl@gmail.com';

async function collectDiagnostics() {
  const base = {
    app_version:       APP_VERSION,
    collected_at:      Date.now(),
    idb_version:       SRS_DB_VER,
    sync_enabled:      _syncEnabled,
    has_session_backup: !!localStorage.getItem('yihai_session_backup'),
    last_sync_ts:      Number(localStorage.getItem('yihai_global_sync_ts')) || null,
    deck_count:        DECKS_META.length,
    logs:              null,
    log_source:        null,
    events:            null,
  };
  try {
    const db = await Promise.race([openSrsDb(), timeout(2000)]);
    // 最近 30 条 warn/error 日志
    base.logs = await readStore(db, LOG_STORE, 30, ['warn','error']);
    base.log_source = 'idb';
    // 最近 10 条事件
    base.events = await readStore(db, EVT_STORE, 10);
  } catch(e) { /* IDB 不可用，logs/events 保持 null */ }
  return base;
}

async function submitFeedback(userDesc) {
  const diagnostics = await collectDiagnostics();
  const payload = {
    app_version:  APP_VERSION,
    user_desc:    userDesc,
    device_id:    _deviceId,
    locale:       getLocale(),
    device_info:  getDeviceInfo(),
    diagnostics,
  };

  // 主通道
  try {
    const fb = supabase.createClient(FB_SUPABASE_URL, FB_SUPABASE_ANON_KEY);
    const { error } = await Promise.race([
      fb.from('feedback').insert(payload),
      timeout(5000)
    ]);
    if (!error) return 'success';
  } catch(e) {}

  // 降级：剪贴板 + localStorage 暂存
  const text = formatFeedbackText(payload);
  try { await navigator.clipboard.writeText(text); } catch(e) {}
  localStorage.setItem('yihai_pending_feedback', JSON.stringify(payload));
  return 'clipboard';
}
```

**暂存补传：** `runSync` 末尾检查 `yihai_pending_feedback`，若存在且 `_syncEnabled`，补传后删除 key。

---

## 七、剪贴板兜底文本格式

```
【忆海拾光 意见反馈】
版本：5.2.0  设备：iPhone iOS 17.4
时间：2026-05-31 09:41
-----------
{用户描述内容}
-----------
最近错误：[模块] 错误信息 (时间)
          [模块] 错误信息 (时间)
```

---

## 八、实现清单

- [ ] Supabase 主项目建 `feedback` 表 + RLS 策略
- [ ] `collectDiagnostics()` 函数（含 IDB 超时容错）
- [ ] `submitFeedback()` 函数（主通道 + 降级）
- [ ] `formatFeedbackText()` 剪贴板格式化
- [ ] `screen-mine` 入口菜单项
- [ ] 反馈底部 sheet HTML + CSS
- [ ] `runSync` 补传暂存反馈逻辑
- [ ] Playwright 测试：`submitFeedback` 函数存在性 + sheet 打开/关闭
- [ ] CLAUDE.md 更新（测试计数、文档同步）
