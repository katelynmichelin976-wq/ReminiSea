import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireAdmin, errorResponse, corsHeaders, handleCors } from "../_shared/admin-auth.ts";

interface CardDifficultyInput {
  userId?: string;
  minLapses?: number;
  limit?: number;
}

/**
 * get-card-difficulty
 * 返回高失败率卡片、已挂起卡片、牌组失败率排名。
 * 请求体：{ userId?: string, minLapses?: number, limit?: number }
 * 不传 userId 则查询所有患者。
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
    const { userId, minLapses = 5, limit = 50 }: CardDifficultyInput = await req.json();

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } }
    );

    // ── 1. 高失败率卡片 ──
    let highLapseQuery = supabase
      .from("sync_card_states")
      .select("user_id, card_id, deck_key, lapses_total, lapses_streak, suspended, srs_stage, updated_at")
      .gte("lapses_total", minLapses)
      .order("lapses_total", { ascending: false })
      .limit(limit);

    if (userId) {
      highLapseQuery = highLapseQuery.eq("user_id", userId);
    }
    const { data: highLapseCards } = await highLapseQuery;

    // ── 2. 已挂起卡片 ──
    let suspendedQuery = supabase
      .from("sync_card_states")
      .select("user_id, card_id, deck_key, lapses_total, lapses_streak, updated_at")
      .eq("suspended", true)
      .order("lapses_total", { ascending: false })
      .limit(limit);

    if (userId) {
      suspendedQuery = suspendedQuery.eq("user_id", userId);
    }
    const { data: suspendedCards } = await suspendedQuery;

    // ── 获取用户邮箱映射 ──
    const { data: authUsers } = await supabase.auth.admin.listUsers();
    const emailMap = new Map<string, string>();
    if (authUsers?.users) {
      for (const u of authUsers.users) {
        emailMap.set(u.id, u.email || "unknown");
      }
    }

    // ── 获取卡片名称 ──
    const allCardIds = new Set<string>();
    if (highLapseCards) for (const c of highLapseCards) allCardIds.add(c.card_id);
    if (suspendedCards) for (const c of suspendedCards) allCardIds.add(c.card_id);

    const cardNameMap = new Map<string, string>();
    if (allCardIds.size > 0) {
      const { data: cards } = await supabase
        .from("cards_pool")
        .select("card_id, card_name")
        .in("card_id", Array.from(allCardIds));

      if (cards) {
        for (const c of cards) {
          if (!cardNameMap.has(c.card_id)) {
            cardNameMap.set(c.card_id, c.card_name);
          }
        }
      }
    }

    // ── 3. 牌组失败率排名 ──
    const { data: deckFailures } = await (userId
      ? supabase.from("sync_trials")
          .select("deck_key, rating")
          .eq("user_id", userId)
      : supabase.from("sync_trials")
          .select("deck_key, rating")
    );

    const deckFailureRates = computeDeckFailureRates(deckFailures || []);

    // ── 组装响应 ──
    const formatCard = (c: any) => ({
      userId: c.user_id,
      email: emailMap.get(c.user_id) || "unknown",
      cardId: c.card_id,
      cardName: cardNameMap.get(c.card_id) || c.card_id,
      deckKey: c.deck_key,
      lapsesTotal: c.lapses_total,
      lapsesStreak: c.lapses_streak,
      suspended: c.suspended ?? false,
      srsStage: c.srs_stage ?? "",
      lastUpdated: c.updated_at,
    });

    return new Response(
      JSON.stringify({
        highLapseCards: (highLapseCards || []).map(formatCard),
        suspendedCards: (suspendedCards || []).map(c => ({
          ...formatCard(c),
          suspended: true,
        })),
        deckFailureRates,
      }),
      { status: 200, headers: { ...corsHeaders(), "Content-Type": "application/json" } }
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error("[get-card-difficulty]", msg);
    return errorResponse(500, msg);
  }
});

function computeDeckFailureRates(trials: any[]): any[] {
  const deckStats = new Map<string, { total: number; again: number }>();
  for (const t of trials) {
    if (!deckStats.has(t.deck_key)) {
      deckStats.set(t.deck_key, { total: 0, again: 0 });
    }
    const s = deckStats.get(t.deck_key)!;
    s.total++;
    if (t.rating === "again") s.again++;
  }

  const result: any[] = [];
  for (const [deckKey, stats] of deckStats) {
    result.push({
      deckKey,
      totalReviews: stats.total,
      totalAgainRatings: stats.again,
      failureRate: stats.total > 0
        ? Math.round((stats.again / stats.total) * 1000) / 10
        : 0,
    });
  }

  result.sort((a, b) => b.failureRate - a.failureRate);
  return result.slice(0, 20); // 返回前 20 个
}
