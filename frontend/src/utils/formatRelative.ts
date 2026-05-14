/**
 * Compact relative-time string for recent activity.
 * Format ladder: "just now" < 1m → "Nm ago" < 1h → "Nh ago" < 1d
 *                "Nd ago" < 7d → "Mon D" (locale month + day) otherwise.
 */
export function formatRelative(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const now = Date.now();
  const diff = now - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/**
 * Bucketed relative date label used in lists/headers.
 * Format ladder: "Today" / "Yesterday" / weekday (this week) /
 *                "Mon D" (this year) / "Mon D, YYYY" otherwise.
 */
export function formatRelativeBucket(isoString: string): string {
  const date = new Date(isoString);
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfYesterday = new Date(startOfToday.getTime() - 86400000);
  const startOfWeek = new Date(startOfToday.getTime() - startOfToday.getDay() * 86400000);
  const startOfYear = new Date(now.getFullYear(), 0, 1);
  if (date >= startOfToday) return "Today";
  if (date >= startOfYesterday) return "Yesterday";
  if (date >= startOfWeek) return date.toLocaleDateString("en-US", { weekday: "short" });
  if (date >= startOfYear) return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
