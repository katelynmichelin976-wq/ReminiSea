# 用户管理（注册 / 找回密码 / 改密）设计

**日期：** 2026-06-09
**状态：** 设计稿（待实现）

---

## 一、目标

补齐忆海拾光的 PWA 用户管理能力。当前账户屏只有登录与登出。本期增加：

1. **注册新账号**（signUp）
2. **找回密码**（邮件 reset）
3. **登录后改密**（需输入老密验证）

**范围外（明确不做）：** magic link、OAuth、删除账号、改邮箱、用户资料。

---

## 二、整体方案

**全部使用 Supabase Auth 内置原语**，零后端代码：

- `_sb.auth.signUp({ email, password, options: { emailRedirectTo } })`
- `_sb.auth.resetPasswordForEmail(email, { redirectTo })`
- `_sb.auth.updateUser({ password })`

邮件模板、SMTP、速率限制全部由 Supabase 托管。本期不引入 Edge Function、第三方 IDP。

---

## 三、UI 入口

### 3.1 账户屏（未登录态）

```
┌────────────────────────┐
│  邮箱 [_______________] │
│  密码 [_______________] │
│        [ 登录 ]         │
│                         │
│  注册新账号    忘记密码? │
└────────────────────────┘
```

- 「注册新账号」「忘记密码?」是文本链接，位于「登录」按钮下方一行
- 文字颜色 `--text3`，下划线，点击进入对应 sheet

### 3.2 账户屏（已登录态）

在现有「退出登录」按钮之上插入「修改密码」按钮。

### 3.3 三个底部 sheet（参照现有 settings-overlay 模式）

| Sheet | 字段 | 主按钮 |
|---|---|---|
| `#register-sheet` | 邮箱 / 密码 / 确认密码 | 「注册」 |
| `#reset-request-sheet` | 邮箱 | 「发送重置邮件」 |
| `#change-password-sheet` | 当前密码 / 新密码 / 确认新密码 | 「保存」 |

打开「注册 sheet」时自动从账户屏邮箱字段填到 sheet 邮箱字段（避免重复输入）。

### 3.4 重置密码 screen（从邮件链接进入）

第四个 UI：用户从邮箱点重置链接 → APP 启动 → 检测 hash → 显示「设置新密码」screen 全屏：

```
┌────────────────────────┐
│  ← 返回                 │
│                         │
│  设置新密码             │
│                         │
│  [ 新密码 _________ ]   │
│  [ 确认密码 ________ ]  │
│        [ 保存 ]         │
└────────────────────────┘
```

完成后 toast「密码已更新」+ 跳转账户屏（用户已自动登录到刚改密码的账号）。

---

## 四、数据流

### 4.1 注册

```
sheet 表单填写
  ↓
前端校验：email 格式 / pwd ≥ 6 / pwd === pwd2
  ↓
_sb.auth.signUp({ email, password, options: {
    emailRedirectTo: APP_URL + '#/email-confirmed'
} })
  ↓
成功 → sheet 转为「等待验证」状态：
  「验证邮件已发送到 {email}，请查收并点击邮件中的链接」
  保留「重发邮件」按钮（防 SMTP 偶发丢件）
  ↓
用户去邮箱点链接 → 浏览器打开 APP_URL#/email-confirmed
  ↓
App 启动 hash 路由检测 → 显示 toast「邮箱验证成功，请登录」
  + 自动填邮箱字段
  + sheet 自动关闭（若仍打开）
```

### 4.2 找回密码

```
sheet 填邮箱 → 点「发送重置邮件」
  ↓
_sb.auth.resetPasswordForEmail(email, {
    redirectTo: APP_URL + '#/reset-password'
})
  ↓
成功 → sheet「重置邮件已发送，请查收」（**无论邮箱是否存在**，防爆破）
  ↓
用户去邮箱点链接 → 浏览器打开 APP_URL#/reset-password
  （Supabase URL 中含 token 参数，SDK 自动处理）
  ↓
App 启动 hash 检测 → 进入「设置新密码」全屏 screen
  → 用户填 [新密码] [确认新密码] → _sb.auth.updateUser({ password })
  → 成功 → toast「密码已更新」+ 跳账户屏（自动登录）
```

### 4.3 改密（已登录态）

```
sheet 填 [当前密码] [新密码] [新密码确认]
  ↓
前端校验：新密 ≥ 6、新密 === 确认
  ↓
第 1 步：_sb.auth.signInWithPassword({ email: _cloudUserEmail, password: oldPwd })
  → 用于验证老密；不影响现 session
  ↓
失败 → sheet「当前密码不正确」
成功 → 第 2 步：_sb.auth.updateUser({ password: newPwd })
  ↓
成功 → toast「密码已更新」+ 关闭 sheet
```

> Supabase 无原生「verify-old-then-update」原语。通过额外 signInWithPassword 验证，避免「拿到 session 就能改密」的安全风险。

