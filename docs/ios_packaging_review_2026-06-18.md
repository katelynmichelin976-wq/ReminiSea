# iOS 打包前评审记录

日期：2026-06-18

范围：评审记录。评审对象为当前 PWA 主应用、发布配置、测试覆盖、Supabase/隐私相关文件，以及当前工作区中已出现但尚未验收的 iOS 打包相关文件。

## 结论

当前代码已经具备较完整的移动 PWA 基础，但还不具备直接打 iOS App Store 包的工程条件。主要缺口不是业务功能，而是 iOS 包装工程、图标/离线资源、App Store 合规资料、真实 iOS 设备验证和媒体存储隔离策略。

如果目标是 TestFlight / App Store，建议先完成 P0，再进入 UI 专属重设计和 Capacitor/WKWebView 包装。

## 本轮执行边界

本轮只记录评审结论，不实施代码、配置、依赖、图标、Capacitor 工程或 Supabase 策略变更。

以下事项需要产品/发布决策后再进入实施：

- 打包路线：继续强化 PWA，或新增 Capacitor/WKWebView iOS 工程。
- 发布主体：开发者姓名、公司/个人主体、联系邮箱、隐私政策和用户协议中的公开信息。
- 私有媒体策略：个人图片/音频是否必须迁入 `yihai-private/{user_id}/...`。
- 诊断入口策略：生产 iOS 包保留受控支持模式，还是完全禁用隐藏诊断脚本。
- iOS UI 重设计范围：只做 HIG 合规适配，还是重做 onboarding、底部导航、训练页和家庭成员操作流。

## 5 项推进状态

| 序号 | 项目 | 当前文档结论 | 工程状态 | 发布判断 |
| --- | --- | --- | --- | --- |
| 1 | 决策打包路线 | 建议走 Capacitor/WKWebView 原生包，同时保留 GitHub Pages PWA | 当前工作区已有未跟踪 `capacitor.config.json`、`ios/` 和 `ios:*` npm scripts | 路线可定为 Capacitor，但需正式代码评审后才能算工程接收 |
| 2 | 补齐 P0 | iOS 工程骨架和图标已有未跟踪草案；法务主体仍缺真实信息 | `manifest.json`、根目录图标、`ios/App/App/Info.plist` 显示已有本地草案 | P0 未完全解除，法务主体和 Apple 签名信息必须人工提供 |
| 3 | 处理 P1 | 本地依赖、媒体隔离、诊断入口、真机矩阵均已有明确处理要求 | 运行时代码仍引用 Google Fonts、jsDelivr Supabase SDK、`ReminiSea` bucket 和线上诊断脚本 | P1 不能仅凭本地文件完成，需后续实现和真机验证 |
| 4 | iOS 专属 UI 方案 | 已新增设计规格：`docs/superpowers/specs/2026-06-18-ios-ui-redesign-design.md` | 本轮不改 UI 代码 | 设计方向可进入评审，未进入实现 |
| 5 | 发布验证 | 当前只保留既有 Chromium/Playwright 基线；iOS 真机与 Xcode 验证未完成 | 当前环境可做静态/Node/Playwright 验证，不能替代 Apple 设备和 TestFlight | 发布验证未完成，需按本文验证矩阵执行 |

## 当前工作区 iOS 草案证据

以下文件/配置已在当前工作区出现，但多数仍处于未跟踪或未验收状态，不应直接视为可发布成果：

- `package.json` 已包含 `ios:icons`、`ios:prepare`、`ios:add`、`ios:sync`、`ios:open` 脚本。
- `package.json` 已出现 `@capacitor/core`、`@capacitor/ios`、`@capacitor/cli` 依赖。
- `capacitor.config.json` 使用 `appId: app.memoryglimmers.yihai`、`appName: 忆海拾光`、`webDir: build/ios-web`。
- `ios/App/App/Info.plist` 已包含麦克风、照片权限说明，并限制 portrait orientation。
- 根目录已有 `icon-192.png`、`icon-512.png`、`apple-touch-icon.png`。
- `build/ios-web` 已存在一次准备出的 Web bundle。

