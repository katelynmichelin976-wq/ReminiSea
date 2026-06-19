# iOS 存储隔离与诊断发布评审

日期：2026-06-18

范围：文档评审，不改代码。聚焦 iOS 发布前的 Supabase Storage 权限、个人媒体隔离、诊断入口和生产日志策略。

## 结论

当前最大隐私风险不是 IndexedDB 本地存储，而是个人媒体是否仍通过宽权限 `ReminiSea` bucket 上传/下载，以及生产包是否仍能动态加载 `/tests/yh_diag.js`。

iOS 发布前必须把“个人媒体私有隔离”和“诊断支持模式”作为 P1 工程项处理并验证。

## 1. 存储隔离

### 当前证据

- `sql/supabase_storage_policies.sql` 对 `ReminiSea` bucket 的 authenticated 用户给出 select/insert/update/delete 权限。
- `sql/supabase_migration_009_private_storage.sql` 已存在 `yihai-private` 私有 bucket 和 user 前缀策略。
- `index.html` 仍存在 `_sb.storage.from('ReminiSea')` 上传/下载路径。

### 风险判断

如果 `ReminiSea` 存储个人牌组图片、录音或家庭资料，则宽权限策略不满足 iOS 发布隐私预期。App Store 隐私标签中如果声明用户内容与身份相关，后端权限也必须支持这个声明。

### 推荐策略

| 内容类型 | 推荐 bucket | 路径规则 | 权限 |
| --- | --- | --- | --- |
| 内置示例牌组媒体 | `ReminiSea` | `public/...` 或固定公开路径 | 可公开读，限制写 |
| 用户个人图片 | `yihai-private` | `{user_id}/images/...` | 仅本人读写 |
| 用户个人录音 | `yihai-private` | `{user_id}/audio/...` | 仅本人读写 |
| 导入包临时文件 | 本地 IndexedDB 优先 | 不上传，除非用户开启同步 | 默认本地 |
| 诊断附件 | 独立受控路径 | `{user_id}/diagnostics/...` | 用户确认后上传 |

### 验收测试

- 账号 A 上传个人图片，账号 B 不能下载。
- 账号 A 上传个人录音，账号 B 不能下载。
- 同一账号换设备可以恢复个人媒体。
- 删除用户数据时，私有 bucket 下对应前缀被清理。
- 公开示例媒体不会被普通 authenticated 用户覆盖。

## 2. IndexedDB 与本地数据

### 当前判断

IndexedDB 是 iOS 包的核心本地状态存储，适合离线训练、SRS、EasyState、导入包和本地日志。iOS 发布前不需要迁移到原生数据库，但必须验证 WKWebView 下的持久化和清理行为。

### 验收测试

- TestFlight 冷启动后 IndexedDB 数据仍存在。
- App 切后台、锁屏、重启后当前训练状态不丢。
- 退出登录不应误删本地牌组，除非用户明确选择清除。
- 清除缓存/删除 App 后数据行为符合用户预期和说明。

## 3. 诊断入口

### 当前证据

- 版本号点击 5 次可打开诊断面板。
- 诊断脚本从线上 `/tests/yh_diag.js` 动态加载。

### 风险判断

隐藏入口本身不是绝对不可接受，但生产 App 动态加载 `tests/` 路径脚本会增加审核、隐私和供应链风险。App Store release 包不应默认依赖线上测试脚本。

### 推荐策略

| 构建类型 | 诊断入口 | 诊断脚本 | 上传日志 |
| --- | --- | --- | --- |
| 本地开发 | 可保留版本号连击 | 可加载本地/测试脚本 | 开发者自用 |
| TestFlight | “我的 > 帮助 > 支持诊断” | 内置或固定版本脚本 | 用户确认后上传 |
| App Store release | 默认关闭 | 不加载 `/tests/` 路径 | 用户确认后最小化上传 |

### 支持诊断文案要求

必须说明：

- 会收集哪些信息：App 版本、设备信息、同步状态、错误日志。
- 不收集哪些信息：家庭照片原图、录音原音频、密码。
- 上传目的：排查同步、导入、训练或权限问题。
- 如何关闭：用户可以随时关闭支持诊断。

## 4. App Store 隐私标签影响

如果保留同步、日志和诊断：

- `User Content` 需要覆盖牌组文本、图片、音频。
- `Usage Data` 需要覆盖学习记录、答题结果、SRS/Easy 状态。
- `Diagnostics` 需要覆盖错误日志和诊断事件。
- `Identifiers` 需要覆盖 Supabase user ID、device ID 或类似设备标识。

需要确认：

- 是否所有数据都 linked to user。
- 是否存在 tracking。当前评审建议声明“不用于第三方广告追踪”，但必须由实际 SDK 和日志策略验证。
- 第三方服务 Supabase 的数据处理说明是否已在隐私政策中覆盖。

## 5. 发布前阻断项

- 未确认个人媒体是否迁入私有 bucket。
- 未做 A/B 账号跨访问验证。
- 未定义生产诊断入口和日志字段。
- 未确认 release 包不请求 `/tests/yh_diag.js`。
- 未把最终隐私标签和隐私政策字段对齐。

这些项未关闭前，不应宣称 iOS 隐私发布就绪。
