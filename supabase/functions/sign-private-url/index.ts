import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const BUCKET = "yihai-private";
const EXPIRY = 3600; // 1 小时

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

Deno.serve(async (req: Request) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Missing Authorization" }), {
      status: 401,
      headers: { "Content-Type": "application/json", ...corsHeaders() },
    });
  }

  // 用 service role key 验证用户 JWT，提取 user_id
  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } }
  );

  const token = authHeader.replace("Bearer ", "");
  const { data: { user }, error: authErr } = await sb.auth.getUser(token);
  if (authErr || !user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json", ...corsHeaders() },
    });
  }

  let path: string;
  try {
    ({ path } = await req.json());
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { "Content-Type": "application/json", ...corsHeaders() },
    });
  }

  // 防路径穿越
  if (!path || typeof path !== "string" || path.includes("..") || path.startsWith("/")) {
    return new Response(JSON.stringify({ error: "Invalid path" }), {
      status: 400,
      headers: { "Content-Type": "application/json", ...corsHeaders() },
    });
  }

  const fullPath = `${user.id}/${path}`;
  const { data, error } = await sb.storage.from(BUCKET).createSignedUrl(fullPath, EXPIRY);
  if (error) {
    const status = (error as any).status === 404 || /not found/i.test(error.message) ? 404 : 500;
    return new Response(JSON.stringify({ error: error.message }), {
      status,
      headers: { "Content-Type": "application/json", ...corsHeaders() },
    });
  }

  return new Response(JSON.stringify({ signedUrl: data.signedUrl }), {
    status: 200,
    headers: { "Content-Type": "application/json", ...corsHeaders() },
  });
});
