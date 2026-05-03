/**
 * Zustand global store — app-level state only.
 * Data fetching lives in components/hooks via the api client.
 */

import { create } from "zustand";

export type SessionSortOrder = "recent" | "oldest" | "alpha";

interface AppState {
  selectedSessionId: string | null;
  selectedProjectId: string | null;
  searchQuery: string;
  isSearchOpen: boolean;
  isSettingsOpen: boolean;
  sidebarCollapsed: boolean;
  sessionSortOrder: SessionSortOrder;
  // Ctrl+O: force all tool/thinking blocks open or closed
  blocksExpanded: boolean;
  // Ctrl+E: suppress all "show more" truncation
  resultsExpanded: boolean;

  selectSession: (id: string | null) => void;
  selectProject: (id: string | null) => void;
  setSearchQuery: (q: string) => void;
  openSearch: () => void;
  closeSearch: () => void;
  openSettings: () => void;
  closeSettings: () => void;
  toggleSidebar: () => void;
  setSessionSortOrder: (order: SessionSortOrder) => void;
  toggleBlocksExpanded: () => void;
  toggleResultsExpanded: () => void;
}

export const useAppStore = create<AppState>((set) => ({
  selectedSessionId: null,
  selectedProjectId: null,
  searchQuery: "",
  isSearchOpen: false,
  isSettingsOpen: false,
  sidebarCollapsed: false,
  sessionSortOrder: "recent",
  blocksExpanded: false,
  resultsExpanded: false,

  selectSession: (id) => set({ selectedSessionId: id }),
  selectProject: (id) => set({ selectedProjectId: id }),
  setSearchQuery: (q) => set({ searchQuery: q }),
  openSearch: () => set({ isSearchOpen: true }),
  closeSearch: () => set({ isSearchOpen: false, searchQuery: "" }),
  openSettings: () => set({ isSettingsOpen: true }),
  closeSettings: () => set({ isSettingsOpen: false }),
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  setSessionSortOrder: (order) => set({ sessionSortOrder: order }),
  toggleBlocksExpanded: () => set((s) => ({ blocksExpanded: !s.blocksExpanded })),
  toggleResultsExpanded: () => set((s) => ({ resultsExpanded: !s.resultsExpanded })),
}));
