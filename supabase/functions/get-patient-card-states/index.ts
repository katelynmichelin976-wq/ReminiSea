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
  cardName: string;
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

    // Single RPC call — JOIN sync_card_states + cards_pool server-side
    const { data, error } = await supabase.rpc("get_card_states_with_names", { p_user_id: userId });

    if (error) throw error;

    const cards: CardState[] = (data || []).map((r: Record<string, unknown>) => ({
      stateKey: r.state_key as string,
      cardId: r.card_id as string,
      deckKey: r.deck_key as string,
      cardName: r.card_name as string,
      srsStage: r.srs_stage as string,
      interval: r.interval as number,
      easeFactor: r.ease_factor as number,
      dueDate: r.due_date as string,
      dueTs: r.due_ts as number,
      stepIndex: r.step_index as number,
      reviewMode: r.review_mode as string,
      lapsesStreak: r.lapses_streak as number,
      lapsesTotal: r.lapses_total as number,
      suspended: r.suspended as boolean,
      updatedAt: r.updated_at as number,
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
