# iOS 打包与发布评审输出汇总

日期：2026-06-18

范围：只记录输出文档，不改代码、不改配置、不推进 iOS 工程实现。

## 当前结论

5 个顺序已经在文档层面完成记录：

1. 打包路线：建议采用 Capacitor/WKWebView 作为 TestFlight / App Store 路线，保留 GitHub Pages PWA。
2. P0：iOS 工程和图标已有当前工作区草案证据，但法务主体、Apple 签名、正式图标验收仍未完成。
3. P1：本地依赖、媒体隔离、诊断入口、真机矩阵已拆成发布前必须处理项。
4. iOS UI：已输出专属 UI 重设计规格，覆盖触控、safe area、Dynamic Type、VoiceOver、onboarding 和核心屏幕。
5. 发布验证：已记录自动化基线、Xcode/TestFlight 验证项、真机手工矩阵和 App Store 隐私标签草案。

## 输出文档

- [ios_packaging_review_2026-06-18.md](./ios_packaging_review_2026-06-18.md)：主评审记录，包含 5 项推进状态、当前 iOS 草案证据、验证记录和验收矩阵。
- [ios_release_readiness_2026-06-18.md](./ios_release_readiness_2026-06-18.md)：发布就绪清单，包含 App Store 合规、隐私标签、医疗宣称边界和最终阻断项。
- [ios_real_device_regression_matrix_2026-06-18.md](./ios_real_device_regression_matrix_2026-06-18.md)：iOS Safari、主屏 PWA、WKWebView/TestFlight 的真机手工测试矩阵。
- [ios_storage_diagnostics_review_2026-06-18.md](./ios_storage_diagnostics_review_2026-06-18.md)：Supabase Storage 隔离、个人媒体权限、诊断入口和生产日志策略评审。
- [2026-06-18-ios-ui-redesign-design.md](./superpowers/specs/2026-06-18-ios-ui-redesign-design.md)：iOS 专属 UI 重设计规格。
- [HyperFrames HTML 输出](./hyperframes-ios-review-2026-06-18/index.html)：基于上述 6 份 review 结果文档生成的 HyperFrames HTML 展示。

## 已记录的验证结果

已在 [ios_packaging_review_2026-06-18.md](./ios_packaging_review_2026-06-18.md) 中记录：

- `npm test`：18 套件，717 断言，0 失败。
- `npm run test:ui-smoke`：68 通过，0 失败。
- `npm run test:srs-e2e`：21 通过，0 失败。
- `npm run test:easy`：28 通过，0 失败。

说明：这些验证证明当前 Web/Playwright 基线，不等价于 iOS 真机、PWA standalone、WKWebView 或 TestFlight 验证。

## 未执行事项

按“不改代码”的要求，以下事项只记录为后续任务，未实施：

- 不修改 `index.html`。
- 不修改 Supabase SQL / Storage 策略。
- 不修改 Capacitor / iOS 工程。
- 不替换 CDN 依赖。
- 不改诊断入口实现。
- 不改 UI。
- 不改法务 HTML。

## 仍需人工或后续工程处理

- Apple Developer Team、签名证书、Provisioning Profile。
- 真实开发者/公司主体、联系邮箱、隐私政策和用户协议最终文本。
- App Store Connect 隐私标签最终确认。
- Xcode Archive、TestFlight 上传和真机验证。
- 私有媒体迁移或权限收紧实现。
- 生产诊断入口实现策略。

## 状态

文档记录工作完成。真实 iOS 发布未完成，不能宣称 App Store / TestFlight 就绪。
