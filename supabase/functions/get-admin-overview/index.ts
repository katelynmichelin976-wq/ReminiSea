import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireAdmin, errorResponse, corsHeaders, handleCors } from "../_shared/admin-auth.ts";
import {
  parseTimeWindow,
  timeWindowStartMs,
  timeWindowStartDateString,
  timeWindowDays,
  type TimeWindow,
} from "../_shared/time-window.ts";

type QuadrantOk<T> = T & { ok: true }
interface QuadrantErr { ok: false; error: string }
type Quadrant<T> = QuadrantOk<T> | QuadrantErr

interface GrowthKpi { dauAvg: number; newUsers: number; totalTrials: number; retention: number | null }
interface MiniChartPoint { date: string; dau: number }
interface HealthKpi { jsErrors: number; affectedUsers: number; sessionAnomalies: number; errorRatePerMille: number }
interface TopError { message: string; count: number; affectedUsers: number }
interface FeedbackKpi { windowCount: number; totalCount: number; withDiagnostics: number; uniqueDevices: number }
interface RecentFeedback { id: string; ts: string; deviceHint: string; feedbackType: string; contentPreview: string; appVersion: string }
interface ContentKpi { totalDecks: number; activeDecks: number; personalOwners: number; newPersonalDecks: number }
interface TopDeck { deckKey: string; name: string; type: string; trials: number; users: number }

interface OverviewResponse {
  ok: true;
  asOf: string;
  timeWindow: TimeWindow;
  growth: Quadrant<{ kpi: GrowthKpi; miniChart: MiniChartPoint[] }>;
  health: Quadrant<{ kpi: HealthKpi; topErrors: TopError[] }>;
  feedback: Quadrant<{ kpi: FeedbackKpi; recent: RecentFeedback[] }>;
  content: Quadrant<{ kpi: ContentKpi; topDecks: TopDeck[] }>;
}

const cache = new Map<string, { at: number; data: OverviewResponse }>();

const SESSION_ANOMALY_TYPES = new Set([
  "session_restore_l1_fail",
  "session_restore_l3_fail",
  "session_restore_l1_timeout",
  "session_restore_sdk_signout",
  "session_restore_l2_real_logout",
]);

