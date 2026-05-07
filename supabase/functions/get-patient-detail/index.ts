import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireAdmin, errorResponse, corsHeaders, handleCors } from "../_shared/admin-auth.ts";

interface PatientDetailInput {
  userId: string;
  days?: number;
}

/**
 * get-patient-detail
 * 返回单个患者的详细分析数据。
 * 请求体：{ userId: string, days?: number }  (days 默认 30)
 */
Deno.serve(async (req: Request) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    await requireAdmin(req);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    if (msg.includes("Unauthorized") || msg.includes("Invalid token")) {
      return errorResponse(403, msg);
    }
    return errorResponse(500, msg);
  }

  try {
    const { userId, days = 30 }: PatientDetailInput = await req.json();
    if (!userId) {
      return errorResponse(400, "Missing userId");
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } }
    );

    const today = new Date().toISOString().split("T")[0];
    const rangeStart = new Date(Date.now() - days * 86400000).toISOString().split("T")[0];

    // ── 并行查询 ──
    const [
      userInfo,
      allTrials,
      sessionsData,
      cardStates,
      authUsers,
      deviceRows,
    ] = await Promise.all([
      // 用户总体统计
      supabase.from("sync_trials")
        .select("timestamp")
        .eq("user_id", userId)
        .order("timestamp", { ascending: false })
        .limit(1),

      // 日期范围内的所有 trial
      supabase.from("sync_trials")
        .select("trial_date, card_id, rating, response_time_ms, srs_stage_before, timestamp, session_id, deck_key")
        .eq("user_id", userId)
        .gte("trial_date", rangeStart)
        .lte("trial_date", today)
        .order("timestamp", { ascending: true }),

      // 总 session 数
      supabase.from("sync_trials")
        .select("session_id")
        .eq("user_id", userId),

      // 当前卡片状态
      supabase.from("sync_card_states")
        .select("srs_stage, deck_key, interval, suspended")
        .eq("user_id", userId),

      // 用户邮箱
      supabase.auth.admin.listUsers(),

      // 设备信息（取最近 2000 条记录用于识别设备）
      supabase.from("sync_trials")
        .select("device_id, device_info, timestamp")
        .eq("user_id", userId)
        .order("timestamp", { ascending: false })
        .limit(2000),
    ]);

    // ── 患者基本信息 ──
    const emailMap = new Map<string, string>();
    if (authUsers?.users) {
      for (const u of authUsers.users) {
        emailMap.set(u.id, u.email || "");
      }
    }

    const firstLastTs = userInfo?.data?.[0]?.timestamp ?? null;
    const allSessions = new Set((sessionsData?.data || []).map(s => s.session_id));

    const activeDates = new Set<string>();
    if (allTrials.data) {
      for (const t of allTrials.data) activeDates.add(t.trial_date);
    }

    const patient = {
      userId,
      email: emailMap.get(userId) || "unknown",
      firstActive: null as number | null,
      lastActive: firstLastTs,
      totalReviews: allTrials.data?.length ?? 0,
      totalSessions: allSessions.size,
      totalActiveDays: activeDates.size,
      currentStreak: calcStreak(activeDates, today),
      longestStreak: calcLongestStreak(activeDates),
    };

    // ── 设备信息 ──
    const devices = computeDevices(deviceRows.data || []);

    // ── 每日统计（每卡首次评分法）──
    const dailyStats = computeDailyStats(allTrials.data || []);

    // ── 牌组分解 ──
    const deckBreakdown = computeDeckBreakdown(
      allTrials.data || [],
      cardStates.data || []
    );

    // ── SRS 阶段分布 ──
    const srsDist: Record<string, number> = {
      new: 0, learning: 0, review: 0, relearning: 0, suspended: 0,
    };
    if (cardStates.data) {
      for (const cs of cardStates.data) {
        if (cs.suspended) { srsDist["suspended"]++; continue; }
        const stage = cs.srs_stage;
        if (stage in srsDist) srsDist[stage]++;
      }
    }

    // ── 响应时间分布 ──
    const rt = computeResponseTimeDist(allTrials.data || []);

    // ── 时段分布 ──
    const hourlyDist = computeHourlyDist(allTrials.data || []);

    return new Response(
      JSON.stringify({
        patient,
        dailyStats,
        deckBreakdown,
        srsDistribution: srsDist,
        responseTimeDistribution: rt,
        hourlyDistribution: hourlyDist,
        devices,
      }),
      { status: 200, headers: { ...corsHeaders(), "Content-Type": "application/json" } }
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error("[get-patient-detail]", msg);
    return errorResponse(500, msg);
  }
});

// ── 辅助函数 ──

function computeDailyStats(trials: any[]): any[] {
  // 按日期分组
  const byDate = new Map<string, any[]>();
  for (const t of trials) {
    const d = t.trial_date;
    if (!byDate.has(d)) byDate.set(d, []);
    byDate.get(d)!.push(t);
  }

  const result: any[] = [];
  for (const [date, rows] of byDate) {
    // 每卡首次评分
    const firstRatings = new Map<string, string>();
    const rtValues: number[] = [];
    let newCards = 0;
    for (const r of rows) {
      if (!firstRatings.has(r.card_id)) {
        firstRatings.set(r.card_id, r.rating);
      }
      if (r.response_time_ms) rtValues.push(r.response_time_ms);
      if (r.srs_stage_before === "new") newCards++;
    }

    let good = 0, hard = 0, again = 0;
    for (const rating of firstRatings.values()) {
      if (rating === "good" || rating === "easy") good++;
      else if (rating === "hard") hard++;
      else if (rating === "again") again++;
    }
    const total = firstRatings.size;
    const accuracy = total > 0 ? Math.round((good / total) * 1000) / 10 : 0;
    const avgRt = rtValues.length > 0
      ? Math.round(rtValues.reduce((a, b) => a + b, 0) / rtValues.length)
      : 0;

    result.push({
      date,
      reviews: rows.length,
      firstRatingGood: good,
      firstRatingHard: hard,
      firstRatingAgain: again,
      accuracyPct: accuracy,
      avgResponseTimeMs: avgRt,
      newCardsIntroduced: newCards,
    });
  }

  result.sort((a, b) => a.date.localeCompare(b.date));
  return result;
}

