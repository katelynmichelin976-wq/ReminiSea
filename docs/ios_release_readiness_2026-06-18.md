# iOS 发布就绪清单

日期：2026-06-18

范围：文档评审，不改代码。用于把 iOS 打包前 5 项顺序拆成可执行、可验收、可阻断的发布清单。

关联文档：

- `docs/ios_packaging_review_2026-06-18.md`
- `docs/ios_real_device_regression_matrix_2026-06-18.md`
- `docs/ios_storage_diagnostics_review_2026-06-18.md`
- `docs/superpowers/specs/2026-06-18-ios-ui-redesign-design.md`

官方参考：

- Apple App Privacy Details: https://developer.apple.com/app-store/app-privacy-details/
- Apple User Privacy and Data Use: https://developer.apple.com/app-store/user-privacy-and-data-use/
- App Store Connect Manage App Privacy: https://developer.apple.com/help/app-store-connect/manage-app-information/manage-app-privacy/
- Apple HIG Layout: https://developer.apple.com/design/human-interface-guidelines/layout
- Apple UI Design Tips: https://developer.apple.com/design/tips/
- App Store Connect Regulated Medical Device Status: https://developer.apple.com/help/app-store-connect/manage-app-information/declare-regulated-medical-device-status/

## 1. 打包路线决策

结论：采用 Capacitor/WKWebView 原生包作为 iOS TestFlight / App Store 路线，GitHub Pages PWA 保留为 Web 发布路线。

理由：

- 当前应用业务主体集中在 `index.html`，以 IndexedDB、Supabase、媒体导入、TTS/录音和浏览器运行时为核心。
- Capacitor 路线可以最小化业务迁移成本，同时提供 Xcode project、签名、权限描述、TestFlight 和本地 Web bundle。
- 短期重写 SwiftUI 会重建 SRS、同步、媒体、i18n、Easy 模式和测试体系，风险过高。

验收证据：

- `capacitor.config.json` 已出现草案。
- `ios/App/App.xcodeproj` 已出现草案。
- `package.json` 已出现 `ios:*` 脚本草案。

剩余阻断：

- 需要正式代码评审确认这些草案是否可接收。
- 需要 Apple Developer Team ID、Signing Certificate、Provisioning Profile。
- 需要在 Xcode 中实际 Archive 并上传 TestFlight。

## 2. P0 发布阻断项

### 2.1 iOS 工程

必须完成：

- Bundle ID 确认：当前草案为 `app.memoryglimmers.yihai`，需确认是否为最终 Bundle ID。
- Display Name 确认：当前草案为 `忆海拾光`。
- Version / Build 规则：不得随意 bump `APP_VERSION`；iOS `CFBundleShortVersionString` 和 Web `APP_VERSION` 需在发布任务中统一。
- Xcode Signing：需要 Apple Developer 账号和 Team。
- Archive：需要 Xcode archive 成功。

当前状态：

- 工程骨架存在，但未验收、未签名、未真机运行。

### 2.2 图标和启动资源

必须完成：

- PWA icon: `192x192`、`512x512`。
- Apple touch icon: `180x180`。
- iOS AppIcon asset catalog 全尺寸。
- App Store 1024 icon。
- Launch Screen 验收，避免黑屏或默认模板感。

当前状态：

- 根目录已有 `icon-192.png`、`icon-512.png`、`apple-touch-icon.png` 草案。
- 仍需确认这些不是临时生成稿，并补齐 App Store 1024 图标审美验收。

### 2.3 法务主体

必须由发布负责人提供：

- 开发者个人姓名或公司主体。
- 对外联系邮箱。
- 隐私政策适用地区。
- 数据删除/账号删除处理路径。
- 是否涉及未成年人或家庭照护场景的额外说明。

当前证据：

- `privacy*.html` 和 `terms*.html` 仍存在开发者名称占位符。

阻断判断：

- 未提供真实主体前，不应提交 App Store 审核。

## 3. P1 发布前必须处理

### 3.1 关键依赖本地化

当前风险：

- `index.html` 依赖 Google Fonts。
- `index.html` 通过 jsDelivr 加载 Supabase UMD SDK。

发布要求：

- iOS 包内登录、同步和首屏渲染不应依赖第三方 CDN 才能工作。
- Supabase SDK 应随 iOS bundle 内置，或至少有可验证的离线/弱网降级策略。
- 字体优先使用 iOS 系统字体，避免首屏依赖 Google Fonts。

验收方法：

- 断网启动 iOS bundle，首页可打开。
- 登录/同步失败时显示可理解错误，不白屏、不卡死。
- 弱网下进入训练不依赖云端成功。

### 3.2 媒体存储隔离

当前风险：

- `sql/supabase_storage_policies.sql` 对 `ReminiSea` bucket 给 authenticated 用户宽权限。
- `sql/supabase_migration_009_private_storage.sql` 已设计 `yihai-private` 私有 bucket。
- 运行时代码仍有 `_sb.storage.from('ReminiSea')` 上传/下载路径。

发布决策：

- 如果个人牌组图片/音频是用户私有数据，应迁入 `yihai-private/{user_id}/...`。
- 如果 `ReminiSea` 继续承载公开/共享资源，必须明确它不存放私人媒体。

验收方法：

- 用 A/B 两个账号验证：A 上传个人媒体后，B 不应能列出、下载或覆盖。
- 跨设备登录同一账号仍能恢复个人媒体。
- 删除账号/删除数据时，关联私有媒体有清理路径。

