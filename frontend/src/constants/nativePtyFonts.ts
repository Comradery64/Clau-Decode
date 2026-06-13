import type { NativePtyFontFamily } from "../api/types";

type NativePtyFontOption = {
  value: NativePtyFontFamily;
  label: string;
  stack: string;
  // false = NOT shipped in this repo (license doesn't allow redistribution);
  // renders only if the user has it installed on their system.
  bundled?: boolean;
  // Where to obtain a not-bundled font (shown as a recommendation in Settings).
  acquireUrl?: string;
};

const MONO_FALLBACK = "\"SFMono-Regular\", Menlo, Consolas, \"Liberation Mono\", monospace";

export const DEFAULT_NATIVE_PTY_FONT: NativePtyFontFamily = "monaspace-argon";

// Each stack lists ONLY the font's own family (+ same-family variants) before
// the neutral system fallback. We deliberately do NOT cross-reference other
// named fonts: doing so made a missing font silently masquerade as a different
// one (e.g. the unbundled "Corbi Mono S" rendered as the bundled "Libertinus
// Mono"). With this layout a bundled font always renders itself, and a
// not-installed commercial font falls back to the obvious system mono instead.
//
// Fonts marked `bundled: false` are NOT shipped (commercial licenses) — they
// render only if the user has them installed locally; otherwise the picker
// shows the system monospace and the label says so.
export const NATIVE_PTY_FONT_OPTIONS: NativePtyFontOption[] = [
  {
    value: "monaspace-argon",
    label: "Monaspace Argon",
    stack: `"Monaspace Argon", "Monaspace Argon Var", "Monaspace Neon", ${MONO_FALLBACK}`,
  },
  {
    value: "source-code-pro",
    label: "Source Code Pro",
    stack: `"Source Code Pro", ${MONO_FALLBACK}`,
  },
  {
    value: "fira-code",
    label: "Fira Code",
    stack: `"Fira Code", ${MONO_FALLBACK}`,
  },
  {
    value: "jetbrains-mono",
    label: "JetBrains Mono",
    stack: `"JetBrains Mono", ${MONO_FALLBACK}`,
  },
  {
    value: "libertinus-mono",
    label: "Libertinus Mono",
    stack: `"Libertinus Mono", "Libertinus Mono Regular", ${MONO_FALLBACK}`,
  },
  {
    value: "xanh-mono",
    label: "Xanh Mono",
    stack: `"Xanh Mono", "Xanh Mono Regular", ${MONO_FALLBACK}`,
  },
  {
    value: "julia-mono",
    label: "JuliaMono",
    stack: `"JuliaMono", ${MONO_FALLBACK}`,
  },
  {
    value: "spline-sans-mono",
    label: "Spline Sans Mono",
    stack: `"Spline Sans Mono", ${MONO_FALLBACK}`,
  },
  {
    value: "ioskeley-mono",
    label: "Ioskeley Mono",
    stack: `"Ioskeley Mono", ${MONO_FALLBACK}`,
  },
  {
    value: "antithesis",
    label: "Antithesis",
    stack: `"Antithesis", "Antithesis Regular", ${MONO_FALLBACK}`,
    bundled: false,
    acquireUrl: "https://font.download/font/antithesis",
  },
  {
    value: "thesansmono-condensed",
    label: "TheSansMono Condensed",
    stack: `"TheSansMono Condensed", "TheSansMonoSCd", "TheSansMono SCd", ${MONO_FALLBACK}`,
    bundled: false,
    acquireUrl: "https://www.lucasfonts.com/fonts/thesans-mono",
  },
  {
    value: "system-monospace",
    label: "System monospace",
    stack: MONO_FALLBACK,
  },
];

export function nativePtyFontStack(value: NativePtyFontFamily | null | undefined): string {
  return (
    NATIVE_PTY_FONT_OPTIONS.find((option) => option.value === value)
    ?? NATIVE_PTY_FONT_OPTIONS.find((option) => option.value === DEFAULT_NATIVE_PTY_FONT)
    ?? NATIVE_PTY_FONT_OPTIONS[0]
  ).stack;
}