function computeDeckBreakdown(trials: any[], cardStates: any[]): any[] {
  // 按 deck_key 分组 trial
  const deckTrials = new Map<string, { ratings: Map<string, string>; count: number }>();
  for (const t of trials) {
    const dk = t.deck_key;
    if (!deckTrials.has(dk)) deckTrials.set(dk, { ratings: new Map(), count: 0 });
    const entry = deckTrials.get(dk)!;
    entry.count++;
    if (!entry.ratings.has(t.card_id)) {
      entry.ratings.set(t.card_id, t.rating);
    }
  }

  // 按 deck_key 分组卡片状态
  const deckCards = new Map<string, { total: number; mastered: number; learning: number; suspended: number }>();
  for (const cs of cardStates) {
    const dk = cs.deck_key;
    if (!deckCards.has(dk)) deckCards.set(dk, { total: 0, mastered: 0, learning: 0, suspended: 0 });
    const entry = deckCards.get(dk)!;
    entry.total++;
    if (cs.suspended) entry.suspended++;
    else if (cs.srs_stage === "review" && cs.interval >= 7) entry.mastered++;
    else if (cs.srs_stage === "learning" || cs.srs_stage === "relearning") entry.learning++;
  }

  const result: any[] = [];
  const allDecks = new Set([...deckTrials.keys(), ...deckCards.keys()]);
  for (const dk of allDecks) {
    const t = deckTrials.get(dk);
    const c = deckCards.get(dk);
    let correct = 0;
    if (t) {
      for (const r of t.ratings.values()) {
        if (r === "good" || r === "easy") correct++;
      }
    }
    result.push({
      deckKey: dk,
      totalReviews: t?.count ?? 0,
      accuracyPct: t && t.ratings.size > 0
        ? Math.round((correct / t.ratings.size) * 1000) / 10
        : 0,
      cardsTotal: c?.total ?? 0,
      cardsMastered: c?.mastered ?? 0,
      cardsLearning: c?.learning ?? 0,
      cardsSuspended: c?.suspended ?? 0,
    });
  }

  result.sort((a, b) => b.totalReviews - a.totalReviews);
  return result;
}

function computeResponseTimeDist(trials: any[]): Record<string, number> {
  const dist = { fast: 0, normal: 0, slow: 0, verySlow: 0 };
  for (const t of trials) {
    const rt = t.response_time_ms;
    if (!rt) continue;
    if (rt < 2000) dist.fast++;
    else if (rt < 5000) dist.normal++;
    else if (rt < 10000) dist.slow++;
    else dist.verySlow++;
  }
  return dist;
}

function computeHourlyDist(trials: any[]): { hour: number; count: number }[] {
  const hours = new Array(24).fill(0);
  for (const t of trials) {
    const h = new Date(t.timestamp).getHours();
    hours[h]++;
  }
  return hours.map((count, hour) => ({ hour, count }));
}

function computeDevices(rows: any[]): { deviceId: string; lastActive: number | null; reviews: number; deviceInfo: Record<string, string> | null }[] {
  const deviceMap = new Map<string, { lastActive: number | null; count: number; info: Record<string, string> | null }>();
  for (const row of rows) {
    if (!row.device_id) continue;
    const existing = deviceMap.get(row.device_id);
    let parsed = null;
    if (row.device_info && typeof row.device_info === 'string') {
      try { parsed = JSON.parse(row.device_info); } catch(e) {}
    } else if (row.device_info && typeof row.device_info === 'object') {
      parsed = row.device_info;
    }
    if (existing) {
      existing.count++;
      if (row.timestamp && (!existing.lastActive || row.timestamp > existing.lastActive)) {
        existing.lastActive = row.timestamp;
      }
      if (parsed && !existing.info) existing.info = parsed;
    } else {
      deviceMap.set(row.device_id, { lastActive: row.timestamp || null, count: 1, info: parsed });
    }
  }
  return Array.from(deviceMap.entries())
    .map(([deviceId, info]) => ({
      deviceId,
      lastActive: info.lastActive,
      reviews: info.count,
      deviceInfo: info.info,
    }))
    .sort((a, b) => (b.lastActive || 0) - (a.lastActive || 0));
}

function calcStreak(activeDates: Set<string>, today: string): number {
  let streak = 0;
  const cursor = new Date(today);
  while (true) {
    const ds = cursor.toISOString().split("T")[0];
    if (!activeDates.has(ds)) break;
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

function calcLongestStreak(activeDates: Set<string>): number {
  const sorted = Array.from(activeDates).sort();
  if (sorted.length === 0) return 0;
  let longest = 1;
  let current = 1;
  for (let i = 1; i < sorted.length; i++) {
    const prev = new Date(sorted[i - 1]);
    const curr = new Date(sorted[i]);
    const diffDays = (curr.getTime() - prev.getTime()) / 86400000;
    if (Math.round(diffDays) === 1) {
      current++;
      longest = Math.max(longest, current);
    } else {
      current = 1;
    }
  }
  return longest;
}
