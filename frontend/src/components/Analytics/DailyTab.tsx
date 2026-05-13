import { useEffect, useRef } from "react";
import * as echarts from "echarts/core";
import type { ComposeOption } from "echarts/core";
import { BarChart } from "echarts/charts";
import type { BarSeriesOption } from "echarts/charts";
import { TooltipComponent, GridComponent, LegendComponent } from "echarts/components";
import type { TooltipComponentOption, GridComponentOption, LegendComponentOption } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import type { DailyBucket } from "../../api/types";

echarts.use([BarChart, TooltipComponent, GridComponent, LegendComponent, CanvasRenderer]);

type EChartsOption = ComposeOption<
  BarSeriesOption | TooltipComponentOption | GridComponentOption | LegendComponentOption
>;

interface DailyTabProps {
  daily: DailyBucket[];
}

const PALETTE = {
  input:      "#7eb6c4",
  output:     "#6bb5a6",
  cacheWrite: "#c9a96e",
  cacheRead:  "#9b8ec4",
};

function isDark(): boolean {
  return document.documentElement.getAttribute("data-theme") === "dark";
}

function fmtK(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`;
  return String(n);
}

export function DailyTab({ daily }: DailyTabProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const chart = echarts.init(containerRef.current, undefined, { renderer: "canvas" });
    chartRef.current = chart;

    const ro = new ResizeObserver(() => chart.resize());
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      chart.dispose();
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || daily.length === 0) return;

    const dark = isDark();
    const textColor = dark ? "#c9c7bf" : "#73726c";
    const gridLine = dark ? "rgba(255,255,255,0.06)" : "rgba(31,30,29,0.08)";

    const option: EChartsOption = {
      backgroundColor: "transparent",
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "shadow" },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        formatter: (params: any) => {
          if (!Array.isArray(params) || params.length === 0) return "";
          const lines = (params as Array<{ seriesName: string; value: number; color: string }>)
            .map((p) => `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${p.color};margin-right:4px"></span>${p.seriesName}: ${fmtK(p.value)}`)
            .join("<br/>");
          return `<b>${(params[0] as { axisValue: string }).axisValue}</b><br/>${lines}`;
        },
      },
      legend: {
        data: ["Input", "Output", "Cache Write", "Cache Read"],
        textStyle: { color: textColor, fontSize: 12 },
        bottom: 0,
      },
      grid: { top: 20, right: 20, bottom: 50, left: 60, containLabel: false },
      xAxis: {
        type: "category",
        data: daily.map((d) => d.day),
        axisLabel: { color: textColor, fontSize: 11, rotate: daily.length > 14 ? 30 : 0 },
        axisLine: { lineStyle: { color: gridLine } },
        axisTick: { show: false },
      },
      yAxis: {
        type: "value",
        axisLabel: { color: textColor, fontSize: 11, formatter: fmtK },
        splitLine: { lineStyle: { color: gridLine } },
      },
      series: [
        {
          name: "Input",
          type: "bar",
          stack: "tokens",
          data: daily.map((d) => d.input_tokens),
          itemStyle: { color: PALETTE.input },
        },
        {
          name: "Output",
          type: "bar",
          stack: "tokens",
          data: daily.map((d) => d.output_tokens),
          itemStyle: { color: PALETTE.output },
        },
        {
          name: "Cache Write",
          type: "bar",
          stack: "tokens",
          data: daily.map((d) => d.cache_creation_tokens),
          itemStyle: { color: PALETTE.cacheWrite },
        },
        {
          name: "Cache Read",
          type: "bar",
          stack: "tokens",
          data: daily.map((d) => d.cache_read_tokens),
          itemStyle: { color: PALETTE.cacheRead },
        },
      ],
    };
    chart.setOption(option);
  }, [daily]);

  if (daily.length === 0) {
    return (
      <div style={{ color: "var(--text-tertiary)", fontSize: "13px" }}>
        No daily data yet.
      </div>
    );
  }

  return (
    <div>
      <h3 style={{ fontSize: "12px", color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.07em", margin: "0 0 12px" }}>
        Daily Token Usage
      </h3>
      <div ref={containerRef} style={{ width: "100%", height: "360px" }} />
    </div>
  );
}