---

## 五、错误处理

| 场景 | 反馈 |
|---|---|
| 邮箱格式不对 | 输入框红框 + sheet 内提示「邮箱格式不正确」 |
| 密码 < 6 位 | 「密码至少 6 位」 |
| 两次密码不一致 | 「两次密码不一致」 |
| 注册时邮箱已注册 | Supabase 返 `User already registered` → sheet「邮箱已注册，请直接登录或找回密码」+ 提供「去登录」按钮 |
| 找回密码邮箱未注册 | Supabase 出于隐私不区分。统一显示「重置邮件已发送，请查收」 |
| 邮件 SMTP 失败 | sheet「发送失败，请稍后重试或联系反馈」 |
| 改密时老密错误 | sheet「当前密码不正确」 |
| 邮件链接过期（token 失效） | App 检测无效 token → toast「链接已过期，请重新申请」+ 跳账户屏 |
| 重置后 updateUser 失败 | sheet「密码更新失败：{msg}」 |
| 网络超时 | 沿用现有 15s `loginTimeout` 模式 → sheet「网络超时，请重试」 |

### 5.1 Loading 状态

所有 sheet 主按钮：点击即 `disabled`，文字切「处理中…」，避免重复点击。

### 5.2 速率限制

Supabase Auth 自带：同邮箱 reset 1 分钟内最多 1 次、同 IP 注册有限频。**前端不另加**。

---

## 六、i18n / 多语言

新增 ~30 个 key × 5 locale = ~150 条字符串。

### 6.1 注册相关

```
reg_sheet_title       注册新账号 / Sign up / 註冊新帳號 / Crear cuenta / 新規登録
reg_email_ph          邮箱地址 / Email / ...
reg_pwd_ph            密码（至少 6 位）/ Password (min 6) / ...
reg_pwd_confirm_ph    确认密码 / Confirm password / ...
reg_btn               注册 / Sign up / ...
reg_btn_pending       处理中… / Processing… / ...
reg_wait_title        验证邮件已发送 / Verification email sent / ...
reg_wait_body         请查收 {email} 并点击邮件中的链接 / Check {email} and click the link / ...
reg_resend_btn        重发邮件 / Resend / ...
reg_already_registered 邮箱已注册，请直接登录或找回密码 / Already registered, log in or reset password / ...
reg_goto_login        去登录 / Go to login / ...
```

### 6.2 找回密码相关

```
reset_request_title   重置密码 / Reset password / ...
reset_request_btn     发送重置邮件 / Send reset email / ...
reset_request_sent    重置邮件已发送，请查收 / Reset email sent / ...
reset_set_title       设置新密码 / Set new password / ...
reset_new_pwd_ph      新密码（至少 6 位）/ New password (min 6) / ...
reset_new_pwd_confirm 确认新密码 / Confirm new password / ...
reset_set_btn         保存 / Save / ...
reset_link_expired    链接已过期，请重新申请 / Link expired, please request again / ...
reset_done_toast      密码已更新 / Password updated / ...
```

### 6.3 改密 / 通用

```
change_pwd_menu       修改密码 / Change password / ...
change_pwd_title      修改密码 / Change password / ...
change_pwd_old_ph     当前密码 / Current password / ...
change_pwd_old_wrong  当前密码不正确 / Current password is incorrect / ...
change_pwd_done_toast 密码已更新 / Password updated / ...

auth_email_invalid    邮箱格式不正确 / Invalid email format / ...
auth_pwd_too_short    密码至少 6 位 / Password must be at least 6 characters / ...
auth_pwd_mismatch     两次密码不一致 / Passwords do not match / ...
auth_send_fail        发送失败，请稍后重试 / Send failed, try later / ...
auth_email_confirmed_toast 邮箱验证成功，请登录 / Email verified, please log in / ...
```

`tests/yihai_v5.0_i18n_test.js` 的 key-parity 校验自动覆盖新 key。

---

## 七、Supabase 配置依赖（实施前必须确认）

| 配置项 | Dashboard 位置 | 期望值 |
|---|---|---|
| Email Confirmation | Authentication → Providers → Email | **ON** |
| SMTP | Project Settings → Auth → SMTP | 已配置（生产建议接 SendGrid/Resend，免费层 Supabase 共享 SMTP 限 4 封/小时） |
| Redirect URLs | Authentication → URL Configuration | 加 `https://katelynmichelin976-wq.github.io/ReminiSea/**`（含 `#/email-confirmed` 与 `#/reset-password`） |
| 邮件模板 | Authentication → Email Templates | 可选改中文 |

---

## 八、改动文件

