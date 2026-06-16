# 多语种 PP/ToS（P2 #4）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新增英文 + 繁体 PP/ToS HTML（4 个新文件 + 中文版加 lang-nav），主 app 中 PP/ToS 链接按 locale 路由（en→`_en`、zh-Hant→`_zh-Hant`、zh-CN 默认、es/ja fallback 到英文）。

**Architecture:** 静态文件命名 `{name}_{locale}.html`；index.html 中新加 `_localizedUrl` + `getPrivacyUrl` / `getTermsUrl`；4 处登录/注册 form `<a>` 加 id，`setLocale` 末尾刷新 href；`showConsentUpgradeDialog` body 直接调用辅助函数。

**Tech Stack:** Static HTML + 内联 CSS + vanilla JS + Playwright（无需登录）。

**Reference Spec:** `docs/superpowers/specs/2026-06-16-multilang-pp-tos-design.md`

**Target Version:** v5.13.17

---

## File Structure

| 文件 | 改动 |
|---|---|
| `privacy.html` | 顶部加 lang-nav（中文当前态高亮） |
| `terms.html` | 顶部加 lang-nav |
| `privacy_en.html` | 新建（英文全文 + lang-nav） |
| `terms_en.html` | 新建（英文全文 + lang-nav） |
| `privacy_zh-Hant.html` | 新建（繁体全文 + lang-nav） |
| `terms_zh-Hant.html` | 新建（繁体全文 + lang-nav） |
| `index.html` | 加 `_localizedUrl/getPrivacyUrl/getTermsUrl`；登录/注册 form `<a>` 加 id；`setLocale` hook；`showConsentUpgradeDialog` 改用函数 |
| `tests/_pw_consent_lang_url.js` | 新建 Playwright（~14 断言，无需登录） |
| `CLAUDE.md` | 新测试登记 |

---

## Task 1: 中文版加 lang-nav

**Files:**
- Modify: `C:\code\privacy.html`
- Modify: `C:\code\terms.html`

### - [ ] Step 1.1: privacy.html 顶部加 lang-nav

In `C:\code\privacy.html`, find `<body>` 之后的第一个 `<h1>` 行：

```html
<body>
<h1>忆海拾光 - 隐私政策</h1>
```

在 `<body>` 之后 / `<h1>` 之前插入：

```html
<nav class="lang-nav" style="margin-bottom:18px;padding:8px 0;border-bottom:1px solid #e2e8f0;font-size:13px;color:#64748b">
  <strong style="color:#0e6585">简体中文</strong>
  · <a href="privacy_en.html" style="color:#0ea5e9;text-decoration:none">English</a>
  · <a href="privacy_zh-Hant.html" style="color:#0ea5e9;text-decoration:none">繁體中文</a>
</nav>
```

### - [ ] Step 1.2: terms.html 同样加 lang-nav

In `C:\code\terms.html`, find `<body>` 之后的 `<h1>`：

```html
<body>
<h1>忆海拾光 - 用户协议</h1>
```

在 `<body>` 之后插入：

```html
<nav class="lang-nav" style="margin-bottom:18px;padding:8px 0;border-bottom:1px solid #e2e8f0;font-size:13px;color:#64748b">
  <strong style="color:#0e6585">简体中文</strong>
  · <a href="terms_en.html" style="color:#0ea5e9;text-decoration:none">English</a>
  · <a href="terms_zh-Hant.html" style="color:#0ea5e9;text-decoration:none">繁體中文</a>
</nav>
```

---

## Task 2: 英文版 PP

**Files:**
- Create: `C:\code\privacy_en.html`

### - [ ] Step 2.1: 创建 privacy_en.html

Create file with full content (use this exact content):

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=5">
<title>Privacy Policy - Memory Glimmers</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;line-height:1.7;color:#1a2a3a;background:#f5f7fa;padding:24px 16px;max-width:760px;margin:0 auto}
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
<nav class="lang-nav" style="margin-bottom:18px;padding:8px 0;border-bottom:1px solid #e2e8f0;font-size:13px;color:#64748b">
  <a href="privacy.html" style="color:#0ea5e9;text-decoration:none">简体中文</a>
  · <strong style="color:#0e6585">English</strong>
  · <a href="privacy_zh-Hant.html" style="color:#0ea5e9;text-decoration:none">繁體中文</a>
</nav>

<h1>Memory Glimmers - Privacy Policy</h1>
<div class="meta">
  <strong>Effective Date:</strong> 2026-06-15<br>
  <strong>Version:</strong> v1.0
</div>

<h2>1. Controller Information</h2>
<p>"Memory Glimmers" (hereinafter "the App" or "we") is developed and operated by individual developer <strong>[Developer Name TBD]</strong>.</p>
<p>Contact: <a href="mailto:zyhaff@gmail.com">zyhaff@gmail.com</a></p>

<h2>2. Information We Collect</h2>
<p>To provide memory training and flashcard services, we collect the following information:</p>

<h3>2.1 Account Information</h3>
<ul>
  <li>Email address used for registration</li>
  <li>Encrypted password (hashed by Supabase Auth; we cannot view it in plaintext)</li>
</ul>

<h3>2.2 Learning Data</h3>
<ul>
  <li>Decks you create/import (card names, images, audio)</li>
  <li>Answer history (timestamps, accuracy, SRS state)</li>
  <li>Practice settings (language, mode, prompt preferences)</li>
</ul>

<h3>2.3 Device Information</h3>
<ul>
  <li>Device identifier (device_id, generated locally)</li>
  <li>Operating system, browser type, screen resolution (for diagnostics and adaptation)</li>
  <li>IP address (recorded by Supabase backend for security audit and quota management)</li>
</ul>

<h3>2.4 Application Event Logs</h3>
<ul>
  <li>Business milestone events (login, sync, errors)</li>
  <li>JS exception reports (crash information, for bug troubleshooting)</li>
</ul>

<h3>2.5 Feedback You Submit</h3>
<ul>
  <li>Text feedback content and accompanying diagnostic information</li>
</ul>

<h3>We Do Not Collect</h3>
<ul>
  <li>Location, contacts, camera/microphone (other than voice recordings you initiate), browsing history</li>
</ul>

<h2>3. Purposes of Use</h2>
<p>Only for:</p>
<ol>
  <li>Providing and improving training services</li>
  <li>Cross-device sync of learning progress</li>
  <li>Security audit and anti-abuse</li>
  <li>Fixing defects (crash reports / sync anomalies)</li>
  <li>Responding to your feedback</li>
