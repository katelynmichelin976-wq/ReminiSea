import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireAdmin, errorResponse, corsHeaders, handleCors } from "../_shared/admin-auth.ts";
import {
  parseTimeWindow,
  timeWindowStartMs,
  timeWindowStartDateString,
  timeWindowDays,
  type TimeWindow,
} from "../_shared/time-window.ts";
import { SESSION_ANOMALY_TYPES } from "../_shared/event-types.ts";

type Supabase = ReturnType<typeof createClient>;

async function trendGrowth(sb: Supabase, tw: TimeWindow, nowMs: number) {
  const startMs = timeWindowStartMs(tw, nowMs);
  const startDate = timeWindowStartDateString(tw, nowMs);
  const totalDays = timeWindowDays(tw);

  const extendedStartMs = startMs - 30 * 86400000;
  const extendedStartDate = new Date(extendedStartMs).toISOString().split("T")[0];

  const { data: trialRows } = await sb
    .from("sync_trials")
    .select("trial_date, user_id")
    .gte("trial_date", extendedStartDate);

  const rows = trialRows || [];

  const byDate = new Map<string, Set<string>>();
  for (const r of rows) {
    if (!byDate.has(r.trial_date)) byDate.set(r.trial_date, new Set());
    byDate.get(r.trial_date)!.add(r.user_id);
  }

  const dauWauMau: { date: string; dau: number; wau: number; mau: number }[] = [];
  for (let i = 0; i < totalDays; i++) {
    const dayMs = startMs + i * 86400000;
    const ds = new Date(dayMs).toISOString().split("T")[0];
    const dau = byDate.get(ds)?.size ?? 0;

    const wauUsers = new Set<string>();
    for (let j = 0; j < 7; j++) {
      const bd = new Date(dayMs - j * 86400000).toISOString().split("T")[0];
      byDate.get(bd)?.forEach(u => wauUsers.add(u));
    }

    const mauUsers = new Set<string>();
    for (let j = 0; j < 30; j++) {
      const bd = new Date(dayMs - j * 86400000).toISOString().split("T")[0];
      byDate.get(bd)?.forEach(u => mauUsers.add(u));
    }

    dauWauMau.push({ date: ds, dau, wau: wauUsers.size, mau: mauUsers.size });
  }

  const startIso = new Date(startMs).toISOString();
  const { data: authData } = await sb.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const allUsers = authData?.users || [];

  const dateCounts = new Map<string, number>();
  for (const u of allUsers) {
    const d = u.created_at?.split("T")[0];
    if (d && d >= startDate) {
      dateCounts.set(d, (dateCounts.get(d) ?? 0) + 1);
    }
  }
  const newSignupsSeries: { date: string; count: number }[] = [];
  for (let i = 0; i < totalDays; i++) {
    const ds = new Date(startMs + i * 86400000).toISOString().split("T")[0];
    newSignupsSeries.push({ date: ds, count: dateCounts.get(ds) ?? 0 });
  }

  const { data: versionRows } = await sb
    .from("sync_trials")
    .select("app_version, user_id")
    .gte("trial_date", startDate)
    .not("app_version", "is", null)
    .neq("app_version", "");

  const versionUsers = new Map<string, Set<string>>();
  for (const r of (versionRows || [])) {
    if (!versionUsers.has(r.app_version)) versionUsers.set(r.app_version, new Set());
    versionUsers.get(r.app_version)!.add(r.user_id);
  }
  const versionDistribution = [...versionUsers.entries()]
    .map(([version, us]) => ({ version, users: us.size }))
    .sort((a, b) => b.users - a.users);

  return { dauWauMau, newSignupsSeries, versionDistribution };
}

