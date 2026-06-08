/**
 * Convert Chinese comments in yihai_v5.1.html to English.
 * Usage: node convert_comments.js
 */
const fs = require('fs');
const path = require('path');

const files = ['yihai_v5.1.html', 'index.html'];
for (const fname of files) {
  const filePath = path.join(__dirname, fname);
  let content = fs.readFileSync(filePath, 'utf8');

// ── CSS section Chinese → English comment mapping ──
const replacements = [
  // Section header comments
  [/\/\* ── 多主题支持 ── \*\//g, '/* ── multi-theme support ── */'],
  [/\/\* ═══ 我的屏 ═══ \*\//g, '/* ═══ mine screen ═══ */'],
  [/\/\* 自制确认弹窗（替代 iOS PWA 下被屏蔽的 confirm\(\)）\*\//g, '/* custom confirm dialog (replaces iOS PWA blocked confirm()) */'],
  [/\/\* 空状态 \*\//g, '/* empty state */'],
  [/\/\* ═══ 制卡表单 ═══ \*\//g, '/* ═══ card creator form ═══ */'],
  [/\/\* ═══ Action Sheet \(照护者 ＋ 按钮\) ═══ \*\//g, '/* ═══ Action Sheet (caregiver + button) ═══ */'],
  [/\/\* ═══ 模式切换开关（我的屏） ═══ \*\//g, '/* ═══ mode toggle switch (mine screen) ═══ */'],
  [/\/\* ═══ 主题选择器 ═══ \*\//g, '/* ═══ theme picker ═══ */'],
  [/\/\* 各主题预览色 \*\//g, '/* theme preview colors */'],
  [/\/\* ═══ 关于页 ═══ \*\//g, '/* ═══ about page ═══ */'],
  [/\/\* Safe area — 集中定义，统一引用 \*\//g, '/* Safe area — centralized, single reference */'],

  // JS section headers
  [/\/\/ ── 工具函数 ────────────────────────────────────────────────────/g, '// ── utility functions ────────────────────────────────────────────'],
  [/\/\/ ── SRS 全局配置（Anki 命名对齐）────────────────────────────────/g, '// ── SRS global config (Anki naming convention) ────────────────────'],
  [/\/\/ ── SRS_CONFIG 持久化覆盖（从 localStorage 恢复用户修改）─────────/g, '// ── SRS_CONFIG persistent overrides (restore user edits from localStorage) ─'],
  [/\/\/ 参数配置云端同步：防抖推送（500ms 内多次修改只推送一次）/g, '// cloud config sync: debounced push (multiple changes within 500ms push once)'],
  [/\/\/ ── 日期 \/ 时间工具函数（所有 SRS 日期操作必须经过这里）──────────/g, '// ── date / time utilities (all SRS date ops must go through here) ──'],
  [/\/\/ UTC 日期（与 Supabase trial_date 生成列一致，该列用 to_timestamp\(\)::date = UTC）/g, '// UTC date (matches Supabase trial_date generated column: to_timestamp()::date = UTC)'],
  [/\/\/ ── IndexedDB：yihai_srs（v5: user_id 多用户隔离）────────────────/g, '// ── IndexedDB: yihai_srs (v5: user_id multi-user isolation) ──────'],
  [/\/\/ ── Supabase 云同步 ────────────────────────────────────────────────/g, '// ── Supabase cloud sync ──────────────────────────────────────────'],
  [/\/\/ ── PWA 诊断面板入口（tap version 5× 加载）───────────────────/g, '// ── PWA diagnostic panel entry (tap version 5× to load) ──────────'],
  [/\/\/ CDN 加速媒体下载（v4.8）：设空串则回退到 Supabase Storage/g, '// CDN-accelerated media download (v4.8): empty = fallback to Supabase Storage'],
  [/\/\/ v4\.9: 暂不启用腾讯云 COS 回源，避免下载费用/g, '// v4.9: Tencent Cloud COS origin-pull disabled to avoid download costs'],
  [/\/\/ CDN 媒体下载辅助：尝试 CDN 加速，失败则回退到 Supabase Storage/g, '// CDN media download helper: try CDN first, fallback to Supabase Storage'],
  [/\/\/ 网络失败时注册 online 事件，恢复后自动重试 session/g, '// register online event on network failure, auto-retry session when restored'],
  [/\/\/ 启动时尝试恢复已有会话/g, '// attempt to restore existing session on startup'],
  [/\/\/ 采集设备信息用于问题定位/g, '// collect device info for troubleshooting'],
  [/\/\/ ── 参数配置云端同步（v4\.8）──────────────────────────────────/g, '// ── config cloud sync (v4.8) ────────────────────────────────────'],
  [/\/\/ ── 统一同步入口（v4\.10）.+/g, '// unified sync entry point (v4.10+): modal progress + voice + scoped sync'],
  [/\/\/ 练习完成后集中补传（仅上传未同步 TrialLog \+ 最新 CardState，不下拉）/g, '// post-practice batch upload (unsynced TrialLog + latest CardState only, no download)'],
  [/\/\/ ── 诊断日志系统 ────────────────────────────────────────────────────/g, '// ── diagnostic log system ──────────────────────────────────────────'],
  [/\/\/ ── 数据埋点：应用事件日志 ──────────────────────────────────────────/g, '// ── telemetry: app event logs ──────────────────────────────────────'],

  // Config comments
  [/\/\/ 新卡学习/g, '// new card learning'],
  [/\/\/ 遗忘重学/g, '// relearning'],
  [/\/\/ 每日上限/g, '// daily limits'],
  [/\/\/ 高级间隔控制/g, '// advanced interval control'],
  [/\/\/ 我们特有参数/g, '// our custom parameters'],
  [/\/\/ 连续失败保护/g, '// consecutive failure protection'],
  [/\/\/ 自动前进（练习模式，对应现有 NDUR）/g, '// auto-advance (practice mode, corresponds to NDUR)'],
  [/\/\/ 统计记录/g, '// stats tracking'],
  [/\/\/ 时长保护（仅练习模式）/g, '// duration guard (practice mode only)'],

  // Unit comments
  [/,       \/\/ 分钟/g, ',       // min'],
  [/,            \/\/ 天/g, ',            // day'],
  [/,         \/\/ 分钟/g, ',         // min'],
  [/,            \/\/ 天/g, ',            // day'],
  [/\s*\/\/ 分钟/g, ' // min'],
  [/\s*\/\/ 天/g, ' // day'],
  [/\s*\/\/ 20 分钟/g, ' // 20 min'],
  [/\s*\/\/ 0 = 手动/g, ' // 0 = manual'],

  // More specific comments
  [/\/\/ learning 阶段 hard 计入连失/g, '// learning-stage hard counts as lapse'],
  [/\/\/ 不再使用（已改用 Anki 平均规则）/g, '// deprecated (Anki average rule used instead)'],
  [/\/\/ 当日移出阈值/g, '// daily removal threshold'],
  [/\/\/ 累计挂起阈值（使用 lapses_total）/g, '// cumulative suspend threshold (uses lapses_total)'],
  [/\/\/ T1→T7 过渡（Phase 2 启用）/g, '// T1→T7 transition (Phase 2)'],
  [/\/\/ 提前出题窗口（对应 Anki "Learn Ahead Limit"，秒）/g, '// learn-ahead window (Anki "Learn Ahead Limit", seconds)'],
  [/\/\/ 主队列耗尽后，due_ts 在此窗口内的 learning 卡才追加出题/g, '// after main queue is exhausted, only learning cards with due_ts within this window are added'],
  [/\/\/ 默认 1200s = 20 分钟，与 Anki 默认一致/g, '// default 1200s = 20 min, matches Anki default'],
  [/\/\/ 练习模式：'normal'=普通（体验弧，20张）\| 'hard'=困难（SRS节律，30张上限）\| 'survival'=生存（清空积压）/g, "// practice modes: 'normal'=standard (arc, 20 cards) | 'hard'=challenging (SRS rhythm, 30 cap) | 'survival'=survival (clear backlog)"],

  // IDB comments
  [/\/\/ 已登录 → cloud user UUID；登出 → 最近一次登录的用户（持久化在 localStorage）；/g, '// logged in → cloud user UUID; logged out → last logged in user (persisted in localStorage);'],
  [/\/\/ 从未登录 → deviceId 兜底。用户切换时新登录自动覆盖。/g, '// never logged in → deviceId fallback. new login on user switch auto-overrides.'],

  // Sync comments
  [/\/\/ 唯一键冲突（23505）说明记录已在服务端存在，视为上传成功/g, '// unique key conflict (23505) = record already exists on server, treat as success'],
  [/\/\/ 标记已同步（写回 IndexedDB，供断线补传判断）/g, '// mark as synced (write back to IndexedDB for offline retry detection)'],
  [/\/\/ 上传成功 → 标记已同步/g, '// upload success → mark synced'],
  [/\/\/ 从云端下载其他设备的 CardState，合并到本地（跨设备进度同步）/g, '// download other devices CardState from cloud, merge locally (cross-device sync)'],
  [/\/\/ 策略：按 state_key 分组，取最新 updated_at，若比本地新则覆盖/g, '// strategy: group by state_key, pick latest updated_at, overwrite if newer than local'],
  [/\/\/ 先拉云端现有配置再合并本地改动（避免不同设备\/浏览器间的配置被冲掉）/g, '// pull cloud config first, then merge local changes (avoid overwriting cross-device config)'],
  [/\/\/ 收集本地 SRS 参数/g, '// collect local SRS params'],
  [/\/\/ 收集本地 UI 参数/g, '// collect local UI params'],
  [/\/\/ 先拉云端现有配置，合并后再推送（避免冲掉其他设备设置的参数）/g, '// pull cloud config first, merge then push (avoid overwriting other devices)'],
  [/\/\/ 从云端拉取参数配置并应用到本地/g, '// pull config from cloud and apply locally'],
  [/\/\/ 应用 SRS 参数/g, '// apply SRS params'],
  [/\/\/ 应用 UI 参数/g, '// apply UI params'],
  [/\/\/ 触发 UI 刷新/g, '// trigger UI refresh'],
  [/\/\/ 应用主题（兼容旧版 light\/dark 和新版 default\/jade\/amber\/dark）/g, '// apply theme (compat with old light/dark and new default/jade/amber/dark)'],
  [/\/\/ 支持模态进度条 \+ 语音播报 \+ 不同同步范围/g, '// supports modal progress + voice + scoped sync'],

  // runSync sub-comments
  [/\/\/ 1\. 上传 TrialLog（增量）/g, '// 1. upload TrialLog (incremental)'],
  [/\/\/ 2\. 参数配置同步/g, '// 2. config sync'],
  [/\/\/ 3\. 下载云端 CardState（增量合并）/g, '// 3. download cloud CardState (incremental merge)'],
  [/\/\/ 3\.5 拉取用户牌组练习天数/g, "// 3.5 pull user's deck practice days"],
  [/\/\/ 4\. 牌组同步（可选：登录后\/手动同步）/g, '// 4. deck sync (optional: after login / manual sync)'],
  [/\/\/ 5\. 事件日志（可选）/g, '// 5. event logs (optional)'],
  [/\/\/ 清理 & 标记/g, '// cleanup & mark'],
  [/\/\/ 结束/g, '// done'],

  // Offline re-upload
  [/\/\/ 断线补传：将未同步的 TrialLog \+ 最新 CardState 推送至云端/g, '// offline retry: push unsynced TrialLog + latest CardState to cloud'],
  [/\/\/ 1\. 补传未同步的 TrialLog（仅当前用户）/g, '// 1. retry unsynced TrialLog (current user only)'],
  [/\/\/ 2\. 补传当前牌组所有 CardState（upsert，安全重传）/g, '// 2. retry all CardState for current deck (upsert, safe retry)'],

  // Migration
  [/\/\/ 登录时将本设备离线记录迁移到当前用户（仅限 deviceId 匹配的）/g, '// migrate local offline records to current user on login (deviceId match only)'],

  // Log system
  [/\/\/ 等级优先级：URL \?log=debug > localStorage yihai_log_level > 默认 warn/g, '// priority: URL ?log=debug > localStorage yihai_log_level > default warn'],
  [/\/\/ IDB 写入：info 及以上；console 彩色输出：全等级可见（取决于当前等级）/g, '// IDB write: info+; console color output: all levels visible (depends on current level)'],
  [/\/\/ DevTools 工具：window\.yhLog\.setLevel \/ show \/ showErrors \/ clear \/ export/g, '// DevTools: window.yhLog.setLevel / show / showErrors / clear / export'],

  // Telemetry
  [/\/\/ 仅写入 IndexedDB，不立即上传（避免与 syncAppEvents 竞态产生 409）/g, '// write to IndexedDB only, don’t upload immediately (avoid 409 race with syncAppEvents)'],
  [/\/\/ 设备注册（非阻塞）/g, '// device registration (non-blocking)'],
  [/\/\/ 23505 = 记录已存在（重复上传，视为成功）/g, '// 23505 = record exists (duplicate upload, treat as success)'],
  [/\/\/ 批量补传 AppEvents（含 warn\/error 诊断日志）/g, '// batch retry AppEvents (including warn/error diagnostic logs)'],
  [/\/\/ 读取未同步业务事件/g, '// read unsynced business events'],
  [/\/\/ 上传业务事件，收集成功 ID/g, '// upload business events, collect success IDs'],
  [/\/\/ 单事务批量写回 synced_at（修复 markEventSynced 遗漏）/g, '// batch write synced_at in single transaction (fix markEventSynced omission)'],
  [/\/\/ 上传 warn\/error 诊断日志（封装为 app_events 格式）/g, '// upload warn/error diagnostic logs (wrapped as app_events format)'],
  [/\/\/ 裁剪 store 到指定条数（保留最新）/g, '// trim store to specified count (keep latest)'],
  [/\/\/ 按 timestamp 升序（最旧在前），删 excess 条/g, '// sort by timestamp ascending (oldest first), delete excess'],
  [/\/\/ 清理过期日志（app_events 30 天）/g, '// clean expired logs (app_events 30 days)'],

  // CardState
  [/\/\/ 仅写本地，不覆写 updated_at，不上传云端（用于云端进度回传的合并写入）/g, '// local write only, don\'t overwrite updated_at, don\'t upload (merge write for cloud progress backfill)'],
  [/\/\/ Playwright test seam（_playwright_multi_user_sync_test\.js 通过 page\.evaluate 调用）/g, '// Playwright test seam (_playwright_multi_user_sync_test.js called via page.evaluate)'],
  [/\/\/ ── TrialLog 写入 ────────────────────────────────────────────────/g, '// ── TrialLog write ──────────────────────────────────────────────'],
  [/\/\/ 读取指定天数内的 TrialLog（按 timestamp 升序）/g, '// read TrialLog within specified days (ascending by timestamp)'],

  // processAnswer
  [/\/\/ ── SM-2 processAnswer 状态机 ────────────────────────────────────/g, '// ── SM-2 processAnswer state machine ────────────────────────────'],
  [/\/\/ 返回更新后的 state（不自动保存，调用方负责 saveCardState）/g, '// returns updated state (caller responsible for saveCardState)'],

  // Learning stage
  [/\/\/ ease_factor 保持 starting_ease，learning 阶段挣扎不影响毕业值/g, '// ease_factor stays at starting_ease, learning-stage struggle doesn\'t affect graduation value'],
  [/\/\/ Phase 2 启用；Phase 1 review_mode 始终维持 'T1'/g, "// Phase 2 enabled; Phase 1 review_mode always stays 'T1'"],
  [/\/\/ 此处仅递增计数，切换逻辑 Phase 2 接入/g, '// only increments count here, switch logic in Phase 2'],

  // Step delay
  [/\/\/ step_index 不变。延迟 = Anki 规则：第一步取\(当前+下一步\)\/2，后续不变/g, '// step_index unchanged. delay = Anki rule: first step = (current+next)/2, subsequent unchanged'],

  // Relearning
  [/\/\/ review_mode \/ review_mode_count 保留（重学完成后恢复）/g, '// review_mode / review_mode_count preserved (restored after relearning)'],
  [/\/\/ 重新毕业：保持 lapse 后缩减的 interval 值/g, '// re-graduate: keep interval reduced after lapse'],
  [/\/\/ review_mode \/ review_mode_count 已保留，直接恢复/g, '// review_mode / review_mode_count preserved, restore directly'],

  // Daily progress
  [/\/\/ 新的一天，重置/g, '// new day, reset'],

  // Session mode
  [/\/\/ ── 练习模式：难度曲线工具函数 ──────────────────────────────────────/g, '// ── practice mode: difficulty curve utilities ────────────────────────'],
  [/\/\/ learning\/relearning 阶段难度未知或正在重学，归入中间段/g, '// learning/relearning: unknown difficulty or in-relearning, place in middle'],
  [/\/\/ 将队列重排为"前易→中难→后易"穹顶曲线/g, '// reorder queue as "easy→hard→easy" dome curve'],
  [/\/\/ 普通模式：固定20张上限，hard卡不超过25%，结果过曲线/g, '// normal mode: fixed 20 card cap, hard cards ≤25%, then apply curve'],

  // buildSessionQueue
  [/\/\/ 返回当日练习队列（card 对象列表，含 _srsState 字段）/g, '// returns today practice queue (card objects with _srsState field)'],
  [/\/\/ 练习启动完全不碰网络，用本地数据直接构建队列/g, '// practice start: no network access, build queue from local data directly'],
  [/\/\/ 确保每张卡都有 CardState（仅写本地，不上传云端——/g, '// ensure each card has CardState (local write only, no cloud upload —'],
  [/\/\/ 此处的 new 状态只是队列构建所需的临时初始值，/g, "// 'new' state here is just a temp initial value for queue building,"],
  [/\/\/ 真实状态由用户答题后的 _writeSrs → processAnswer 产生并同步）/g, '// real state is produced & synced by _writeSrs → processAnswer after user answers'],
  [/\/\/ 修复 learning\/relearning 卡 due_ts=0 的异常数据/g, "// fix learning/relearning cards with due_ts=0 (edge case)"],
  [/\/\/ （根因待查。兜底：设 due_ts=1 使其立即到期，而非永久跳过）/g, '// (root cause unknown. fallback: set due_ts=1 to make it due immediately)'],

  // Queue phases
  [/\/\/ 1\. 到期 review 卡（due_date <= today），oldest first/g, '// 1. due review cards (due_date <= today), oldest first'],
  [/\/\/ 2\. 到期 relearning 卡（due_ts <= now）/g, '// 2. due relearning cards (due_ts <= now)'],
  [/\/\/ 3\. 到期 learning 卡（due_ts <= now，包括 new 状态已经发过的）/g, '// 3. due learning cards (due_ts <= now, including new state cards already shown)'],
  [/\/\/ 已用 review 槽位（含当日已练的 learning\/relearning\/review）/g, '// used review slots (includes today learning/relearning/review)'],
  [/\/\/ 合并主队列（review \+ relearning \+ learning），按槽位上限截取/g, '// merge master queue (review + relearning + learning), cap by slot limit'],
  [/\/\/ 4\. 新卡：受两个上限约束/g, '// 4. new cards: bounded by two limits'],
  [/\/\/ 组装完整队列（生存\/困难模式基础队列），附上 _srsState/g, '// assemble full queue (survival/hard base queue), attach _srsState'],
  [/\/\/ 按练习模式决定最终队列/g, '// final queue determined by practice mode'],
  [/\/\/ survival：现有队列全量 + 曲线排列/g, '// survival: full existing queue + curve arrangement'],

  // Learning ahead
  [/\/\/ ── 获取 learning\/relearning 到期\/即将到期卡（主队列耗尽后追加）────/g, '// ── get due/almost-due learning/relearning cards (added after main queue exhausted) ──'],
  [/\/\/ 注意：learning\/relearning 卡答完后新 due_ts 可能落在本 session 内/g, '// note: learning/relearning cards may get new due_ts within this session after answering'],
  [/\/\/ （hard 不改步长、again 重置到第一步），此时 due_ts ≤ now 仍需出题/g, "// (hard doesn't change step, again resets to step 1), due_ts ≤ now still needs to be shown"],

  // Deck stats
  [/\/\/ ── 首页 deck stats（读真实 CardState）───────────────────────────/g, '// ── home deck stats (read real CardState) ──────────────────────────'],
  [/\/\/ 无 CardState 的卡片视为新卡（刚下载\/导入后未练习）/g, '// cards without CardState are considered new (just downloaded/imported, unpracticed)'],
  [/\/\/ 新卡数上限 = 不超过每日剩余可用新卡槽位/g, '// new card cap = remaining daily new card slots'],
  [/\/\/ 到期数上限 = 不超过每日剩余可用复习槽位（避免主页虚高）/g, '// due card cap = remaining daily review slots (avoid inflated home page count)'],

  // Device ID
  [/\/\/ ── 云端同步预埋：device_id ──────────────────────────────────────/g, '// ── cloud sync prep: device_id ──────────────────────────────────'],

  // Import deck storage
  [/\/\/ ── 导入牌组存储（localStorage \+ 内存）─────────────────────────/g, '// ── imported deck storage (localStorage + memory) ─────────────────'],
  [/\/\/ 内部卡片格式：\{ id, img, name, options:\[4项\], correct:0-3, details:\[\] \}/g, '// internal card format: { id, img, name, options:[4], correct:0-3, details:[] }'],
  [/\/\/ options 和 correct 在 getDeck\(\) 时动态生成，img 为 blob URL/g, '// options and correct generated dynamically by getDeck(), img = blob URL'],

  // Variable comments
  [/\/\/ key → cards\[\]，运行时填充/g, '// key → cards[], populated at runtime'],
  [/\/\/ \[\{ key, name \}\]，运行时从 localStorage 恢复/g, '// [{ key, name }], restored from localStorage at runtime'],
  [/\/\/ 备用词库：牌组卡片不足4张时补充干扰项/g, '// fallback pool: supplement distractors when deck has <4 cards'],
  [/\/\/ 内置测试牌组（Emoji 图片，无需导入，始终存在）/g, '// built-in test deck (Emoji images, no import needed, always present)'],
  [/\/\/ 运行时生成 options \+ correct（始终生成4个选项供 OPT_COUNT 取用）/g, '// runtime generates options + correct (always 4 options for OPT_COUNT selection)'],
  [/\/\/ 返回 \{ options:\[\{name,cardId\}\], correct:0 \}/g, '// returns { options:[{name,cardId}], correct:0 }'],
  [/\/\/ 从同牌组构建带 id 的候选池/g, '// build candidate pool with IDs from same deck'],
  [/\/\/ 同牌组不足3个时从备用词库补充（无 id，用 null）/g, '// when same deck has <3 cards, supplement from fallback pool (no id, use null)'],

  // localStorage
  [/\/\/ ── localStorage 持久化 ──────────────────────────────────────────/g, '// ── localStorage persistence ──────────────────────────────────────'],
  [/\/\/ 内置牌组不存/g, '// built-in decks not persisted'],
  [/\/\/ ── IndexedDB 媒体缓存 ───────────────────────────────────────────/g, '// ── IndexedDB media cache ─────────────────────────────────────────'],
  [/\/\/ ── 媒体文件检查与清理 ──────────────────────────────────────────────/g, '// ── media file check & cleanup ────────────────────────────────────'],

  // Media cleanup
  [/\/\/ 1\. 获取 IndexedDB 中所有 blob key/g, '// 1. get all blob keys from IndexedDB'],
  [/\/\/ 2\. 构建预期 key 集合（所有牌组 × 所有卡片）/g, '// 2. build expected key set (all decks × all cards)'],
  [/\/\/ 3\. 找出孤立 key/g, '// 3. find orphaned keys'],
  [/\/\/ 4\. 计算大小（只加载孤立文件）/g, '// 4. calculate size (only load orphan files)'],

  // restoreDecks
  [/\/\/ 兼容旧数据：未标记 source 的按云端同步戳推断/g, '// compat: infer source from cloud sync timestamp for unmarked data'],
  [/\/\/ 迁移：旧格式的 imgUrl\/audUrl 映射到 _imgUrl\/_audUrl/g, '// migrate: old format imgUrl/audUrl → _imgUrl/_audUrl'],
  [/\/\/ 从 IndexedDB 恢复图片/g, '// restore images from IndexedDB'],
  [/\/\/ 从 IndexedDB 恢复录音/g, '// restore audio from IndexedDB'],
  [/\/\/ 始终注入内置测试牌组/g, '// always inject built-in test deck'],
  [/\/\/ 恢复云端练习天数缓存/g, '// restore cloud practice days cache'],

  // .yhspack import
  [/\/\/ ── \.yhspack 导入 ────────────────────────────────────────────────/g, '// ── .yhspack import ──────────────────────────────────────────────'],
  [/\/\/ 图片（按扩展名推导 MIME，支持 PNG\/WebP\/GIF）/g, '// image (derive MIME from extension, supports PNG/WebP/GIF)'],
  [/\/\/ 录音/g, '// audio'],
  [/\/\/ 写入内存/g, '// write to memory'],
  [/\/\/ 更新或追加 meta/g, '// update or append meta'],
  [/\/\/ 持久化（只存 id+name，blob URL 不存）/g, '// persist (id+name only, blob URL not stored)'],
  [/\/\/ 刷新首页列表，选中刚导入的牌组/g, '// refresh home list, select the just-imported deck'],

  // Parameter variables
  [/\/\/ 练习模式倒计时（毫秒），0=手动/g, '// practice mode countdown (ms), 0=manual'],
  [/\/\/ 浏览模式倒计时（毫秒），0=手动/g, '// browse mode countdown (ms), 0=manual'],
  [/\/\/ 练习答案播报延迟（毫秒）/g, '// practice answer speech delay (ms)'],
  [/\/\/ 浏览答案播报延迟（毫秒）/g, '// browse answer speech delay (ms)'],
  [/\/\/ 答题提示/g, '// quiz prompt'],
  [/\/\/ 答题提示开关/g, '// quiz prompt toggle'],
  [/\/\/ 答题提示延迟（毫秒）/g, '// quiz prompt delay (ms)'],
  [/\/\/ 答题提示文案（i18n 默认英文，loadPhrases 后覆盖）/g, '// quiz prompt text (i18n default English, overridden by loadPhrases)'],
  [/\/\/ 选项提示/g, '// option hint'],
  [/\/\/ 选项提示开关/g, '// option hint toggle'],
  [/\/\/ 选项提示延迟（毫秒）/g, '// option hint delay (ms)'],
  [/\/\/ 答错提示/g, '// wrong hint'],
  [/\/\/ 答错提示开关/g, '// wrong hint toggle'],
  [/\/\/ 朗读物品提示/g, '// read item name hint'],
  [/\/\/ 朗读物品提示开关（浏览\/练习均受控）/g, '// read item name toggle (browse + practice)'],

  // TTS
  [/\/\/ TTS 音色参数/g, '// TTS voice params'],
  [/\/\/ 语速/g, '// rate'],
  [/\/\/ 音调/g, '// pitch'],
  [/\/\/ 音色名称，空=自动选中文音色/g, '// voice name, empty=auto-select Chinese voice'],
  [/\/\/ 防误触：手指按住至少多少ms才算有效点击（毫秒）/g, '// touch guard: minimum press duration for valid tap (ms)'],

  // More variables
  [/\/\/ 浏览模式答案显示延迟/g, '// browse mode answer display delay'],
  [/\/\/ 毫秒/g, ' // ms'],
  [/\/\/ 答对反馈/g, '// correct answer feedback'],
  [/\/\/ 撒花动画开关/g, '// confetti animation toggle'],
  [/\/\/ 回答正确语音开关/g, '// correct answer speech toggle'],

  // Timer comments
  [/\/\/ 进入题目时的语音计时器/g, '// speech timers for card prompts'],
  [/\/\/ 答案播报延迟 timer/g, '// answer speech delay timer'],
  [/\/\/ 每次进入练习页自增，语音链检查id终止跨页面播报/g, '// increments per quiz entry, speech chain checks id to stop cross-page speech'],
  [/\/\/ 最近一次 _writeSrs 的 Promise，用于等待写完/g, '// most recent _writeSrs Promise, for awaiting completion'],
  [/\/\/ 防止重复点击开始练习/g, '// prevent duplicate start-practice clicks'],

  // Practice mode SRS
  [/\/\/ ── 练习模式 SRS 状态 ──────────────────────────────────────────/g, '// ── practice mode SRS state ────────────────────────────────────'],
  [/\/\/ 当前卡片显示时间戳（response_time 计算用）/g, '// current card display timestamp (for response_time calc)'],
  [/\/\/ 本题最终评分（'again'\|'hard'\|'good'\|'easy'）/g, "// final rating for this card ('again'|'hard'|'good'|'easy')"],
  [/\/\/ 本次 session 唯一 ID（TrialLog 用）/g, '// unique session ID (TrialLog use)'],
  [/\/\/ 按卡·首次评级统计（用于完成页展示）/g, '// per-card first rating stats (for finish screen)'],
  [/\/\/ state_key → 首次 rating/g, '// state_key → first rating'],
  [/\/\/ \{ deckKey::cardId: true \} 当日保护移出的卡/g, '// { deckKey::cardId: true } cards removed today by daily_remove_lapses'],
  [/\/\/ 活跃时长计算/g, '// active duration calculation'],

  // Card state / attempt
  [/\/\/ 待写入 SRS 的 attempt 信息（onSel 记录，revealAnswer 写入）/g, '// pending SRS attempt info (recorded by onSel, written by revealAnswer)'],
  [/\/\/ 释放 ObjectURL 防止内存泄漏/g, '// revoke ObjectURL to prevent memory leak'],
  [/\/\/ 如果详情屏正在显示此牌组，同步更新名称/g, '// if deck detail screen is showing this deck, sync name update'],
  [/\/\/ ── getDeckStats：同步占位，updateDeckStats 异步覆盖 ─────────/g, '// ── getDeckStats: sync placeholder, updateDeckStats async overwrite ──'],
  [/\/\/ ── WakeLock 防锁屏 ────────────────────────────────────────────/g, '// ── WakeLock (prevent screen lock) ──────────────────────────────'],
  [/\/\/ 页面重新可见时（从后台切回）重新申请/g, '// re-acquire when page becomes visible again (switched from background)'],
  [/\/\/ ── 照护者模式 ─────────────────────────────────────────────────/g, '// ── caregiver mode ───────────────────────────────────────────────'],

  // Card creator
  [/\/\/ ── 制卡表单 ─────────────────────────────────────────/g, '// ── card creator form ────────────────────────────────────'],
  [/\/\/ 填充牌组下拉/g, '// populate deck dropdown'],
  [/\/\/ 当前牌组（含测试牌组）但排除 builtin（测试牌组不可编辑）/g, '// current decks (including test deck) but exclude builtin (test deck not editable)'],
  [/\/\/ 实际上允许所有牌组，但 builtin 只读问题由 save 时处理/g, '// actually allow all decks, builtin read-only handled at save time'],
  [/\/\/ 先添加非内置牌组/g, '// add non-built-in decks first'],
  [/\/\/ 内置牌组特殊处理 — 作为不可用提示/g, '// built-in deck special handling — show as unavailable'],
  [/\/\/ 如果有 preselect 参数，选中对应牌组/g, '// if preselect parameter given, select that deck'],
  [/\/\/ 重置表单/g, '// reset form'],
  [/\/\/ 聚焦首页确保选中态消失/g, '// focus home to ensure selection state clears'],
  [/\/\/ 处理新建牌组/g, '// handle new deck creation'],
  [/\/\/ 往选择器插入新选项并选中/g, '// insert new option into selector and select it'],
  [/\/\/ 查找牌组名/g, '// lookup deck name'],
  [/\/\/ 生成卡片 ID/g, '// generate card ID'],
  [/\/\/ 语言自动检测/g, '// auto-detect language'],
  [/\/\/ 默认中文/g, '// default Chinese'],
  [/\/\/ 详情 — 按行分割/g, '// details — split by line'],
  [/\/\/ 构建卡片/g, '// build card'],
  [/\/\/ 保存图片/g, '// save image'],
  [/\/\/ 保存录音/g, '// save audio'],
  [/\/\/ 加入牌组/g, '// add to deck'],
  [/\/\/ 持久化/g, '// persist'],
  [/\/\/ 等待所有媒体保存完成/g, '// wait for all media saves to complete'],
  [/\/\/ 刷新首页牌组列表/g, '// refresh home deck list'],
  [/\/\/ 是否继续添加/g, '// continue adding?'],
  [/\/\/ 清空表单，保留牌组选择/g, '// clear form, keep deck selection'],

  // Export
  [/\/\/ ── \.yhspack 导出 ────────────────────────────────────────────────/g, '// ── .yhspack export ──────────────────────────────────────────────'],
  [/\/\/ 优先从 IndexedDB 取媒体（用户创建\/导入的卡片）/g, '// prefer media from IndexedDB (user-created/imported cards)'],
  [/\/\/ 内联或网络图片：用 URL 引用/g, '// inline or network images: reference by URL'],
  [/\/\/ 生成 \.yhspack 并分享/g, '// generate .yhspack and share'],
  [/\/\/ 降级为下载/g, '// fallback to download'],

  // Mode routing
  [/\/\/ 练习模式：使用 SRS 队列/g, '// practice mode: use SRS queue'],

  // Deck detail
  [/\/\/ ── 牌组详情屏 ─────────────────────────────────────────────────/g, '// ── deck detail screen ───────────────────────────────────────────'],
  [/\/\/ ── 卡片列表 ───────────────────────────────────────────────────/g, '// ── card list ────────────────────────────────────────────────────'],
  [/\/\/ ── 卡片重命名 ─────────────────────────────────────────────────/g, '// ── card rename ──────────────────────────────────────────────────'],
  [/\/\/ ── 卡片删除 ─────────────────────────────────────────────────/g, '// ── card delete ──────────────────────────────────────────────────'],
  [/\/\/ ── 自定义输入对话框 ───────────────────────────────────────────/g, '// ── custom input dialog ──────────────────────────────────────────'],
  [/\/\/ 等待最后一次 SRS 写入完成，再渲染首页（避免显示写入前的旧数据）/g, '// wait for last SRS write, then render home (avoid stale data)'],

  // Card prompts
  [/\/\/ 进入题目后启动语音提示序列/g, '// start speech prompt sequence after entering a card'],
  [/\/\/ 第一阶段：答题提示/g, '// Phase 1: quiz prompt'],
  [/\/\/ 第二阶段：选项提示（在答题提示延迟基础上再等OPT_HINT_DELAY）/g, '// Phase 2: option hint (waits additional OPT_HINT_DELAY after quiz prompt)'],

  // i18n
  [/\/\/ ── i18n 地基（阶段 0）──────────────────────────────────────────/g, '// ── i18n foundation (phase 0) ────────────────────────────────────'],
  [/\/\/ 切换语言后重置语音提示文案为当前语言默认值/g, '// reset voice prompts to current locale defaults on language switch'],

  // kana detection
  [/\/\/ 平\/片假名（先于汉字）/g, '// hiragana/katakana (before CJK)'],

  // Audio / speech utilities
  [/\/\/ 解锁 TTS 引擎/g, '// unlock TTS engine'],
  [/\/\/ 解锁 Audio 播放权限（iOS 需要 gesture 内产生一次真实音频上下文）/g, '// unlock Audio playback (iOS requires a real audio context within gesture)'],
  [/\/\/ 部分 iOS 版本还需要 HTMLAudioElement play 一次/g, '// some iOS versions also need HTMLAudioElement play once'],
  [/\/\/ 播放答案语音：优先录音，无录音降级 TTS/g, '// play answer speech: prefer recording, fallback TTS'],
  [/\/\/ speak 不带 cancel，避免打断刚恢复的引擎/g, '// speak without cancel, avoid interrupting just-restored engine'],
  [/\/\/ session已切换，终止/g, '// session switched, abort'],

  // Option hint parsing
  [/\/\/ 选项提示：把文案中的\{A\}\{B\}\{C\}\{D\}替换为实际选项后依次播报/g, '// option hint: replace {A}{B}{C}{D} with actual options and speak sequentially'],
  [/\/\/ 选项提示：解析文案中的 \{A\}\{B\}\{C\} 和停顿符 \.（一个\.=400ms）/g, '// option hint: parse {A}{B}{C} and pause char . (one .=100ms)'],
  [/\/\/ 示例文案：请在\{A\}\.\{B\}\.\{C\}中选择一个/g, '// example: "Choose from {A}.{B}.{C}"'],
  [/\/\/ 每个 \. 的停顿时长/g, '// pause duration per .'],
  [/\/\/ 第一步：把通配符替换为实际选项文字/g, '// step 1: replace wildcards with actual option text'],
  [/\/\/ 移除未被替换的多余通配符/g, '// remove unreplaced wildcards'],
  [/\/\/ 第二步：按停顿符 \. 拆分成片段/g, '// step 2: split into segments by pause char .'],
  [/\/\/ 第三步：顺序播报，pause 片段用 setTimeout 插入停顿/g, '// step 3: sequential playback, pause segments use setTimeout'],

  // Anki counter
  [/\/\/ ── Anki 三色计数器（新卡蓝 + 学习中橙 + 复习绿）────────────────/g, '// ── Anki three-color counter (new=blue + learning=orange + review=green) ─'],

  // Quiz rendering
  [/\/\/ 从剩余队列统计（qIdx 之后的卡，含当前卡）/g, '// stat from remaining queue (cards after qIdx, incl current)'],
  [/\/\/ 记录卡片显示时间，用于 response_time_ms/g, '// record card display time for response_time_ms'],
  [/\/\/ 立即清除上一张的答案状态，防止浏览模式翻页闪现/g, '// immediately clear previous answer state, prevent flash on browse nav'],
  [/\/\/ img 字段：URL（blob\/http\/data）用 <img>，Emoji 或空值用 textContent/g, '// img field: URL (blob/http/data) → <img>, Emoji or empty → textContent'],
  [/\/\/ 平板上横版图片（如16:9家庭照）使用原始比例，最大化图片区/g, '// landscape images on tablet (e.g. 16:9 family photos) use original ratio, max image area'],
  [/\/\/ options 格式：\[\{name, cardId\}\]/g, '// options format: [{name, cardId}]'],
  [/\/\/ TrialLog distractor_chosen 用/g, '// for TrialLog distractor_chosen field'],
  [/\/\/ 防误触：touchstart 记录按下时间，touchend 判断是否达到阈值/g, '// touch guard: touchstart records press time, touchend checks threshold'],
  [/\/\/ PC 鼠标点击正常触发（无防误触需求）/g, '// PC mouse click triggers normally (no touch guard needed)'],
  [/\/\/ 选项区高度随 viewport 高度等比缩放/g, '// option area height scales proportionally with viewport'],
  [/\/\/ 传入实际显示的选项文字，供选项提示使用/g, '// pass actual option text for option hint speech'],
  [/\/\/ 下一张按钮立即显示/g, '// show next button immediately'],
  [/\/\/ 答案面板预填充但不显示/g, '// prefill answer panel but keep hidden'],

  // Answer flow
  [/\/\/ 语音开始播放的同时，启动文字显示计时/g, '// start text display timer alongside speech playback'],
  [/\/\/ 恢复transition，让show动画正常播放/g, '// restore transition for show animation'],
  [/\/\/ 语音播完后启动倒计时/g, '// start countdown after speech ends'],
  [/\/\/ ── 答对 ──────────────────────────────────────────────────/g, '// ── correct ──────────────────────────────────────────────'],
  [/\/\/ T1 评分映射：第1次正确→Good，第2次正确（第1次答错过）→Hard/g, '// T1 rating mapping: 1st correct→Good, 2nd correct (after 1st wrong)→Hard'],
  [/\/\/ ── 答错 ──────────────────────────────────────────────────/g, '// ── wrong ────────────────────────────────────────────────'],
  [/\/\/ 记录本次误选的 card id（供 TrialLog distractor_chosen 字段）/g, '// record the wrongly selected card id (for TrialLog distractor_chosen)'],
  [/\/\/ 第二次答错 → Again/g, '// 2nd wrong → Again'],

  // SRS write
  [/\/\/ ── SRS 写入（练习模式）──────────────────────────────────────/g, '// ── SRS write (practice mode) ────────────────────────────'],
  [/\/\/ 立即清除答案面板，禁止transition防止淡出期间闪现新内容/g, '// immediately clear answer panel, disable transition to prevent flash'],
  [/\/\/ ── 练习模式：检查 _pendingStop，以及是否还有下一题 ──────────/g, '// ── practice mode: check _pendingStop and next card ────'],
  [/\/\/ 时长保护：limit 模式下当前卡答完后强制停止/g, '// duration guard: force stop after current card in limit mode'],
  [/\/\/ 主队列耗尽 → 检查是否有未到期 learning 卡可追加/g, '// main queue exhausted → check for not-yet-due learning cards to add'],
  [/\/\/ 追加到队列末尾，继续出题（步长时间压缩，可接受近似）/g, '// append to queue end, continue (step time compressed, acceptable approximation)'],
  [/\/\/ 无任何卡片 → session 结束/g, '// no cards → session ends'],

  // _writeSrs comments
  [/\/\/ ── SRS 写入（练习模式专用）───────────────────────────────────/g, '// ── SRS write (practice mode specific) ────────────────────────────'],
  [/\/\/ 活跃时长记录（在 SRS 更新之前）/g, '// record active duration (before SRS update)'],
  [/\/\/ 当日移出保护：lapses_streak 已达阈值，今天跳过此卡（任何评分）/g, '// daily removal guard: lapses_streak threshold reached, skip this card today (any rating)'],
  [/\/\/ SM-2 状态快照（写入 TrialLog 用）/g, '// SM-2 state snapshot (for TrialLog write)'],
  [/\/\/ 更新 CardState/g, '// update CardState'],
  [/\/\/ 更新内存中的 _srsState（供后续答题参考）/g, '// update in-memory _srsState (for subsequent card answers)'],
  [/\/\/ 当日移出保护：连续失败达到 daily_remove_lapses/g, '// daily removal guard: consecutive failures hit daily_remove_lapses'],
  [/\/\/ 自动挂起：lapses_total 达到 auto_suspend_lapses/g, '// auto-suspend: lapses_total hits auto_suspend_lapses'],
  [/\/\/ DailyProgress 更新（每卡每日只计首次，learning 步骤重出不重复计数）/g, '// DailyProgress update (count once per card per day, learning step repeats excluded)'],
  [/\/\/ 按卡·首次评级统计（本次 session）/g, '// per-card first rating (current session)'],
  [/\/\/ 选择题展示的所有选项 cardId/g, '// all option cardIds shown for this question'],
  [/\/\/ Phase 2：需要卡片 category 字段/g, '// Phase 2: needs card category field'],
  [/\/\/ 云端同步在 writeTrialLog \/ saveCardState 中静默触发/g, '// cloud sync triggered silently in writeTrialLog / saveCardState'],

  // Finish screen
  [/\/\/ ── 完成界面 ──────────────────────────────────────────────────/g, '// ── finish screen ────────────────────────────────────────────────'],
  [/\/\/ 按卡·首次评级统计/g, '// per-card first rating stats'],
  [/\/\/ 练习完成后集中补传/g, '// batch upload after practice completes'],

  // Active duration
  [/\/\/ ── 活跃时长记录（练习模式）──────────────────────────────────/g, '// ── active duration tracking (practice mode) ────────────────────'],
  [/\/\/ ── visibilitychange：切后台时重置 idle 计时，避免虚报活跃时长 ──/g, '// ── visibilitychange: reset idle timer on background switch, avoid false active time ──'],
  [/\/\/ 0 = 手动模式，不启动倒计时/g, '// 0 = manual mode, no countdown'],

  // Settings
  [/\/\/ 填充音色下拉列表（中文优先，其余附后）/g, '// populate voice dropdown (Chinese first, others appended)'],
  [/\/\/ 朗读物品提示/g, '// read item hint'],
  [/\/\/ 答题提示/g, '// quiz prompt'],
  [/\/\/ 选项提示/g, '// option hint'],
  [/\/\/ 答错提示/g, '// wrong hint'],
  [/\/\/ 浏览答案延迟 \/ 答对反馈/g, '// browse answer delay / correct feedback'],
  [/\/\/ TTS 音色参数/g, '// TTS voice params'],
  [/\/\/ 答案播报延迟/g, '// answer speech delay'],
  [/\/\/ 选项数量 \/ 倒计时 \/ 防误触/g, '// option count / countdown / touch guard'],
  [/\/\/ NDUR 优先用 localStorage，其次跟随 SRS_CONFIG\.practice_advance_sec/g, '// NDUR prefers localStorage, falls back to SRS_CONFIG.practice_advance_sec'],

  // Settings panel populating
  [/\/\/ 开关同步/g, '// toggle sync'],
  [/\/\/ 文案同步/g, '// phrase sync'],
  [/\/\/ 浏览答案延迟 \/ 答对反馈/g, '// browse answer delay / correct feedback'],
  [/\/\/ TTS 参数同步/g, '// TTS param sync'],
  [/\/\/ 音色列表在语音列表加载后填充/g, '// voice list populated after voice list loads'],
  [/\/\/ 选项数量/g, '// option count'],
  [/\/\/ 延迟滑块同步/g, '// delay slider sync'],
  [/\/\/ CSS var 滑块同步/g, '// CSS var slider sync'],

  // Media helpers
  [/\/\/ 创建 ObjectURL，自动 revoke 旧的（防泄漏）/g, '// create ObjectURL, auto-revoke old (leak prevention)'],
  [/\/\/ 并发限制辅助函数：最多 limit 个异步任务并行/g, '// concurrency limiter: max limit async tasks in parallel'],

  // syncDeckFromCloud
  [/\/\/ 1\. 通过 server_deck_cards 获取该牌组的 card_id 列表（按排序）/g, '// 1. get card_id list for deck via server_deck_cards (ordered)'],
  [/\/\/ 2\. 查询 cards_pool 获取卡片详情和媒体路径/g, '// 2. query cards_pool for card details and media paths'],
  [/\/\/ 按 sort_order 排列/g, '// order by sort_order'],
  [/\/\/ 3\. 生成 deck key/g, '// 3. generate deck key'],
  [/\/\/ 4\. 下载媒体并组装卡片（并发 3 路，卡内图音并行）/g, '// 4. download media and assemble cards (concurrency 3, image+audio parallel per card)'],
  [/\/\/ 记录同步时间戳/g, '// record sync timestamp'],
  [/\/\/ 4\. 写入内存 + 持久化/g, '// 4. write to memory + persist'],
  [/\/\/ 5\. 刷新 UI（切换到新牌组）/g, '// 5. refresh UI (switch to new deck)'],
  [/\/\/ noToast=true 表示从 runSync 内部调用，runSync 会在状态同步后统一调用 updateDeckStats\(\)/g, '// noToast=true means called from within runSync, which calls updateDeckStats() after state sync'],
  [/\/\/ 避免此处 IDB 状态未就绪时的竞态覆盖/g, '// avoid race overwrite when IDB state isn\'t ready yet'],
  [/\/\/ 媒体下载/g, '// media download'],
  [/\/\/ 1\. 拿服务器 card_id 列表（轻量，只传 ID）/g, '// 1. get server card_id list (lightweight, IDs only)'],
  [/\/\/ 2\. 读本地/g, '// 2. read local'],
  [/\/\/ 3\. 分类：新增（本地没有）、已有（本地存在）/g, '// 3. classify: new (not local), existing (local)'],
  [/\/\/ 4\. 对已有卡片：增量查询（只拉 updated_at > lastSyncAt 的）/g, '// 4. for existing cards: delta query (only pull updated_at > lastSyncAt)'],
  [/\/\/ 分批查询，避免 IN 列表过长（Supabase 限制）/g, '// batch query to avoid long IN lists (Supabase limit)'],
  [/\/\/ 首次同步（无 lastSyncAt）：已有卡片也全查/g, '// first sync (no lastSyncAt): query all existing cards too'],
  [/\/\/ 若 lastSyncAt 存在且 changedMap 为空 → 所有已有卡片均无变更/g, '// if lastSyncAt exists and changedMap is empty → no existing cards changed'],
  [/\/\/ 5\. 查询新增卡片的完整数据/g, '// 5. query complete data for new cards'],
  [/\/\/ 6\. 处理已有卡片：仅变更的才更新/g, '// 6. process existing cards: only update changed ones'],
  [/\/\/ 服务器有更新/g, '// server has update'],
  [/\/\/ 只在媒体 URL 不同时下载/g, '// only download if media URL differs'],
  [/\/\/ 无变更，直接保留/g, '// no change, keep as-is'],
  [/\/\/ 7\. 处理新增卡片（并发 3 路）/g, '// 7. process new cards (concurrency 3)'],
  [/\/\/ 8\. 删除同步：服务器已移除的卡片不同步保留（与 Anki 逻辑一致）/g, '// 8. delete sync: cards removed from server not kept locally (matches Anki)'],
  [/\/\/ 9\. 保存/g, '// 9. save'],
  [/\/\/ 标记为云端牌组/g, '// mark as cloud deck'],

  // Settings open/close
  [/\/\/ 每次打开时刷新音色列表，确保 iOS 语音包加载后能显示/g, '// refresh voice list on each open, ensure iOS voice packs show after loading'],
  [/\/\/ 关设置面板时立即推参数到云端/g, '// push config to cloud immediately when settings close'],

  // Theme / version
  [/\/\/ 高亮选中的主题卡/g, '// highlight selected theme card'],
  [/\/\/ 同步设置页深色模式开关/g, '// sync dark mode toggle in settings'],
  [/\/\/ 高亮当前主题/g, '// highlight current theme'],
  [/\/\/ 读取版本号/g, '// read version number'],

  // Init
  [/\/\/ 恢复主题 — 支持 default\/jade\/amber\/dark/g, '// restore theme — supports default/jade/amber/dark'],
  [/\/\/ 旧版 'light'\/'dark' 迁移/g, "// migrate old 'light'/'dark' settings"],
  [/\/\/ 1\. UI 初始化 — 立即渲染，不等待 Supabase CDN/g, '// 1. UI init — render immediately, don\'t wait for Supabase CDN'],
  [/\/\/ 2\. 云端初始化 — Supabase SDK 加载完成后执行/g, '// 2. cloud init — runs after Supabase SDK loads'],

  // Auth state listener
  [/\/\/ SDK auth 状态监听 — token 续签 \/ 过期登出时自动更新 UI/g, '// SDK auth state listener — auto-update UI on token refresh / expiry'],
  [/\/\/ _syncEnabled 仍 true → 非主动登出（doCloudLogout 已先置 false）/g, '// _syncEnabled still true → not active logout (doCloudLogout already set it false)'],
  [/\/\/ _sessionOffline 时保留 offline 模式，不覆盖（restoreCloudSession 已判为网络问题）/g, '// keep offline mode when _sessionOffline (restoreCloudSession already flagged network issue)'],
  [/\/\/ SDK 检测到 token 无法续签 → 静默登出, 显示登录表单/g, '// SDK detected token can\'t be refreshed → silent logout, show login form'],
  [/\/\/ 忽略 INITIAL_SESSION — restoreCloudSession 已处理/g, '// ignore INITIAL_SESSION — already handled by restoreCloudSession'],

  // initCloud
  [/\/\/ 等待 Supabase SDK 就绪后再 initCloud（defer 脚本在 inline 之后执行）/g, '// wait for Supabase SDK before initCloud (defer script runs after inline)'],
  [/\/\/ 若曾登录过，立即标记为恢复中，避免打开设置时闪"未登录"/g, '// if ever logged in, immediately mark as restoring to avoid flash of "not logged in"'],
  [/\/\/ SDK 超时加载失败（离线\/CDN 不可达）/g, '// SDK timeout (offline/CDN unreachable)'],

  // Stats screen
  [/\/\/ v4\.3  统计屏 \+ SRS 设置 Tab \+ 首页第三列/g, '// v4.3  stats screen + SRS settings tab + home 3rd column'],
  [/\/\/ ── 统计屏导航 ────────────────────────────────────────────────/g, '// ── stats screen nav ────────────────────────────────────────────'],
  [/\/\/ 清空缓存，强制从 IndexedDB 重新读取/g, '// clear cache, force re-read from IndexedDB'],
  [/\/\/ 等待最后一次 SRS 写入完成，确保读到最新状态/g, '// wait for last SRS write to ensure latest state'],

  // Stats Today
  [/\/\/ ── Tab 0：今日概况 ───────────────────────────────────────────/g, '// ── Tab 0: today overview ────────────────────────────────────────'],
  [/\/\/ 当跨设备同步已填充 dp 统计时优先使用（同步是练习完成\/手动\/切前台时触发，不在统计时拉云端）/g, '// prefer cross-device aggregated dp when synced (sync runs on practice complete/manual/foreground, not on stats open)'],
  [/\/\/ 使用同步后的跨设备汇总数据/g, '// use cross-device aggregated data after sync'],
  [/\/\/ 未同步：从本地 TrialLog 计算（仅当日）/g, '// not synced: calculate from local TrialLog (today only)'],
  [/\/\/ 近7天柱状图（每天练习卡片数）/g, '// 7-day bar chart (cards practiced per day)'],

  // Stats Decks
  [/\/\/ ── Tab 1：牌组概况 ───────────────────────────────────────────/g, '// ── Tab 1: deck overview ────────────────────────────────────────'],
  [/\/\/ 总卡片数用牌组实际大小，不受 CardState 是否同步影响/g, '// total cards from actual deck size, unaffected by CardState sync status'],
  [/\/\/ 待开始 = 总卡数 - 已知有状态的卡数（含无 CardState 的卡）/g, '// new = total cards - cards with known state (incl cards without CardState)'],
  [/\/\/ 练习天数 = 云端已计天数 + 本地未同步部分/g, '// practice days = cloud counted days + local unsynced portion'],
  [/\/\/ 补充本地未同步的新增天数/g, '// supplement local unsynced new days'],
  [/\/\/ 未来7天到期预测/g, '// 7-day due forecast'],

  // Stats Cards
  [/\/\/ ── Tab 2：卡片状态 ────────────────────────────────────────────/g, '// ── Tab 2: card state ────────────────────────────────────────────'],
  [/\/\/ 补充无 CardState 的卡片（从未答过，视为待开始），确保"全部"和其它筛选中都可见/g, '// add cards without CardState (never answered, treat as new), visible in "All" and other filters'],

  // Card detail
  [/\/\/ 状态标签（review 阶段按 interval 区分：< maximum_interval=复习中，>= 已掌握）/g, '// status label (review stage: interval < maximum_interval=In Review, >= Mastered)'],
  [/\/\/ 下次复习/g, '// next review'],
  [/\/\/ lapses 颜色/g, '// lapses color'],

  // Stats Log
  [/\/\/ ── Tab 3：练习记录 ────────────────────────────────────────────/g, '// ── Tab 3: practice log ──────────────────────────────────────────'],
  [/\/\/ getTrialLogs 已过滤 _retrying，升序排列；取最新100条倒序展示/g, '// getTrialLogs already filters _retrying, ascending; show latest 100 in reverse'],

  // Card detail panel
  [/\/\/ ── 卡片详情面板 ───────────────────────────────────────────────/g, '// ── card detail panel ────────────────────────────────────────────'],
  [/\/\/ 读 CardState/g, '// read CardState'],
  [/\/\/ 阶段显示/g, '// stage display'],
  [/\/\/ 下次预测（显示计算过程方便调试）/g, '// next prediction (show calculation for debugging)'],
  [/\/\/ 答题历史/g, '// answer history'],

  // Card reset
  [/\/\/ 用 newCardState 重建完整初始状态，不留任何历史字段/g, '// rebuild fresh CardState, no history fields retained'],
  [/\/\/ 仅解除挂起，保留所有 SRS 进度/g, '// just unsuspend, keep all SRS progress'],

  // SRS Settings tab
  [/\/\/ ── SRS 设置 Tab ─────────────────────────────────────────────/g, '// ── SRS settings tab ────────────────────────────────────────────'],
  [/\/\/ 学习\/重学步长输入（逗号分隔的分钟数数组）/g, '// learning/relearning steps input (comma-separated minutes array)'],
  [/\/\/ 解析每段：纯数字=分钟，支持 m\/h\/d（大小写不敏感）/g, '// parse each segment: number=minutes, supports m/h/d (case-insensitive)'],
  [/\/\/ 例：1m 10m 1h 1d → \[1, 10, 60, 1440\]/g, '// e.g. 1m 10m 1h 1d → [1, 10, 60, 1440]'],
  [/\/\/ hint：把分钟数转回易读格式显示（小写单位）/g, '// hint: convert minutes to readable format (lowercase unit)'],
  [/\/\/ Learn Ahead Limit 输入（m \/ h，存储为秒）/g, '// Learn Ahead Limit input (m/h, stored as seconds)'],
  [/\/\/ Anki 默认值预设/g, '// Anki default preset'],
  [/\/\/ 步骤输入框（数组转逗号分隔字符串，单位智能选择）/g, '// step input (array to comma-separated string with smart unit selection)'],
  [/\/\/ learn_ahead_limit（文本输入框）/g, '// learn_ahead_limit (text input)'],
  [/\/\/ 练习模式勾选/g, '// practice mode radio'],

  // SRS settings tab sync
  [/\/\/ SRS Tab 打开时同步一次（通过修改 openSettings 调用链实现）/g, '// sync once when SRS tab opens (via modified openSettings call chain)'],
  [/\/\/ ── 首页第三列（今日完成）─────────────────────────────────────/g, '// ── home 3rd column (today done) ─────────────────────────────────'],
  [/\/\/ 初始化左滑手势（仅一次）/g, '// init swipe gestures (once)'],
  [/\/\/ 滚动时关闭左滑卡片/g, '// close swiped cards on scroll'],

  // Swipe gestures
  [/\/\/ ── 左滑手势 ───────────────────────────────────────────────────/g, '// ── swipe gestures ──────────────────────────────────────────────'],
  [/\/\/ 鼠标点击：直接进详情（不绑定到 deck-card-inner — 事件委托已处理 tap）/g, '// mouse click: enter details directly (not bound to deck-card-inner — event delegation handles tap)'],
  [/\/\/ 如果左滑打开状态，先关闭不导航/g, '// if swipe is open, close without navigating'],

  // updateDeckStats
  [/\/\/ updateDeckStats：刷新到期和新卡两列/g, '// updateDeckStats: refresh due and new card columns'],
  [/\/\/ 失败时清空占位符，显示 0/g, '// clear placeholder on failure, show 0'],

  // Confirm dialog / Toast
  [/\/\/ ── 自制确认弹窗（替代 iOS PWA 被屏蔽的 confirm）─────────────/g, '// ── custom confirm dialog (replaces iOS PWA blocked confirm) ────'],
  [/\/\/ ── Toast 通用工具 ─────────────────────────────────────────────/g, '// ── Toast utilities ────────────────────────────────────────────'],
  [/\/\/ Service Worker 暂未启用（GitHub Pages App-Bound Domain 限制）/g, '// Service Worker disabled (GitHub Pages App-Bound Domain restriction)'],
  [/\/\/ 待绑定独立域名后恢复/g, '// restore after binding custom domain'],
  [/\/\/ 禁止长按右键菜单/g, '// disable long-press right-click menu'],

  // ── Early CSS inline comments (missed in first pass for index.html) ──
  [/\/\* iOS 长按菜单 \*\//g, '/* iOS long-press menu */'],
  [/\/\* 文字选中 \*\//g, '/* text selection */'],
  [/\/\* 设置页输入框恢复文字选中和输入 \*\//g, '/* restore text selection in settings inputs */'],
  [/\/\* 图片禁止拖拽和长按保存 \*\//g, '/* prevent image drag and long-press save */'],

  // ── Remaining Chinese comments from second pass ──
  [/\/\/ v4\.0  SRS 数据层/g, '// v4.0  SRS data layer'],
  [/\/\/ lapse 后 review 间隔乘数（0\.0 = 重置为 minimum_interval）/g, '// review interval multiplier after lapse (0.0 = reset to minimum_interval)'],
  [/\/\/ 媒体清理：暂存最近一次扫描的孤立 key/g, '// media cleanup: cache last orphan scan keys'],
  [/\/\/ 学习中实时上传开关/g, '// realtime upload toggle during learning'],
  [/\/\/ SDK 加载中或 session 恢复中，避免闪"未登录"/g, '// SDK loading or session restoring, avoid flashing "not logged in"'],
  [/\/\/ 防止重复注册 online 监听/g, '// prevent duplicate online listener registration'],
  [/\/\/ runSync 并发锁/g, '// runSync concurrency lock'],
  [/\/\/ 有凭证但网络失败，保留登录外观等待重连/g, '// has credentials but network failed, keep login appearance, wait for reconnect'],
  [/\/\/ 优先走 CDN/g, '// prefer CDN first'],
  [/\/\/ 回退到 Supabase Storage/g, '// fallback to Supabase Storage'],
  [/\/\/ 预读 localStorage token — 无需网络，可立即获得用户身份/g, '// pre-read localStorage token — no network needed, immediate user identity'],
  [/\/\/ 注意：Supabase SDK 用 projectRef（不含域名）作 key，需与 SDK 保持一致/g, '// note: Supabase SDK uses projectRef (no domain) as key, must match SDK'],
  [/\/\/ 如果 SDK key 已被清除（SDK 内部检测到过期后会清理），尝试自有备份/g, '// if SDK key cleared (SDK cleans on expiry detection), try own backup'],
  [/\/\/ 第1级：getSession\(\)（SDK 自动用 refresh_token 续签）/g, '// Level 1: getSession() (SDK auto-refreshes with refresh_token)'],
  [/\/\/ 第2级：手动 setSession（处理 SDK 读 localStorage 的竞态）/g, '// Level 2: manual setSession (handle SDK localStorage race)'],
  [/\/\/ 区分：Supabase 明确拒绝（400 \+ 凭证无效错误码）才视为真实登出；/g, '// distinguish: Supabase explicit rejection (400 + invalid credential code) = real logout;'],
  [/\/\/ 其余失败（网络、超时、message 为 undefined 等）一律走 offline 保留登录态。/g, '// other failures (network, timeout, undefined message) → offline, keep login state.'],
  [/\/\/ iOS PWA reload 后网络栈短暂不稳，refresh 请求容易失败但不代表账号失效。/g, '// iOS PWA reload has brief network instability, refresh may fail but account is valid.'],
  [/\/\/ Supabase 错误 message 可能是下划线（refresh_token_not_found）或空格（Refresh Token Not Found）/g, '// Supabase error message may be underscore (refresh_token_not_found) or spaced (Refresh Token Not Found)'],
  [/\/\/ 不确定失败 → offline 模式，等 online 事件自动重试/g, '// indeterminate failure → offline mode, wait for online event auto-retry'],
  [/\/\/ 真实登出（token 服务端已失效）：清除备份，直接返回，显示登录界面/g, '// real logout (token server-side invalid): clear backup, return, show login UI'],
  [/\/\/ 第3级：300ms 重试（CDN 竞态兜底）/g, '// Level 3: 300ms retry (CDN race fallback)'],
  [/\/\/ 全级失败兜底：有 localStorage token 但网络不可达 → offline 模式/g, '// all levels failed: has localStorage token but network unreachable → offline mode'],
  [/\/\/ 预填上次登录邮箱，方便用户重新登录/g, '// prefill last login email for convenience'],
  [/\/\/ 备份 session 至自有 key，防 SDK 因 refresh 失败自行清除后无法恢复/g, '// backup session to own key, prevent SDK cleanup on refresh failure from losing login'],
  [/\/\/ 先迁移离线记录再同步，避免 getAllCardStates 按 cloudUserId 过滤时漏掉 deviceId 记录/g, '// migrate offline records before sync, avoid getAllCardStates filtering by cloudUserId missing deviceId records'],
  [/\/\/ 登录后全量同步（答题\/状态\/配置\/牌组）/g, '// full sync after login (answers/state/config/decks)'],
  [/\/\/ v5: 不清 _cloudUserId — getCurrentUserId\(\) 继续返回最近登录用户，/g, '// v5: don\'t clear _cloudUserId — getCurrentUserId() still returns last login,'],
  [/\/\/ 离线练习的数据归属正确。除非显式切换账号，新登录会覆盖。/g, '// offline practice data belongs correctly. new login overwrites unless explicit account switch.'],
  [/\/\/ 登出后等同于离线模式，云牌组保留可用。/g, '// logout = offline mode, cloud decks remain usable.'],

  // Fix remaining second-pass misses
  [/\/\/ 有凭证但网络失败：保留登录外观，等待重连/g, '// has credentials but network failed: keep login appearance, wait for reconnect'],
  [/\/\/ App 启动时立即生成/g, '// generated immediately on app start'],
  [/\/\/ ── Anki 三色计数器（新卡蓝 \+ 学习中橙 \+ 复习绿）────────────────/g, '// ── Anki three-color counter (new=blue + learning=orange + review=green) ─'],
  [/\/\/ 按 state_key 分组去重，取每条最新记录/g, '// group by state_key, deduplicate, take latest per key'],
  [/\/\/ 读本地所有 CardState/g, '// read all local CardState'],
  [/\/\/ 收集所有 SRS \+ UI 参数为 JSON，upsert 到云端/g, '// collect all SRS + UI params as JSON, upsert to cloud'],
  [/\/\/ 统一同步入口（v4\.10）：支持模态进度条 \+ 语音播报 \+ 不同同步范围：支持模态进度条 \+ 语音播报 \+ 不同同步范围/g, '// unified sync entry (v4.10): modal progress + voice + scoped sync'],
  [/\/\/ 等待上次 SRS 写入完成/g, '// wait for last SRS write to complete'],
  [/\/\/ survival：现有队列全量 \+ 曲线排列/g, '// survival: full existing queue + curve arrangement'],
  [/\/\/ 以下为原有代码（未修改）/g, '// original code below (unchanged)'],
  [/\/\/ persist（只存 id\+name，blob URL 不存）/g, '// persist (id+name only, blob URL not stored)'],
  [/\/\/ quiz prompt开关/g, '// quiz prompt toggle'],
  [/\/\/ quiz prompt延迟（毫秒）/g, '// quiz prompt delay (ms)'],
  [/\/\/ quiz prompt文案（i18n 默认英文，loadPhrases 后覆盖）/g, '// quiz prompt text (i18n default English, overridden by loadPhrases)'],
  [/\/\/ option hint开关/g, '// option hint toggle'],
  [/\/\/ option hint延迟（毫秒）/g, '// option hint delay (ms)'],
  [/\/\/ wrong hint开关/g, '// wrong hint toggle'],
  [/\/\/ read item name hint开关（浏览\/练习均受控）/g, '// read item name toggle (browse + practice)'],
  [/\/\/ option hint：把文案中的\{A\}\{B\}\{C\}\{D\}替换为实际选项后依次播报/g, '// option hint: replace {A}{B}{C}{D} with actual options and speak sequentially'],
  [/\/\/ option hint：解析文案中的 \{A\}\{B\}\{C\} 和停顿符 \.（一个\.=400ms）/g, '// option hint: parse {A}{B}{C} and pause char . (one .=100ms)'],
  [/\/\/ 恢复transition/g, '// restore transition'],
  [/\/\/ answer speech delay后播放，优先录音，无录音用 TTS/g, '// play after answer speech delay, prefer recording, fallback TTS'],
  [/\/\/ 答案名称播完后：播 details → 倒计时/g, '// after answer name: speak details → countdown'],
  [/\/\/ TrialLog 写入/g, '// TrialLog write'],
  [/\/\/ options_shown：当前题目展示的所有选项 cardId/g, '// options_shown: all option cardIds shown for this question'],
  [/\/\/ 上云上传时填写/g, '// filled on cloud upload'],
  [/\/\/ 0 = manual模式，不启动倒计时/g, '// 0 = manual mode, no countdown'],
  [/\/\/ 4\. 写入内存 \+ 持久化/g, '// 4. write to memory + persist'],
  [/\/\/ 练习天数 = 云端已计天数 \+ 本地未同步部分/g, '// practice days = cloud counted days + local unsynced portion'],

  // Block comments (/* ... */)
  [/\/\* CDN 不通则回退到 Supabase \*\//g, '/* CDN unreachable, fallback to Supabase */'],
  [/\/\* 单个失败不影响其他 \*\//g, '/* single failure does not affect others */'],
  [/\/\* 跳过损坏的牌组 \*\//g, '/* skip corrupted deck */'],
  [/\/\* 不支持或被拒绝，静默处理 \*\//g, '/* unsupported or rejected, silently handled */'],

  // Step index comment (changed by the replacement on L153 which might not have matched)
  [/\/\/ step_index 不变。延迟 = Anki 规则：第一步取\(当前\+下一步\)\/2，后续不变/g, '// step_index unchanged. delay = Anki rule: first step = (current+next)/2, subsequent unchanged'],

  // ── HTML comments (<!-- ... -->) ──
  [/<!-- 隐藏文件输入 -->/g, '<!-- hidden file input -->'],
  [/<!-- Tab Bar（首页激活） -->/g, '<!-- Tab Bar (home active) -->'],
  [/<!-- Tab 0：今日概况 -->/g, '<!-- Tab 0: today overview -->'],
  [/<!-- Tab 1：牌组概况 -->/g, '<!-- Tab 1: deck overview -->'],
  [/<!-- Tab 2：卡片状态 -->/g, '<!-- Tab 2: card state -->'],
  [/<!-- Tab 3：练习记录 -->/g, '<!-- Tab 3: practice log -->'],
  [/<!-- 卡片详情面板（叠加在统计屏上） -->/g, '<!-- card detail panel (overlaid on stats screen) -->'],
  [/<!-- 账号卡（登录状态由 updateMineProfile 动态更新） -->/g, '<!-- account card (login state updated by updateMineProfile) -->'],
  [/<!-- 统计 -->/g, '<!-- stats -->'],
  [/<!-- 设置 \+ 导入 -->/g, '<!-- settings + import -->'],
  [/<!-- 模式切换 -->/g, '<!-- mode switch -->'],
  [/<!-- Tab Bar（我的激活） -->/g, '<!-- Tab Bar (mine active) -->'],
  [/<!-- ══════════════ 主题选择器 ══════════════ -->/g, '<!-- ══════════════ theme picker ══════════════ -->'],
  [/<!-- ══════════════ 关于 ══════════════ -->/g, '<!-- ══════════════ about ══════════════ -->'],
  [/<!-- ══════════════ 制卡表单 ══════════════ -->/g, '<!-- ══════════════ card creator form ══════════════ -->'],
  [/<!-- ══════════════ ACTION SHEET（照护者＋按钮） ══════════════ -->/g, '<!-- ══════════════ ACTION SHEET (caregiver + button) ══════════════ -->'],
  [/<!-- Tab 0: 通用 -->/g, '<!-- Tab 0: general -->'],
  [/<!-- Tab 1: 语音 -->/g, '<!-- Tab 1: speech -->'],
  [/<div class="sheet-panel" id="tab-3">\s*<!-- 云端 -->/g, '<div class="sheet-panel" id="tab-3">      <!-- cloud -->'],
  [/<!-- 未登录 -->/g, '<!-- not logged in -->'],
  [/<!-- 正在恢复会话 -->/g, '<!-- session restoring -->'],
  [/<!-- 已登录 -->/g, '<!-- logged in -->'],
  [/<!-- 同步进度 Modal -->/g, '<!-- sync progress modal -->'],
];

  let modified = content;

  for (const [pattern, replacement] of replacements) {
    modified = modified.replace(pattern, replacement);
  }

  // Check for remaining Chinese comments
  const remaining = [];
  const lines = modified.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Check for Chinese characters in comments (skip URL lines like data: URIs / http://)
    const commentMatch = (line.match(/\/\/[^"]*[一-鿿]/) && !line.includes('http://')) || line.match(/\/\*[^*]*[一-鿿][^*]*\*\//);
    if (commentMatch) {
      remaining.push({ line: i + 1, text: line.trim() });
    }
  }

  if (remaining.length > 0) {
    console.log(`\n${fname}: ${remaining.length} Chinese comments remaining`);
    remaining.forEach(r => console.log(`  L${r.line}: ${r.text}`));
  } else {
    console.log(fname + ': All Chinese comments converted');
  }

  fs.writeFileSync(filePath, modified, 'utf8');
}
console.log('Done.');
