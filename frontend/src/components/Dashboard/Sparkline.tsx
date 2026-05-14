export function Sparkline({ values, width = 96, height = 28 }: { values: number[]; width?: number; height?: number }) {
  if (values.length < 2) return null;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = max - min || 1;
  const stepX = width / (values.length - 1);
  // Inset by stroke/circle radius so endpoints don't clip.
  const pad = 3;
  const innerH = height - pad * 2;
  const points = values
    .map((v, i) => {
      const x = i * stepX;
      const y = pad + innerH - ((v - min) / range) * innerH;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });
  const polyStr = points.join(" ");
  const lastX = (values.length - 1) * stepX;
  const lastY = pad + innerH - ((values[values.length - 1] - min) / range) * innerH;
  // Area fill below the line, anchored to bottom of SVG.
  const areaStr = `0,${height} ${polyStr} ${width},${height}`;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ display: "block", overflow: "visible", flexShrink: 0 }} aria-hidden="true">
      <polyline
        points={areaStr}
        fill="var(--accent-orange)"
        fillOpacity="0.10"
        stroke="none"
      />
      <polyline
        points={polyStr}
        fill="none"
        stroke="var(--accent-orange)"
        strokeWidth="1.75"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <circle cx={lastX} cy={lastY} r="2.5" fill="var(--accent-orange)" />
    </svg>
  );
}