async function trendHealth(sb: Supabase, tw: TimeWindow, nowMs: number) {
  const startMs = timeWindowStartMs(tw, nowMs);

  const { data: eventRows } = await sb
    .from("app_events")
    .select("event_type, user_id, payload, timestamp")
    .gte("timestamp", startMs);

  const events = eventRows || [];

  const hourlyMap = new Map<string, { jsErrors: number; sessionAnomalies: number }>();
  for (const e of events) {
    const hourBucket = new Date(e.timestamp).toISOString().slice(0, 13);
    if (!hourlyMap.has(hourBucket)) hourlyMap.set(hourBucket, { jsErrors: 0, sessionAnomalies: 0 });
    const bucket = hourlyMap.get(hourBucket)!;
    if (e.event_type === "js_error") bucket.jsErrors++;
    if (SESSION_ANOMALY_TYPES.has(e.event_type)) bucket.sessionAnomalies++;
  }
  const hourly = [...hourlyMap.entries()]
    .filter(([, v]) => v.jsErrors > 0 || v.sessionAnomalies > 0)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([hourBucket, v]) => ({ hourBucket, jsErrors: v.jsErrors, sessionAnomalies: v.sessionAnomalies }));

  const msgMap = new Map<string, { firstAt: string; lastAt: string; count: number; users: Set<string>; versions: Set<string> }>();
  for (const e of events) {
    if (e.event_type !== "js_error") continue;
    const p = e.payload as Record<string, unknown> | null;
    const rawMsg = p?.message;
    const msg = typeof rawMsg === "string" ? rawMsg.slice(0, 200) : "(no message)";
    if (!msgMap.has(msg)) {
      msgMap.set(msg, { firstAt: e.timestamp, lastAt: e.timestamp, count: 0, users: new Set(), versions: new Set() });
    }
    const entry = msgMap.get(msg)!;
    entry.count++;
    if (e.timestamp < entry.firstAt) entry.firstAt = e.timestamp;
    if (e.timestamp > entry.lastAt) entry.lastAt = e.timestamp;
    if (e.user_id) entry.users.add(e.user_id);
    const ver = p?.app_version;
    if (typeof ver === "string" && ver) entry.versions.add(ver);
  }
  const errorTable = [...msgMap.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .map(([message, v]) => ({
      message,
      firstAt: v.firstAt,
      lastAt: v.lastAt,
      count: v.count,
      affectedUsers: v.users.size,
      versions: [...v.versions],
    }));

  const versionMap = new Map<string, { total: number; errors: number }>();
  for (const e of events) {
    const p = e.payload as Record<string, unknown> | null;
    const ver = (typeof p?.app_version === "string" && p.app_version) ? p.app_version : "unknown";
    if (!versionMap.has(ver)) versionMap.set(ver, { total: 0, errors: 0 });
    const entry = versionMap.get(ver)!;
    entry.total++;
    if (e.event_type === "js_error") entry.errors++;
  }
  const versionHealth = [...versionMap.entries()]
    .map(([version, v]) => ({
      version,
      totalEvents: v.total,
      errors: v.errors,
      errorRatePerMille: v.total > 0 ? Math.round((v.errors / v.total) * 10000) / 10 : 0,
    }))
    .sort((a, b) => b.errorRatePerMille - a.errorRatePerMille);

  return { hourly, errorTable, versionHealth };
}

async function trendFeedback(sb: Supabase, tw: TimeWindow, nowMs: number) {
  const startMs = timeWindowStartMs(tw, nowMs);
  const startIso = new Date(startMs).toISOString();

  const { data: fbRows } = await sb
    .from("feedback")
    .select("id, created_at, device_id, feedback_type, app_version, user_desc, diagnostics")
    .gte("created_at", startIso)
    .order("created_at", { ascending: false })
    .limit(200);

  const rows = fbRows || [];

  const list = rows.map(r => ({
    id: r.id,
    ts: r.created_at,
    deviceHint: r.device_id ? String(r.device_id).slice(0, 8) : "anon",
    feedbackType: r.feedback_type ?? "general",
    appVersion: r.app_version ?? "",
    content: r.user_desc ?? "",
    diagnostics: r.diagnostics,
  }));

  const allText = rows.map(r => r.user_desc ?? "").join("").replace(/\s/g, "");
  const gramCounts = new Map<string, number>();
  for (let i = 0; i < allText.length - 1; i++) {
    const gram = allText.slice(i, i + 2);
    if (/^[一-鿿]{2}$/.test(gram)) {
      gramCounts.set(gram, (gramCounts.get(gram) ?? 0) + 1);
    }
  }
  const keywords = [...gramCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([term, count]) => ({ term, count }));

  return { list, keywords };
}