</ol>
<p>We <strong>will not</strong>:</p>
<ul>
  <li>Use data for advertising</li>
  <li>Sell data to third parties</li>
  <li>Share data with unrelated third parties</li>
</ul>

<h2>4. Third-Party Services</h2>
<table>
<tr><th>Service</th><th>Purpose</th><th>Data Scope</th></tr>
<tr><td>Supabase (Supabase Inc., USA/Singapore)</td><td>Database, authentication, file storage</td><td>All account and learning data</td></tr>
<tr><td>GitHub Pages (GitHub Inc., USA)</td><td>Static asset hosting</td><td>No user data stored; only page access logs</td></tr>
</table>
<p>Third parties operate under their data processing obligations and respective privacy policies:</p>
<ul>
  <li><a href="https://supabase.com/privacy" target="_blank" rel="noopener">Supabase Privacy Policy</a></li>
  <li><a href="https://docs.github.com/site-policy/privacy-policies/github-general-privacy-statement" target="_blank" rel="noopener">GitHub Privacy Statement</a></li>
</ul>

<h2>5. Data Storage Location (Factual Disclosure)</h2>
<p>We use cloud services from Supabase Inc. (US-incorporated company). The database is located in <strong>Singapore (ap-southeast-1)</strong>; file storage is in the same region. This choice is based on service availability, latency, and cost considerations and is not targeted at users of any specific region.</p>
<p>This service is targeted at the <strong>global Chinese-speaking community</strong>, with overseas users as the primary audience. We do not actively promote or operate in mainland China. If you are a resident of mainland China and use this service voluntarily, you agree that your data will be stored at the above overseas locations.</p>

<h2>6. Data Retention</h2>
<ul>
  <li><strong>Active accounts</strong>: retained throughout the service term</li>
  <li><strong>Account deletion</strong>: deleted within 30 days of your deletion request (retention period accommodates reversal requests and statutory obligations)</li>
  <li><strong>Crash reports / event logs</strong>: automatically purged after 90 days</li>
  <li><strong>Feedback records</strong>: 3 years (for tracking improvements)</li>
</ul>

<h2>7. Your Rights (CCPA / General Privacy Principles)</h2>
<p>Regardless of your region, we commit to the following rights:</p>
<table>
<tr><th>Right</th><th>How to Exercise</th></tr>
<tr><td><strong>Right to know</strong> how we handle your information</td><td>Read this Policy</td></tr>
<tr><td><strong>Access</strong> your data</td><td>In-app: "Mine" → Export Data / Email zyhaff@gmail.com</td></tr>
<tr><td><strong>Correct</strong> inaccurate information</td><td>Edit in-app / email request</td></tr>
<tr><td><strong>Delete</strong> your data</td><td>Email zyhaff@gmail.com with subject "Data Deletion Request"; executed within 30 days</td></tr>
<tr><td><strong>Withdraw consent / close</strong> account</td><td>Email request</td></tr>
<tr><td><strong>Export</strong> data copy</td><td>Email request; provided within 10 business days</td></tr>
<tr><td><strong>No discrimination</strong> after exercising the above rights — no service degradation</td><td>Automatically guaranteed</td></tr>
</table>
<p>California residents have additional CCPA rights (do-not-sell / do-not-share). Since this service does not sell or share user personal information with third parties, the CCPA "Do Not Sell" right applies automatically.</p>

<h2>8. Cookies and Local Storage</h2>
<p>We use browser localStorage and IndexedDB to store:</p>
<ul>
  <li>Your login tokens (for auto-login)</li>
  <li>Deck data cache (for offline practice)</li>
  <li>Application settings</li>
</ul>
<p>We do not use third-party cookies or conduct advertising tracking.</p>

<h2>9. Security Measures</h2>
<ul>
  <li>Passwords use industry-standard hashing (implemented by Supabase)</li>
  <li>Data transmitted via HTTPS/TLS 1.2+</li>
  <li>Database access restricted by Supabase RLS policies (only you can access your data)</li>
  <li>Application-layer exception auto-reporting for security monitoring</li>
</ul>
<p>We strive to protect data security but cannot guarantee absolute security. In case of a data breach, we will notify affected users within 72 hours of discovery.</p>

<h2>10. Protection of Minors (COPPA)</h2>
<p>This App is <strong>not directed at children under 13</strong> (COPPA threshold). If you are under 13, do not use this App. If we discover we have collected information from a child under 13, we will delete it immediately.</p>
<p>Parents who discover their children have inadvertently used this App may contact us at <a href="mailto:zyhaff@gmail.com">zyhaff@gmail.com</a> to delete related data.</p>

<h2>11. Policy Updates</h2>
<p>This Policy may be revised as service features adjust or laws change. For material changes, we will notify users through:</p>
<ul>
  <li>Prominent in-app announcement</li>
  <li>Email to your registered email address</li>
</ul>
<p>If you do not agree to the updated Policy, please stop using this App.</p>

<h2>12. Contact</h2>
<p>For privacy-related questions or requests:</p>
<ul>
  <li>Email: <a href="mailto:zyhaff@gmail.com">zyhaff@gmail.com</a></li>
  <li>We will respond within 15 business days</li>
</ul>

<h2>13. Governing Law</h2>
<p>This Policy is governed by the <strong>laws of the State of California, USA</strong>, consistent with all applicable US federal laws and Apple App Store platform rules. Any disputes shall be interpreted and resolved under California law.</p>

