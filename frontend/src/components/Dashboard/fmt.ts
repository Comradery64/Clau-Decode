// Shared formatting helpers used across Dashboard sub-components.

export function fmtUsd(n: number): string {
  if (n >= 1) return `$${n.toFixed(2)}`;
  if (n > 0) return `$${n.toFixed(4)}`;
  return "$0";
}

export function fmtCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000) return `${(n / 1000).toFixed(0)}k`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

export function fmtModel(m: string): string {
  return m.replace(/^claude-/, "").replace(/-\d{8}$/, "");
}

export const MODEL_COLORS: Record<string, string> = {
  sonnet: "#b8956a",
  opus: "#9b8ec4",
  haiku: "#6bb5a6",
};

export function modelColor(m: string): string {
  const lower = m.toLowerCase();
  for (const [key, color] of Object.entries(MODEL_COLORS)) {
    if (lower.includes(key)) return color;
  }
  return "var(--text-tertiary)";
}

export function greeting(): string {
  const h = new Date().getHours();
  if (h < 5) return "Working late";
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

export function splitPath(p: string): { name: string; dir: string } {
  const idx = p.lastIndexOf("/");
  if (idx === -1) return { name: p, dir: "" };
  return { name: p.slice(idx + 1), dir: p.slice(0, idx) };
}
