export type TimeWindow = "24h" | "7d" | "30d";

export function parseTimeWindow(s: unknown): TimeWindow {
  if (s === "24h" || s === "7d" || s === "30d") return s;
  return "7d";
}

export function timeWindowToMs(tw: TimeWindow): number {
  if (tw === "24h") return 24 * 3600 * 1000;
  if (tw === "7d") return 7 * 86400 * 1000;
  return 30 * 86400 * 1000;
}

export function timeWindowStartMs(tw: TimeWindow, nowMs = Date.now()): number {
  return nowMs - timeWindowToMs(tw);
}

export function timeWindowStartDateString(tw: TimeWindow, nowMs = Date.now()): string {
  return new Date(timeWindowStartMs(tw, nowMs)).toISOString().split("T")[0];
}

export function timeWindowDays(tw: TimeWindow): number {
  if (tw === "24h") return 1;
  if (tw === "7d") return 7;
  return 30;
}