评审意见：这些草案方向基本符合 Capacitor 路线，但仍需要单独代码评审、iOS 设备验证、Apple Developer 签名配置和 App Store 合规资料补齐。

## 已验证基线

初始评审运行：

```bash
npm test
npm run test:ui-smoke
node tests/_pw_orientation_lock.js
```

结果：

- 单元测试：18 套件，717 断言，0 失败
- UI 冒烟：68 通过，0 失败
- 横竖屏 overlay：13 通过，0 失败

注意：这些是 Chromium / Playwright 基线，不等价于真机 iOS Safari、PWA standalone 或 WKWebView 验证。

本轮追加运行：

```bash
npm test
python3 -m http.server 8080 --directory .
npm run test:ui-smoke
npm run test:srs-e2e
npm run test:easy
```

结果：

- 单元测试：18 套件，717 断言，0 失败
- UI 冒烟：68 通过，0 失败
- SRS E2E：21 通过，0 失败
- Easy 模式：28 通过，0 失败

注意：第一次未启动本地 HTTP 服务时，`test:easy` 连接 `localhost:8080` 被拒绝，`test:ui-smoke` 和 `test:srs-e2e` 也只输出 0 通过/0 失败，不能作为有效覆盖；随后启动本地服务器后重跑，以上结果才是有效基线。

## 正向信号

- `index.html:5-17` 已包含 iOS PWA 基础 meta：`viewport-fit=cover`、Apple web app capable、status bar、manifest、apple touch icon。
- `index.html:59-62` 集中定义 safe area 变量，底部导航和关键底部操作多处使用 `var(--safe-bottom)`。
- `index.html:471`、`index.html:12860` 已有自定义确认弹窗，避开 iOS PWA 的 `confirm()` 问题。
- `index.html:9280-9305` 已有 `warmupSpeech()`，覆盖 iOS TTS 和 AudioContext 解锁。
- `tests/_pw_orientation_lock.js` 覆盖横竖屏 overlay 和状态保持。
- `docs/上架就绪清单.md` 已经识别出隐私、Service Worker、Apple Developer、onboarding 等上线缺口。

## P0 阻断项

### 1. 尚无 iOS 原生打包工程

初始证据：初始只读审计时，仓库未发现 `capacitor.config.*`、`ios/`、`Info.plist`、`Podfile`、`.xcodeproj` 或 `.xcworkspace`。

当前状态：工作区已出现未跟踪的 `capacitor.config.json`、`ios/`、`ios/App/App.xcodeproj`、`ios/App/App/Info.plist`，但这些仍是未验收草案。

影响：如果这些草案不进入正式评审、签名配置和 Xcode 验证，项目仍不能被视为具备稳定 IPA、TestFlight 或 App Store 交付能力。

建议：明确路线后新增 Capacitor 工程，至少包含 iOS app id、display name、bundle id、WKWebView 配置、App Transport Security、asset catalog、launch screen 和隐私描述。

### 2. App 图标资源缺失

初始证据：

- `manifest.json` 中 `"icons": []`
- `index.html:17` 引用 `./icon-192.png`
- 仓库根目录未找到 `icon-192.png` / `icon-512.png`

当前状态：工作区已出现 `icon-192.png`、`icon-512.png`、`apple-touch-icon.png`，`manifest.json` 也已有图标条目，但仍需确认这些图标是否为正式视觉资产，而不是临时生成稿。

影响：如果图标未正式验收，PWA 添加到主屏、iOS 包装、App Store asset catalog 仍缺可发布资产。

建议：生成完整图标集：PWA `192/512`、Apple touch icon、iOS AppIcon.appiconset 所需尺寸。更新 `manifest.json` 和 iOS asset catalog。

### 3. 法务文档仍有开发者占位符

证据：

- `privacy.html:41`
- `privacy_en.html:41`
- `privacy_zh-Hant.html:41`
- `terms.html:44`
- `terms_en.html:44`
- `terms_zh-Hant.html:44`
- `docs/上架就绪清单.md:12`

影响：App Store 审核和公开发布不应包含 `[开发者姓名待填]` / `[Developer Name TBD]`。

