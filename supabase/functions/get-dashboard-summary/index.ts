import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireAdmin, errorResponse, corsHeaders, handleCors } from "../_shared/admin-auth.ts";

interface DashboardSummary {
  activePatientsToday: number;
  totalReviewsToday: number;
  totalReviewsThisWeek: number;
  totalReviewsThisMonth: number;
  avgAccuracyToday: number | null;
  avgResponseTimeMsToday: number | null;
  activePatientsThisWeek: number;
  totalPatients: number;
  practiceVolume7d: { date: string; reviews: number; activeUsers: number }[];
  recentActivity: {
    userId: string;
    email: string;
    lastActive: number;
    reviewsToday: number;
    accuracyToday: number | null;
  }[];
}

/**
 * get-dashboard-summary
 * 返回全局 KPI 聚合数据，供看板概览页使用。
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
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } }
    );

    const today = new Date().toISOString().split("T")[0];
    const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().split("T")[0];
    const monthAgo = new Date(Date.now() - 30 * 86400000).toISOString().split("T")[0];

    // 并行获取基础数据
    const [
      todayTrials,
      weekCount,
      monthCount,
      allPatients,
      weekPatients,
    ] = await Promise.all([
      // 今日所有 trial
      supabase.from("sync_trials")
        .select("user_id, card_id, rating, response_time_ms, timestamp")
        .eq("trial_date", today),

      // 本周总条数
      supabase.from("sync_trials").select("id", { count: "exact", head: true })
        .gte("trial_date", weekAgo),

      // 本月总条数
      supabase.from("sync_trials").select("id", { count: "exact", head: true })
        .gte("trial_date", monthAgo),

      // 所有患者数
      supabase.from("sync_trials").select("user_id")
        .not("user_id", "is", null),

      // 本周活跃患者
      supabase.from("sync_trials").select("user_id")
        .gte("trial_date", weekAgo),
    ]);

    // ── 今日 KPI ──
    const todayData = todayTrials.data || [];
    const userIdsToday = new Set(todayData.map(r => r.user_id));
    const activePatientsToday = userIdsToday.size;

    // 每卡首次评分正确率
    const firstRatings = new Map<string, string>();
    for (const r of todayData) {
      const key = `${r.user_id}::${r.card_id}`;
      if (!firstRatings.has(key)) firstRatings.set(key, r.rating);
    }
    let correct = 0;
    for (const rating of firstRatings.values()) {
      if (rating === "good" || rating === "easy") correct++;
    }
    const avgAccuracyToday = firstRatings.size > 0
      ? Math.round((correct / firstRatings.size) * 1000) / 10
      : null;

    // 平均响应时间
    const rtValues = todayData
      .map(r => r.response_time_ms)
      .filter((v): v is number => v !== null && v !== undefined);
    const avgResponseTimeMsToday = rtValues.length > 0
      ? Math.round(rtValues.reduce((a, b) => a + b, 0) / rtValues.length)
      : null;

    // ── 全局计数 ──
    const allUserIds = allPatients.data
      ? new Set(allPatients.data.map(r => r.user_id)).size
      : 0;
    const activePatientsThisWeek = weekPatients.data
      ? new Set(weekPatients.data.map(r => r.user_id)).size
      : 0;

    // ── 近 7 天每日复习量 ──
    const volumeData = todayData; // reuse
    const byDate = new Map<string, { reviews: Set<string>; users: Set<string> }>();
    // 还需获取过去 7 天数据
    const { data: weekAll } = await supabase
      .from("sync_trials")
      .select("trial_date, user_id")
      .gte("trial_date", weekAgo);

    if (weekAll) {
      for (const row of weekAll) {
        const d = row.trial_date;
        if (!byDate.has(d)) byDate.set(d, { reviews: new Set(), users: new Set() });
        const entry = byDate.get(d)!;
        entry.reviews.add(row.user_id + "::" + d);
        entry.users.add(row.user_id);
      }
    }

    const practiceVolume7d: { date: string; reviews: number; activeUsers: number }[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(weekAgo);
      d.setDate(d.getDate() + i);
      const ds = d.toISOString().split("T")[0];
      const entry = byDate.get(ds);
      practiceVolume7d.push({
        date: ds,
        reviews: entry ? entry.reviews.size : 0,
        activeUsers: entry ? entry.users.size : 0,
      });
    }

    // ── 最近活跃患者（今日）+ 邮箱 ──
    const { data: authUsers } = await supabase.auth.admin.listUsers();
    const emailMap = new Map<string, string>();
    if (authUsers?.users) {
      for (const u of authUsers.users) emailMap.set(u.id, u.email || "unknown");
    }

    const userActivity = new Map<string, { lastActive: number; ratings: Map<string, string>; count: number }>();
    for (const r of todayData) {
      if (!userActivity.has(r.user_id)) {
        userActivity.set(r.user_id, { lastActive: r.timestamp, ratings: new Map(), count: 0 });
      }
      const u = userActivity.get(r.user_id)!;
      u.count++;
      if (r.timestamp > u.lastActive) u.lastActive = r.timestamp;
      const ckey = r.card_id;
      if (!u.ratings.has(ckey)) u.ratings.set(ckey, r.rating);
    }

    const recentActivity = Array.from(userActivity.entries())
      .sort((a, b) => b[1].lastActive - a[1].lastActive)
      .slice(0, 10)
      .map(([userId, info]) => {
        let acc = 0;
        for (const r of info.ratings.values()) {
          if (r === "good" || r === "easy") acc++;
        }
        return {
          userId,
          email: emailMap.get(userId) || "unknown",
          lastActive: info.lastActive,
          reviewsToday: info.count,
          accuracyToday: info.ratings.size > 0
            ? Math.round((acc / info.ratings.size) * 1000) / 10
            : null,
        };
      });

    const summary: DashboardSummary = {
      activePatientsToday,
      totalReviewsToday: todayData.length,
      totalReviewsThisWeek: weekCount?.count ?? 0,
      totalReviewsThisMonth: monthCount?.count ?? 0,
      avgAccuracyToday,
      avgResponseTimeMsToday,
      activePatientsThisWeek,
      totalPatients: allUserIds,
      practiceVolume7d,
      recentActivity,
    };

    return new Response(
      JSON.stringify(summary),
      { status: 200, headers: { ...corsHeaders(), "Content-Type": "application/json" } }
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error("[get-dashboard-summary]", msg);
    return errorResponse(500, msg);
  }
});
