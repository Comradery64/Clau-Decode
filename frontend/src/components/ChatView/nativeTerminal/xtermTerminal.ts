import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { Unicode11Addon } from "@xterm/addon-unicode11";
import type { ITerminalOptions, ITheme } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";

export type NativeTerminal = Terminal;
export type NativeFitAddon = FitAddon;
export type NativeTerminalOptions = ITerminalOptions;
export type { ITheme };

export function createNativeTerminal(options: NativeTerminalOptions): NativeTerminal {
  return new Terminal(options);
}

export function createNativeFitAddon(): NativeFitAddon {
  return new FitAddon();
}

// Unicode 11 width table. xterm defaults to the Unicode 6 table, which
// under-counts modern emoji (✅ U+2705, 🟢 U+1F7E2, etc.) by one cell — claude
// renders them 2-wide, so the mismatch shifts the line by a cell and the offset
// cascades down the screen on repaint/scroll (the "stray char / bottom gone"
// artifact). Activating version "11" makes xterm's width match claude's.
export function createNativeUnicodeAddon(): Unicode11Addon {
  return new Unicode11Addon();
}

export function applyNativeTerminalTheme(terminal: NativeTerminal, theme: ITheme): void {
  // xterm applies options.theme live (re-themes the renderer in place).
  terminal.options.theme = theme;
}

// Write PTY bytes straight through to xterm's VT engine. A real terminal does
// nothing to the byte stream, and xterm is a faithful VT emulator, so claude's
// output renders — and accumulates scrollback — exactly as it does in iTerm /
// Terminal.app.
//
// We used to scan each write for a "redraw boundary" (cursor-home+erase,
// full-screen erase, alt-screen, form-feed) and call terminal.clear() when one
// was found. That was the scroll bug: claude routinely repaints its bottom
// chrome (status line / input box) with cursor-home + per-line erase AFTER its
// history has scrolled into xterm's scrollback. Each repaint tripped the
// boundary and clear() wiped ALL accumulated scrollback — so the native view
// had nothing above the fold. Proven: a home+erase repaint after 225 scrolled
// lines keeps 225 with raw write() but collapses to 0 with the clear() path.
export function writeNativeTerminalBytes(terminal: NativeTerminal, bytes: Uint8Array): void {
  terminal.write(bytes);
}
