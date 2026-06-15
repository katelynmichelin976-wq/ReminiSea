# 隐私政策 + 用户协议（P1）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 创建中文版 `privacy.html` + `terms.html`（GitHub Pages 静态页面），登录 form + 注册 sheet 加同意 checkbox（不勾不能提交），同意后写 LS（`yh:v1:user:consentAt` + `yh:v1:user:consentVersion`）。

**Architecture:** 两个静态 HTML 部署到 GitHub Pages 根目录（与主 app `https://katelynmichelin976-wq.github.io/ReminiSea/` 同源），主 app 内 checkbox 通过 `<a target="_blank">` 跳转外链打开。Checkbox 状态控制对应 submit 按钮 `disabled` 属性；提交成功后 LS 落同意时间戳 + 版本号。

**Tech Stack:** HTML + 内联 CSS（不依赖 app 样式表，独立可读）、vanilla JS（disabled 切换 + LS 写入）、Playwright 测试。

**Reference Spec:** `docs/superpowers/specs/2026-06-14-privacy-policy-and-terms-design.md`（含完整 PP/ToS 中文正文）

---

## File Structure

| 文件 | 改动 |
|---|---|
| `privacy.html` | 新建（仓库根目录，GitHub Pages 自动暴露），约 230 行（spec §7 正文 + 内联 CSS） |
| `terms.html` | 新建（仓库根目录），约 240 行（spec §8 正文 + 服务定位段落 + 内联 CSS） |
| `index.html` | 登录 form + 注册 sheet 各加 checkbox（~20 行 HTML）+ JS 控制 disabled（~30 行）+ doAccountLogin/doRegister 成功后写 LS（~6 行）+ i18n 5 key × 5 语种（~25 行） |
| `tests/_pw_consent_checkbox.js` | 新建（~120 行，~12 断言） |
| `CLAUDE.md` | 新测试登记（1 行） |

---

## Task 1: 创建 `privacy.html`

**Files:**
- Create: `C:\code\privacy.html`

### - [ ] Step 1.1: 创建 `privacy.html` 完整文件