Deno.serve(async (req: Request) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    await requireAdmin(req);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    if (msg.includes("Unauthorized") || msg.includes("Invalid token") || msg.includes("Missing")) {
      return errorResponse(403, msg);
    }
    return errorResponse(500, msg);
  }

  const url = new URL(req.url);
  const tw = parseTimeWindow(url.searchParams.get("timeWindow"));
  const cacheKey = `${tw}::${Math.floor(Date.now() / 60000)}`;

  const cached = cache.get(cacheKey);
  if (cached) {
    return new Response(
      JSON.stringify(cached.data),
      { status: 200, headers: { ...corsHeaders(), "Content-Type": "application/json" } }
    );
  }

  const nowMs = Date.now();
  const startMs = timeWindowStartMs(tw, nowMs);
  const startDate = timeWindowStartDateString(tw, nowMs);
  const startIso = new Date(startMs).toISOString();
  const totalDays = timeWindowDays(tw);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } }
  );

  let growth: OverviewResponse["growth"];
  let health: OverviewResponse["health"];
  let feedback: OverviewResponse["feedback"];
  let content: OverviewResponse["content"];

  try {
    const { data: trialRows } = await supabase
      .from("sync_trials")
      .select("trial_date, user_id")
      .gte("trial_date", startDate);

    const rows = trialRows || [];
    const totalTrials = rows.length;

    const byDate = new Map<string, Set<string>>();
    for (const r of rows) {
      if (!byDate.has(r.trial_date)) byDate.set(r.trial_date, new Set());
      byDate.get(r.trial_date)!.add(r.user_id);
    }

    let dauSum = 0;
    const miniChart: MiniChartPoint[] = [];
    for (let i = 0; i < totalDays; i++) {
      const d = new Date(startMs + i * 86400000);
      const ds = d.toISOString().split("T")[0];
      const dau = byDate.get(ds)?.size ?? 0;
      dauSum += dau;
      miniChart.push({ date: ds, dau });
    }
    const dauAvg = Math.round((dauSum / totalDays) * 10) / 10;

    const { data: authData } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const newUsers = (authData?.users || []).filter(
      u => u.created_at >= startIso
    ).length;

    let retention: number | null = null;
    if (tw === "7d") {
      const cohortStart = new Date(startMs - 7 * 86400000).toISOString().split("T")[0];
      const cohortEnd = startDate;
      const { data: cohortRows } = await supabase
        .from("sync_trials")
        .select("user_id")
        .gte("trial_date", cohortStart)
        .lt("trial_date", cohortEnd);
      const cohort = new Set((cohortRows || []).map(r => r.user_id));
      const retained = new Set(rows.map(r => r.user_id));
      const retainedCount = [...cohort].filter(u => retained.has(u)).length;
      retention = cohort.size > 0 ? Math.round((retainedCount / cohort.size) * 1000) / 10 : null;
    } else if (tw === "30d") {
      const cohortStart = new Date(startMs - 30 * 86400000).toISOString().split("T")[0];
      const cohortEnd = startDate;
      const { data: cohortRows } = await supabase
        .from("sync_trials")
        .select("user_id")
        .gte("trial_date", cohortStart)
        .lt("trial_date", cohortEnd);
      const cohort = new Set((cohortRows || []).map(r => r.user_id));
      const retained = new Set(rows.map(r => r.user_id));
      const retainedCount = [...cohort].filter(u => retained.has(u)).length;
      retention = cohort.size > 0 ? Math.round((retainedCount / cohort.size) * 1000) / 10 : null;
    }

    growth = { ok: true, kpi: { dauAvg, newUsers, totalTrials, retention }, miniChart };
  } catch (e) {
    growth = { ok: false, error: e instanceof Error ? e.message : String(e) };
  }

  try {
    const { data: eventRows } = await supabase
      .from("app_events")
      .select("event_type, user_id, payload")
      .gte("timestamp", startMs);

    const events = eventRows || [];
    const totalEvents = events.length;

    const jsErrorEvents = events.filter(e => e.event_type === "js_error");
    const jsErrors = jsErrorEvents.length;
    const affectedUsers = new Set(jsErrorEvents.map(e => e.user_id)).size;
    const sessionAnomalies = events.filter(e => SESSION_ANOMALY_TYPES.has(e.event_type)).length;
    const errorRatePerMille = totalEvents > 0
      ? Math.round((jsErrors / totalEvents) * 10000) / 10
      : 0;

    const msgMap = new Map<string, { count: number; users: Set<string> }>();
    for (const e of jsErrorEvents) {
      const raw = (e.payload as Record<string, unknown>)?.message;
      const msg = typeof raw === "string" ? raw.slice(0, 200) : "(no message)";
      if (!msgMap.has(msg)) msgMap.set(msg, { count: 0, users: new Set() });
      const entry = msgMap.get(msg)!;
      entry.count++;
      if (e.user_id) entry.users.add(e.user_id);
    }
    const topErrors: TopError[] = [...msgMap.entries()]
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 5)
      .map(([message, v]) => ({ message, count: v.count, affectedUsers: v.users.size }));

    health = { ok: true, kpi: { jsErrors, affectedUsers, sessionAnomalies, errorRatePerMille }, topErrors };
  } catch (e) {
    health = { ok: false, error: e instanceof Error ? e.message : String(e) };
  }

  try {
    const { data: fbRows } = await supabase
      .from("feedback")
      .select("id, created_at, device_id, feedback_type, user_desc, app_version, diagnostics")
      .gte("created_at", startIso)
      .order("created_at", { ascending: false });

    const { count: totalCount } = await supabase
      .from("feedback")
      .select("*", { count: "exact", head: true });

    const rows = fbRows || [];
    const windowCount = rows.length;
    const withDiagnostics = rows.filter(r => r.diagnostics != null).length;
    const uniqueDevices = new Set(rows.map(r => r.device_id).filter(Boolean)).size;

    const recent: RecentFeedback[] = rows.slice(0, 5).map(r => ({
      id: r.id,
      ts: r.created_at,
      deviceHint: r.device_id ? String(r.device_id).slice(0, 8) : "anon",
      feedbackType: r.feedback_type ?? "general",
      contentPreview: (r.user_desc || "").slice(0, 60),
      appVersion: r.app_version ?? "",
    }));

    feedback = { ok: true, kpi: { windowCount, totalCount: totalCount ?? 0, withDiagnostics, uniqueDevices }, recent };
  } catch (e) {
    feedback = { ok: false, error: e instanceof Error ? e.message : String(e) };
  }

  try {
    const [{ data: deckRows }, { data: trialRows }] = await Promise.all([
      supabase.from("decks").select("id, name, deck_type, user_id, created_at"),
      supabase.from("sync_trials").select("deck_key, user_id").gte("trial_date", startDate),
    ]);

    const decks = deckRows || [];
    const trials = trialRows || [];

    const totalDecks = decks.length;
    const activeDecks = new Set(trials.map(r => r.deck_key)).size;
    const personalOwners = new Set(
      decks.filter(d => d.deck_type === "personal").map(d => d.user_id)
    ).size;
    const newPersonalDecks = decks.filter(
      d => d.deck_type === "personal" && d.created_at >= startIso
    ).length;

    const deckByKey = new Map<string, { name: string; type: string }>();
    for (const d of decks) {
      deckByKey.set(d.id, { name: d.name, type: d.deck_type });
    }

    const deckTrials = new Map<string, { trials: number; users: Set<string> }>();
    for (const r of trials) {
      if (!deckTrials.has(r.deck_key)) deckTrials.set(r.deck_key, { trials: 0, users: new Set() });
      const entry = deckTrials.get(r.deck_key)!;
      entry.trials++;
      if (r.user_id) entry.users.add(r.user_id);
    }

    const topDecks: TopDeck[] = [...deckTrials.entries()]
      .sort((a, b) => b[1].trials - a[1].trials)
      .slice(0, 5)
      .map(([deckKey, v]) => {
        const meta = deckByKey.get(deckKey);
        return {
          deckKey,
          name: meta?.name ?? deckKey,
          type: meta?.type ?? "unknown",
          trials: v.trials,
          users: v.users.size,
        };
      });

    content = { ok: true, kpi: { totalDecks, activeDecks, personalOwners, newPersonalDecks }, topDecks };
  } catch (e) {
    content = { ok: false, error: e instanceof Error ? e.message : String(e) };
  }

  const result: OverviewResponse = {
    ok: true,
    asOf: new Date(nowMs).toISOString(),
    timeWindow: tw,
    growth,
    health,
    feedback,
    content,
  };

  cache.set(cacheKey, { at: nowMs, data: result });

  return new Response(
    JSON.stringify(result),
    { status: 200, headers: { ...corsHeaders(), "Content-Type": "application/json" } }
  );
});
