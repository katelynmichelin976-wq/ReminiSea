# Admin v2 Schema Check（Phase 0 产出）

Date: 2026-06-14 → 数据采样 2026-06-15
Project ID: `juzkonrzfyvchqxzmlpr`

## 真实表 + 关键列（已采样验证）

### sync_trials（1187 行）
- `id` bigint PK
- `user_id` uuid（FK auth.users）
- `card_id`, `deck_key`, `session_id`, `trial_id` text
- `rating` text, `is_correct` bool, `attempt_number` int
- `response_time_ms` int
- `srs_stage_before/after`, `interval_before/after`, `ease_before/after`
- `lapses_streak/total_before/after` int
- `review_mode_before/after` text, `step_index_after` int
- `timestamp` bigint（毫秒）
- `synced_at`, `created_at` timestamptz
- `trial_date` date ← **关键聚合字段**
- `device_info` jsonb, `app_version` text ← **DAU/版本可直接用**
- `due_ts` bigint, `due_date` text, `suspended` bool, `suspended_reason` text
- `session_mode` text default 'normal'
- `active_gap_ms` bigint

### sync_card_states（4000 行）
- 略（v2 admin 不直接用）

### app_events（9927 行）
- `event_id` text PK
- `user_id` uuid
- `event_type` text ← **关键**
- `deck_key` text
- `payload` jsonb ← **app_version 在这里：`payload->>'app_version'`**
- `device_id` text
- `timestamp` bigint（毫秒）
- `created_at` timestamptz
- ⚠️ **不存在 `app_version` 顶层列**

**实际 event_type 分布（近 30 天 top）**：
```
go_home                                1410
session_restore_start                   782
sync_started                            712
cloud_state_merge                       664
build_queue                             555
start_practice                          552
sync_done                               448
login                                   447
session_restore_ok                      328
session_restore_none                    279
session_restore_token_refreshed         123
config_changed                          114
show_finish                              99
session_restore_sdk_signout              94
logout                                   73
session_restore_l1_ok                    60
session_restore_offline                  52
session_restore_l1_fail                  46
delete_deck                              36
session_restore_l3_fail                  33
import_deck                              27
session_restore_l2_real_logout            7
session_restore_l1_timeout                6
log:warn                                  6
session_restore_l2_offline                5
```

⚠️ **关键发现**：
- 没有 `js_error` 事件（v5.13.11 上线 1 天，还没积累/触发）。v2 KPI 显示 0 即可，不阻塞
- 没有 `sync_failed/sync_error/sync_timeout`。但有 `session_restore_l1_fail/l3_fail/l1_timeout/l2_offline/l2_real_logout/session_restore_sdk_signout`——这些可视为"故障类"事件，可聚合为"恢复失败"指标
- "log:warn" 6 条——低优先级，可作 health 维度之一

### feedback（65 行）
- `id` uuid PK
- `created_at` timestamptz
- `app_version` text
- `feedback_type` text default 'general'
- `user_desc` text ← **正文字段**（不是 content）
- `device_id` text
- `locale` text
- `device_info` jsonb
- `diagnostics` jsonb ← 含 sync_enabled / last_sync_ts / has_session_backup / app_version / deck_count / idb_version / collected_at / events / logs / log_source / user_id / local_log
- ⚠️ **无 user_id 顶层列**（user_id 嵌在 diagnostics jsonb 里，14/65 条有）
- ⚠️ **无截图字段**（sign-private-url 在 v2 不需要复用）

### decks（5 行）
- `id` text PK
- `user_id` uuid
- `name` text（**不是 title**）
- `deck_type` text default 'personal' ∈ {`'preset'`, `'personal'`}
- `card_count` int
- `shared_at` timestamptz nullable
- `name_lang` text default 'zh-CN'
- `created_at`, `updated_at` timestamptz
- ⚠️ **无 `is_featured` 列**——"精选"概念在云端不存在
- ⚠️ **无 `deck_subscriptions` 表**——订阅只在客户端 IDB

**实际分布**：`preset=1（蔬菜水果）`、`personal=4`

### deck_cards（186 行）
- `id` bigint PK
- `deck_id`, `card_id`, `name` text
- `card_type` text default 'choice'
- `media`, `ext` jsonb
- `sort_order` int
- ⚠️ 无 `created_at`

### admin_users（1 行）
- `id` bigint PK
- `user_id` uuid（FK auth.users）
- `role` text default 'doctor' ← legacy，前端忽略
- `display_name` text ← legacy "测试医生"，前端忽略
- `created_at`, `updated_at` timestamptz

**唯一管理员确认**：`user_id=5358bfeb-d0d7-4a6e-894c-652bc1533d70` = `zyhacl@gmail.com`

### easy_card_states（69 行）
- v2 admin 不直接用

## 数据采样（用于交叉校验）

**近 30 天 app_version 分布（取自 sync_trials.app_version distinct user）**：
- 4.11.19=3, 5.4.9/5.5.0/5.6.0/5.1.6/5.1.0/5.13.4/5.10.0/5.2.0/4.11.18/4.10.0=2 users each
- 其余=1 user，覆盖 4.10–5.13.11 几十个版本

**top 牌组（近 7 天 trials）**：
- `01edbdfd` 蔬菜水果（preset）→ 3 users / 106 trials
- `__builtin_test__` → 2 users / 43 trials
- `3e85da18` 蔬菜水果 personal → 1 / 33
- `aa1e5d1b...` 家人 → 1 / 21
- `167e8e6a...` 家人 → 2 / 15
- `38672675...` 4000 Words → 1 / 10

## 对 plan/spec 的影响（决策清单）

1. **象限 ④ 内容运营** 整改：从「精选订阅」→「牌组使用热度」
   - 决策已定（用户选项 1）
2. **象限 ③ 反馈**：
   - 字段映射 `content → user_desc`
   - "不同用户数" → "不同设备数"（device_id distinct）
   - 邮箱前缀显示项 → 直接显示 device_id 前 8 位 + feedback_type + app_version
   - 砍掉截图/sign-private-url（数据库里没有截图字段）
3. **象限 ② 系统健康**：
   - `app_events.app_version` 改用 `payload->>'app_version'`
   - JS 错误事件名仍用 `js_error`（KPI 显示 0 即可）
   - 同步失败事件名改为 `session_restore_l1_fail` + `session_restore_l3_fail` + `session_restore_l1_timeout` + `session_restore_sdk_signout` 并集（可定义为 "session 异常"）
4. **象限 ① 增长活跃**：无改动
5. **`decks.name`**：所有引用 `d.title` 改为 `d.name`
6. **admin 显示**：忽略 admin_users.display_name 与 role，前端只显示 auth.users.email