Create `C:\code\privacy.html` with the following exact content:

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=5">
<title>隐私政策 - 忆海拾光</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif;line-height:1.7;color:#1a2a3a;background:#f5f7fa;padding:24px 16px;max-width:760px;margin:0 auto}
  h1{font-size:28px;font-weight:700;margin-bottom:8px;color:#0e6585}
  .meta{color:#64748b;font-size:13px;margin-bottom:28px;padding-bottom:16px;border-bottom:1px solid #e2e8f0}
  h2{font-size:20px;font-weight:700;margin:28px 0 12px;color:#1a3a5c}
  h3{font-size:16px;font-weight:600;margin:16px 0 8px;color:#334155}
  p{margin-bottom:12px;color:#334155}
  ul,ol{margin:8px 0 12px 24px;color:#334155}
  li{margin-bottom:6px}
  table{width:100%;border-collapse:collapse;margin:12px 0;font-size:14px}
  th,td{padding:8px 12px;border:1px solid #cbd5e1;text-align:left;vertical-align:top}
  th{background:#e0f2fe;color:#0e6585;font-weight:600}
  a{color:#0ea5e9;text-decoration:none}
  a:hover{text-decoration:underline}
  strong{color:#0e6585}
  .back-link{display:inline-block;margin-top:32px;padding:8px 16px;background:#0ea5e9;color:#fff;border-radius:6px}
  @media (max-width:640px){body{padding:16px 12px}h1{font-size:24px}h2{font-size:18px}}
</style>
</head>
<body>
<h1>忆海拾光 - 隐私政策</h1>
<div class="meta">
  <strong>生效日期：</strong>2026-06-15<br>
  <strong>版本：</strong>v1.0
</div>

<h2>一、控制者信息</h2>
<p>「忆海拾光」（以下简称"本应用"或"我们"）由个人开发者<strong>[开发者姓名待填]</strong>开发并运营。</p>
<p>联系邮箱：<a href="mailto:zyhaff@gmail.com">zyhaff@gmail.com</a></p>

<h2>二、我们收集的信息</h2>
<p>为提供训练记忆与学习卡片服务，我们收集以下信息：</p>

<h3>1. 账号信息</h3>
<ul>
  <li>注册邮箱</li>
  <li>加密密码（仅哈希存储于 Supabase Auth，我们无法查看明文）</li>
</ul>

<h3>2. 学习数据</h3>
<ul>
  <li>您创建/导入的牌组数据（卡片名称、图片、音频）</li>
  <li>答题记录（时间、正确率、SRS 状态）</li>
  <li>练习配置（语言、模式、提示偏好）</li>
</ul>

<h3>3. 设备信息</h3>
<ul>
  <li>设备唯一标识符（device_id，本机生成）</li>
  <li>操作系统、浏览器类型、屏幕分辨率（用于诊断与适配）</li>
  <li>IP 地址（由 Supabase 后端记录，用于安全审计与配额管理）</li>
</ul>

<h3>4. 应用事件日志</h3>
<ul>
  <li>业务里程碑事件（登录、同步、错误等）</li>
  <li>JS 异常报告（崩溃信息，用于排查 bug）</li>
</ul>

<h3>5. 您主动提交的反馈</h3>
<ul>
  <li>文字反馈内容、附带的诊断信息</li>
</ul>

<h3>我们不收集：</h3>
<ul>
  <li>位置信息、通讯录、相机/麦克风（除您主动录制语音外）、浏览历史</li>
</ul>

<h2>三、信息用途</h2>
<p>仅用于：</p>
<ol>
  <li>提供并改进训练服务</li>
  <li>跨设备同步学习进度</li>
  <li>安全审计与防作弊</li>
  <li>修复缺陷（崩溃报告 / 同步异常）</li>
  <li>在您提交反馈时进行答复</li>
</ol>
<p>我们<strong>不会</strong>：</p>
<ul>
  <li>用于广告投放</li>
  <li>出售给第三方</li>
  <li>共享给与服务无关的第三方</li>
</ul>

<h2>四、第三方服务</h2>
<table>
<tr><th>服务</th><th>用途</th><th>数据范围</th></tr>
<tr><td>Supabase（Supabase Inc.，美国/新加坡）</td><td>数据库、身份认证、文件存储</td><td>全部账号与学习数据</td></tr>
<tr><td>GitHub Pages（GitHub Inc.，美国）</td><td>静态资源托管</td><td>不存储用户数据，仅页面访问日志</td></tr>
</table>
<p>第三方均与我们签订有数据处理义务，并遵守各自隐私政策：</p>
<ul>
  <li><a href="https://supabase.com/privacy" target="_blank" rel="noopener">Supabase Privacy Policy</a></li>
  <li><a href="https://docs.github.com/site-policy/privacy-policies/github-general-privacy-statement" target="_blank" rel="noopener">GitHub Privacy Statement</a></li>
</ul>

<h2>五、数据存储位置（事实披露）</h2>
<p>我们使用 Supabase Inc.（美国注册公司）提供的云服务，数据库位于<strong>新加坡（ap-southeast-1）</strong>，文件存储在同一区域。我们对此区域的选择基于服务可用性、延迟与成本考量，并非针对任何特定地区用户。</p>
<p>本服务面向<strong>全球华人社区</strong>，主要受众为海外用户，未在中国大陆开展主动推广或运营。如您是中国大陆居民并自愿使用本服务，您同意您的数据将存储于上述境外位置。</p>

<h2>六、数据保留期限</h2>
<ul>
  <li><strong>活跃账号</strong>：服务期间持续保留</li>
  <li><strong>注销账号</strong>：自您提交注销请求起 30 天内删除（保留期用于撤销请求与法定保留义务）</li>
  <li><strong>崩溃报告/事件日志</strong>：90 天后自动清除</li>
  <li><strong>反馈记录</strong>：3 年（用于追踪问题改进）</li>
</ul>

<h2>七、您的权利（参考 CCPA / 通用隐私原则）</h2>
<p>不论您所在地区，我们承诺以下权利：</p>
<table>
<tr><th>权利</th><th>行使方式</th></tr>
<tr><td><strong>知悉</strong> 我们如何处理您的信息</td><td>阅读本政策</td></tr>
<tr><td><strong>访问</strong> 您的数据</td><td>App 内「我的」→ 导出数据 / 邮件 zyhaff@gmail.com</td></tr>
<tr><td><strong>更正</strong> 不准确信息</td><td>App 内编辑 / 邮件请求</td></tr>
<tr><td><strong>删除</strong> 您的数据</td><td>邮件 zyhaff@gmail.com，主题"数据删除请求"，30 天内执行</td></tr>
<tr><td><strong>撤回同意 / 注销</strong> 账号</td><td>邮件请求注销账号</td></tr>
<tr><td><strong>导出</strong> 数据副本</td><td>邮件请求，10 个工作日内提供</td></tr>
<tr><td><strong>不受歧视</strong> 行使上述权利后服务不降级</td><td>自动保障</td></tr>
</table>
<p>加州居民另享 CCPA 项下权利（不出售数据 / 不分享数据），由于本服务不出售或分享用户个人信息于第三方，CCPA "Do Not Sell" 权利对您自动适用。</p>

<h2>八、Cookie 与本地存储</h2>
<p>我们使用浏览器 localStorage 与 IndexedDB 存储：</p>
<ul>
  <li>您的登录令牌（用于自动登录）</li>
  <li>牌组数据缓存（用于离线练习）</li>
  <li>应用设置</li>
</ul>
<p>不使用第三方 Cookie，不进行广告追踪。</p>

<h2>九、安全措施</h2>
<ul>
  <li>密码采用业界标准哈希算法（由 Supabase 实施）</li>
  <li>数据传输使用 HTTPS/TLS 1.2+</li>
  <li>数据库访问受 Supabase RLS 策略限制（仅您本人可访问您的数据）</li>
  <li>应用层异常自动上报便于安全监控</li>
</ul>
<p>我们尽力保障数据安全，但不能保证绝对安全。如发生数据泄露，我们将于发现后 72 小时内通知受影响用户。</p>

<h2>十、未成年人保护（COPPA）</h2>
<p>本应用<strong>不针对未满 13 周岁的儿童</strong>（COPPA 阈值）。如您未满 13 周岁，请勿使用本应用。如我们发现已收集了未满 13 周岁儿童的信息，将立即删除。</p>
<p>家长如发现孩子误用了本应用，可通过 <a href="mailto:zyhaff@gmail.com">zyhaff@gmail.com</a> 联系我们删除相关数据。</p>

<h2>十一、政策更新</h2>
<p>本政策可能随服务功能调整或法律变更而修订。重大变更我们将通过以下方式通知：</p>
<ul>
  <li>App 内显著位置公告</li>
  <li>您注册邮箱的电子邮件</li>
</ul>
<p>如您不同意更新后的政策，请停止使用本应用。</p>

<h2>十二、联系方式</h2>
<p>如有隐私相关问题或请求，请联系：</p>
<ul>
  <li>邮箱：<a href="mailto:zyhaff@gmail.com">zyhaff@gmail.com</a></li>
  <li>我们将在 15 个工作日内回复</li>
</ul>

<h2>十三、适用法律</h2>
<p>本政策适用<strong>美国加利福尼亚州法律</strong>，与所有联邦法律及 Apple App Store 平台规则一致。涉及任何争议，依美国加州法律解释与解决。</p>

<a class="back-link" href="./">← 返回应用</a>
</body>
</html>
```

---

## Task 2: 创建 `terms.html`

**Files:**
- Create: `C:\code\terms.html`

### - [ ] Step 2.1: 创建 `terms.html` 完整文件

Create `C:\code\terms.html` with the following exact content:

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=5">
<title>用户协议 - 忆海拾光</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif;line-height:1.7;color:#1a2a3a;background:#f5f7fa;padding:24px 16px;max-width:760px;margin:0 auto}
  h1{font-size:28px;font-weight:700;margin-bottom:8px;color:#0e6585}
  .meta{color:#64748b;font-size:13px;margin-bottom:28px;padding-bottom:16px;border-bottom:1px solid #e2e8f0}
  h2{font-size:20px;font-weight:700;margin:28px 0 12px;color:#1a3a5c}
  h2.highlight{color:#b91c1c;background:#fef2f2;padding:12px 16px;border-left:4px solid #b91c1c;border-radius:4px}
  h3{font-size:16px;font-weight:600;margin:16px 0 8px;color:#334155}
  p{margin-bottom:12px;color:#334155}
  ul,ol{margin:8px 0 12px 24px;color:#334155}
  li{margin-bottom:6px}
  strong{color:#0e6585}
  a{color:#0ea5e9;text-decoration:none}
  a:hover{text-decoration:underline}
  .notice{padding:12px 16px;background:#fef3c7;border-left:4px solid #f59e0b;border-radius:4px;margin:16px 0;color:#78350f}
  .back-link{display:inline-block;margin-top:32px;padding:8px 16px;background:#0ea5e9;color:#fff;border-radius:6px}
  @media (max-width:640px){body{padding:16px 12px}h1{font-size:24px}h2{font-size:18px}}
</style>
</head>
<body>
<h1>忆海拾光 - 用户协议</h1>
<div class="meta">
  <strong>生效日期：</strong>2026-06-15<br>
  <strong>版本：</strong>v1.0
</div>

<div class="notice">
  <strong>注册或使用本应用即视为您已阅读、理解并同意本协议全部条款。</strong>
</div>

<h2>一、协议关系</h2>
<p>本协议是您（以下称"用户"）与<strong>[开发者姓名待填]</strong>（以下称"我们"）之间关于使用「忆海拾光」服务的法律协议。</p>

<h2>二、服务说明</h2>
<p>本应用提供：</p>
<ul>
  <li>基于 SM-2 算法的间隔重复记忆训练</li>
  <li>个人牌组创建与卡片管理</li>
  <li>跨设备学习进度同步</li>
  <li>语音辅助播报</li>
</ul>
<p>服务为基础免费提供。未来可能推出付费订阅功能，届时将通过本协议修订形式提前公告。</p>

<h2>三、账号与注册</h2>
<ul>
  <li>您需提供有效邮箱注册账号</li>
  <li>您应妥善保管账号密码，对账号下所有活动负责</li>
  <li>一人一号；不得共享或转让账号</li>
  <li>如发现账号被未授权使用，请立即通过 <a href="mailto:zyhaff@gmail.com">zyhaff@gmail.com</a> 联系我们</li>
</ul>

<h2>四、用户行为规范</h2>
<p>您承诺不会：</p>
<ol>
  <li>上传或分享含色情、暴力、政治敏感或违法内容的卡片</li>
  <li>上传未经授权使用的第三方版权内容</li>
  <li>使用自动化脚本进行批量操作或干扰服务</li>
  <li>攻击、破坏或试图绕过应用安全机制</li>
  <li>假冒他人或提供虚假信息</li>
  <li>利用本应用进行任何商业用途未事先获得我们书面许可</li>
</ol>

<h2>五、用户内容</h2>

<h3>1. 所有权</h3>
<p>您上传的牌组卡片、图片、录音等内容的版权归您所有。</p>

<h3>2. 授权</h3>
<p>您同意授予我们使用您内容的有限许可，仅用于：</p>
<ul>
  <li>在您账号下存储与同步</li>
  <li>跨设备展示与播放</li>
  <li>维护与改进服务</li>
</ul>
<p>许可范围不包括将您内容用于推广、训练 AI 模型或转售。</p>

<h3>3. 您的责任</h3>
<p>您对所上传内容的合法性、合规性、不侵权负责。如因您内容引发法律纠纷，由您承担全部责任。</p>

<h3>4. 我们的权利</h3>
<p>对于明显违反本协议第四条的内容，我们有权不经通知删除并暂停或注销相关账号。</p>

<h2>六、知识产权</h2>
<ul>
  <li>本应用的软件、设计、商标、文档归我们所有</li>
  <li>您仅获得有限的、非独占、不可转让的使用许可</li>
  <li>未经书面许可，不得逆向工程、反编译、二次发布或衍生开发</li>
</ul>

<h2>七、免责声明</h2>
<p><strong>本服务按"现状"提供，不保证：</strong></p>
<ol>
  <li>间隔重复算法能改善任何特定个人的记忆能力</li>
  <li>服务持续可用、零中断、无错误</li>
  <li>您的数据不会因软件缺陷、第三方服务故障或不可抗力而丢失</li>
</ol>
<p>我们建议您定期通过应用内导出功能备份重要数据。</p>

<h2>八、责任限制</h2>
<p>在法律允许的最大范围内：</p>
<ol>
  <li>我们对您因使用本应用产生的间接、附带、衍生损害不承担责任</li>
  <li>因第三方服务（Supabase、GitHub Pages 等）原因导致的损失，由相应服务提供方承担</li>
  <li>我们的总责任不超过您过去 12 个月内为本服务支付的费用（免费用户为零）</li>
</ol>

<h2 class="highlight">九、服务定位（重要）</h2>
<p>本服务面向<strong>全球华人社区</strong>，主要受众为<strong>海外华人</strong>。</p>
<p>服务的设计假设、合规框架、数据存储位置（Supabase 新加坡）和适用法律（美国加州）均基于此定位。</p>
<p><strong>如您居住在中国大陆：</strong></p>
<ol>
  <li>您理解并同意本服务<strong>未在中国大陆主动推广或运营</strong></li>
  <li>您是在自愿、主动选择下使用本服务，<strong>不视为我们向中国大陆居民提供产品或服务</strong></li>
  <li>您理解您的账号数据将存储于境外服务器</li>
  <li>您同意以美国加州法律为准解释本协议，不适用中华人民共和国法律</li>
  <li>如您不同意上述条款，请勿使用本服务</li>
</ol>

<h2>十、服务变更与终止</h2>
<p>我们保留以下权利：</p>
<ol>
  <li>随时调整、暂停或终止部分或全部服务功能</li>
  <li>因技术原因进行不影响核心功能的维护与升级</li>
  <li>对违反本协议的用户，可终止其服务</li>
</ol>
<p>非用户原因导致的服务终止，我们将提前 30 天公告。</p>

<h2>十一、适用法律与争议解决</h2>
<ol>
  <li><strong>本协议适用美国加利福尼亚州法律</strong>，与适用的美国联邦法律及 Apple Developer 协议保持一致</li>
  <li>因本协议产生的争议，双方应<strong>首先协商解决</strong></li>
  <li>协商不成的，争议提交<strong>加利福尼亚州圣克拉拉县（Santa Clara County）</strong>有管辖权的州或联邦法院解决；或经双方同意提交美国仲裁协会（AAA）按其商事仲裁规则在加州进行仲裁</li>
  <li>如您是中国大陆居民，您理解并同意本协议适用美国法律，不适用中国法律</li>
</ol>

<h2>十二、协议变更</h2>
<p>我们可能修订本协议。重大变更将通过 App 内公告或邮件通知。继续使用即视为接受新版本。</p>

<h2>十三、联系方式</h2>
<ul>
  <li>邮箱：<a href="mailto:zyhaff@gmail.com">zyhaff@gmail.com</a></li>
  <li>我们将在 15 个工作日内回复</li>
</ul>

<a class="back-link" href="./">← 返回应用</a>
</body>
</html>
```

---

## Task 3: i18n 5 语种新增 5 个 consent key

**Files:**
- Modify: `C:\code\index.html`（5 处 i18n block 各加 5 行）

### - [ ] Step 3.1: i18n — en

In `C:\code\index.html`, find around line 7232 the `'en':` block. Locate the line `meta_description: 'Picture-word matching — learn with fun',` (one of the first keys). Insert AFTER it:

```javascript
    consent_label: 'I have read and agree to the',
    consent_privacy: 'Privacy Policy',
    consent_and: 'and',
    consent_terms: 'Terms of Service',
    consent_required_hint: 'Please check the box to agree before continuing',
```

### - [ ] Step 3.2: i18n — zh-CN

Find the `'zh-CN':` block around line 7559. Find `meta_description: '看图识物 — 快乐学习',`. Insert AFTER:

```javascript
    consent_label: '我已阅读并同意',
    consent_privacy: '《隐私政策》',
    consent_and: '和',
    consent_terms: '《用户协议》',
    consent_required_hint: '请先勾选同意才能继续',
```

### - [ ] Step 3.3: i18n — zh-Hant

Find the `'zh-Hant':` block around line 7882. Find `meta_description: '看圖識物 — 快樂學習',`. Insert AFTER:

```javascript
    consent_label: '我已閱讀並同意',
    consent_privacy: '《隱私政策》',
    consent_and: '和',
    consent_terms: '《用戶協議》',
    consent_required_hint: '請先勾選同意才能繼續',
```

### - [ ] Step 3.4: i18n — es

Find the `'es':` block around line 8190. Find `meta_description: 'Reconocimiento visual — aprende con diversion',`. Insert AFTER:

```javascript
    consent_label: 'He leído y acepto los',
    consent_privacy: 'Términos de Privacidad',
    consent_and: 'y',
    consent_terms: 'Términos de Servicio',
    consent_required_hint: 'Por favor marca la casilla para continuar',
```

### - [ ] Step 3.5: i18n — ja

Find the `'ja':` block around line 8506. Find `meta_description: '写真で学ぶ — 楽しく覚えよう',`. Insert AFTER:

```javascript
    consent_label: '以下に同意します：',
    consent_privacy: 'プライバシーポリシー',
    consent_and: 'と',
    consent_terms: '利用規約',
    consent_required_hint: '続行するにはチェックを入れてください',
```

---

## Task 4: 登录 form 加 checkbox + JS 控制

**Files:**
- Modify: `C:\code\index.html`（登录区域 HTML + 全局 JS）

### - [ ] Step 4.1: 在登录 form 中加 checkbox HTML

In `C:\code\index.html`, find this exact line (around line 2440):

```html
        <button class="account-btn account-btn-primary" id="account-login-btn" onclick="doAccountLogin()" data-i18n="account_login_btn">登 录</button>
```

Insert this block IMMEDIATELY BEFORE that line (so checkbox is above login button):

```html
        <label class="account-consent-row" style="display:flex;align-items:flex-start;gap:8px;font-size:13px;color:#475569;margin:8px 0;line-height:1.5;cursor:pointer;-webkit-user-select:none;user-select:none">
          <input type="checkbox" id="consent-login" onchange="_updateLoginConsent()" style="margin-top:3px;flex-shrink:0;cursor:pointer">
          <span><span data-i18n="consent_label">我已阅读并同意</span> <a href="https://katelynmichelin976-wq.github.io/ReminiSea/privacy.html" target="_blank" rel="noopener" data-i18n="consent_privacy" style="color:#0ea5e9;text-decoration:none">《隐私政策》</a> <span data-i18n="consent_and">和</span> <a href="https://katelynmichelin976-wq.github.io/ReminiSea/terms.html" target="_blank" rel="noopener" data-i18n="consent_terms" style="color:#0ea5e9;text-decoration:none">《用户协议》</a></span>
        </label>
```

### - [ ] Step 4.2: 在注册 sheet 中加 checkbox HTML

In `C:\code\index.html`, find this exact line (around line 2121):

```html
      <button class="account-btn account-btn-primary" id="reg-submit-btn" onclick="doRegister()" data-i18n="reg_btn" style="margin-top:14px">注册</button>
```

Insert this block IMMEDIATELY BEFORE that line:

```html
      <label class="account-consent-row" style="display:flex;align-items:flex-start;gap:8px;font-size:13px;color:#475569;margin:10px 0;line-height:1.5;cursor:pointer;-webkit-user-select:none;user-select:none">
        <input type="checkbox" id="consent-register" onchange="_updateRegisterConsent()" style="margin-top:3px;flex-shrink:0;cursor:pointer">
        <span><span data-i18n="consent_label">我已阅读并同意</span> <a href="https://katelynmichelin976-wq.github.io/ReminiSea/privacy.html" target="_blank" rel="noopener" data-i18n="consent_privacy" style="color:#0ea5e9;text-decoration:none">《隐私政策》</a> <span data-i18n="consent_and">和</span> <a href="https://katelynmichelin976-wq.github.io/ReminiSea/terms.html" target="_blank" rel="noopener" data-i18n="consent_terms" style="color:#0ea5e9;text-decoration:none">《用户协议》</a></span>
      </label>
```

### - [ ] Step 4.3: 加 JS disabled 控制函数

In `C:\code\index.html`, find `function openRegisterSheet() {` (around line 6370). Insert IMMEDIATELY BEFORE this function:

```javascript
// ── Consent checkbox 控制（v5.13.13）─────────────────────────
function _updateLoginConsent() {
  var cb = document.getElementById('consent-login');
  var btn = document.getElementById('account-login-btn');
  if (cb && btn) btn.disabled = !cb.checked;
}
function _updateRegisterConsent() {
  var cb = document.getElementById('consent-register');
  var btn = document.getElementById('reg-submit-btn');
  if (cb && btn) btn.disabled = !cb.checked;
}
function _writeConsentLs() {
  try {
    lsSet('yh:v1:user:consentAt', new Date().toISOString());
    lsSet('yh:v1:user:consentVersion', 'v1');
  } catch (e) { console.warn('[consent] LS write fail', e && e.message); }
}

```

### - [ ] Step 4.4: 启动时初始化 disabled

In `C:\code\index.html`, locate the IIFE startup block. Find around line 11720:

```javascript
  setTimeout(_tryInitCloud, 100);
```

Insert IMMEDIATELY BEFORE that line:

```javascript
  // initial consent checkbox state — both buttons start disabled
  setTimeout(function() {
    var loginBtn = document.getElementById('account-login-btn');
    var regBtn = document.getElementById('reg-submit-btn');
    if (loginBtn) loginBtn.disabled = true;
    if (regBtn) regBtn.disabled = true;
  }, 0);
```

### - [ ] Step 4.5: `doAccountLogin` 成功时写 LS

In `C:\code\index.html`, find this exact block in `doAccountLogin` (around line 6299-6301):

```javascript
    logAppEvent('login', { email: email });
    upsertDeviceRegistry();
    runSync({ modal: true, decks: false, events: true, title: t('sync_syncing_data'), deckKey: currentDeck })
```

Insert IMMEDIATELY AFTER the `logAppEvent('login', ...)` line:

```javascript
    _writeConsentLs();
```

So the block becomes:

```javascript
    logAppEvent('login', { email: email });
    _writeConsentLs();
    upsertDeviceRegistry();
    runSync({ modal: true, decks: false, events: true, title: t('sync_syncing_data'), deckKey: currentDeck })
```

### - [ ] Step 4.6: `doRegister` 成功时写 LS

In `C:\code\index.html`, find this exact block in `doRegister` (around line 6428):

```javascript
    document.getElementById('reg-title').style.display = 'none';
    document.getElementById('reg-email').style.display = 'none';
```

Insert IMMEDIATELY BEFORE the first line above:

```javascript
    _writeConsentLs();
```

So the block becomes:

```javascript
    _writeConsentLs();
    document.getElementById('reg-title').style.display = 'none';
    document.getElementById('reg-email').style.display = 'none';
```

### - [ ] Step 4.7: `openRegisterSheet` 重置 checkbox

In `C:\code\index.html`, find inside `openRegisterSheet` (around line 6377):

```javascript
  document.getElementById('reg-msg').style.display = 'none';
```

Insert IMMEDIATELY AFTER:

```javascript
  var cb = document.getElementById('consent-register');
  if (cb) { cb.checked = false; _updateRegisterConsent(); }
```

### - [ ] Step 4.8: 验证启动无报错

Ensure HTTP server on port 8080:

```powershell
$test = $null
try { $test = Invoke-WebRequest -Uri "http://localhost:8080/index.html" -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop } catch {}
if (-not $test) {
  Start-Process -FilePath "python" -ArgumentList "-m","http.server","8080","--directory","C:\code" -WindowStyle Hidden
  Start-Sleep -Seconds 2
}
```

```powershell
node tests/_pw_ui_smoke.js
```

Expected: 68/0 全过（login form 区域被 checkbox 改动，但 smoke 不点登录按钮，应不受影响）。

---

## Task 5: Playwright 测试

**Files:**
- Create: `C:\code\tests\_pw_consent_checkbox.js`

### - [ ] Step 5.1: 创建测试文件

Create `C:\code\tests\_pw_consent_checkbox.js` with this exact content:

```javascript
/**
 * 同意 checkbox 测试 — v5.13.13
 *
 * 依赖：python -m http.server 8080 --directory C:\code
 * 运行：node tests/_pw_consent_checkbox.js
 *
 * 覆盖：登录/注册 form 加 consent checkbox，未勾选时 submit disabled；
 *       checkbox 链接 target/_blank + href 正确；i18n 切换；提交后 LS 落地。
 */
const { chromium } = require('playwright');
const { pass, section, wait, run, getCounts, getBaseUrl } = require('./_playwright_helper');

const URL = getBaseUrl() + '?v=' + Date.now();

(async () => {
  const browser = await chromium.launch({ headless: !process.env.HEADED });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });

  try {
    await page.goto(URL, { waitUntil: 'networkidle', timeout: 30000 });
    await wait(page, 800);

    // ════ PHASE 1: 登录 form checkbox 默认未勾 + button disabled ════
    section('PHASE 1: 登录 form checkbox 初始态');
    await run(page, () => showScreen('screen-account'));
    await wait(page, 400);

    const loginCbChecked = await run(page, () => document.getElementById('consent-login').checked);
    pass('登录 checkbox 默认未勾', loginCbChecked === false);

    const loginBtnDisabled = await run(page, () => document.getElementById('account-login-btn').disabled);
    pass('登录按钮默认 disabled', loginBtnDisabled === true);

    // ════ PHASE 2: 勾选 checkbox → 按钮 enabled ════
    section('PHASE 2: 勾选后 enabled');
    await run(page, () => {
      const cb = document.getElementById('consent-login');
      cb.checked = true;
      cb.dispatchEvent(new Event('change'));
    });
    await wait(page, 100);
    const loginBtnEnabled = await run(page, () => document.getElementById('account-login-btn').disabled);
    pass('勾选后登录按钮 enabled', loginBtnEnabled === false);

    // 再取消勾选 → 重新 disabled
    await run(page, () => {
      const cb = document.getElementById('consent-login');
      cb.checked = false;
      cb.dispatchEvent(new Event('change'));
    });
    await wait(page, 100);
    const loginBtnRedisabled = await run(page, () => document.getElementById('account-login-btn').disabled);
    pass('取消勾选后登录按钮 redisabled', loginBtnRedisabled === true);

    // ════ PHASE 3: 链接 href + target=_blank ════
    section('PHASE 3: 链接属性');
    const privacyHref = await run(page, () => {
      const a = document.querySelector('label.account-consent-row a[data-i18n="consent_privacy"]');
      return a ? a.href : null;
    });
    pass('隐私政策链接 href 正确', privacyHref && privacyHref.endsWith('/privacy.html'));

    const privacyTarget = await run(page, () => {
      const a = document.querySelector('label.account-consent-row a[data-i18n="consent_privacy"]');
      return a ? a.target : null;
    });
    pass('隐私政策链接 target=_blank', privacyTarget === '_blank');

    const termsHref = await run(page, () => {
      const a = document.querySelector('label.account-consent-row a[data-i18n="consent_terms"]');
      return a ? a.href : null;
    });
    pass('用户协议链接 href 正确', termsHref && termsHref.endsWith('/terms.html'));

    // ════ PHASE 4: i18n 切换 ════
    section('PHASE 4: i18n 切换');
    await run(page, () => setLocale('en'));
    await wait(page, 400);
    const enLabel = await run(page, () =>
      document.querySelector('label.account-consent-row span[data-i18n="consent_label"]').textContent
    );
    pass('en 切换后含 "agree"', /agree/i.test(enLabel));

    await run(page, () => setLocale('ja'));
    await wait(page, 400);
    const jaLabel = await run(page, () =>
      document.querySelector('label.account-consent-row span[data-i18n="consent_label"]').textContent
    );
    pass('ja 切换后含「同意」', jaLabel.includes('同意'));

    await run(page, () => setLocale('zh-CN'));
    await wait(page, 400);

    // ════ PHASE 5: 注册 sheet checkbox ════
    section('PHASE 5: 注册 sheet checkbox');
    await run(page, () => openRegisterSheet());
    await wait(page, 400);
    const regCbChecked = await run(page, () => document.getElementById('consent-register').checked);
    pass('注册 checkbox 默认未勾', regCbChecked === false);
    const regBtnDisabled = await run(page, () => document.getElementById('reg-submit-btn').disabled);
    pass('注册按钮默认 disabled', regBtnDisabled === true);

    await run(page, () => {
      const cb = document.getElementById('consent-register');
      cb.checked = true;
      cb.dispatchEvent(new Event('change'));
    });
    await wait(page, 100);
    const regBtnEnabled = await run(page, () => document.getElementById('reg-submit-btn').disabled);
    pass('勾选后注册按钮 enabled', regBtnEnabled === false);

    // ════ PHASE 6: LS 写入函数可调用 ════
    section('PHASE 6: LS 写入');
    await run(page, () => {
      localStorage.removeItem('yh:v1:user:consentAt');
      localStorage.removeItem('yh:v1:user:consentVersion');
      _writeConsentLs();
    });
    const consentAt = await run(page, () => localStorage.getItem('yh:v1:user:consentAt'));
    const consentVer = await run(page, () => localStorage.getItem('yh:v1:user:consentVersion'));
    pass('LS yh:v1:user:consentAt 已写', consentAt && /^\d{4}-\d{2}-\d{2}T/.test(consentAt));
    pass('LS yh:v1:user:consentVersion == v1', consentVer === 'v1');

  } finally {
    await browser.close();
  }

  const { passed, failed, errors } = getCounts();
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  结果: ${passed} 通过, ${failed} 失败`);
  console.log('═'.repeat(60));
  if (failed) { errors.forEach(e => console.log(e)); process.exit(1); }
})();
```

### - [ ] Step 5.2: 跑测试

```powershell
node tests/_pw_consent_checkbox.js
```

Expected: ~14 断言全过。

---

## Task 6: 全回归 + CLAUDE.md 登记 + 单 commit

**Files:**
- Modify: `C:\code\CLAUDE.md`
- Single commit including all P1 changes

### - [ ] Step 6.1: CLAUDE.md 登记新测试

In `C:\code\CLAUDE.md`, find the Playwright test table. Add a row near other auth/UI tests:

```
| `tests/_pw_consent_checkbox.js` | 隐私同意 checkbox（登录/注册 form 强制勾选 + LS 落地 + i18n + 链接，~14 断言，无需登录） |
```

### - [ ] Step 6.2: 全回归

```powershell
node tests/run_all.js
node tests/_pw_ui_smoke.js
node tests/_pw_consent_checkbox.js
```

Expected:
- run_all: 14 套件 / 667 断言全过
- _pw_ui_smoke: 68 断言全过
- _pw_consent_checkbox: ~14 断言全过

### - [ ] Step 6.3: 单 commit

```powershell
git add privacy.html terms.html index.html tests/_pw_consent_checkbox.js CLAUDE.md
git commit -m "feat: 隐私政策 + 用户协议 P1 (中文 + 同意 checkbox)"
```

---

## Self-Review

**Spec 覆盖（对照 `docs/superpowers/specs/2026-06-14-privacy-policy-and-terms-design.md`）**:
- ✅ §3.1 `privacy.html` 文档 → Task 1
- ✅ §3.2 `terms.html` 文档 → Task 2（含 §9 服务定位段）
- ✅ §4.2 Checkbox UI → Task 4 Step 4.1（登录）+ 4.2（注册）
- ✅ §4.3 i18n 5 key × 5 语种 → Task 3
- ✅ §4.4 LS 持久化 → Task 4 Step 4.5/4.6（doAccountLogin / doRegister 后写）
- ✅ §5.1 Playwright 测试 → Task 5
- ✅ §5.2 回归 → Task 6 Step 6.2

**Placeholder 扫描**：无 TBD / TODO / "implement later" / "fill in" 等。

**Type consistency**:
- `consent-login` / `consent-register` 两个 checkbox id 全文一致
- `_updateLoginConsent` / `_updateRegisterConsent` / `_writeConsentLs` 函数命名一致
- `yh:v1:user:consentAt` / `yh:v1:user:consentVersion` LS key 一致
- i18n key `consent_label` / `consent_privacy` / `consent_and` / `consent_terms` / `consent_required_hint` 一致

**已知 risk**：
- Step 4.3 的 `lsSet` 函数从 LS_KEYS helper 提供（v5.13.2 后通用，已稳定）
- Step 4.4 启动时初始化 disabled 用 `setTimeout(fn, 0)` 等 DOM ready
- Step 5.1 测试 PHASE 6 直接调 `_writeConsentLs()`，不走真实登录路径（避免依赖 TEST_PASSWORD）
- 同意状态 sync_config 跨设备同步 → 推到 P2

---

## 不在 P1 内的事

- ❌ 英文 / 其他语种 PP/ToS HTML（P2）
- ❌ sync_config 加 consent 字段跨设备同步（P2）
- ❌ 同意版本升级时弹窗重新征同意（P2）
- ❌ 拒绝同意的注销/退出流程（P2）
- ❌ App Store 隐私标签 JSON（P2 - App Store Connect 后台）
- ❌ 律师 review 后正文修订（P2）

---

## 已知风险

| 风险 | 等级 | 缓解 |
|---|---|---|
| `privacy.html` / `terms.html` 部署前 [开发者姓名待填] 未替换 → 文档不完整 | 中 | 推送 GitHub Pages 前 grep 占位符警告 |
| GitHub Pages 部署延迟（push 后 ~30 秒生效）| 低 | 用户提前明白 |
| LS 写入失败（quota）→ 同意状态丢失 | 低 | `try-catch + console.warn`，不阻塞 login 流 |
| 老用户从未"同意"→ 法律追溯弱 | 低 | spec 已明确 P2 加回溯流程 |
| 中国大陆用户起诉适用中国法律 | 极低 | terms.html §9/§11 已声明加州法律 |
