// True when keyboard focus is inside the native PTY terminal — i.e. keystrokes
// are meant for claude, not for our app. Global app shortcuts (especially the
// Ctrl-based ones, which collide head-on with the terminal's own Ctrl+C / Ctrl+R
// / Ctrl+L etc. for Windows/Linux users) bail when this is true, so they stay
// live only where no PTY is focused — effectively the Decoded view, where the
// native pane is display:none and nothing inside it can hold focus.
//
// We key off the DOM (the native terminal host carries data-testid) rather than
// React view-mode state so a single cheap check works from any global handler —
// including main.tsx's reload listener, which runs before React mounts.
export function isNativePtyFocused(): boolean {
  if (typeof document === "undefined") return false;
  const active = document.activeElement;
  return !!active?.closest?.('[data-testid="native-terminal-host"]');
}
