# 外部存储接入设计（MediaSource 适配器）

**日期**：2026-05-25  
**状态**：已批准，待实施  
**对应版本**：v5.2（计划）

---

## 一、背景与目标

当前所有卡片媒体（图片、音频）必须上传到 Supabase Storage（桶 `ReminiSea`）。存在四个痛点：

1. **隐私**：家庭照片/视频不宜上传第三方服务
2. **成本**：Supabase Storage 按存储量和带宽计费
3. **视频**：家庭录像体积大，Supabase Storage 不适合存储和流式播放
4. **可及性**：用户希望直接复用已存在网盘里的素材

**目标**：支持多媒体来源——保留 Supabase Storage 用于轻量学习卡片，新增直链 URL（Dropbox/OneDrive）和 WebDAV（坚果云/群晖/Nextcloud）作为私密大容量媒体的来源。

---

## 二、核心设计：URI 前缀路由

不新增字段，不改 Supabase schema。`_imgUrl` / `_audUrl` 字符串通过 URI 前缀区分来源：

| 前缀 / 格式 | 来源 | 示例 |
|------------|------|------|
| 无前缀（旧格式） | Supabase Storage（向下兼容） | `ReminiSea/cards/xxx.jpg` |
| `sb:` | Supabase Storage（新格式） | `sb:ReminiSea/cards/xxx.jpg` |
| `https://` | 直链 URL（Dropbox / OneDrive） | `https://dl.dropbox.com/s/.../a.mp4?raw=1` |
| `wd:` | WebDAV（浏览器直连） | `wd:家庭相册/生日2025.mp4` |
| emoji / 无 URL 特征 | 直接显示（现有逻辑） | `🍎` |

**图片与视频共用 `_imgUrl`**：同一张卡片不会同时存在图片和视频，按扩展名（`.mp4` / `.mov` / `.webm`）决定渲染为 `<img>` 还是 `<video>`。

---

## 三、resolveMedia 函数

```javascript
// 返回 { url: string, streaming: boolean }
// streaming=true 时直接用 url 作为 <img src> / <video src>，不下载到 IndexedDB
async function resolveMedia(src, mime) {
  if (!src) return null;

  // emoji / 纯文本
  if (isEmoji(src)) return { url: src, streaming: false };

  // 直链 URL（Dropbox raw=1、OneDrive embed 等）
  if (src.startsWith('https://') || src.startsWith('http://')) {
    return { url: src, streaming: true };
  }

  // WebDAV
  if (src.startsWith('wd:')) {
    const path = src.slice(3);
    if (!WEBDAV_URL || !WEBDAV_USER) return null;  // 未配置 → 占位
    const targetUrl = WEBDAV_URL.replace(/\/$/, '') + '/' + path;
    // 浏览器直连，Basic Auth 由 fetch 选项传入（见 fetchWebdav）
    return { url: targetUrl, streaming: true, webdav: true };
  }

  // Supabase Storage（无前缀旧格式 / sb: 新格式）
  const storagePath = src.startsWith('sb:') ? src.slice(3) : src;
  // 走现有 CDN + Supabase Storage 下载逻辑（不变）
  return resolveSupabaseMedia(storagePath, mime);
}
```

**WebDAV fetch 辅助**：

```javascript
async function fetchWebdav(url) {
  const auth = 'Basic ' + btoa(WEBDAV_USER + ':' + WEBDAV_PASS);
  const resp = await fetch(url, { headers: { Authorization: auth } });
  if (!resp.ok) throw new Error('WebDAV ' + resp.status);
  return resp;
}
```

**渲染层**：调用 `resolveMedia` 后：
- `streaming: true, webdav: false` → 直接 `element.src = url`（直链，浏览器原生处理 Range）
- `streaming: true, webdav: true` → `fetchWebdav` 下载完整 blob → `URL.createObjectURL` → `element.src`（WebDAV 需要 Auth 头，无法让 `<video>` 直接带头，**MVP 阶段不支持视频 seek**，加载完毕后才可播放）
- `streaming: false` → 现有 blob/ObjectURL 逻辑（Supabase 媒体，缓存进 IndexedDB）

> **WebDAV 视频 seek 限制**：浏览器 `<video>` 标签无法携带自定义请求头，WebDAV 需要 Authorization，因此只能整体下载后播放，无法拖进度条流式 seek。后续可通过 Service Worker 拦截请求、注入 Auth 头来解决，MVP 不做。直链 URL（Dropbox/OneDrive）无此限制，seek 正常。

---

## 四、WebDAV 配置

MVP 阶段用常量，不做设置 UI：

```javascript
const WEBDAV_URL  = '';  // 如 'https://dav.jianguoyun.com/dav/'
const WEBDAV_USER = '';  // WebDAV 用户名
const WEBDAV_PASS = '';  // WebDAV 密码或 App Token
```

三个常量留空 = 未配置，`wd:` 媒体显示灰色占位图。后续迭代在设置屏增加 UI，改为从 localStorage 读取。

---

## 五、直链 URL 推荐服务

| 服务 | 直链格式 | 视频流媒体 |
|------|---------|-----------|
| **Dropbox** | 分享链接将 `?dl=0` → `?raw=1` | ✅ 支持 |
| **OneDrive** | embed 链接（`1drv.ms` → embed URL） | ✅ 支持 |
| **群晖 QuickConnect** | 直接公开链接 | ✅ 支持 |
| Google Drive | ❌ 不支持直链流媒体 | ❌ 不适用 |

---

## 六、wd: 路径进入卡片的途径（MVP）

1. **手动编辑 `.yhspack`**：在 JSON 里直接写 `"_imgUrl": "wd:家庭相册/生日2025.mp4"`，导入 App 后生效
2. **睡前故事硬编码**：故事条目的媒体字段直接写 `wd:` 路径

后续制卡 UI 迭代时新增"从 WebDAV 选择"入口，`resolveMedia` 层无需改动。

---

## 七、向下兼容与降级

| 场景 | 行为 |
|------|------|
| 存量无前缀路径 | `resolveMedia` fallthrough 到现有 Supabase 逻辑，零影响 |
| WebDAV 未配置 | `wd:` 媒体显示灰色占位图，不报错 |
| WebDAV 不可达 | fetch 失败 → 占位图 + `console.warn` |
| 直链 403/404 | `<img>`/`<video>` 原生 error 事件 → 占位图 |
| 混合牌组 | 同一牌组可混用三种来源，按前缀路由，互不干扰 |

**Supabase schema 无需变更**，`cards_pool.image_url` 继续存字符串。

---

## 八、不在范围内

- WebDAV 设置 UI（后续迭代）
- Google Drive OAuth 接入（不适合直链流媒体，不做）
- 媒体本地缓存管理 UI（后续迭代）
- 上传媒体到 WebDAV（只做读取）