async function trendContent(sb: Supabase, tw: TimeWindow, nowMs: number) {
  const startDate = timeWindowStartDateString(tw, nowMs);

  const [{ data: deckRows }, { data: trialRows }, { data: cardRows }] = await Promise.all([
    sb.from("decks").select("id, name, deck_type, user_id, created_at"),
    sb.from("sync_trials").select("deck_key, user_id").gte("trial_date", startDate),
    sb.from("deck_cards").select("deck_id"),
  ]);

  const decks = deckRows || [];
  const trials = trialRows || [];
  const cards = cardRows || [];

  const deckMeta = new Map<string, { name: string; type: string; ownerHint: string; createdAt: string | null }>();
  for (const d of decks) {
    deckMeta.set(d.id, {
      name: d.name,
      type: d.deck_type,
      ownerHint: d.deck_type === "personal" && d.user_id ? String(d.user_id).slice(0, 8) : "—",
      createdAt: d.created_at ?? null,
    });
  }

  const trialsByKey = new Map<string, { trials: number; users: Set<string> }>();
  for (const r of trials) {
    if (!trialsByKey.has(r.deck_key)) trialsByKey.set(r.deck_key, { trials: 0, users: new Set() });
    const e = trialsByKey.get(r.deck_key)!;
    e.trials++;
    if (r.user_id) e.users.add(r.user_id);
  }

  const allKeys = new Set([...deckMeta.keys(), ...trialsByKey.keys()]);
  const fullDeckTable = [...allKeys]
    .map(deckKey => {
      const meta = deckMeta.get(deckKey);
      const stats = trialsByKey.get(deckKey);
      return {
        deckKey,
        name: meta?.name ?? deckKey,
        type: meta?.type ?? "unknown",
        ownerHint: meta?.ownerHint ?? "—",
        createdAt: meta?.createdAt ?? null,
        trials: stats?.trials ?? 0,
        users: stats?.users.size ?? 0,
      };
    })
    .sort((a, b) => b.trials - a.trials);

  const personalDecks = decks.filter(d => d.deck_type === "personal");

  const ownerCount = new Map<string, number>();
  for (const d of personalDecks) {
    const owner = d.user_id ?? "__anon__";
    ownerCount.set(owner, (ownerCount.get(owner) ?? 0) + 1);
  }
  const personalOwnerDistribution: Record<string, number> = { "1": 0, "2": 0, "3-5": 0, "6-10": 0, "10+": 0 };
  for (const cnt of ownerCount.values()) {
    if (cnt === 1) personalOwnerDistribution["1"]++;
    else if (cnt === 2) personalOwnerDistribution["2"]++;
    else if (cnt <= 5) personalOwnerDistribution["3-5"]++;
    else if (cnt <= 10) personalOwnerDistribution["6-10"]++;
    else personalOwnerDistribution["10+"]++;
  }

  const cardsByDeck = new Map<string, number>();
  for (const c of cards) {
    cardsByDeck.set(c.deck_id, (cardsByDeck.get(c.deck_id) ?? 0) + 1);
  }
  const personalCardDistribution: Record<string, number> = { "0": 0, "1-4": 0, "5-19": 0, "20-49": 0, "50+": 0 };
  for (const d of personalDecks) {
    const cnt = cardsByDeck.get(d.id) ?? 0;
    if (cnt === 0) personalCardDistribution["0"]++;
    else if (cnt <= 4) personalCardDistribution["1-4"]++;
    else if (cnt <= 19) personalCardDistribution["5-19"]++;
    else if (cnt <= 49) personalCardDistribution["20-49"]++;
    else personalCardDistribution["50+"]++;
  }

  return { fullDeckTable, personalOwnerDistribution, personalCardDistribution };
}

const VALID_QUADRANTS = new Set(["growth", "health", "feedback", "content"]);

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
  const quadrant = url.searchParams.get("quadrant");
  if (!quadrant || !VALID_QUADRANTS.has(quadrant)) {
    return errorResponse(400, "Missing or invalid quadrant param. Must be one of: growth, health, feedback, content");
  }

  const tw = parseTimeWindow(url.searchParams.get("timeWindow"));
  const nowMs = Date.now();

  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } }
  );

  try {
    let data: unknown;
    if (quadrant === "growth") data = await trendGrowth(sb, tw, nowMs);
    else if (quadrant === "health") data = await trendHealth(sb, tw, nowMs);
    else if (quadrant === "feedback") data = await trendFeedback(sb, tw, nowMs);
    else data = await trendContent(sb, tw, nowMs);

    return new Response(
      JSON.stringify({ ok: true, quadrant, timeWindow: tw, data }),
      { status: 200, headers: { ...corsHeaders(), "Content-Type": "application/json" } }
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return errorResponse(500, msg);
  }
});
