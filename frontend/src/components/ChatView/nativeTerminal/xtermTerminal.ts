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

const terminalTextDecoder = new TextDecoder();
const terminalTextEncoder = new TextEncoder();

// Claude's TUI periodically repaints the whole screen (form-feed, alt-screen
// enter, full-screen erase, or home+erase). Everything before the LAST such
// boundary in a buffer is about to be overwritten, so replaying it just churns
// scrollback. Find that boundary so the caller can clear() + write only the
// live remainder. (Carried over from the original xterm renderer — xterm's VT
// engine renders the rest correctly on its own.)
function lastRedrawBoundary(text: string): number {
  const patterns = [
    /\x0c/g, // form feed
    /\x1b\[\?1049h/g, // enter alternate screen
    /\x1b\[(?:2|3)J/g, // erase entire screen / scrollback
    /\x1b\[(?:H|1;1H)(?=\x1b\[[0-9;?]*[JK])/g, // cursor home immediately followed by erase
  ];
  let boundary = -1;
  for (const pattern of patterns) {
    pattern.lastIndex = 0;
    let match = pattern.exec(text);
    while (match) {
      boundary = Math.max(boundary, match.index);
      match = pattern.exec(text);
    }
  }
  return boundary;
}

export interface PreparedTerminalWrite {
  data: Uint8Array;
  clearsRedrawHistory: boolean;
}

export function prepareTerminalWrite(data: Uint8Array): PreparedTerminalWrite {
  const text = terminalTextDecoder.decode(data);
  const boundary = lastRedrawBoundary(text);
  if (boundary < 0) return { data, clearsRedrawHistory: false };
  if (boundary === 0) return { data, clearsRedrawHistory: true };
  return {
    data: terminalTextEncoder.encode(text.slice(boundary)),
    clearsRedrawHistory: true,
  };
}

// Strip \x1b[3J (erase scrollback) so a resume/clear can't wipe xterm's
// scrollback — including the seeded transcript. \x1b[2J (erase the visible
// screen) is left intact; in xterm it doesn't touch scrollback.
export function stripScrollbackErase(bytes: Uint8Array): Uint8Array {
  const text = terminalTextDecoder.decode(bytes);
  if (!text.includes("\x1b[3J")) return bytes;
  return terminalTextEncoder.encode(text.replace(/\x1b\[3J/g, ""));
}

// Write claude's bytes straight through — do NOT clear() on repaints. Clearing
// wiped xterm's scrollback on every full-screen repaint, so history never
// survived (you couldn't scroll back, and any seeded transcript was erased).
// claude repaints the viewport in place (home + per-line erase), which leaves
// the scrolled-off history intact in scrollback on its own.
export function writeNativeTerminalBytes(terminal: NativeTerminal, bytes: Uint8Array): void {
  terminal.write(stripScrollbackErase(bytes));
}
