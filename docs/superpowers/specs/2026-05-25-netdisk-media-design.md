# 外部存储接入设计（MediaSource 适配器）

**日期**：2026-05-25（2026-05-26 更新：双桶设计、视频直链为主）
**状态**：已批准，待实施
**对应版本**：v5.2（计划）

---

## 一、背景与目标

当前所有卡片媒体（图片、音频）上传到 Supabase Storage 公共桶 `ReminiSea`，无用户隔离，任何人持 URL 即可访问。存在四个痛点：

1. **隐私**：家人录音、家庭视频不应无隔离地存公共桶
2. **成本**：视频文件大，Supabase Storage 按带宽计费不划算
3. **速度**：Supabase 服务器在境外，国内用户视频播放体验差
4. **可及性**：用户希望复用已有 OSS/CDN 上的媒体素材

**目标**：
- 按内容性质分桶存储，教学媒体继续走公共桶，个人内容走私有桶
- 视频以**外部直链**为主（OSS/CDN），不进 Supabase
- 音频（TTS/词卡录音）继续走公共桶 Supabase，文件小无需变动
- 家人录音、家庭视频走私有桶，签名 URL 访问，用户间严格隔离

---

## 二、内容分类与双桶策略

| 内容类型 | 例子 | 隐私需求 | 存储方案 |
|---------|------|---------|---------|
| 词卡图片 | 🍎苹果图、emoji | 无 | 公共桶 `ReminiSea`（现状不变） |
| 词卡音频 | TTS 合成发音 | 无 | 公共桶 `ReminiSea`（现状不变） |
| 家人录音 | 爷爷/奶奶的声音 | **有** | 私有桶 `yihai-private`，签名 URL |
| 家庭视频 | 睡前故事、生日录像 | **有** | **外部直链**（OSS/CDN），或私有桶 |

**私有桶路径结构**（用户隔离）：

```
yihai-private/
└── {user_id}/
    ├── recordings/     ← 家人录音
    └── videos/         ← 家庭视频（备选，主路径是外部直链）
```

用户只能访问自己 `{user_id}/` 下的文件，路径由 Edge Function 校验，客户端无法越权。

---

## 三、URI 前缀路由

不新增字段，不改 Supabase schema。`_imgUrl` / `_audUrl` 字符串通过 URI 前缀区分来源：

| 前缀 / 格式 | 来源 | 示例 |
|------------|------|------|
| 无前缀（旧格式） | Supabase 公共桶（向下兼容） | `ReminiSea/cards/xxx.jpg` |
| `sb:` | Supabase 公共桶（新格式） | `sb:ReminiSea/cards/xxx.jpg` |
| `priv:` | Supabase 私有桶（签名 URL） | `priv:recordings/grandpa.mp3` |
| `https://` | 外部直链（OSS / CDN） | `https://xxx.oss-cn.aliyuncs.com/video.mp4` |
| `wd:` | WebDAV（浏览器直连） | `wd:家庭相册/生日2025.mp4` |
| emoji / 无 URL 特征 | 直接显示 | `🍎` |

**图片与视频共用 `_imgUrl`**：按扩展名（`.mp4` / `.mov` / `.webm`）决定渲染为 `<img>` 还是 `<video>`。

---

## 四、私有桶访问流程（priv: 前缀）

```
App 需要播放 priv:recordings/grandpa.mp3
    ↓
携带 Supabase JWT，调用 Edge Function
POST /functions/v1/sign-private-url
{ "path": "recordings/grandpa.mp3" }
    ↓
Edge Function：
  1. 验证 JWT → 提取 user_id
  2. 拼接完整路径：{user_id}/recordings/grandpa.mp3
  3. 检查路径无 ".." 穿越
  4. 生成 Supabase Storage 签名 URL（1小时有效）
  5. 返回 { signedUrl }
    ↓
<audio src="{signedUrl}"> 或 <video src="{signedUrl}"> 直接播放
```

**签名 URL 缓存**：同一路径的签名 URL 在内存中缓存 50 分钟，避免重复请求 Edge Function。

---

## 五、resolveMedia 函数

