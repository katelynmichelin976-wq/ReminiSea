# 忆海拾光 · 管理看板

医生/家属监控平台，独立于训练 App 部署。

- 文件：`yihai_admin_v1.html`
- 部署方式：与训练 App 同仓库，独立迭代版本号
- 认证方式：Supabase Auth email/password + `admin_users` 表鉴权
- 数据访问：Edge Functions 使用 `service_role` key 跨用户聚合数据

---

## 版本历史

### v1.3 — 2026-05-07

**新增设备信息展示**
- 患者概览新增「设备信息」区块，列出用户使用的所有设备
- 设备列：ID、类型（iOS/Android/PC/Mac）、浏览器（Chrome/Safari/Edge/Firefox）、屏幕分辨率、语言、答题数、最后活跃
- 多设备时自动标注黄色「多设备」标签
- `get-patient-detail` 新增 `device_info` 查询，解析 `sync_trials.device_info` JSON 字段
- 训练 App 新增 `getDeviceInfo()` 在每次答题时上报 `{ua, screen, lang}`

### v1.2 — 2026-05-07

**新增参数配置查看**
- 患者详情新增「参数配置」子 Tab，查看用户云端 `sync_config` 配置
- 分 SRS 复习参数和 UI 界面参数两组展示，按字母排序
- 每项参数含中文标签、当前值；布尔值显示 ✓/✗，数组逗号分隔
- 可折叠面板 + 展开全部/收起全部按钮
- 新增 Edge Function `get-patient-config`，查询 `sync_config` 表

### v1.1 — 2026-05-06

**患者列表修复**
- 移除 admin 用户过滤，测试账号 `zyhacl@gmail.com` 现在出现在患者列表中

**新增月历查询**
- 患者详情新增「月历」子 Tab，显示每月练习日历网格
- 日历格以彩色圆点标注正确率（绿≥70%、黄40-70%、红<40%）
- 点击有数据的日期，加载该日完整答题记录表格

**新增卡牌状态查询**
- 患者详情新增「卡牌状态」子 Tab，显示所有卡片的 SRS 状态
- 包含：卡片名称、牌组、SRS 阶段（彩色标签）、间隔天数、易度、到期日、失败次数

### v1.0 — 2026-05-06（初始版本）

**医生/家属监控看板**
- 独立 HTML 页面 `yihai_admin_v1.html`，与训练 App 分离部署
- Supabase Edge Functions（`service_role` key）跨用户聚合，绕过 RLS 限制
- `admin_users` 表 + 共享鉴权模块，医生邮箱登录自动验证管理权限

**服务端聚合 API（8 个 Edge Function）**
| Function | 用途 |
|----------|------|
| `admin-auth-check` | JWT 鉴权 + admin_users 权限验证 |
| `get-dashboard-summary` | 全局 KPI：今日活跃患者数/复习量/正确率/响应时间 |
| `get-patients-list` | 患者列表含参与度指标（活跃天数、连续天数、复习量、正确率） |
| `get-patient-detail` | 患者详情：每日趋势、牌组分解、SRS 分布、响应时间/时段分布 |
| `get-card-difficulty` | 困难卡片识别：高失败率/已挂起卡片、牌组失败率排名 |
| `get-patient-calendar` | 月历查询：按月返回每日练习摘要，支持点击日期查看答题记录 |
| `get-patient-card-states` | 卡牌状态查询：返回患者所有卡片的 SRS 状态（含卡片名称） |
| `get-patient-config` | 参数配置查询：返回用户云端 SRS/UI 参数配置 |

**数据库层**
- `admin_users` 表 + RLS 策略
- `sync_trials.trial_date` 生成列 + 5 个性能索引
- 3 个 RPC 函数：`count_distinct_user_ids`、`get_patient_daily_stats`、`get_patient_deck_stats`

**看板功能**
- 概览视图：KPI 卡片 + 7 天复习量柱状图 + 活跃患者表格
- 患者视图：搜索/排序/详情面板（趋势图、牌组分解、SRS 环形图）
- 卡片视图：按患者筛选、高失败率/挂起表格、牌组失败率排名
- 骨架屏加载态 + 空状态 + 错误重试
- 桌面 sidebar / 移动端底部 tab bar 响应式布局
- 概览页 60s 自动刷新