| 文件 | 改动 |
|---|---|
| `index.html` | + 3 个 sheet HTML（注册 / 找回密码 / 改密）+ 4 个处理函数 |
| `index.html` | + `screen-reset-password` 全屏 screen + 启动 hash 路由检测（`#/email-confirmed` `#/reset-password`） |
| `index.html` | 账户屏未登录态加「注册新账号」「忘记密码?」链接 |
| `index.html` | 账户屏已登录态加「修改密码」按钮 |
| `index.html` | 5 locale × ~30 i18n keys |
| `index.html` | 用户手册 URL（如「请查收 {email}」）使用 `t()` 而非硬编码 |
| `tests/_pw_user_mgmt.js`（新） | ~25 断言：sheet 元素存在、表单校验、hash 路由 |
| `tests/_pw_ui_smoke.js` | +3 断言：新 sheet 元素 / 新 i18n key 渲染 |
| `CLAUDE.md` | Recent Changes 加新条目 |
| `docs/yihai_变更记录_CLAUDE参考.md` | 加版本条目 |
| `docs/用户手册.md` | 「登录与多设备同步」节扩展注册 / 找回密码 / 改密步骤 |

---

## 九、测试策略

### 9.1 单元测试

无新增。i18n key-parity 已由 `yihai_v5.0_i18n_test.js` 自动覆盖。

### 9.2 Playwright（新 `tests/_pw_user_mgmt.js`，~25 断言）

| 场景 | 断言示例 |
|---|---|
| 注册 sheet 存在 + 表单字段齐全 | `document.getElementById('register-sheet')` 等 |
| 注册前端校验：空邮箱、邮箱格式、密码长度、两次密码不一致 | 各自显示对应错误文案 |
| 注册成功路径：mock `signUp` 返成功 → sheet 转「等待验证」 | UI 状态切换 |
| 注册失败路径：mock 返 `User already registered` → 显示「邮箱已注册」+「去登录」 |  |
| 找回密码 sheet 同样校验 + mock 成功 / 失败 |  |
| 改密 sheet 校验 + mock 老密验证失败 / 成功 |  |
| Hash 路由检测：`#/email-confirmed` 触发 toast + 自动填邮箱 |  |
| Hash 路由检测：`#/reset-password` 进入新密码 screen |  |

### 9.3 Playwright `_pw_ui_smoke.js` 扩展

- 3 断言：账户屏未登录态出现「注册新账号」「忘记密码?」链接 + 已登录态出现「修改密码」按钮（已登录态需先用 cloudLogin helper）

### 9.4 真实环境实测（人工）

不进自动化（实发邮件成本与不确定性）：

- 真实账号注册 → 收邮件 → 点链接 → toast → 自动填邮箱 → 登录
- 真实账号找回密码 → 收邮件 → 点链接 → 设新密 → 自动登录
- 已登录改密 → 输老密 → 改成功 → 登出 → 用新密登录

---

## 十、安全

| 风险 | 缓解 |
|---|---|
| 改密路径无老密验证（仅有 session 就能改） | 强制第 1 步 `signInWithPassword({ email, password: oldPwd })` |
| 邮箱探测（reset 时区分「已注册」与「未注册」泄露用户存在性） | 统一返「重置邮件已发送，请查收」无论邮箱是否存在 |
| 暴力破解登录 / 注册 | Supabase Auth 自带速率限制；不另加客户端限流 |
| 改密后老 session 失效问题 | Supabase updateUser 后老 session 保持；用户登出再登需用新密 |
| 邮件验证链接被中间人窃取 | Supabase 链接绑定 token + nonce，时效有限；无法控制邮箱传输安全（出于 SMTP TLS） |
| 中间人攻击 | App 走 HTTPS（GitHub Pages 默认），Supabase API 走 HTTPS |

---

## 十一、风险与权衡

| 风险 | 评估 | 缓解 |
|---|---|---|
| 免费 SMTP 限 4 封/小时 | 生产用户量增长后会卡邮件 | 切自建 SMTP 服务（SendGrid 免费 100/天） |
| 邮件被识别为垃圾邮件 | Supabase 共享 SMTP 出现 IP 信誉问题 | 自建 SMTP + SPF/DKIM/DMARC |
| 用户填错邮箱 | 注册成功但永远收不到验证邮件 | 验证页提供「重发邮件」+「邮箱填错？」改邮箱链接（本期不做，后续加） |
| Hash 路由检测时机 | App 启动早于 Supabase SDK 初始化导致 token 处理时序问题 | 在 SDK 初始化完成后检测 hash，未完成时延迟 100ms 重试 |
| 用户在 PWA standalone 模式点邮件链接 | 系统浏览器打开 Tab，未必跳回 PWA | 文档明确「请在浏览器中查看邮件链接」 |

---

## 十二、未来扩展（不在本期）

- Magic link（无密码）登录
- OAuth：Google / Apple / 微信
- 改邮箱
- 用户资料（昵称 / 头像）
- 删除账号（Edge Function 调 Admin API）
- 二次验证（2FA）
- 设备管理（看哪些设备登录过）