<a class="back-link" href="./">← Back to App</a>
</body>
</html>
```

---

## Task 3: 英文版 ToS

**Files:**
- Create: `C:\code\terms_en.html`

### - [ ] Step 3.1: 创建 terms_en.html

Create file with this exact content:

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=5">
<title>Terms of Service - Memory Glimmers</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;line-height:1.7;color:#1a2a3a;background:#f5f7fa;padding:24px 16px;max-width:760px;margin:0 auto}
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
<nav class="lang-nav" style="margin-bottom:18px;padding:8px 0;border-bottom:1px solid #e2e8f0;font-size:13px;color:#64748b">
  <a href="terms.html" style="color:#0ea5e9;text-decoration:none">简体中文</a>
  · <strong style="color:#0e6585">English</strong>
  · <a href="terms_zh-Hant.html" style="color:#0ea5e9;text-decoration:none">繁體中文</a>
</nav>

<h1>Memory Glimmers - Terms of Service</h1>
<div class="meta">
  <strong>Effective Date:</strong> 2026-06-15<br>
  <strong>Version:</strong> v1.0
</div>

<div class="notice">
  <strong>By registering or using this App, you are deemed to have read, understood, and agreed to all terms of these Terms of Service.</strong>
</div>

<h2>1. Contract Relationship</h2>
<p>This Agreement is a legal contract between you ("User") and <strong>[Developer Name TBD]</strong> ("we") concerning the use of "Memory Glimmers" services.</p>

<h2>2. Service Description</h2>
<p>This App provides:</p>
<ul>
  <li>Spaced repetition memory training based on the SM-2 algorithm</li>
  <li>Personal deck creation and card management</li>
  <li>Cross-device sync of learning progress</li>
  <li>Voice-assisted playback</li>
</ul>
<p>The service is provided free of charge at its basic tier. Paid subscription features may be introduced in the future, with advance notice via amendments to these Terms.</p>

<h2>3. Accounts and Registration</h2>
<ul>
  <li>You must provide a valid email to register</li>
  <li>You shall safeguard your account credentials and bear responsibility for all activities under your account</li>
  <li>One person, one account; sharing or transferring accounts is not permitted</li>
  <li>If you discover unauthorized account use, contact us immediately at <a href="mailto:zyhaff@gmail.com">zyhaff@gmail.com</a></li>
</ul>

<h2>4. User Conduct</h2>
<p>You agree not to:</p>
<ol>
  <li>Upload or share cards containing pornographic, violent, politically sensitive, or illegal content</li>
  <li>Upload unauthorized third-party copyrighted content</li>
  <li>Use automated scripts for bulk operations or service disruption</li>
  <li>Attack, damage, or attempt to bypass the App's security mechanisms</li>
  <li>Impersonate others or provide false information</li>
  <li>Use this App for any commercial purpose without our prior written permission</li>
</ol>

<h2>5. User Content</h2>

<h3>5.1 Ownership</h3>
<p>You retain copyright of deck cards, images, recordings, and other content you upload.</p>

<h3>5.2 License Grant</h3>
<p>You grant us a limited license to use your content solely for:</p>
<ul>
  <li>Storing and syncing under your account</li>
  <li>Cross-device display and playback</li>
  <li>Service maintenance and improvement</li>
</ul>
<p>This license does not extend to promotional use, AI training, or resale of your content.</p>

<h3>5.3 Your Responsibility</h3>
<p>You are responsible for the legality, compliance, and non-infringement of content you upload. If legal disputes arise from your content, you bear full liability.</p>

<h3>5.4 Our Rights</h3>
<p>For content clearly violating Section 4, we may remove it without notice and suspend or close the related account.</p>

<h2>6. Intellectual Property</h2>
<ul>
  <li>The software, design, trademarks, and documentation of this App belong to us</li>
  <li>You obtain only a limited, non-exclusive, non-transferable license to use</li>
  <li>Without written permission, no reverse engineering, decompilation, redistribution, or derivative development is permitted</li>
</ul>

<h2>7. Disclaimer</h2>
<p><strong>The Service is provided "as is" without warranty that:</strong></p>
<ol>
  <li>The spaced repetition algorithm will improve any specific individual's memory</li>
  <li>The Service will be continuously available, uninterrupted, or error-free</li>
  <li>Your data will not be lost due to software defects, third-party service failures, or force majeure</li>
</ol>
<p>We recommend periodic backups via the in-app export feature.</p>

<h2>8. Limitation of Liability</h2>
<p>To the maximum extent permitted by law:</p>
<ol>
  <li>We are not liable for indirect, incidental, or consequential damages arising from your use of this App</li>
  <li>Losses caused by third-party services (Supabase, GitHub Pages, etc.) are the responsibility of those providers</li>
  <li>Our total liability shall not exceed the fees you paid for this service in the past 12 months (zero for free users)</li>
</ol>

<h2 class="highlight">9. Service Positioning (Important)</h2>
<p>This Service is targeted at the <strong>global Chinese-speaking community</strong>, with <strong>overseas Chinese</strong> as the primary audience.</p>
<p>The Service's design assumptions, compliance framework, data storage location (Supabase Singapore), and governing law (California, USA) are all based on this positioning.</p>
<p><strong>If you reside in mainland China:</strong></p>
<ol>
  <li>You understand and agree that this Service is <strong>not actively promoted or operated in mainland China</strong></li>
  <li>You use this Service voluntarily and at your own initiative; <strong>this shall not be construed as us providing products or services to residents of mainland China</strong></li>
  <li>You understand your account data will be stored on overseas servers</li>
  <li>You agree this Agreement is interpreted under California, USA law, and PRC law does not apply</li>
  <li>If you do not agree to the above, please do not use this Service</li>
</ol>

<h2>10. Service Changes and Termination</h2>
<p>We reserve the right to:</p>
<ol>
  <li>Adjust, suspend, or terminate part or all service features at any time</li>
  <li>Perform maintenance and upgrades that do not affect core functionality</li>
  <li>Terminate service for users who violate these Terms</li>
</ol>
<p>For service termination not caused by users, we will provide 30 days' advance notice.</p>

<h2>11. Governing Law and Dispute Resolution</h2>
<ol>
  <li><strong>This Agreement is governed by the laws of the State of California, USA</strong>, consistent with applicable US federal law and Apple Developer Program License Agreement</li>
  <li>Disputes arising from this Agreement shall be <strong>resolved through negotiation</strong> first</li>
  <li>If negotiation fails, disputes shall be submitted to state or federal courts with jurisdiction in <strong>Santa Clara County, California</strong>; or, by mutual agreement, to arbitration with the American Arbitration Association (AAA) under its Commercial Arbitration Rules in California</li>
  <li>If you reside in mainland China, you understand and agree this Agreement is governed by US law, not Chinese law</li>
</ol>

<h2>12. Agreement Changes</h2>
<p>We may revise these Terms. Material changes will be notified via in-app announcement or email. Continued use after notice constitutes acceptance of the new version.</p>

<h2>13. Contact</h2>
<ul>
  <li>Email: <a href="mailto:zyhaff@gmail.com">zyhaff@gmail.com</a></li>
  <li>We will respond within 15 business days</li>
</ul>

<a class="back-link" href="./">← Back to App</a>
</body>
</html>
```

---

## Task 4: 繁体 PP

**Files:**
- Create: `C:\code\privacy_zh-Hant.html`

### - [ ] Step 4.1: 创建 privacy_zh-Hant.html

Create file with this exact content (从 zh-CN 转繁体 + 词汇本地化「软件→軟體」「网络→網路」「视频→影片」「质量→品質」「实施→實施」「权利→權利」「认证→認證」等台湾习惯)：

