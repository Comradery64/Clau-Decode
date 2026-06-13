/**
 * Zustand global store — app-level state only.
 * Data fetching lives in components/hooks via the api client.
 */

import { create } from "zustand";
import type { HostInfo, Profile } from "../api/types";
import { getChatIdFromRoute } from "../router";

function initialChatId(): string | null {
  if (typeof window === "undefined") return null;
  const h = window.location.hash.replace(/^#/, "") || "/";
  return getChatIdFromRoute(h.startsWith("/chat/") ? (h as `/chat/${string}`) : "/");
}

export type SessionSortOrder = "recent" | "oldest" | "alpha";
export type SidebarMode = "chat" | "folder";

interface AppState {
  selectedSessionId: string | null;
  selectedProjectId: string | null;
  pendingScrollMessageId: string | null;
  searchQuery: string;
  isSearchOpen: boolean;
  isSettingsOpen: boolean;
  isHelpOpen: boolean;
  isShortcutsOpen: boolean;
  sidebarCollapsed: boolean;
  sidebarMode: SidebarMode;
  fileExplorerRoot: string | null;
  viewingFilePath: string | null;
  sessionSortOrder: SessionSortOrder;
  showParentFolder: boolean;
  blocksExpanded: boolean;
  resultsExpanded: boolean;
  profiles: Profile[];
  activeProfileId: string | null;
  hostInfo: HostInfo | null;

  // Multi-select mode
  selectionMode: boolean;
  selectedSessionIds: Set<string>;

  selectSession: (id: string | null) => void;
  setPendingScrollMessageId: (id: string | null) => void;
  selectProject: (id: string | null) => void;
  setSearchQuery: (q: string) => void;
  openSearch: () => void;
  closeSearch: () => void;
  openSettings: () => void;
  closeSettings: () => void;
  openHelp: () => void;
  closeHelp: () => void;
  openShortcuts: () => void;
  closeShortcuts: () => void;
  toggleSidebar: () => void;
  toggleExplorer: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  setSidebarMode: (mode: SidebarMode) => void;
  setFileExplorerRoot: (path: string | null) => void;
  setViewingFilePath: (path: string | null) => void;
  setSessionSortOrder: (order: SessionSortOrder) => void;
  setShowParentFolder: (show: boolean) => void;
  toggleBlocksExpanded: () => void;
  toggleResultsExpanded: () => void;
  setProfiles: (profiles: Profile[]) => void;
  setActiveProfileId: (id: string | null) => void;
  setHostInfo: (info: HostInfo | null) => void;

  // Multi-select actions
  enterSelectionMode: () => void;
  exitSelectionMode: () => void;
  toggleSessionSelected: (id: string) => void;
  clearSelection: () => void;
  setSelectedSessionIds: (ids: string[]) => void;
}

export const useAppStore = create<AppState>((set) => ({
  selectedSessionId: initialChatId(),
  selectedProjectId: null,
  pendingScrollMessageId: null,
  searchQuery: "",
  isSearchOpen: false,
  isSettingsOpen: false,
  isHelpOpen: false,
  isShortcutsOpen: false,
  sidebarCollapsed: false,
  sidebarMode: "chat",
  fileExplorerRoot: null,
  viewingFilePath: null,
  sessionSortOrder: "recent",
  showParentFolder: false,
  blocksExpanded: false,
  resultsExpanded: false,
  profiles: [],
  activeProfileId: null,
  hostInfo: null,

  // Multi-select mode
  selectionMode: false,
  selectedSessionIds: new Set<string>(),

  selectSession: (id) => set({ selectedSessionId: id }),
  setPendingScrollMessageId: (id) => set({ pendingScrollMessageId: id }),
  selectProject: (id) => set({ selectedProjectId: id }),
  setSearchQuery: (q) => set({ searchQuery: q }),
  openSearch: () => set({ isSearchOpen: true }),
  closeSearch: () => set({ isSearchOpen: false, searchQuery: "" }),
  openSettings: () => set({ isSettingsOpen: true }),
  closeSettings: () => set({ isSettingsOpen: false }),
  openHelp: () => set({ isHelpOpen: true }),
  closeHelp: () => set({ isHelpOpen: false }),
  openShortcuts: () => set({ isShortcutsOpen: true }),
  closeShortcuts: () => set({ isShortcutsOpen: false }),
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  toggleExplorer: () =>
    set((s) => {
      // Explorer is "visible" when sidebar is expanded AND mode === "folder".
      // Toggle that visibility: expand + folder, or fall back to chat.
      const explorerVisible = !s.sidebarCollapsed && s.sidebarMode === "folder";
      return explorerVisible
        ? { sidebarMode: "chat" as const }
        : { sidebarCollapsed: false, sidebarMode: "folder" as const };
    }),
  setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
  setSidebarMode: (mode) => set({ sidebarMode: mode }),
  setFileExplorerRoot: (path) => set({ fileExplorerRoot: path }),
  setViewingFilePath: (path) => set({ viewingFilePath: path }),
  setSessionSortOrder: (order) => set({ sessionSortOrder: order }),
  setShowParentFolder: (show) => set({ showParentFolder: show }),
  toggleBlocksExpanded: () => set((s) => ({ blocksExpanded: !s.blocksExpanded })),
  toggleResultsExpanded: () => set((s) => ({ resultsExpanded: !s.resultsExpanded })),
  setProfiles: (profiles) => set({ profiles }),
  setActiveProfileId: (id) => set({ activeProfileId: id }),
  setHostInfo: (info) => set({ hostInfo: info }),

  // Multi-select actions
  enterSelectionMode: () => set({ selectionMode: true, selectedSessionIds: new Set<string>() }),
  exitSelectionMode: () => set({ selectionMode: false, selectedSessionIds: new Set<string>() }),
  toggleSessionSelected: (id) =>
    set((s) => {
      const next = new Set(s.selectedSessionIds);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { selectedSessionIds: next };
    }),
  clearSelection: () => set({ selectedSessionIds: new Set<string>() }),
  setSelectedSessionIds: (ids) => set({ selectedSessionIds: new Set(ids) }),
}));
