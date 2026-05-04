import React, { useEffect } from "react";
import { useAppStore } from "./store";
import { createEventSource, api } from "./api/client";
import { useRoute } from "./router";

function applyTheme(theme: string) {
  if (theme === "dark") {
    document.documentElement.setAttribute("data-theme", "dark");
  } else if (theme === "light") {
    document.documentElement.setAttribute("data-theme", "light");
  } else {
    document.documentElement.removeAttribute("data-theme");
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    if (prefersDark) document.documentElement.setAttribute("data-theme", "dark");
  }
}

(window as Window & { __clauDecodeApplyTheme?: typeof applyTheme }).__clauDecodeApplyTheme = applyTheme;

const Sidebar = React.lazy(() => import("./components/Sidebar/Sidebar"));
const ChatView = React.lazy(() => import("./components/ChatView/ChatView"));
const AnalyticsPanel = React.lazy(() => import("./components/Analytics/AnalyticsPanel"));
const SettingsModal = React.lazy(() => import("./components/Settings/SettingsModal"));
const SearchOverlay = React.lazy(() => import("./components/Sidebar/SearchOverlay"));

function IconSidebarExpand() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2"/>
      <path d="M9 3v18"/>
    </svg>
  );
}

export default function App() {
  const { isSettingsOpen, isSearchOpen, sidebarCollapsed } = useAppStore();
  const toggleSidebar = useAppStore((s) => s.toggleSidebar);
  const route = useRoute();

  useEffect(() => {
    api.getConfig().then((cfg) => applyTheme(cfg.theme)).catch(() => {});
  }, []);

  useEffect(() => {
    const es = createEventSource(() => {
      window.dispatchEvent(new CustomEvent("clau-decode:refresh"));
    });
    return () => es.close();
  }, []);

  // Apple-style scrollbar fade: add .is-scrolling to the scrolling element, remove after idle
  useEffect(() => {
    const timers = new Map<Element, ReturnType<typeof setTimeout>>();
    const onScroll = (e: Event) => {
      if (!(e.target instanceof Element)) return;
      const el = e.target;
      el.classList.add("is-scrolling");
      const existing = timers.get(el);
      if (existing) clearTimeout(existing);
      timers.set(el, setTimeout(() => {
        el.classList.remove("is-scrolling");
        timers.delete(el);
      }, 1000));
    };
    document.addEventListener("scroll", onScroll, { capture: true, passive: true });
    return () => {
      document.removeEventListener("scroll", onScroll, { capture: true });
      timers.forEach(clearTimeout);
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const ctrl = e.metaKey || e.ctrlKey;
      if (!ctrl) return;

      if (e.key === "k") {
        e.preventDefault();
        useAppStore.getState().openSearch();
      } else if (e.key === "o") {
        // Ctrl+O — expand/collapse all tool + thinking blocks
        e.preventDefault();
        useAppStore.getState().toggleBlocksExpanded();
      } else if (e.key === "e") {
        // Ctrl+E — toggle show-all-content (no "show more" truncation)
        e.preventDefault();
        useAppStore.getState().toggleResultsExpanded();
      }
      // Cmd+R / Cmd+J refresh is registered in main.tsx before React mounts,
      // so it has the earliest possible registration time and best chance of
      // beating the browser's own Cmd+R handler.
    };
    // Capture phase + document target = highest priority. preventDefault here
    // wins against the browser's default reload action for Cmd+R.
    document.addEventListener("keydown", onKey, { capture: true });
    return () => document.removeEventListener("keydown", onKey, { capture: true });
  }, []);

  return (
    <div
      style={{
        display: "flex",
        height: "100vh",
        overflow: "hidden",
        background: "var(--bg-base)",
      }}
    >
      <React.Suspense fallback={null}>
        {/* Keep Sidebar mounted when collapsed so we don't refetch every project
            and session each time the user toggles. The Sidebar reads
            sidebarCollapsed itself and hides via display:none. */}
        <Sidebar />
        {route === "/analytics" ? <AnalyticsPanel /> : <ChatView />}
        {isSettingsOpen && <SettingsModal />}
        {isSearchOpen && <SearchOverlay />}
      </React.Suspense>
      {sidebarCollapsed && (
        <button
          onClick={toggleSidebar}
          aria-label="Expand sidebar"
          style={{
            position: "fixed",
            top: "12px",
            left: "12px",
            zIndex: 100,
            background: "var(--bg-sidebar)",
            border: "1px solid var(--border-subtle)",
            borderRadius: "var(--radius-sm)",
            cursor: "pointer",
            color: "var(--text-tertiary)",
            padding: "6px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            transition: "color var(--transition-fast), background var(--transition-fast)",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.color = "var(--text-primary)";
            (e.currentTarget as HTMLButtonElement).style.background = "var(--bg-sidebar-hover)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.color = "var(--text-tertiary)";
            (e.currentTarget as HTMLButtonElement).style.background = "var(--bg-sidebar)";
          }}
        >
          <IconSidebarExpand />
        </button>
      )}
    </div>
  );
}
