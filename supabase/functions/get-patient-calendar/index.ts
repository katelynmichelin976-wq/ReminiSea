import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

function corsHeaders(): Record<string, string> {
  return { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Authorization, Content-Type" };
}
function handleCors(req: Request): Response | null {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders() });
  return null;
}
function errorResponse(status: number, message: string): Response {
  return new Response(JSON.stringify({ error: message }), { status, headers: { "Content-Type": "application/json" } });
}

async function requireAdmin(req: Request): Promise<{ userId: string; displayName: string; role: string }> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) throw new Error("Missing or invalid Authorization header");
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const token = authHeader.replace("Bearer ", "");
  const { data: { user }, error: userError } = await supabase.auth.getUser(token);
  if (userError || !user) throw new Error("Invalid token: " + (userError?.message || "no user"));
  const { data: admin, error: adminError } = await supabase.from("admin_users").select("user_id, role, display_name").eq("user_id", user.id).maybeSingle();
  if (adminError) throw new Error("Database error: " + adminError.message);
  if (!admin) throw new Error("Unauthorized: not an admin user");
  return { userId: user.id, displayName: admin.display_name, role: admin.role };
}

interface DayData {
  date: string;
  reviews: number;
  accuracyPct: number | null;
  firstAgain: number;
  firstHard: number;
  firstGood: number;
}

interface TrialRecord {
  trialId: string;
  cardId: string;
  cardName: string;
  deckKey: string;
  rating: string;
  isCorrect: boolean | null;
  responseTimeMs: number | null;
  srsStageBefore: string | null;
  srsStageAfter: string | null;
  timestamp: number;
}

interface CalendarResponse {
  year: number;
  month: number;
  days: DayData[];
  trials?: TrialRecord[];
}

/**
 * get-patient-calendar
 * 返回指定患者某月的练习日历数据。
 * 参数: { userId, year, month, date? }
 * - 如果提供 date，同时返回该日详细答题记录
 */
Deno.serve(async (req: Request) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try { await requireAdmin(req); } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return errorResponse(msg.includes("Unauthorized") || msg.includes("Invalid token") ? 403 : 500, msg);
  }

  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
    const { userId, year, month, date } = await req.json();

    if (!userId || !year || !month) {
      return errorResponse(400, "Missing required parameters: userId, year, month");
    }

    // Build date range for the month
    const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const endDate = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

    // If a specific date is requested, return trial records
    if (date) {
      const { data: trials } = await supabase
        .from("sync_trials")
        .select("trial_id, card_id, deck_key, rating, is_correct, response_time_ms, srs_stage_before, srs_stage_after, timestamp")
        .eq("user_id", userId)
        .eq("trial_date", date)
        .order("timestamp", { ascending: true });

      // Look up card names
      const cardIds = [...new Set((trials || []).map(t => t.card_id))];
      const { data: cardsPool } = await supabase
        .from("cards_pool")
        .select("card_id, card_name")
        .in("card_id", cardIds);
      const nameMap = new Map<string, string>();
      if (cardsPool) {
        for (const c of cardsPool) nameMap.set(c.card_id, c.card_name);
      }

      const response: CalendarResponse = { year, month, days: [], trials: [] };
      if (trials) {
        response.trials = trials.map(t => ({
          trialId: t.trial_id,
          cardId: t.card_id,
          cardName: nameMap.get(t.card_id) || t.card_id,
          deckKey: t.deck_key,
          rating: t.rating,
          isCorrect: t.is_correct,
          responseTimeMs: t.response_time_ms,
          srsStageBefore: t.srs_stage_before,
          srsStageAfter: t.srs_stage_after,
          timestamp: t.timestamp,
        }));
      }
      return new Response(JSON.stringify(response), { status: 200, headers: { ...corsHeaders(), "Content-Type": "application/json" } });
    }

    // Get daily aggregates for the month
    const { data: dailyData } = await supabase
      .from("sync_trials")
      .select("trial_date, card_id, rating, timestamp")
      .eq("user_id", userId)
      .gte("trial_date", startDate)
      .lte("trial_date", endDate)
      .order("timestamp", { ascending: true });

    if (!dailyData || dailyData.length === 0) {
      return new Response(JSON.stringify({ year, month, days: [] } satisfies CalendarResponse), {
        status: 200, headers: { ...corsHeaders(), "Content-Type": "application/json" },
      });
    }

    // Aggregate by date
    const byDate = new Map<string, { total: number; firstRatings: Map<string, string> }>();
    for (const row of dailyData) {
      if (!byDate.has(row.trial_date)) {
        byDate.set(row.trial_date, { total: 0, firstRatings: new Map() });
      }
      const entry = byDate.get(row.trial_date)!;
      entry.total++;
      // First rating per card per day
      if (!entry.firstRatings.has(row.card_id)) {
        entry.firstRatings.set(row.card_id, row.rating);
      }
    }

    const days: DayData[] = [];
    for (const [dateStr, data] of byDate.entries()) {
      let good = 0;
      for (const r of data.firstRatings.values()) {
        if (r === "good" || r === "easy") good++;
      }
      let again = 0, hard = 0;
      for (const r of data.firstRatings.values()) {
        if (r === "again") again++;
        else if (r === "hard") hard++;
      }
      days.push({
        date: dateStr,
        reviews: data.total,
        accuracyPct: data.firstRatings.size > 0 ? Math.round((good / data.firstRatings.size) * 1000) / 10 : null,
        firstAgain: again,
        firstHard: hard,
        firstGood: good,
      });
    }

    days.sort((a, b) => a.date.localeCompare(b.date));

    return new Response(JSON.stringify({ year, month, days } satisfies CalendarResponse), {
      status: 200, headers: { ...corsHeaders(), "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error("[get-patient-calendar]", msg);
    return errorResponse(500, msg);
  }
});
