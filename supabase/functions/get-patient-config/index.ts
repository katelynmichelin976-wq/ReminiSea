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

// SRS 参数中文标签映射
const SRS_LABELS: Record<string, string> = {
  learning_steps: "学习步长（分钟）",
  graduating_interval: "毕业间隔（天）",
  easy_interval: "简单间隔（天）",
  relearning_steps: "重学步长（分钟）",
  minimum_interval: "最小间隔（天）",
  new_interval: "失败后间隔乘数",
  new_cards_per_day: "每日新卡上限",
  maximum_reviews_per_day: "每日复习上限",
  new_cards_ignore_review_limit: "新卡忽略复习上限",
  maximum_interval: "最大间隔（天）",
  starting_ease: "初始难度",
  easy_bonus: "简单奖励",
  interval_modifier: "间隔修正",
  hard_interval: "困难间隔乘数",
  ease_min: "最小难度",
  hard_step_multiplier: "困难步长乘数",
  t1_review_before_mix: "T1 复习次数",
  t1_mix_before_t7: "T1 混合后次数",
  daily_remove_lapses: "每日移出门槛",
  auto_suspend_lapses: "自动挂起阈值",
  practice_advance_sec: "自动前进秒数",
  maximum_answer_seconds: "最大答题秒数",
  idle_threshold_sec: "空闲阈值（秒）",
  warn_duration_sec: "提醒时长（秒）",
  warn_repeat_sec: "提醒重复间隔（秒）",
  warn_mode: "提醒模式",
  learn_ahead_limit: "提前学习窗口（秒）",
};

// UI 参数中文标签映射
const UI_LABELS: Record<string, string> = {
  readHint: "阅读提示",
  quizPromptOn: "答题提示",
  quizPromptDelay: "提示延迟",
  optHintOn: "选项提示",
  optHintDelay: "选项提示延迟",
  wrongHintOn: "错误提示",
  confettiOn: "完成动画",
  correctHintOn: "正确提示",
  phraseSelect: "选题短语",
  phraseWrong: "答错短语",
  phraseOptHint: "选项提示短语",
  phraseCorrect: "答对短语",
  ttsRate: "语音语速",
  ttsPitch: "语音音调",
  ttsVoiceName: "语音角色",
  delay: "切换延迟",
  browseDelay: "浏览延迟",
  browseAnsDelay: "浏览答案延迟",
  optCount: "选项数量",
  optTouchDelay: "触摸延迟",
  ndur: "练习时长",
  bdur: "浏览时长",
  theme: "主题",
};

interface PatientConfigInput {
  userId: string;
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
    const { userId }: PatientConfigInput = await req.json();
    if (!userId) return errorResponse(400, "Missing required parameter: userId");

    const { data, error } = await supabase
      .from("sync_config")
      .select("config_json, updated_at, created_at")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) throw error;

    const config = data?.config_json || null;
    const updatedAt = data?.updated_at || null;
    const createdAt = data?.created_at || null;

    return new Response(JSON.stringify({
      config,
      updatedAt,
      createdAt,
      srsLabels: SRS_LABELS,
      uiLabels: UI_LABELS,
    }), {
      status: 200,
      headers: { ...corsHeaders(), "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error("[get-patient-config]", msg);
    return errorResponse(500, msg);
  }
});
