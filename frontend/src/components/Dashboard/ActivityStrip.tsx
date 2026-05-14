import type { DailyBucket } from "../../api/types";
import { SectionHeader } from "./SectionHeader";

export function ActivityStrip({ daily }: { daily: DailyBucket[] }) {
  const DAYS = 30;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const buckets = new Map<string, DailyBucket>();
  for (const b of daily) buckets.set(b.day, b);

  const cells: Array<{ key: string; date: Date; count: number }> = [];
  for (let i = DAYS - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    const b = buckets.get(key);
    cells.push({ key, date: d, count: b ? b.prompt_count : 0 });
  }

  const max = Math.max(1, ...cells.map((c) => c.count));

  // Intensity ramp uses color-mix so the gradient tracks --accent-orange in
  // both themes. The empty-cell color is a neutral bg-tool-block lift, not a
  // bright accent, so quiet days don't compete visually.
  const RAMP = [
    "var(--bg-tool-block)",
    "color-mix(in srgb, var(--accent-orange) 20%, transparent)",
    "color-mix(in srgb, var(--accent-orange) 40%, transparent)",
    "color-mix(in srgb, var(--accent-orange) 65%, transparent)",
    "var(--accent-orange)",
  ];

  function intensity(count: number): string {
    if (count === 0) return RAMP[0];
    const t = count / max;
    if (t < 0.25) return RAMP[1];
    if (t < 0.5) return RAMP[2];
    if (t < 0.75) return RAMP[3];
    return RAMP[4];
  }

  const totalPrompts = cells.reduce((a, c) => a + c.count, 0);
  const activeDays = cells.filter((c) => c.count > 0).length;

  return (
    <section>
      <SectionHeader title="Activity" hint={`${activeDays}/${DAYS} active days · ${totalPrompts} prompts`} />
      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        <div style={{ display: "flex", gap: "4px" }}>
          {cells.map((c) => (
            <div
              key={c.key}
              title={`${c.date.toLocaleDateString("en-US", { month: "short", day: "numeric" })} · ${c.count} prompt${c.count !== 1 ? "s" : ""}`}
              style={{
                flex: 1,
                aspectRatio: "1 / 1",
                maxHeight: "22px",
                borderRadius: "3px",
                background: intensity(c.count),
                transition: "background 0.15s",
              }}
            />
          ))}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "11px", color: "var(--text-tertiary)" }}>
          <span>30 days ago</span>
          <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
            <span>less</span>
            {RAMP.map((c, i) => (
              <div key={i} style={{ width: "10px", height: "10px", borderRadius: "2px", background: c }} />
            ))}
            <span>more</span>
          </div>
          <span>today</span>
        </div>
      </div>
    </section>
  );
}
