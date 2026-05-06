import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireAdmin, errorResponse, corsHeaders, handleCors } from "../_shared/admin-auth.ts";

interface PatientInfo {
  userId: string;
  email: string;
  lastActiveTs: number | null;
  firstActiveTs: number | null;
  totalReviews: number;
  reviewsLast7d: number;
  reviewsLast30d: number;
  activeDaysLast7d: number;
  activeDaysLast30d: number;
  currentStreakDays: number;
  avgAccuracyLast7d: number | null;
  decksActive: number;
  suspendedCardCount: number;
  cardsLearning: number;
  cardsTotal: number;
}

/**
 * get-patients-list
 * 返回所有患者列表及其基本参与度指标。
 * 按最后活跃时间倒序排列。
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
    const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString().split("T")[0];
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString().split("T")[0];

    // 获取所有有练习记录的用户
    const { data: allUserIds } = await supabase
      .from("sync_trials")
      .select("user_id")
      .not("user_id", "is", null);

    if (!allUserIds || allUserIds.length === 0) {
      return new Response(
        JSON.stringify({ patients: [] }),
        { status: 200, headers: { ...corsHeaders(), "Content-Type": "application/json" } }
      );
    }

    const distinctIds = [...new Set(allUserIds.map(r => r.user_id))];

    // 获取邮箱（排除管理员自己）
    const { data: adminUsers } = await supabase
      .from("admin_users")
      .select("user_id");

    const adminIdSet = new Set((adminUsers || []).map(a => a.user_id));
    const patientIds = distinctIds.filter(id => !adminIdSet.has(id));

    if (patientIds.length === 0) {
      return new Response(
        JSON.stringify({ patients: [] }),
        { status: 200, headers: { ...corsHeaders(), "Content-Type": "application/json" } }
      );
    }

    // 获取用户邮箱
    const { data: authUsers } = await supabase.auth.admin.listUsers();
    const emailMap = new Map<string, string>();
    if (authUsers?.users) {
      for (const u of authUsers.users) {
        emailMap.set(u.id, u.email || "unknown");
      }
    }

    // 并发查询每个患者的数据
    const patientPromises = patientIds.map(async (userId) => {
      const [
        firstLast,
        reviewCounts,
        count7d,
        count30d,
        activeDays7,
        activeDays30,
        accuracy7d,
        cardStats,
      ] = await Promise.all([
        // 首次和最后活跃
        supabase.from("sync_trials")
          .select("timestamp")
          .eq("user_id", userId)
          .order("timestamp", { ascending: false })
          .limit(1),

        // 总复习量
        supabase.from("sync_trials")
          .select("id", { count: "exact", head: true })
          .eq("user_id", userId),

        // 7 天复习量
        supabase.from("sync_trials")
          .select("id", { count: "exact", head: true })
          .eq("user_id", userId)
          .gte("trial_date", sevenDaysAgo),

        // 30 天复习量
        supabase.from("sync_trials")
          .select("id", { count: "exact", head: true })
          .eq("user_id", userId)
          .gte("trial_date", thirtyDaysAgo),

        // 7 天活跃天数
        supabase.from("sync_trials")
          .select("trial_date")
          .eq("user_id", userId)
          .gte("trial_date", sevenDaysAgo),

        // 30 天活跃天数
        supabase.from("sync_trials")
          .select("trial_date")
          .eq("user_id", userId)
          .gte("trial_date", thirtyDaysAgo),

        // 7 天正确率（每卡首次评分）
        computePatientAccuracy(supabase, userId, sevenDaysAgo, today),

        // 卡片状态统计
        supabase.from("sync_card_states")
          .select("srs_stage, suspended, id", { count: "exact", head: true })
          .eq("user_id", userId),
      ]);

      // 计算活跃天数
      const activeDates7 = new Set((activeDays7?.data || []).map(r => r.trial_date));
      const activeDates30 = new Set((activeDays30?.data || []).map(r => r.trial_date));

      // 当前连续天数
      const streak = calcStreak(activeDates30, today);

      // 活跃牌组数
      const { data: decks } = await supabase
        .from("sync_card_states")
        .select("deck_key")
        .eq("user_id", userId);
      const activeDecks = decks ? new Set(decks.map(d => d.deck_key)).size : 0;

      // 卡片状态
      const { data: cardStates, count: totalCards } = await supabase
        .from("sync_card_states")
        .select("srs_stage, suspended", { count: "exact", head: false })
        .eq("user_id", userId);

      const cardCounts = { suspended: 0, learning: 0 };
      if (cardStates) {
        for (const cs of cardStates) {
          if (cs.suspended) cardCounts.suspended++;
          if (cs.srs_stage === "learning" || cs.srs_stage === "relearning") cardCounts.learning++;
        }
      }

      return {
        userId,
        email: emailMap.get(userId) || "unknown",
        lastActiveTs: firstLast?.data?.[0]?.timestamp ?? null,
        firstActiveTs: null, // 简化处理
        totalReviews: reviewCounts?.count ?? 0,
        reviewsLast7d: count7d?.count ?? 0,
        reviewsLast30d: count30d?.count ?? 0,
        activeDaysLast7d: activeDates7.size,
        activeDaysLast30d: activeDates30.size,
        currentStreakDays: streak,
        avgAccuracyLast7d: accuracy7d,
        decksActive: activeDecks,
        suspendedCardCount: cardCounts.suspended,
        cardsLearning: cardCounts.learning,
        cardsTotal: totalCards ?? 0,
      } as PatientInfo;
    });

    const patients = await Promise.all(patientPromises);
    patients.sort((a, b) => (b.lastActiveTs ?? 0) - (a.lastActiveTs ?? 0));

    return new Response(
      JSON.stringify({ patients }),
      { status: 200, headers: { ...corsHeaders(), "Content-Type": "application/json" } }
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error("[get-patients-list]", msg);
    return errorResponse(500, msg);
  }
});

async function computePatientAccuracy(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  from: string,
  to: string
): Promise<number | null> {
  const { data } = await supabase
    .from("sync_trials")
    .select("card_id, rating, timestamp")
    .eq("user_id", userId)
    .gte("trial_date", from)
    .lte("trial_date", to)
    .order("timestamp", { ascending: true });

  if (!data || data.length === 0) return null;

  const firstRatings = new Map<string, string>();
  for (const row of data) {
    const key = row.card_id;
    if (!firstRatings.has(key)) {
      firstRatings.set(key, row.rating);
    }
  }

  let correct = 0;
  for (const r of firstRatings.values()) {
    if (r === "good" || r === "easy") correct++;
  }
  return firstRatings.size > 0
    ? Math.round((correct / firstRatings.size) * 1000) / 10
    : null;
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
