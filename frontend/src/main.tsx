import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { emit } from "./utils/events";
import { migrateReadSessions } from "./utils/localStorage";
import { isNativePtyFocused } from "./utils/nativePtyFocus";
import { ErrorBoundary } from "./components/ErrorBoundary";
import "overlayscrollbars/styles/overlayscrollbars.css";
import "./styles/theme.css";
import "./styles/nativePtyFonts.css";

// Run one-off localStorage migrations before React mounts so the data is
// already in its new shape by the time any component reads it. Lives here
// (not at module-load in SessionItem) to keep HMR and unit tests free of
// side effects.
migrateReadSessions();

const spinStyle = document.createElement("style");
spinStyle.textContent = "@keyframes spin { to { transform: rotate(360deg) } }";
document.head.appendChild(spinStyle);

// Register the refresh-shortcut listener at module-load time, before React
// mounts. Cmd+R is intercepted by the browser earlier than other shortcuts;
// the earlier our listener exists, the better its chance of winning.
// - window capture fires before document capture
// - e.code matches the physical key regardless of Shift or keyboard layout
// - stopImmediatePropagation blocks any later-registered listener from undoing our preventDefault
window.addEventListener(
  "keydown",
  (e) => {
    if (!(e.metaKey || e.ctrlKey)) return;
    // Ctrl+R is the terminal's reverse-search; don't hijack it (or Ctrl+J)
    // for a page reload while the native PTY is focused.
    if (isNativePtyFocused()) return;
    if (e.code === "KeyR" || e.code === "KeyJ" || e.key === "r" || e.key === "R") {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      emit("refresh", undefined);
    }
  },
  { capture: true }
);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
