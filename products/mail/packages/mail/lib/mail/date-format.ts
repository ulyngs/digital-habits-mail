/**
 * How mail shows dates and times in the list and in a thread.
 *
 * Pure functions. They read the clock and the viewer's locale, and nothing
 * else, so a change here shows up the same way in every surface.
 */

export function startOfDay(d: Date): number {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  return copy.getTime();
}

export function dayBucket(iso: string): string {
  const now = new Date();
  const today = startOfDay(now);
  const then = startOfDay(new Date(iso));
  const dayMs = 24 * 60 * 60 * 1000;
  if (then >= today) return "Today";
  if (then >= today - dayMs) return "Yesterday";
  const daysAgo = Math.floor((today - then) / dayMs);
  const weekday = now.getDay() === 0 ? 7 : now.getDay(); // Monday-based
  if (daysAgo < weekday) return "Earlier this week";
  if (daysAgo < weekday + 7) return "Last week";
  return "Earlier";
}

export function rowTime(iso: string, options?: { withYear?: boolean }): string {
  const d = new Date(iso);
  if (options?.withYear) {
    // Search spans years — always show an absolute date.
    return d.toLocaleDateString(undefined, {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  }
  const bucket = dayBucket(iso);
  // Today / Yesterday already have section headers — show the clock time.
  if (bucket === "Today" || bucket === "Yesterday") {
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  if (bucket === "Earlier this week") {
    return d.toLocaleDateString(undefined, { weekday: "short" });
  }
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

/**
 * The clock time, always — no "yesterday", no weekday.
 *
 * For a chat bubble, where the day is a heading further up and the only
 * question left about a message is what time it was said.
 */
export function timeOfDay(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** True when two timestamps fall on the same calendar day, locally. */
export function sameDay(a: string | null, b: string | null): boolean {
  if (!a || !b) return false;
  return startOfDay(new Date(a)) === startOfDay(new Date(b));
}

/**
 * The heading over a day's messages in a chat.
 *
 * `dayBucket` answers a different question — it groups a list into Today,
 * Earlier this week, Last week — and "Earlier" over a run of bubbles says
 * nothing about which day they were. This names the day.
 */
export function chatDayLabel(iso: string | null): string {
  if (!iso) return "";
  const then = startOfDay(new Date(iso));
  const today = startOfDay(new Date());
  const dayMs = 24 * 60 * 60 * 1000;
  if (then === today) return "Today";
  if (then === today - dayMs) return "Yesterday";
  const d = new Date(iso);
  const withinYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    ...(withinYear ? null : { year: "numeric" }),
  });
}

export function shortDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
  });
}

export function messageStamp(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return `${shortDate(iso)}, ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
}

/**
 * Client-side mirror of the server's Gmail-style quote appendix, so the
 * optimistic local bubble can collapse it behind "…" just like a fetched one.
 */