```html
<!DOCTYPE html>
<html lang="zh-Hant">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=5">
<title>隱私政策 - 憶海拾光</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:-apple-system,BlinkMacSystemFont,"PingFang TC","Microsoft JhengHei",sans-serif;line-height:1.7;color:#1a2a3a;background:#f5f7fa;padding:24px 16px;max-width:760px;margin:0 auto}
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
<nav class="lang-nav" style="margin-bottom:18px;padding:8px 0;border-bottom:1px solid #e2e8f0;font-size:13px;color:#64748b">
  <a href="privacy.html" style="color:#0ea5e9;text-decoration:none">简体中文</a>
  · <a href="privacy_en.html" style="color:#0ea5e9;text-decoration:none">English</a>
  · <strong style="color:#0e6585">繁體中文</strong>
</nav>

<h1>憶海拾光 - 隱私政策</h1>
<div class="meta">
  <strong>生效日期：</strong>2026-06-15<br>
  <strong>版本：</strong>v1.0
</div>

<h2>一、控制者資訊</h2>
<p>「憶海拾光」（以下簡稱「本應用」或「我們」）由個人開發者<strong>[開發者姓名待填]</strong>開發並營運。</p>
<p>聯絡郵箱：<a href="mailto:zyhaff@gmail.com">zyhaff@gmail.com</a></p>

<h2>二、我們收集的資訊</h2>
<p>為提供訓練記憶與學習卡片服務，我們收集以下資訊：</p>

<h3>1. 帳號資訊</h3>
<ul>
  <li>註冊郵箱</li>
  <li>加密密碼（僅雜湊儲存於 Supabase Auth，我們無法檢視明文）</li>
</ul>

<h3>2. 學習資料</h3>
<ul>
  <li>您建立/匯入的牌組資料（卡片名稱、圖片、音訊）</li>
  <li>答題紀錄（時間、正確率、SRS 狀態）</li>
  <li>練習設定（語言、模式、提示偏好）</li>
</ul>

<h3>3. 裝置資訊</h3>
<ul>
  <li>裝置唯一識別碼（device_id，本機產生）</li>
  <li>作業系統、瀏覽器類型、螢幕解析度（用於診斷與適配）</li>
  <li>IP 位址（由 Supabase 後端紀錄，用於安全稽核與配額管理）</li>
</ul>

<h3>4. 應用程式事件紀錄</h3>
<ul>
  <li>業務里程碑事件（登入、同步、錯誤等）</li>
  <li>JS 例外回報（崩潰資訊，用於排查 bug）</li>
</ul>

<h3>5. 您主動提交的意見回饋</h3>
<ul>
  <li>文字回饋內容、附帶的診斷資訊</li>
</ul>

<h3>我們不收集：</h3>
<ul>
  <li>位置資訊、通訊錄、相機/麥克風（除您主動錄製語音外）、瀏覽歷史</li>
</ul>

<h2>三、資訊用途</h2>
<p>僅用於：</p>
<ol>
  <li>提供並改進訓練服務</li>
  <li>跨裝置同步學習進度</li>
  <li>安全稽核與防作弊</li>
  <li>修復缺陷（崩潰報告 / 同步異常）</li>
  <li>在您提交回饋時進行答覆</li>
</ol>
<p>我們<strong>不會</strong>：</p>
<ul>
  <li>用於廣告投放</li>
  <li>出售給第三方</li>
  <li>分享給與服務無關的第三方</li>
</ul>

<h2>四、第三方服務</h2>
<table>
<tr><th>服務</th><th>用途</th><th>資料範圍</th></tr>
<tr><td>Supabase（Supabase Inc.，美國/新加坡）</td><td>資料庫、身分認證、檔案儲存</td><td>全部帳號與學習資料</td></tr>
<tr><td>GitHub Pages（GitHub Inc.，美國）</td><td>靜態資源託管</td><td>不儲存使用者資料，僅頁面存取紀錄</td></tr>
</table>
<p>第三方均與我們簽訂有資料處理義務，並遵守各自隱私政策：</p>
<ul>
  <li><a href="https://supabase.com/privacy" target="_blank" rel="noopener">Supabase Privacy Policy</a></li>
  <li><a href="https://docs.github.com/site-policy/privacy-policies/github-general-privacy-statement" target="_blank" rel="noopener">GitHub Privacy Statement</a></li>
</ul>

<h2>五、資料儲存位置（事實揭露）</h2>
<p>我們使用 Supabase Inc.（美國註冊公司）提供的雲端服務，資料庫位於<strong>新加坡（ap-southeast-1）</strong>，檔案儲存在同一區域。我們對此區域的選擇基於服務可用性、延遲與成本考量，並非針對任何特定地區使用者。</p>
<p>本服務面向<strong>全球華人社群</strong>，主要受眾為海外使用者，未在中國大陸開展主動推廣或營運。如您是中國大陸居民並自願使用本服務，您同意您的資料將儲存於上述境外位置。</p>

<h2>六、資料保留期限</h2>
<ul>
  <li><strong>活躍帳號</strong>：服務期間持續保留</li>
  <li><strong>登出帳號</strong>：自您提交登出請求起 30 天內刪除（保留期用於撤銷請求與法定保留義務）</li>
  <li><strong>崩潰報告/事件紀錄</strong>：90 天後自動清除</li>
  <li><strong>回饋紀錄</strong>：3 年（用於追蹤問題改進）</li>
</ul>

<h2>七、您的權利（參考 CCPA / 通用隱私原則）</h2>
<p>不論您所在地區，我們承諾以下權利：</p>
<table>
<tr><th>權利</th><th>行使方式</th></tr>
<tr><td><strong>知悉</strong> 我們如何處理您的資訊</td><td>閱讀本政策</td></tr>
<tr><td><strong>存取</strong> 您的資料</td><td>App 內「我的」→ 匯出資料 / 郵件 zyhaff@gmail.com</td></tr>
<tr><td><strong>更正</strong> 不準確資訊</td><td>App 內編輯 / 郵件請求</td></tr>
<tr><td><strong>刪除</strong> 您的資料</td><td>郵件 zyhaff@gmail.com，主旨「資料刪除請求」，30 天內執行</td></tr>
<tr><td><strong>撤回同意 / 登出</strong> 帳號</td><td>郵件請求登出帳號</td></tr>
<tr><td><strong>匯出</strong> 資料副本</td><td>郵件請求，10 個工作日內提供</td></tr>
<tr><td><strong>不受歧視</strong> 行使上述權利後服務不降級</td><td>自動保障</td></tr>
</table>
<p>加州居民另享 CCPA 項下權利（不出售資料 / 不分享資料），由於本服務不出售或分享使用者個人資訊於第三方，CCPA "Do Not Sell" 權利對您自動適用。</p>

<h2>八、Cookie 與本機儲存</h2>
<p>我們使用瀏覽器 localStorage 與 IndexedDB 儲存：</p>
<ul>
  <li>您的登入權杖（用於自動登入）</li>
  <li>牌組資料快取（用於離線練習）</li>
  <li>應用程式設定</li>
</ul>
<p>不使用第三方 Cookie，不進行廣告追蹤。</p>

<h2>九、安全措施</h2>
<ul>
  <li>密碼採用業界標準雜湊演算法（由 Supabase 實作）</li>
  <li>資料傳輸使用 HTTPS/TLS 1.2+</li>
  <li>資料庫存取受 Supabase RLS 策略限制（僅您本人可存取您的資料）</li>
  <li>應用程式層例外自動回報便於安全監控</li>
</ul>
<p>我們盡力保障資料安全，但無法保證絕對安全。如發生資料外洩，我們將於發現後 72 小時內通知受影響使用者。</p>

<h2>十、未成年人保護（COPPA）</h2>
<p>本應用<strong>不針對未滿 13 周歲的兒童</strong>（COPPA 閾值）。如您未滿 13 周歲，請勿使用本應用。如我們發現已收集了未滿 13 周歲兒童的資訊，將立即刪除。</p>
<p>家長如發現孩子誤用了本應用，可透過 <a href="mailto:zyhaff@gmail.com">zyhaff@gmail.com</a> 聯絡我們刪除相關資料。</p>

<h2>十一、政策更新</h2>
<p>本政策可能隨服務功能調整或法律變更而修訂。重大變更我們將透過以下方式通知：</p>
<ul>
  <li>App 內顯著位置公告</li>
  <li>您註冊郵箱的電子郵件</li>
</ul>
<p>如您不同意更新後的政策，請停止使用本應用。</p>

<h2>十二、聯絡方式</h2>
<p>如有隱私相關問題或請求，請聯絡：</p>
<ul>
  <li>郵箱：<a href="mailto:zyhaff@gmail.com">zyhaff@gmail.com</a></li>
  <li>我們將在 15 個工作日內回覆</li>
</ul>

<h2>十三、適用法律</h2>
<p>本政策適用<strong>美國加利福尼亞州法律</strong>，與所有聯邦法律及 Apple App Store 平台規則一致。涉及任何爭議，依美國加州法律解釋與解決。</p>

<a class="back-link" href="./">← 返回應用</a>
</body>
</html>
```

