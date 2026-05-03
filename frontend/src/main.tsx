import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles/theme.css";

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
    if (e.code === "KeyR" || e.code === "KeyJ" || e.key === "r" || e.key === "R") {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      window.dispatchEvent(new CustomEvent("clau-decode:refresh"));
    }
  },
  { capture: true }
);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
