import { requireAdmin, errorResponse, corsHeaders, handleCors } from "../_shared/admin-auth.ts";

/**
 * admin-auth-check
 * 验证当前用户是否是管理员。
 * 看板登录后调用此函数确认管理权限。
 */
Deno.serve(async (req: Request) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const admin = await requireAdmin(req);
    return new Response(
      JSON.stringify({
        ok: true,
        userId: admin.userId,
        displayName: admin.displayName,
        role: admin.role,
      }),
      { status: 200, headers: { ...corsHeaders(), "Content-Type": "application/json" } }
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    if (msg.includes("Unauthorized") || msg.includes("Invalid token") || msg.includes("Missing")) {
      return errorResponse(403, msg);
    }
    console.error("[admin-auth-check]", msg);
    return errorResponse(500, "Internal error");
  }
});