---

## Task 5: 繁体 ToS

**Files:**
- Create: `C:\code\terms_zh-Hant.html`

### - [ ] Step 5.1: 创建 terms_zh-Hant.html

Create file with this exact content:

```html
<!DOCTYPE html>
<html lang="zh-Hant">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=5">
<title>使用者協議 - 憶海拾光</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:-apple-system,BlinkMacSystemFont,"PingFang TC","Microsoft JhengHei",sans-serif;line-height:1.7;color:#1a2a3a;background:#f5f7fa;padding:24px 16px;max-width:760px;margin:0 auto}
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
<nav class="lang-nav" style="margin-bottom:18px;padding:8px 0;border-bottom:1px solid #e2e8f0;font-size:13px;color:#64748b">
  <a href="terms.html" style="color:#0ea5e9;text-decoration:none">简体中文</a>
  · <a href="terms_en.html" style="color:#0ea5e9;text-decoration:none">English</a>
  · <strong style="color:#0e6585">繁體中文</strong>
</nav>

<h1>憶海拾光 - 使用者協議</h1>
<div class="meta">
  <strong>生效日期：</strong>2026-06-15<br>
  <strong>版本：</strong>v1.0
</div>

<div class="notice">
  <strong>註冊或使用本應用即視為您已閱讀、理解並同意本協議全部條款。</strong>
</div>

<h2>一、協議關係</h2>
<p>本協議是您（以下稱「使用者」）與<strong>[開發者姓名待填]</strong>（以下稱「我們」）之間關於使用「憶海拾光」服務的法律協議。</p>

<h2>二、服務說明</h2>
<p>本應用提供：</p>
<ul>
  <li>基於 SM-2 演算法的間隔重複記憶訓練</li>
  <li>個人牌組建立與卡片管理</li>
  <li>跨裝置學習進度同步</li>
  <li>語音輔助播報</li>
</ul>
<p>服務為基礎免費提供。未來可能推出付費訂閱功能，屆時將透過本協議修訂形式提前公告。</p>

<h2>三、帳號與註冊</h2>
<ul>
  <li>您需提供有效郵箱註冊帳號</li>
  <li>您應妥善保管帳號密碼，對帳號下所有活動負責</li>
  <li>一人一號；不得共享或轉讓帳號</li>
  <li>如發現帳號被未授權使用，請立即透過 <a href="mailto:zyhaff@gmail.com">zyhaff@gmail.com</a> 聯絡我們</li>
</ul>

<h2>四、使用者行為規範</h2>
<p>您承諾不會：</p>
<ol>
  <li>上傳或分享含色情、暴力、政治敏感或違法內容的卡片</li>
  <li>上傳未經授權使用的第三方版權內容</li>
  <li>使用自動化腳本進行批次操作或干擾服務</li>
  <li>攻擊、破壞或試圖繞過應用程式安全機制</li>
  <li>假冒他人或提供虛假資訊</li>
  <li>利用本應用進行任何商業用途未事先獲得我們書面許可</li>
</ol>

<h2>五、使用者內容</h2>

<h3>1. 所有權</h3>
<p>您上傳的牌組卡片、圖片、錄音等內容的版權歸您所有。</p>

<h3>2. 授權</h3>
<p>您同意授予我們使用您內容的有限許可，僅用於：</p>
<ul>
  <li>在您帳號下儲存與同步</li>
  <li>跨裝置展示與播放</li>
  <li>維護與改進服務</li>
</ul>
<p>許可範圍不包括將您內容用於推廣、訓練 AI 模型或轉售。</p>

<h3>3. 您的責任</h3>
<p>您對所上傳內容的合法性、合規性、不侵權負責。如因您內容引發法律糾紛，由您承擔全部責任。</p>

<h3>4. 我們的權利</h3>
<p>對於明顯違反本協議第四條的內容，我們有權不經通知刪除並暫停或註銷相關帳號。</p>

<h2>六、智慧財產權</h2>
<ul>
  <li>本應用的軟體、設計、商標、文件歸我們所有</li>
  <li>您僅獲得有限的、非獨佔、不可轉讓的使用許可</li>
  <li>未經書面許可，不得逆向工程、反編譯、二次發布或衍生開發</li>
</ul>

<h2>七、免責聲明</h2>
<p><strong>本服務按「現狀」提供，不保證：</strong></p>
<ol>
  <li>間隔重複演算法能改善任何特定個人的記憶能力</li>
  <li>服務持續可用、零中斷、無錯誤</li>
  <li>您的資料不會因軟體缺陷、第三方服務故障或不可抗力而遺失</li>
</ol>
<p>我們建議您定期透過應用程式內匯出功能備份重要資料。</p>

<h2>八、責任限制</h2>
<p>在法律允許的最大範圍內：</p>
<ol>
  <li>我們對您因使用本應用產生的間接、附帶、衍生損害不承擔責任</li>
  <li>因第三方服務（Supabase、GitHub Pages 等）原因導致的損失，由相應服務提供方承擔</li>
  <li>我們的總責任不超過您過去 12 個月內為本服務支付的費用（免費使用者為零）</li>
</ol>

<h2 class="highlight">九、服務定位（重要）</h2>
<p>本服務面向<strong>全球華人社群</strong>，主要受眾為<strong>海外華人</strong>。</p>
<p>服務的設計假設、合規框架、資料儲存位置（Supabase 新加坡）和適用法律（美國加州）均基於此定位。</p>
<p><strong>如您居住在中國大陸：</strong></p>
<ol>
  <li>您理解並同意本服務<strong>未在中國大陸主動推廣或營運</strong></li>
  <li>您是在自願、主動選擇下使用本服務，<strong>不視為我們向中國大陸居民提供產品或服務</strong></li>
  <li>您理解您的帳號資料將儲存於境外伺服器</li>
  <li>您同意以美國加州法律為準解釋本協議，不適用中華人民共和國法律</li>
  <li>如您不同意上述條款，請勿使用本服務</li>
</ol>

<h2>十、服務變更與終止</h2>
<p>我們保留以下權利：</p>
<ol>
  <li>隨時調整、暫停或終止部分或全部服務功能</li>
  <li>因技術原因進行不影響核心功能的維護與升級</li>
  <li>對違反本協議的使用者，可終止其服務</li>
</ol>
<p>非使用者原因導致的服務終止，我們將提前 30 天公告。</p>

<h2>十一、適用法律與爭議解決</h2>
<ol>
  <li><strong>本協議適用美國加利福尼亞州法律</strong>，與適用的美國聯邦法律及 Apple Developer 協議保持一致</li>
  <li>因本協議產生的爭議，雙方應<strong>首先協商解決</strong></li>
  <li>協商不成的，爭議提交<strong>加利福尼亞州聖克拉拉縣（Santa Clara County）</strong>有管轄權的州或聯邦法院解決；或經雙方同意提交美國仲裁協會（AAA）按其商事仲裁規則在加州進行仲裁</li>
  <li>如您是中國大陸居民，您理解並同意本協議適用美國法律，不適用中國法律</li>
</ol>

<h2>十二、協議變更</h2>
<p>我們可能修訂本協議。重大變更將透過 App 內公告或郵件通知。繼續使用即視為接受新版本。</p>

<h2>十三、聯絡方式</h2>
<ul>
  <li>郵箱：<a href="mailto:zyhaff@gmail.com">zyhaff@gmail.com</a></li>
  <li>我們將在 15 個工作日內回覆</li>
</ul>

<a class="back-link" href="./">← 返回應用</a>
</body>
</html>
```