```javascript
// 返回 { url, streaming }
// streaming=true 时直接用 url 作为 <img src> / <video src>，不下载到 IndexedDB
const _signedUrlCache = new Map();  // path → { url, exp }

async function resolveMedia(src, mime) {
  if (!src) return null;
  if (isEmoji(src)) return { url: src, streaming: false };

  // 外部直链
  if (src.startsWith('https://') || src.startsWith('http://')) {
    return { url: src, streaming: true };
  }

  // 私有桶（签名 URL）
  if (src.startsWith('priv:')) {
    const path = src.slice(5);
    const cached = _signedUrlCache.get(path);
    if (cached && cached.exp > Date.now()) return { url: cached.url, streaming: true };
    const { data, error } = await _sb.functions.invoke('sign-private-url', { body: { path } });
    if (error || !data.signedUrl) return null;
    _signedUrlCache.set(path, { url: data.signedUrl, exp: Date.now() + 50 * 60 * 1000 });
    return { url: data.signedUrl, streaming: true };
  }

  // WebDAV
  if (src.startsWith('wd:')) {
    if (!WEBDAV_URL || !WEBDAV_USER) return null;
    const path = src.slice(3);
    const base = WEBDAV_URL.replace(/\/$/, '');
    const encoded = path.split('/').map(encodeURIComponent).join('/');
    return { url: base + '/' + encoded, streaming: true, webdav: true };
  }

  // Supabase 公共桶（无前缀旧格式 / sb: 新格式）
  const storagePath = src.startsWith('sb:') ? src.slice(3) : src;
  return resolveSupabaseMedia(storagePath, mime);  // 现有 CDN + 下载逻辑，不变
}
```

**WebDAV fetch 辅助**（同原设计，MVP 整体下载，不支持 seek）：

```javascript
async function fetchWebdav(url) {
  const auth = 'Basic ' + btoa(WEBDAV_USER + ':' + WEBDAV_PASS);
  const resp = await fetch(url, { headers: { Authorization: auth } });
  if (!resp.ok) throw new Error('WebDAV HTTP ' + resp.status);
  return resp;
}
```

**渲染层**：
- `streaming: true, webdav: false` → 直接 `element.src = url`（直链/签名 URL，浏览器原生处理 Range）
- `streaming: true, webdav: true` → `fetchWebdav` 下载完整 blob → `URL.createObjectURL`（MVP 不支持 seek）
- `streaming: false` → 现有 blob/ObjectURL 逻辑（公共桶媒体，缓存进 IndexedDB）

---

## 六、Edge Function：sign-private-url

新建 `supabase/functions/sign-private-url/index.ts`：

```typescript
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const BUCKET = 'yihai-private'
const EXPIRY = 3600  // 1 小时

Deno.serve(async (req) => {
  const auth = req.headers.get('Authorization') ?? ''
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: auth } }
  })

  // 验证登录
  const { data: { user }, error: authErr } = await sb.auth.getUser()
  if (authErr || !user) return new Response('Unauthorized', { status: 401 })

  const { path } = await req.json()

  // 防路径穿越
  if (!path || path.includes('..') || path.startsWith('/')) {
    return new Response('Invalid path', { status: 400 })
  }

  const fullPath = `${user.id}/${path}`
  const { data, error } = await sb.storage.from(BUCKET).createSignedUrl(fullPath, EXPIRY)
  if (error) return new Response(error.message, { status: 500 })

  return Response.json({ signedUrl: data.signedUrl })
})
```

---

## 七、视频来源策略

**主路径：外部直链（`https://`）**

| 场景 | 推荐服务 | 直链格式 |
|------|---------|---------|
| 国内家庭视频 | 阿里云 OSS / 七牛云 | `https://xxx.oss-cn-hangzhou.aliyuncs.com/video.mp4` |
| 国际用户 | Cloudflare R2 / Backblaze B2 | `https://xxx.r2.dev/video.mp4` |
| 个人网盘（坚果云等） | WebDAV `wd:` | `wd:家庭相册/生日.mp4` |

**备选路径：私有桶（`priv:`）**

适合已上传到 Supabase 的视频，或不想维护外部存储的用户。速度较外部 OSS 慢，适合小视频（< 50MB）。

**不推荐：公共桶直接存视频**——无隐私隔离，带宽成本高。

---

## 八、WebDAV 配置（MVP 用常量）

```javascript
const WEBDAV_URL  = '';  // 如 'https://dav.jianguoyun.com/dav/'
const WEBDAV_USER = '';
const WEBDAV_PASS = '';
```

留空 = 未配置，`wd:` 媒体显示占位图。后续迭代改为设置屏 UI + localStorage。

---

## 九、向下兼容与降级

| 场景 | 行为 |
|------|------|
| 存量无前缀路径 | fallthrough 到现有 Supabase 公共桶逻辑，零影响 |
| `priv:` 但未登录 | Edge Function 返回 401 → 占位图 |
| `priv:` Edge Function 失败 | 占位图 + `console.warn` |
| WebDAV 未配置 | 占位图，不报错 |
| 直链 403/404 | `<img>`/`<video>` 原生 error → 占位图 |
| 混合牌组 | 同一牌组可混用所有来源，按前缀路由，互不干扰 |

**Supabase schema 无需变更**，`cards_pool.image_url` 继续存字符串。

---

## 十、不在范围内

- WebDAV 设置 UI（后续迭代）
- Google Drive OAuth 接入
- 媒体本地缓存管理 UI
- 上传媒体到 WebDAV（只做读取）
- 私有桶上传 UI（上传由外部工具完成，App 只读取）
- 国内/国际双节点自动路由（后续按用量决定是否做）
