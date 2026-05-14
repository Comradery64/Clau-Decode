import React, { useEffect, useRef } from "react";
import { useAppStore } from "./store";
import { api, createEventSource, getConfigCached } from "./api/client";
import { useRoute, getChatIdFromRoute } from "./router";
import { emit } from "./utils/events";
import { ErrorBoundary } from "./components/ErrorBoundary";

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

const chatViewImport = () => import("./components/ChatView/ChatView");
const searchOverlayImport = () => import("./components/Sidebar/SearchOverlay");
const settingsModalImport = () => import("./components/Settings/SettingsModal");

const Sidebar = React.lazy(() => import("./components/Sidebar/Sidebar"));
const ChatView = React.lazy(chatViewImport);
const AnalyticsPanel = React.lazy(() => import("./components/Analytics/AnalyticsPanel"));
const Dashboard = React.lazy(() => import("./components/Dashboard/Dashboard"));
const SettingsModal = React.lazy(settingsModalImport);
const SearchOverlay = React.lazy(searchOverlayImport);
const HelpPopup = React.lazy(() => import("./components/Sidebar/HelpPopup"));
const ShortcutsPopup = React.lazy(() => import("./components/Sidebar/ShortcutsPopup"));
const FileViewer = React.lazy(() => import("./components/FileViewer/FileViewer"));

export default function App() {
  const { isSettingsOpen, isSearchOpen, isHelpOpen, isShortcutsOpen, viewingFilePath } = useAppStore();
  const route = useRoute();
  const chatIdFromUrl = getChatIdFromRoute(route);

  // URL is the source of truth for selectedSessionId. Sync on route change
  // (covers initial mount, sidebar clicks, search clicks, browser back/forward).
  useEffect(() => {
    const current = useAppStore.getState().selectedSessionId;
    if (chatIdFromUrl !== current) {
      useAppStore.getState().selectSession(chatIdFromUrl);
    }
  }, [chatIdFromUrl]);

  useEffect(() => {
    // Cached so SettingsModal's first open paints instantly off the same
    // network round-trip used here for theme.
    getConfigCached().then((cfg) => applyTheme(cfg.theme)).catch(() => {});
    // Stash host info in the store so SessionItem etc. can gate host-side
    // actions (Open in terminal, Reveal in Finder) when accessed remotely.
    api.getHostInfo()
      .then((info) => useAppStore.getState().setHostInfo(info))
      .catch(() => {});
  }, []);

  // Preload the lazy chunks the user will likely hit first so they're ready
  // in the background before the first click — avoids a chunk-fetch delay on
  // cold first open.
  useEffect(() => {
    chatViewImport();
    searchOverlayImport();
    settingsModalImport();
  }, []);

  useEffect(() => {
    const es = createEventSource(() => {
      emit("refresh", undefined);
    });
    return () => es.close();
  }, []);

  // When the file viewer opens as a split pane, auto-collapse the sidebar so
  // the chat/dashboard stays readable; restore the user's prior sidebar state
  // when the file viewer closes.
  const prevSidebarRef = useRef<boolean | null>(null);
  useEffect(() => {
    if (viewingFilePath) {
      if (prevSidebarRef.current === null) {
        prevSidebarRef.current = useAppStore.getState().sidebarCollapsed;
        useAppStore.getState().setSidebarCollapsed(true);
      }
    } else if (prevSidebarRef.current !== null) {
      useAppStore.getState().setSidebarCollapsed(prevSidebarRef.current);
      prevSidebarRef.current = null;
    }
  }, [viewingFilePath]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        const s = useAppStore.getState();
        if (s.isSearchOpen || s.isSettingsOpen || s.isHelpOpen || s.isShortcutsOpen || s.viewingFilePath) {
          e.preventDefault();
          s.closeSearch();
          s.closeSettings();
          s.closeHelp();
          s.closeShortcuts();
          s.setViewingFilePath(null);
        }
        return;
      }

      const ctrl = e.metaKey || e.ctrlKey;
      if (!ctrl) return;

      if (e.key === "k") {
        e.preventDefault();
        useAppStore.getState().openSearch();
      } else if (e.key === "e") {
        // Ctrl+E — toggle show-all-content (no "show more" truncation)
        e.preventDefault();
        useAppStore.getState().toggleResultsExpanded();
      } else if (e.shiftKey && e.key === ",") {
        e.preventDefault();
        useAppStore.getState().openSettings();
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
      {/* Main content in its own boundary so overlay lazy-loads never blank it. */}
      <React.Suspense fallback={null}>
        {/* Keep Sidebar mounted when collapsed so we don't refetch every project
            and session each time the user toggles. The Sidebar reads
            sidebarCollapsed itself and hides via display:none. */}
        <Sidebar />
        <div style={{ flex: 1, display: "flex", minWidth: 0, overflow: "hidden" }}>
          <ErrorBoundary>
            {route === "/analytics" ? <AnalyticsPanel /> : chatIdFromUrl ? <ChatView /> : <Dashboard />}
          </ErrorBoundary>
        </div>
        {viewingFilePath && (
          <ErrorBoundary>
            <React.Suspense fallback={null}>
              <FileViewer />
            </React.Suspense>
          </ErrorBoundary>
        )}
      </React.Suspense>
      {/* Each overlay gets its own error boundary + Suspense — a crash or lazy
          load in one overlay never blanks the page behind it. */}
      {isSettingsOpen && <ErrorBoundary><React.Suspense fallback={null}><SettingsModal /></React.Suspense></ErrorBoundary>}
      {isSearchOpen && <ErrorBoundary><React.Suspense fallback={null}><SearchOverlay /></React.Suspense></ErrorBoundary>}
      {isHelpOpen && <ErrorBoundary><React.Suspense fallback={null}><HelpPopup /></React.Suspense></ErrorBoundary>}
      {isShortcutsOpen && <ErrorBoundary><React.Suspense fallback={null}><ShortcutsPopup /></React.Suspense></ErrorBoundary>}
    </div>
  );
}