---

## Task 6: index.html 路由函数 + 链接刷新

**Files:**
- Modify: `C:\code\index.html`

### - [ ] Step 6.1: 加 `_localizedUrl` / `getPrivacyUrl` / `getTermsUrl`

Find `function _writeConsentLs()` (P1 已有，约 line 6310 区域)，在它之前插入：

```javascript
function _localizedUrl(filename) {
  const base = 'https://katelynmichelin976-wq.github.io/ReminiSea/';
  const locale = (typeof getLocale === 'function') ? getLocale() : 'zh-CN';
  if (locale === 'en' || locale === 'es' || locale === 'ja') {
    return base + filename.replace('.html', '_en.html');
  }
  if (locale === 'zh-Hant') {
    return base + filename.replace('.html', '_zh-Hant.html');
  }
  return base + filename;
}
function getPrivacyUrl() { return _localizedUrl('privacy.html'); }
function getTermsUrl()   { return _localizedUrl('terms.html'); }

function _refreshConsentLinks() {
  const ids = {
    'consent-login-privacy-a':    getPrivacyUrl,
    'consent-login-terms-a':      getTermsUrl,
    'consent-register-privacy-a': getPrivacyUrl,
    'consent-register-terms-a':   getTermsUrl,
  };
  for (const id in ids) {
    const a = document.getElementById(id);
    if (a) a.href = ids[id]();
  }
}

```

### - [ ] Step 6.2: 登录 form `<a>` 加 id

Find login form consent row (P1 已有，约 line 2440 之前)：

```html
        <label class="account-consent-row" style="display:flex;align-items:flex-start;gap:8px;font-size:13px;color:#475569;margin:8px 0;line-height:1.5;cursor:pointer;-webkit-user-select:none;user-select:none">
          <input type="checkbox" id="consent-login" onchange="_updateLoginConsent()" style="margin-top:3px;flex-shrink:0;cursor:pointer">
          <span><span data-i18n="consent_label">我已阅读并同意</span> <a href="https://katelynmichelin976-wq.github.io/ReminiSea/privacy.html" target="_blank" rel="noopener" data-i18n="consent_privacy" style="color:#0ea5e9;text-decoration:none">《隐私政策》</a> <span data-i18n="consent_and">和</span> <a href="https://katelynmichelin976-wq.github.io/ReminiSea/terms.html" target="_blank" rel="noopener" data-i18n="consent_terms" style="color:#0ea5e9;text-decoration:none">《用户协议》</a></span>
        </label>
```

Replace with（两个 `<a>` 加 id）：

