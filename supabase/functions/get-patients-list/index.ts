import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

function corsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
  };
}

function handleCors(req: Request): Response | null {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }
  return null;
}

function errorResponse(status: number, message: string): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function requireAdmin(req: Request): Promise<{ userId: string; displayName: string; role: string }> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    throw new Error("Missing or invalid Authorization header");
  }
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } }
  );
  const token = authHeader.replace("Bearer ", "");
  const { data: { user }, error: userError } = await supabase.auth.getUser(token);
  if (userError || !user) {
    throw new Error("Invalid token: " + (userError?.message || "no user"));
  }
  const { data: admin, error: adminError } = await supabase
    .from("admin_users")
    .select("user_id, role, display_name")
    .eq("user_id", user.id)
    .maybeSingle();
  if (adminError) throw new Error("Database error: " + adminError.message);
  if (!admin) throw new Error("Unauthorized: not an admin user");
  return { userId: user.id, displayName: admin.display_name, role: admin.role };
}

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

Deno.serve(async (req: Request) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    await requireAdmin(req);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return errorResponse(msg.includes("Unauthorized") || msg.includes("Invalid token") ? 403 : 500, msg);
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

    const { data: allUserIds } = await supabase
      .from("sync_trials")
      .select("user_id")
      .not("user_id", "is", null);

    if (!allUserIds || allUserIds.length === 0) {
      return new Response(JSON.stringify({ patients: [] }), {
        status: 200,
        headers: { ...corsHeaders(), "Content-Type": "application/json" },
      });
    }

    const distinctIds = [...new Set(allUserIds.map(r => r.user_id))];

    const { data: authUsers } = await supabase.auth.admin.listUsers();
    const emailMap = new Map<string, string>();
    if (authUsers?.users) {
      for (const u of authUsers.users) emailMap.set(u.id, u.email || "unknown");
    }

    const patientPromises = distinctIds.map(async (userId) => {
      const [firstLast, reviewCounts, count7d, count30d, activeDays7, activeDays30, accuracy7d] =
        await Promise.all([
          supabase.from("sync_trials").select("timestamp").eq("user_id", userId).order("timestamp", { ascending: false }).limit(1),
          supabase.from("sync_trials").select("id", { count: "exact", head: true }).eq("user_id", userId),
          supabase.from("sync_trials").select("id", { count: "exact", head: true }).eq("user_id", userId).gte("trial_date", sevenDaysAgo),
          supabase.from("sync_trials").select("id", { count: "exact", head: true }).eq("user_id", userId).gte("trial_date", thirtyDaysAgo),
          supabase.from("sync_trials").select("trial_date").eq("user_id", userId).gte("trial_date", sevenDaysAgo),
          supabase.from("sync_trials").select("trial_date").eq("user_id", userId).gte("trial_date", thirtyDaysAgo),
          computePatientAccuracy(supabase, userId, sevenDaysAgo, today),
        ]);

      const activeDates7 = new Set((activeDays7?.data || []).map(r => r.trial_date));
      const activeDates30 = new Set((activeDays30?.data || []).map(r => r.trial_date));
      const streak = calcStreak(activeDates30, today);

      const { data: decks } = await supabase.from("sync_card_states").select("deck_key").eq("user_id", userId);
      const activeDecks = decks ? new Set(decks.map(d => d.deck_key)).size : 0;

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
        firstActiveTs: null,
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

    return new Response(JSON.stringify({ patients }), {
      status: 200,
      headers: { ...corsHeaders(), "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error("[get-patients-list]", msg);
    return errorResponse(500, msg);
  }
});

async function computePatientAccuracy(supabase: ReturnType<typeof createClient>, userId: string, from: string, to: string): Promise<number | null> {
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
    if (!firstRatings.has(row.card_id)) firstRatings.set(row.card_id, row.rating);
  }

  let correct = 0;
  for (const r of firstRatings.values()) {
    if (r === "good" || r === "easy") correct++;
  }
  return firstRatings.size > 0 ? Math.round((correct / firstRatings.size) * 1000) / 10 : null;
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
