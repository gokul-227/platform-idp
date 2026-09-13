/**
 * How this estate writes an instant, so the console and the sign-in app cannot
 * disagree about one. Always UTC and always said so: every timestamp here is
 * recorded by a server, and a bare `2026-09-08 19:20` reads as local time to
 * whoever is looking at it.
 */

/** `8 Sep 2026` — the day, for a column that stacks it above the time. */
export function formatDay(value: Date): string {
  return value.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** `19:20:14 UTC` — seconds, because two audit rows a minute apart are common. */
export function formatTimeUtc(value: Date): string {
  return `${value.toISOString().slice(11, 19)} UTC`;
}

/** `8 Sep 2026, 19:20:14 UTC` — one event, read on its own. */
export function formatTimestamp(value: Date): string {
  return `${formatDay(value)}, ${formatTimeUtc(value)}`;
}

/**
 * `2026-09-08 19:20 UTC` — sortable and to the minute, for the created/updated
 * rows where the second never matters and the column is narrow.
 */
export function formatDate(value?: Date): string {
  if (!value) {
    return "";
  }
  return `${value.toISOString().replace("T", " ").slice(0, 16)} UTC`;
}