### 3.3 诊断入口发布策略

当前风险：

- 版本号点击 5 次打开诊断面板。
- 诊断脚本从线上 `/tests/yh_diag.js` 动态加载。

发布决策：

- 生产 iOS 包默认不应加载 `/tests/` 路径脚本。
- 推荐改为“我的 > 帮助 > 支持诊断”，由用户主动开启，并说明收集内容。
- 如果仅 TestFlight 保留诊断，App Store release build 应禁用。

验收方法：

- App Store release 包中断网、弱网、正常网络均不会请求 `/tests/yh_diag.js`。
- 支持模式开启前，不上传诊断日志。
- 支持模式关闭后，不继续采集。

### 3.4 Service Worker / 离线策略

PWA 路线：

- 需要可用 Service Worker、缓存清单和更新策略。

Capacitor 路线：

- 需要确认 `build/ios-web` 包含首屏、隐私政策、用户协议、图标和必要 SDK。
- 不应把 Web PWA 的 Service Worker 状态直接等同于 iOS bundle 离线可用。

验收方法：

- iOS bundle 首次安装后断网打开，页面不白屏。
- 已导入本地牌组后断网可以继续训练。
- 云同步失败时不会破坏本地 IndexedDB 状态。

## 4. iOS UI 专属方案

设计文档：

- `docs/superpowers/specs/2026-06-18-ios-ui-redesign-design.md`

核心要求：

- 触控目标至少 `44x44pt`。
- 底部导航不超过 5 项，并同时显示图标和文字。
- 首页只有一个主 CTA。
- 空状态可以不登录开始体验。
- 支持 VoiceOver、Dynamic Type、reduced motion。
- 避免生产诊断入口隐藏在版本号连击里。

验收方法：

- iPhone SE、标准 iPhone、Pro Max 分别检查触控、safe area、软键盘遮挡。
- Dynamic Type 调到较大字号，核心按钮和训练卡片不截断。
- VoiceOver 顺序和视觉顺序一致。

## 5. 发布验证矩阵

### 5.1 自动化基线

必须运行：

- `npm test`
- `npm run test:ui-smoke`
- `npm run test:srs-e2e`
- `npm run test:easy`

按影响范围追加：

- Sync/auth: `npm run test:cloud-sync`
- Cross-device/media: `npm run test:cross-device`
- Easy sync: `npm run test:easy-sync`
- Orientation: `node tests/_pw_orientation_lock.js`

### 5.2 打包验证

必须运行：

- `npm run ios:prepare`
- `npx cap sync ios`
- `xcodebuild -list -project ios/App/App.xcodeproj`
- Xcode Archive
- TestFlight 内部测试安装

### 5.3 真机矩阵

设备：

- iPhone SE 或等价小屏。
- 标准 iPhone。
- iPhone Pro Max。

环境：

- iOS Safari。
- 主屏 PWA。
- WKWebView / TestFlight。

场景：

- 首次打开。
- 语言选择。
- 注册 / 登录 / 退出重登。
- 使用示例牌组开始训练。
- 导入 `.yhspack`。
- 图片显示、语音播放、录音权限、照片权限。
- Easy 模式和 Normal 模式各完成一轮。
- 云同步、断网训练、恢复网络后同步。
- 横屏 overlay。
- 软键盘输入邮箱/密码/搜索时不遮挡关键按钮。

## 6. App Store Connect 隐私标签草案

需要逐项在 App Store Connect 中确认。Apple 要求开发者识别应用及第三方伙伴收集的数据类型，并说明用途、是否关联身份、是否用于追踪。

初步数据类型：

- Contact Info: 邮箱，用于账号登录、同步身份、找回账号。
- User ID: Supabase 用户 ID / 本地设备 ID，用于同步和数据归属。
- User Content: 牌组文本、图片、音频、导入包、反馈内容。
- Usage Data: 学习记录、答题结果、SRS 状态、同步状态。
- Diagnostics: 本地日志、诊断日志、错误事件；生产采集策略待定。
- Device ID / Device Info: 如果同步表写入设备 ID 和设备信息，需要申报并说明用途。

需要明确“不做”的项：

- 不用于第三方广告追踪。
- 不出售用户数据。
- 不把家庭媒体公开给其他账号。

阻断项：

- 诊断日志到底采集哪些字段。
- 个人媒体是否完全私有隔离。
- 数据删除请求如何执行并验证。

## 7. 医疗/健康合规判断

当前产品更接近记忆训练和家庭辅助工具，不应宣称诊断、治疗、预防疾病或替代医疗建议。

App Store Connect 可能需要确认是否属于 regulated medical device。若产品文案继续保持“训练/辅助/家庭记忆”定位，通常应避免医疗器械宣称；最终判断需由发布主体根据目标地区法规确认。

发布文案建议：

- 可以说：帮助家庭制作记忆训练牌组、记录练习进度。
- 不应说：治疗失智症、改善医学诊断结果、替代医生建议。

## 8. 最终阻断清单

以下事项不是 Codex 只写文档可以完成的：

- Apple Developer 账号和签名配置。
- 法务主体、联系邮箱和隐私政策正式文本。
- App Store Connect 隐私标签最终确认。
- 真机 iOS Safari / PWA / TestFlight 验证。
- Xcode Archive 和 TestFlight 上传。
- Supabase Storage 私有媒体策略实现和跨账号验证。
- 生产诊断入口实现策略。

只有这些阻断项被实际完成并验证后，才能宣称 iOS 发布就绪。