建议：发布前替换真实开发者/主体信息，并复核隐私政策、用户协议、联系邮箱、适用地区。

## P1 发布前应处理

### 4. 当前无可用 Service Worker / 离线缓存

证据：

- 未发现 service worker 注册逻辑；`index.html:10380-10400` 只有清理已有 Service Worker 和 cache 的强制刷新逻辑。
- `docs/上架就绪清单.md:27-28` 已把 Service Worker 和自定义域名列为 P1。

影响：作为 PWA 发布时，离线能力和安装体验不足。作为 Capacitor 包时，可通过本地 bundle 缓解，但仍需要明确资源加载策略。

建议：如果继续 PWA 路线，恢复 SW 并绑定自定义域名；如果走 Capacitor，明确哪些资源必须随包内置，哪些允许在线加载。

### 5. 运行时依赖外部 CDN

证据：

- `index.html:14-16` 加载 Google Fonts
- `index.html:12907` 从 jsDelivr 加载 Supabase SDK
- `index.html:11953-12048` UI 会先渲染，但云同步初始化依赖 Supabase SDK 加载完成

影响：弱网、墙、CDN 故障、App Store 审核网络环境下，登录/同步可能不可用。若做原生包，核心 SDK 不宜依赖第三方 CDN。

建议：iOS 包内置 Supabase SDK 和关键字体，或明确使用 Capacitor 构建链打包依赖。

### 6. 用户媒体存储隔离需要复核

证据：

- `sql/supabase_storage_policies.sql:1-18` 对 `ReminiSea` bucket 给 authenticated 用户完整 select/insert/update/delete 权限。
- `sql/supabase_migration_009_private_storage.sql:20-34` 已新增 `yihai-private` 前缀隔离策略。
- 运行时代码仍多处使用 `_sb.storage.from('ReminiSea')`，如 `index.html:3406`、`index.html:11514`。

影响：如果个人牌组图片/音频属于用户私有内容，`ReminiSea` bucket 的宽权限策略风险较高。

建议：确认所有个人媒体是否迁到 `yihai-private/{user_id}/...`；若仍使用 `ReminiSea`，至少按 user 前缀收紧 RLS。

### 7. iOS 真机专属路径未被自动化覆盖

证据：`docs/superpowers/specs/2026-06-16-test-coverage-baseline-design.md` 已记录 iOS PWA-only 路径未由 Chromium 覆盖。

影响：以下风险不能由当前 Playwright 结果证明：

- standalone 模式 safe area / status bar / Home Indicator
- iOS Safari TTS voice loading、AudioContext 解锁
- WKWebView IndexedDB 持久化和清理策略
- 软键盘遮挡输入框
- 文件导入、录音、媒体播放权限

建议：建立真机手工回归表，至少覆盖 iPhone SE / 标准 iPhone / Pro Max，iOS Safari、主屏 PWA、WKWebView 三种运行环境。

### 8. 可触控目标存在偏小风险

证据：

- `index.html:826` `.sheet-close-btn` 为 `28x28`
- `index.html:1739-1744` 首页刷新按钮图标为 `14x14`，按钮本身只设置小 padding
- 多处图标按钮接近视觉尺寸而不是 44pt 触控热区

影响：iOS HIG 推荐至少 44pt 触控目标；小按钮会影响老人/家属使用，也可能降低审核体验观感。

建议：iOS 专属 UI 重设计时统一定义 `--tap-min: 44px`，对图标按钮用更大的 hit area，而不是只放大图标。

### 9. 隐藏诊断入口需要发布策略

证据：

- `index.html:1738` 版本号点击 5 次打开诊断面板
- `index.html:3361-3371` 从线上 `/tests/yh_diag.js` 动态加载诊断脚本
- `docs/上架就绪清单.md:43` 已要求发布前移除调试遗留

影响：诊断能力对排障有价值，但 `tests/` 路径和隐藏入口需明确是否允许进入生产包。App Store 审核不喜欢明显测试/调试残留。

建议：将诊断入口改为受控支持模式，或在 iOS release build 中禁用动态加载测试脚本。

## P2 可排期优化

### 10. `user-scalable=no` 对无障碍不友好

