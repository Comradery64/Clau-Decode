import { expect, test } from "@playwright/test";
import path from "node:path";

declare global {
  interface Window {
    GhosttyWeb: {
      init: () => Promise<void>;
      Terminal: new (options: {
        cols: number;
        rows: number;
        scrollback: number;
        fontSize: number;
        fontFamily: string;
        theme: { background: string; foreground: string };
      }) => {
        cols: number;
        rows: number;
        open: (element: HTMLElement) => void;
        write: (data: string) => void;
        getScrollbackLength: () => number;
        getViewportY: () => number;
      };
    };
    __ghosttySmoke: {
      canvas: boolean;
      scrollback: number;
      cols: number;
      rows: number;
      viewportY: number;
    };
  }
}

test("ghostty-web opens, writes redraw bytes, and keeps scrollback", async ({ page }) => {
  await page.setContent('<div id="terminal" style="width:800px;height:400px"></div>');
  await page.addScriptTag({
    path: path.resolve(process.cwd(), "node_modules/ghostty-web/dist/ghostty-web.umd.cjs"),
  });

  await page.evaluate(async () => {
    const { init, Terminal } = window.GhosttyWeb;
    await init();
    const term = new Terminal({
      cols: 80,
      rows: 12,
      scrollback: 200,
      fontSize: 13,
      fontFamily: "monospace",
      theme: { background: "#20201f", foreground: "#f6f4ef" },
    });
    term.open(document.getElementById("terminal")!);
    for (let i = 0; i < 40; i += 1) term.write(`line ${i}\r\n`);
    term.write("\x1b[H\x1b[2Kfresh redraw");
    await new Promise((resolve) => requestAnimationFrame(resolve));
    window.__ghosttySmoke = {
      canvas: Boolean(document.querySelector("canvas")),
      scrollback: term.getScrollbackLength(),
      cols: term.cols,
      rows: term.rows,
      viewportY: term.getViewportY(),
    };
  });

  const result = await page.evaluate(() => window.__ghosttySmoke);
  expect(result.canvas).toBe(true);
  expect(result.scrollback).toBeGreaterThan(20);
  expect(result.cols).toBe(80);
  expect(result.rows).toBe(12);
  expect(result.viewportY).toBe(0);
});