```html
        <label class="account-consent-row" style="display:flex;align-items:flex-start;gap:8px;font-size:13px;color:#475569;margin:8px 0;line-height:1.5;cursor:pointer;-webkit-user-select:none;user-select:none">
          <input type="checkbox" id="consent-login" onchange="_updateLoginConsent()" style="margin-top:3px;flex-shrink:0;cursor:pointer">
          <span><span data-i18n="consent_label">我已阅读并同意</span> <a id="consent-login-privacy-a" href="https://katelynmichelin976-wq.github.io/ReminiSea/privacy.html" target="_blank" rel="noopener" data-i18n="consent_privacy" style="color:#0ea5e9;text-decoration:none">《隐私政策》</a> <span data-i18n="consent_and">和</span> <a id="consent-login-terms-a" href="https://katelynmichelin976-wq.github.io/ReminiSea/terms.html" target="_blank" rel="noopener" data-i18n="consent_terms" style="color:#0ea5e9;text-decoration:none">《用户协议》</a></span>
        </label>
```

### - [ ] Step 6.3: 注册 sheet `<a>` 加 id

Find register sheet consent row（约 line 2121 之前）：

```html
      <label class="account-consent-row" style="display:flex;align-items:flex-start;gap:8px;font-size:13px;color:#475569;margin:10px 0;line-height:1.5;cursor:pointer;-webkit-user-select:none;user-select:none">
        <input type="checkbox" id="consent-register" onchange="_updateRegisterConsent()" style="margin-top:3px;flex-shrink:0;cursor:pointer">
        <span><span data-i18n="consent_label">我已阅读并同意</span> <a href="https://katelynmichelin976-wq.github.io/ReminiSea/privacy.html" target="_blank" rel="noopener" data-i18n="consent_privacy" style="color:#0ea5e9;text-decoration:none">《隐私政策》</a> <span data-i18n="consent_and">和</span> <a href="https://katelynmichelin976-wq.github.io/ReminiSea/terms.html" target="_blank" rel="noopener" data-i18n="consent_terms" style="color:#0ea5e9;text-decoration:none">《用户协议》</a></span>
      </label>
```

Replace with:

```html
      <label class="account-consent-row" style="display:flex;align-items:flex-start;gap:8px;font-size:13px;color:#475569;margin:10px 0;line-height:1.5;cursor:pointer;-webkit-user-select:none;user-select:none">
        <input type="checkbox" id="consent-register" onchange="_updateRegisterConsent()" style="margin-top:3px;flex-shrink:0;cursor:pointer">
        <span><span data-i18n="consent_label">我已阅读并同意</span> <a id="consent-register-privacy-a" href="https://katelynmichelin976-wq.github.io/ReminiSea/privacy.html" target="_blank" rel="noopener" data-i18n="consent_privacy" style="color:#0ea5e9;text-decoration:none">《隐私政策》</a> <span data-i18n="consent_and">和</span> <a id="consent-register-terms-a" href="https://katelynmichelin976-wq.github.io/ReminiSea/terms.html" target="_blank" rel="noopener" data-i18n="consent_terms" style="color:#0ea5e9;text-decoration:none">《用户协议》</a></span>
      </label>
```

### - [ ] Step 6.4: setLocale hook

Find `setLocale` function definition. Grep `function setLocale\(`：

```powershell
node -e "const fs=require('fs');const c=fs.readFileSync('C:/code/index.html','utf8');const m=c.match(/function setLocale\(/g);console.log(m);const idx=c.search(/function setLocale\(/);if(idx>=0){console.log(c.substring(idx,idx+800));}"
```

在 `setLocale` 函数体内末尾（return 之前或函数最后一个语句之后）插入：

```javascript
  if (typeof _refreshConsentLinks === 'function') _refreshConsentLinks();
```

如果不确定位置，把它加到 `applyI18n()` 函数末尾（执行 data-i18n 替换后）。

### - [ ] Step 6.5: showConsentUpgradeDialog 改用函数

Find `showConsentUpgradeDialog`（P1 加的）:

```javascript
async function showConsentUpgradeDialog() {
  const baseUrl = 'https://katelynmichelin976-wq.github.io/ReminiSea/';
  const privacyLink = `<a href="${baseUrl}privacy.html" target="_blank" rel="noopener" style="color:#0ea5e9;text-decoration:none">${esc(t('consent_privacy'))}</a>`;
  const termsLink   = `<a href="${baseUrl}terms.html" target="_blank" rel="noopener" style="color:#0ea5e9;text-decoration:none">${esc(t('consent_terms'))}</a>`;
```

Replace with:

```javascript
async function showConsentUpgradeDialog() {
  const privacyLink = `<a href="${getPrivacyUrl()}" target="_blank" rel="noopener" style="color:#0ea5e9;text-decoration:none">${esc(t('consent_privacy'))}</a>`;
  const termsLink   = `<a href="${getTermsUrl()}" target="_blank" rel="noopener" style="color:#0ea5e9;text-decoration:none">${esc(t('consent_terms'))}</a>`;
```

（去掉 `const baseUrl = ...` 行）

### - [ ] Step 6.6: 启动时初次刷新

Find 启动序列（P1 末尾，约 line 11949 setTimeout 启动 disabled）。在 `setTimeout(_tryInitCloud, 100);` 之前再加：

```javascript
  setTimeout(function() {
    if (typeof _refreshConsentLinks === 'function') _refreshConsentLinks();
  }, 0);
```

确保第一次渲染就根据初始 locale 设置 href。

---

## Task 7: Playwright 测试 + CLAUDE.md + commit

**Files:**
- Create: `C:\code\tests\_pw_consent_lang_url.js`
- Modify: `C:\code\CLAUDE.md`
- Single commit

### - [ ] Step 7.1: 创建测试文件

Create `C:\code\tests\_pw_consent_lang_url.js`:

