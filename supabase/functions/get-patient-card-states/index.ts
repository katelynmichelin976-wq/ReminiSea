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

interface CardState {
  stateKey: string;
  cardId: string;
  deckKey: string;
  srsStage: string;
  interval: number;
  easeFactor: number;
  dueDate: string;
  dueTs: number;
  stepIndex: number;
  reviewMode: string;
  lapsesStreak: number;
  lapsesTotal: number;
  suspended: boolean;
  updatedAt: number;
}

/**
 * get-patient-card-states
 * 返回指定患者所有卡片的 SRS 状态。
 * 参数: { userId }
 * 从 cards_pool 获取卡片名称。
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
    const { userId } = await req.json();
    if (!userId) return errorResponse(400, "Missing required parameter: userId");

    // Get all card states for this user
    const { data: cardStates, error: csError } = await supabase
      .from("sync_card_states")
      .select("*")
      .eq("user_id", userId)
      .order("deck_key", { ascending: true })
      .order("card_id", { ascending: true });

    if (csError) throw csError;

    // Get card names from cards_pool
    const cardIds = [...new Set((cardStates || []).map(c => c.card_id))];
    const { data: cardsPool } = await supabase
      .from("cards_pool")
      .select("card_id, card_name, deck_name")
      .in("card_id", cardIds);

    const nameMap = new Map<string, string>();
    if (cardsPool) {
      for (const c of cardsPool) {
        // Take the latest name for each card_id
        nameMap.set(c.card_id, c.card_name);
      }
    }

    const cards: (CardState & { cardName: string })[] = (cardStates || []).map(cs => ({
      stateKey: cs.state_key,
      cardId: cs.card_id,
      deckKey: cs.deck_key,
      cardName: nameMap.get(cs.card_id) || cs.card_id,
      srsStage: cs.srs_stage,
      interval: cs.interval,
      easeFactor: cs.ease_factor,
      dueDate: cs.due_date,
      dueTs: cs.due_ts,
      stepIndex: cs.step_index,
      reviewMode: cs.review_mode,
      lapsesStreak: cs.lapses_streak,
      lapsesTotal: cs.lapses_total,
      suspended: cs.suspended,
      updatedAt: cs.updated_at,
    }));

    return new Response(JSON.stringify({ cards }), {
      status: 200,
      headers: { ...corsHeaders(), "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error("[get-patient-card-states]", msg);
    return errorResponse(500, msg);
  }
});
