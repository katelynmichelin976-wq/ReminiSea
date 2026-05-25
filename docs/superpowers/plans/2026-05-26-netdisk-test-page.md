# MediaSource 适配器测试页实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 创建独立测试页 `tests/_netdisk_test.html`，在浏览器中直观验证三种媒体来源（直链 URL、WebDAV、emoji）的图片/视频渲染效果，不依赖主 App。

**Architecture:** 单文件 HTML，内联 CSS + JS。顶部常量区填入 WebDAV 配置和测试 URL；`resolveMedia()` 按 URI 前缀路由；`renderMedia()` 把结果渲染成 `<img>`/`<video>` 并显示状态标签。

**Tech Stack:** 纯 HTML/CSS/JS，无依赖，浏览器直接打开（file:// 或 HTTP server）。

---

### Task 1：创建测试页骨架 + 核心函数

**Files:**
- Create: `tests/_netdisk_test.html`

- [ ] **Step 1：创建文件，写入完整内容**

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>MediaSource 适配器测试</title>
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: system-ui, sans-serif; padding: 20px; background: #f5f5f5; color: #222; }
h1 { margin-bottom: 8px; font-size: 18px; }
.desc { color: #666; font-size: 13px; margin-bottom: 20px; }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 16px; }
.card { background: #fff; border-radius: 12px; padding: 14px; box-shadow: 0 1px 4px rgba(0,0,0,.1); }
.card-label { font-size: 12px; font-weight: 600; color: #888; margin-bottom: 6px; text-transform: uppercase; letter-spacing: .5px; }
.card-src { font-size: 11px; color: #aaa; margin-bottom: 10px; word-break: break-all; }
.media-box { min-height: 120px; display: flex; align-items: center; justify-content: center; background: #f9f9f9; border-radius: 8px; overflow: hidden; position: relative; }
.media-box img, .media-box video { max-width: 100%; max-height: 180px; object-fit: contain; display: block; }
.media-box .emoji { font-size: 64px; }
.status { font-size: 12px; padding: 6px 10px; border-radius: 6px; margin-bottom: 6px; }
.status.loading { background: #e8f4ff; color: #0066cc; }
.status.ok     { background: #e6f9ee; color: #1a8a3e; }
.status.warn   { background: #fff8e1; color: #b36b00; }
.status.error  { background: #ffeaea; color: #c00; }
.status.info   { background: #f0f0f0; color: #555; }
.badge { display: inline-block; font-size: 10px; padding: 2px 7px; border-radius: 99px; margin-bottom: 8px; font-weight: 600; }
.badge.url    { background: #dbeafe; color: #1d4ed8; }
.badge.webdav { background: #f3e8ff; color: #7c3aed; }
.badge.emoji  { background: #fef9c3; color: #854d0e; }
.badge.legacy { background: #f0fdf4; color: #166534; }
</style>
</head>
<body>

<h1>MediaSource 适配器测试</h1>
<p class="desc">测试三种媒体来源的渲染效果。WebDAV 需填写下方常量后刷新页面。</p>

<div id="root" class="grid"></div>

<script>
// ── 配置区（填入后刷新）──────────────────────────────────────────
const WEBDAV_URL  = '';   // 如 'https://dav.jianguoyun.com/dav/'
const WEBDAV_USER = '';   // WebDAV 用户名
const WEBDAV_PASS = '';   // WebDAV 密码或 App Token

// ── 测试用例 ─────────────────────────────────────────────────────
// 替换为你自己的真实链接来测试
const TEST_CASES = [
  {
    label: 'emoji',
    src: '🍎',
    note: 'emoji 直接显示'
  },
  {
    label: '直链图片（HTTPS）',
    src: 'https://picsum.photos/seed/yihai/300/200',
    note: 'Lorem Picsum 随机图，无需登录'
  },
  {
    label: '直链视频（HTTPS）',
    src: 'https://www.w3schools.com/html/mov_bbb.mp4',
    note: 'W3Schools 测试视频，公开直链'
  },
  {
    label: 'Dropbox 图片（raw=1）',
    src: '',   // 粘贴 Dropbox 分享链接，将 ?dl=0 改为 ?raw=1
    note: '留空则跳过'
  },
  {
    label: 'Dropbox 视频（raw=1）',
    src: '',   // 粘贴 Dropbox mp4 分享链接，将 ?dl=0 改为 ?raw=1
    note: '留空则跳过'
  },
  {
    label: 'WebDAV 图片',
    src: 'wd:test.jpg',   // 替换为 WebDAV 服务器上真实存在的图片路径
    note: '需配置上方 WEBDAV_* 常量'
  },
  {
    label: 'WebDAV 视频',
    src: 'wd:test.mp4',   // 替换为 WebDAV 服务器上真实存在的视频路径
    note: '整体下载后播放，MVP 不支持 seek'
  },
  {
    label: 'Supabase 旧路径（降级）',
    src: 'ReminiSea/cards/sample.jpg',
    note: '测试页不走 Supabase SDK，仅展示路径识别'
  },
  {
    label: '空值',
    src: '',
    note: '应显示占位'
  },
];

// ── 工具函数 ──────────────────────────────────────────────────────
function isEmoji(str) {
  if (!str) return false;
  if (str.includes('://') || str.includes('.') || str.includes('/')) return false;
  return /^[\p{Emoji}\p{Extended_Pictographic}]+$/u.test(str.trim());
}

function isVideo(src) {
  return /\.(mp4|mov|webm|avi|mkv)(\?|$)/i.test(src);
}

// ── resolveMedia ──────────────────────────────────────────────────
async function resolveMedia(src) {
  if (!src) return { type: 'empty', url: null };
  if (isEmoji(src)) return { type: 'emoji', url: src };
  if (src.startsWith('https://') || src.startsWith('http://')) {
    return { type: 'url', url: src };
  }
  if (src.startsWith('wd:')) {
    if (!WEBDAV_URL || !WEBDAV_USER) return { type: 'webdav_unconfigured', url: null };
    const path = src.slice(3);
    const base = WEBDAV_URL.replace(/\/$/, '');
    // 路径含中文/空格需编码，但保留 /
    const encoded = path.split('/').map(encodeURIComponent).join('/');
    return { type: 'webdav', url: base + '/' + encoded };
  }
  // 无前缀 = 旧 Supabase 路径
  return { type: 'supabase_legacy', url: src };
}

// ── fetchWebdav ───────────────────────────────────────────────────
async function fetchWebdav(url) {
  const auth = 'Basic ' + btoa(WEBDAV_USER + ':' + WEBDAV_PASS);
  const resp = await fetch(url, { headers: { Authorization: auth } });
  if (!resp.ok) throw new Error('WebDAV HTTP ' + resp.status);
  return resp;
}

// ── renderMedia ───────────────────────────────────────────────────
async function renderMedia(src, box) {
  box.innerHTML = '<div class="status loading">⏳ 加载中…</div>';

  try {
    const resolved = await resolveMedia(src);

    if (resolved.type === 'empty') {
      box.innerHTML = '<div class="status warn">— 空值（占位）</div>';
      return;
    }

    if (resolved.type === 'emoji') {
      box.innerHTML = '<div class="emoji">' + resolved.url + '</div>';
      return;
    }

    if (resolved.type === 'webdav_unconfigured') {
      box.innerHTML = '<div class="status warn">⚠️ WebDAV 未配置<br><small>填写顶部常量后刷新</small></div>';
      return;
    }

    if (resolved.type === 'supabase_legacy') {
      box.innerHTML = '<div class="status info">📦 识别为 Supabase 旧路径<br><small>' + resolved.url + '</small></div>';
      return;
    }

    // url 或 webdav
    let finalUrl = resolved.url;
    let objectUrl = null;

    if (resolved.type === 'webdav') {
      const resp = await fetchWebdav(resolved.url);
      const blob = await resp.blob();
      objectUrl = URL.createObjectURL(blob);
      finalUrl = objectUrl;
    }

    const isVid = isVideo(src || finalUrl);
    const el = isVid ? document.createElement('video') : document.createElement('img');
    if (isVid) { el.controls = true; }
    el.src = finalUrl;

    box.innerHTML = '';

    const onSuccess = () => {
      const tag = document.createElement('div');
      tag.className = 'status ok';
      tag.textContent = '✅ ' + resolved.type + (isVid ? ' · 视频' : ' · 图片');
      box.prepend(tag);
    };

    el.addEventListener(isVid ? 'loadedmetadata' : 'load', onSuccess);
    el.addEventListener('error', () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      box.innerHTML = '<div class="status error">❌ 加载失败<br><small>' + finalUrl.slice(0, 80) + '</small></div>';
    });

    box.appendChild(el);

  } catch(e) {
    box.innerHTML = '<div class="status error">❌ ' + e.message + '</div>';
  }
}

// ── 渲染卡片 ──────────────────────────────────────────────────────
function badgeClass(src) {
  if (!src) return '';
  if (isEmoji(src)) return 'emoji';
  if (src.startsWith('https://') || src.startsWith('http://')) return 'url';
  if (src.startsWith('wd:')) return 'webdav';
  return 'legacy';
}

function badgeLabel(src) {
  if (!src) return '空';
  if (isEmoji(src)) return 'emoji';
  if (src.startsWith('https://') || src.startsWith('http://')) return 'HTTPS 直链';
  if (src.startsWith('wd:')) return 'WebDAV';
  return 'Supabase 旧格式';
}

const root = document.getElementById('root');
TEST_CASES.forEach(tc => {
  if (tc.src === '' && tc.label.includes('Dropbox')) return;  // 跳过未填的 Dropbox

  const card = document.createElement('div');
  card.className = 'card';

  const bc = badgeClass(tc.src);
  card.innerHTML =
    '<div class="card-label">' + tc.label + '</div>' +
    (bc ? '<span class="badge ' + bc + '">' + badgeLabel(tc.src) + '</span>' : '') +
    '<div class="card-src">' + (tc.src || '（空）') + '</div>' +
    '<div class="media-box" id="box-' + Math.random().toString(36).slice(2) + '"></div>' +
    '<div style="font-size:11px;color:#aaa;margin-top:6px">' + tc.note + '</div>';

  root.appendChild(card);

  const box = card.querySelector('.media-box');
  renderMedia(tc.src, box);
});
</script>
</body>
</html>
```

- [ ] **Step 2：在浏览器打开验证**

用 HTTP server 打开（避免 file:// CORS 限制）：

```powershell
python -m http.server 8080 --directory C:\code
```

然后在浏览器访问：`http://localhost:8080/tests/_netdisk_test.html`

预期看到：
- 🍎 emoji 卡片直接显示
- Lorem Picsum 随机图片正常加载（绿色 ✅）
- W3Schools 测试视频可播放（绿色 ✅）
- Dropbox/WebDAV 若未填则显示对应提示
- Supabase 旧路径显示"识别为 Supabase 旧路径"信息条

- [ ] **Step 3：填入真实 WebDAV 或 Dropbox URL 测试（可选）**

在文件顶部常量区填入：
```javascript
const WEBDAV_URL  = 'https://dav.jianguoyun.com/dav/';
const WEBDAV_USER = 'your-email@example.com';
const WEBDAV_PASS = 'your-app-token';
```

或把 Dropbox 分享链接的 `?dl=0` 改成 `?raw=1` 填入对应 `src` 字段。刷新页面。

- [ ] **Step 4：提交**

```powershell
git add tests/_netdisk_test.html
git commit -m "test: MediaSource 适配器测试页（直链/WebDAV/emoji 渲染验证）"
```

---

## 自查

**Spec coverage：**
- ✅ URI 前缀路由（无前缀/https://wd:）
- ✅ emoji 快捷路径
- ✅ WebDAV 浏览器直连 + Basic Auth
- ✅ WebDAV 未配置降级占位
- ✅ 直链不缓存 IndexedDB
- ✅ WebDAV 视频整体下载（MVP 不支持 seek，卡片有说明）
- ✅ Supabase 旧路径识别（测试页不走 SDK，仅识别并提示）

**Placeholder 扫描：** 无 TBD/TODO，所有代码完整。

**类型一致性：** `resolveMedia` 返回 `{type, url}`，`renderMedia` 消费同一结构，`isVideo`/`isEmoji` 签名统一。
