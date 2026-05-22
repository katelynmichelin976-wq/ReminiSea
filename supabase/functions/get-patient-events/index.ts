import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

function corsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
  };
}
function handleCors(req: Request): Response | null {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders() });
  return null;
}
function errorResponse(status: number, message: string): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function requireAdmin(
  req: Request,
): Promise<{ userId: string; displayName: string; role: string }> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer "))
    throw new Error("Missing or invalid Authorization header");
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
  const token = authHeader.replace("Bearer ", "");
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser(token);
  if (userError || !user)
    throw new Error("Invalid token: " + (userError?.message || "no user"));
  const { data: admin, error: adminError } = await supabase
    .from("admin_users")
    .select("user_id, role, display_name")
    .eq("user_id", user.id)
    .maybeSingle();
  if (adminError) throw new Error("Database error: " + adminError.message);
  if (!admin) throw new Error("Unauthorized: not an admin user");
  return { userId: user.id, displayName: admin.display_name, role: admin.role };
}

interface EventRecord {
  eventId: string;
  eventType: string;
  deckKey: string;
  payload: Record<string, unknown>;
  deviceId: string;
  timestamp: number;
}

Deno.serve(async (req: Request) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    await requireAdmin(req);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return errorResponse(
      msg.includes("Unauthorized") || msg.includes("Invalid token") ? 403 : 500,
      msg,
    );
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );
    const { userId, days } = await req.json();

    if (!userId || !days) {
      return errorResponse(400, "Missing required parameters: userId, days");
    }

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - (Number(days) - 1));
    startDate.setHours(0, 0, 0, 0);
    const cutoffTs = startDate.getTime();

    const { data: events, error } = await supabase
      .from("app_events")
      .select("event_id, event_type, deck_key, payload, device_id, timestamp")
      .eq("user_id", userId)
      .gte("timestamp", cutoffTs)
      .order("timestamp", { ascending: false })
      .limit(200);

    if (error) throw error;

    const response = {
      events: (events || []).map(
        (e): EventRecord => ({
          eventId: e.event_id,
          eventType: e.event_type,
          deckKey: e.deck_key || "",
          payload: e.payload || {},
          deviceId: e.device_id,
          timestamp: e.timestamp,
        }),
      ),
    };

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { ...corsHeaders(), "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error("[get-patient-events]", msg);
    return errorResponse(500, msg);
  }
});