证据：`index.html:5` 设置 `maximum-scale=1.0, user-scalable=no`。

影响：对视力较弱用户不友好；iOS 专属版本应优先支持系统字号或至少不阻止缩放。

建议：重设计时评估移除缩放限制，并补充动态字号/大字模式检查。

### 11. App Store 隐私标签尚未固化

证据：`docs/上架就绪清单.md:14` 仍标为 P1。

影响：上架需要在 App Store Connect 填写采集数据类型、用途、是否关联身份等。

建议：基于实际采集项整理隐私标签：邮箱、用户 ID、学习记录、设备信息、反馈日志、媒体文件、诊断日志。

### 12. 首次用户 onboarding 仍是产品风险

证据：`docs/上架就绪清单.md:45-52` 已标注新用户首次打开、首牌组来源、默认练习模式待设计。

影响：功能完成不等于陌生用户能自助开始；App Store 审核员和首批外部用户都会从空状态进入。

建议：iOS UI 重设计时把 onboarding、示例牌组、首次练习路径作为第一屏核心流程，而不是后补说明。

## 建议下一步顺序

1. 决策打包路线：纯 PWA 继续强化，还是 Capacitor/WKWebView 原生包。
2. 补齐 P0：iOS 工程、图标资源、法务主体信息。
3. 处理 P1：本地化依赖、媒体存储隔离、诊断发布策略、真机测试矩阵。
4. 用 `uiuxpro` + `frontend-design` 做 iOS 专属 UI 方案，不直接复刻当前 Web UI。
5. 跑发布验证：`npm test`、UI 冒烟、SRS/Easy、IDB、sync/auth、真机 iOS 手工回归。

## 文档化验收矩阵

详细发布清单见：`docs/ios_release_readiness_2026-06-18.md`。

### 打包路线验收

- 决策：采用 Capacitor/WKWebView 作为 TestFlight / App Store 路线，PWA 作为 GitHub Pages 继续保留。
- 理由：当前应用是单文件 PWA，业务状态主要依赖 IndexedDB、Supabase 和浏览器能力；Capacitor 可以最小化业务迁移成本，同时提供 Xcode、签名、TestFlight、权限描述和本地 bundle 能力。
- 不建议短期重写为 SwiftUI：会重写 SRS、IDB、媒体导入、同步、国际化和训练流程，风险明显高于包装路线。

### P0 验收

- iOS 工程：需要 `capacitor.config.json`、`ios/App/App.xcodeproj`、`ios/App/App/Info.plist`、可打开的 Xcode project、稳定 bundle id 和 signing team。
- 图标：需要 PWA `192/512`、Apple touch icon、iOS AppIcon asset catalog、App Store 1024 图标，并确认图标不是临时草稿。
- 法务：需要替换所有隐私政策和用户协议中的开发者占位符，补齐开发者/主体、联系邮箱、适用地区和数据删除路径。

### P1 验收

- 本地依赖：iOS bundle 不应依赖第三方 CDN 才能登录或同步；Supabase SDK 和关键字体需本地化或有明确降级策略。
- 媒体隔离：个人媒体必须确认是否迁入 `yihai-private/{user_id}/...`；若继续使用 `ReminiSea`，需收紧 Storage RLS。
- 诊断入口：生产 iOS 包必须禁用 `/tests/yh_diag.js` 动态加载，或改成受控支持模式并记录审核理由。
- 真机矩阵：至少覆盖 iPhone SE、标准 iPhone、Pro Max；运行环境覆盖 Safari、主屏 PWA、WKWebView/TestFlight。

### 发布验证验收

- 自动化：`npm test`、`npm run test:ui-smoke`、`npm run test:srs-e2e`、`npm run test:easy`。
- 打包：`npm run ios:prepare`、`npx cap sync ios`、`xcodebuild -list -project ios/App/App.xcodeproj`。
- 真机：首次打开、注册/登录、导入牌组、训练、TTS/录音/图片、离线重开、云同步、退出重登、横竖屏、软键盘。
- 审核：App Store 隐私标签、权限弹窗文案、未成年人/家庭场景说明、数据删除流程、诊断入口策略。
