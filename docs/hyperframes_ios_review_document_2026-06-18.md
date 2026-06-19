# HyperFrames 风格 iOS 评审文档

日期：2026-06-18

范围：只记录输出文档，不生成 HyperFrames HTML composition，不运行 `npx hyperframes`，不改应用代码或工程配置。

## 使用的技能

本轮按 `hyperframes` 技能的高层结构整理文档：

- What：观众/读者应理解什么。
- Structure：内容如何分段。
- Timing：信息推进顺序。
- Layout：每个章节的最终可读状态。
- Animate：如果后续做视频化表达，应如何转场和强调。

说明：`hyperframes` 技能本身用于 HTML 视频合成、动效、字幕、旁白和渲染。当前任务是 Markdown 文档输出，因此没有创建 composition，也没有执行 lint/validate/render。

## What

读者需要在 3 分钟内理解：

- 当前项目功能基本完成，但 iOS 发布并未完成。
- 5 个顺序在文档层面已经拆解完成。
- 真正的 App Store / TestFlight 就绪仍依赖法务主体、Apple 签名、真机验证和若干工程实现。
- 后续若允许改代码，应优先处理 CDN 本地化、媒体私有隔离、诊断入口和 iOS bundle 验证。

## Structure

输出文档分为 5 个主层级：

1. 主评审记录：`docs/ios_packaging_review_2026-06-18.md`
2. 发布就绪清单：`docs/ios_release_readiness_2026-06-18.md`
3. 真机回归矩阵：`docs/ios_real_device_regression_matrix_2026-06-18.md`
4. 存储隔离与诊断评审：`docs/ios_storage_diagnostics_review_2026-06-18.md`
5. iOS UI 设计规格：`docs/superpowers/specs/2026-06-18-ios-ui-redesign-design.md`

总入口：

- `docs/ios_review_output_summary_2026-06-18.md`

## Timing

如果把这些内容做成 HyperFrames 视频或演示，建议节奏如下：

| 时间段 | 章节 | 重点 |
| --- | --- | --- |
| 0-10s | 标题 | “iOS 发布不是功能完成，而是工程、合规和真机验证闭环” |
| 10-30s | 5 项状态 | Capacitor 路线、P0/P1、UI、验证矩阵 |
| 30-55s | 当前草案证据 | `capacitor.config.json`、`ios/`、图标、Info.plist 草案 |
| 55-85s | P0 阻断 | 法务主体、Apple 签名、正式图标、Xcode Archive |
| 85-120s | P1 风险 | CDN、`ReminiSea`、诊断脚本、离线策略 |
| 120-150s | UI 方向 | 家庭记忆训练、44pt、Dynamic Type、VoiceOver、onboarding |
| 150-180s | 最终行动 | 真机矩阵、隐私标签、TestFlight、仍需人工决策 |

## Layout

文档阅读层级应保持：

- 先给结论，再给证据。
- 先列阻断，再列建议。
- 每个风险必须有“当前证据 / 影响 / 验收方法”。
- 每个验收项必须能对应到文件、命令、设备或人工输入。

建议后续如果视频化：

- 画面使用 5 个大卡片表示 5 项顺序。
- P0 用红色边框标记，不使用夸张警告动画。
- P1 用琥珀色标记，表示发布前必须处理。
- UI 方案用平静蓝绿，延续 `ios-ui-redesign` 文档中的家庭医疗色彩。
- 最后一屏只保留“不能宣称 iOS 发布就绪”的结论和阻断项。

## Animate

如果后续允许生成 HyperFrames composition，动效建议：

- 场景之间使用柔和 wipe 或 crossfade，避免跳切。
- 每个章节元素都做 entrance，不做中途 exit，由转场接管离场。
- 重点风险使用 marker sweep 或轻量描边，不用闪烁。
- 数据表只做逐行淡入，保证可读。
- 全片遵守 WCAG 对比和安全阅读节奏。

## 最终文档结论

按 HyperFrames 的叙事框架，上述文档的核心故事是：

> 项目可以进入 iOS 发布准备阶段，但不能直接宣称发布就绪。当前应把 Capacitor 路线、P0/P1 阻断、iOS UI 规格、真机验证和 App Store 合规拆开推进。

当前已完成的是“输出文档闭环”；未完成的是“真实 iOS 发布闭环”。