```javascript
const { chromium } = require('playwright');
const { pass, section, wait, run, getCounts, getBaseUrl } = require('./_playwright_helper');

const URL = getBaseUrl() + '?v=' + Date.now();

async function getLoginPrivacyHref(page) {
  return run(page, () => {
    const a = document.getElementById('consent-login-privacy-a');
    return a ? a.href : null;
  });
}
async function getLoginTermsHref(page) {
  return run(page, () => {
    const a = document.getElementById('consent-login-terms-a');
    return a ? a.href : null;
  });
}

(async () => {
  const browser = await chromium.launch({ headless: !process.env.HEADED });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });

  try {
    await page.goto(URL, { waitUntil: 'networkidle', timeout: 30000 });
    await run(page, () => { showScreen('screen-account'); });
    await wait(page, 600);

    section('PHASE 1: zh-CN 默认 → privacy.html / terms.html');
    await run(page, () => setLocale('zh-CN'));
    await wait(page, 400);
    let p = await getLoginPrivacyHref(page);
    let t = await getLoginTermsHref(page);
    pass('zh-CN privacy 指向 privacy.html', p && p.endsWith('/privacy.html'));
    pass('zh-CN terms 指向 terms.html', t && t.endsWith('/terms.html'));

    section('PHASE 2: en → privacy_en.html');
    await run(page, () => setLocale('en'));
    await wait(page, 400);
    p = await getLoginPrivacyHref(page);
    t = await getLoginTermsHref(page);
    pass('en privacy 指向 privacy_en.html', p && p.endsWith('/privacy_en.html'));
    pass('en terms 指向 terms_en.html', t && t.endsWith('/terms_en.html'));

    section('PHASE 3: zh-Hant → _zh-Hant.html');
    await run(page, () => setLocale('zh-Hant'));
    await wait(page, 400);
    p = await getLoginPrivacyHref(page);
    t = await getLoginTermsHref(page);
    pass('zh-Hant privacy 指向 privacy_zh-Hant.html', p && p.endsWith('/privacy_zh-Hant.html'));
    pass('zh-Hant terms 指向 terms_zh-Hant.html', t && t.endsWith('/terms_zh-Hant.html'));

    section('PHASE 4: es fallback → _en.html');
    await run(page, () => setLocale('es'));
    await wait(page, 400);
    p = await getLoginPrivacyHref(page);
    t = await getLoginTermsHref(page);
    pass('es privacy fallback 到 privacy_en.html', p && p.endsWith('/privacy_en.html'));
    pass('es terms fallback 到 terms_en.html', t && t.endsWith('/terms_en.html'));

    section('PHASE 5: ja fallback → _en.html');
    await run(page, () => setLocale('ja'));
    await wait(page, 400);
    p = await getLoginPrivacyHref(page);
    t = await getLoginTermsHref(page);
    pass('ja privacy fallback 到 privacy_en.html', p && p.endsWith('/privacy_en.html'));
    pass('ja terms fallback 到 terms_en.html', t && t.endsWith('/terms_en.html'));

    section('PHASE 6: 还原 zh-CN');
    await run(page, () => setLocale('zh-CN'));
    await wait(page, 400);
    p = await getLoginPrivacyHref(page);
    pass('恢复 zh-CN privacy.html', p && p.endsWith('/privacy.html'));

    section('PHASE 7: showConsentUpgradeDialog 链接随 locale');
    await run(page, () => setLocale('en'));
    await wait(page, 400);
    await run(page, () => {
      localStorage.setItem('yh:v1:user:consentVersion', 'v0');
      _consentUpgradeInFlight = false;
      checkConsentUpgrade();
    });
    await wait(page, 1500);
    const dlgLinks = await run(page, () => {
      const links = Array.from(document.querySelectorAll('.yh-dialog a'));
      return links.map(a => a.href);
    });
    pass('dialog 含 privacy_en.html 链接', dlgLinks.some(h => h.endsWith('/privacy_en.html')));
    pass('dialog 含 terms_en.html 链接', dlgLinks.some(h => h.endsWith('/terms_en.html')));

    await run(page, () => document.querySelector('#yh-dlg-no')?.click());
    await wait(page, 300);

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

### - [ ] Step 7.2: 跑测试

```powershell
node tests/_pw_consent_lang_url.js
```

Expected: 13/14 断言全过。

### - [ ] Step 7.3: 回归

```powershell
node tests/run_all.js
node tests/_pw_ui_smoke.js
node tests/_pw_consent_checkbox.js
```

期望：
- run_all: 15 套件 / 691 断言全过（无单测新增）
- _pw_ui_smoke: 68/0
- _pw_consent_checkbox: 14/0（P1 不破）

### - [ ] Step 7.4: CLAUDE.md 测试登记

In `C:\code\CLAUDE.md`, find `_pw_consent_sync.js` 行，之后插入：

```
| `tests/_pw_consent_lang_url.js` | PP/ToS 链接 i18n 路由（zh-CN/en/zh-Hant/es-fallback/ja-fallback + dialog 内链接随 locale，~13 断言，无需登录） |
```

### - [ ] Step 7.5: 单 commit

```powershell
git add privacy.html terms.html privacy_en.html terms_en.html privacy_zh-Hant.html terms_zh-Hant.html index.html tests/_pw_consent_lang_url.js CLAUDE.md
git commit -m "feat: P2 #4 PP/ToS 英文 + 繁体 + locale 链接路由"
```

---

## Self-Review

**Spec 覆盖**（对照 `docs/superpowers/specs/2026-06-16-multilang-pp-tos-design.md`）：
- ✅ §2 文件结构 6 个 HTML → Task 1-5
- ✅ §3.1 `_localizedUrl` + `getPrivacyUrl` + `getTermsUrl` → Task 6.1
- ✅ §3.2 4 处链接绑定 + setLocale hook → Task 6.2/6.3/6.4
- ✅ §3.2 showConsentUpgradeDialog 改用函数 → Task 6.5
- ✅ §3.3 lang-nav 顶部 → Task 1（zh-CN）+ Task 2/3/4/5（其他语种 nav 内置）
- ✅ §4.2 繁体词汇本地化 → Task 4/5 文本
- ✅ §6.2 Playwright → Task 7

**Placeholder 扫描**：6 HTML 文件中 `[开发者姓名待填]` / `[Developer Name TBD]` / `[開發者姓名待填]` 部署前必须替换（spec §7 风险已列）。

**Type 一致性**：
- `_localizedUrl` / `getPrivacyUrl` / `getTermsUrl` / `_refreshConsentLinks` 函数名一致
- `consent-login-privacy-a` / `consent-login-terms-a` / `consent-register-privacy-a` / `consent-register-terms-a` 4 个 id 一致

**已知 risk**：
- Task 6.4 `setLocale` 函数定位：如果项目用 `applyI18n` 实际渲染 i18n 文本，hook 加到 `applyI18n` 末尾更稳；如果只有 `setLocale`，加到末尾。Step 6.4 提供 grep 命令确认。

---

## 不在 P2 #4 内的事

- ❌ es / ja 完整 PP/ToS 翻译（fallback 到英文足够）
- ❌ 律师 review 后正文修订（P2 #6）
- ❌ App Store 隐私标签 JSON（P2 #5）
- ❌ 占位符替换（部署前 ops）
