import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Edge Function 共享鉴权工具
 * 验证 Bearer JWT，检查调用者是否在 admin_users 表中
 * 返回 { userId: string, displayName: string, role: string }
 * 鉴权失败时抛 Error
 */
export async function requireAdmin(req: Request): Promise<{
  userId: string;
  displayName: string;
  role: string;
}> {
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

  if (adminError) {
    throw new Error("Database error: " + adminError.message);
  }
  if (!admin) {
    throw new Error("Unauthorized: not an admin user");
  }

  return {
    userId: user.id,
    displayName: admin.display_name,
    role: admin.role,
  };
}

/**
 * 为 Edge Function 创建 JSON 错误响应
 */
export function errorResponse(status: number, message: string): Response {
  return new Response(
    JSON.stringify({ error: message }),
    { status, headers: { "Content-Type": "application/json" } }
  );
}

/**
 * 为 Edge Function 创建 JSON 成功响应
 */
export function corsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
  };
}

export function handleCors(req: Request): Response | null {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders(),
    });
  }
  return null;
}
