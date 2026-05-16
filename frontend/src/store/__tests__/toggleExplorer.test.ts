import { describe, it, expect, beforeEach } from "vitest";
import { useAppStore } from "../index";

describe("toggleExplorer", () => {
  beforeEach(() => {
    useAppStore.setState({ sidebarCollapsed: false, sidebarMode: "chat" });
  });

  it("expands the sidebar and switches to folder mode when sidebar is collapsed", () => {
    useAppStore.setState({ sidebarCollapsed: true, sidebarMode: "chat" });
    useAppStore.getState().toggleExplorer();
    const s = useAppStore.getState();
    expect(s.sidebarCollapsed).toBe(false);
    expect(s.sidebarMode).toBe("folder");
  });

  it("expands the sidebar and shows folder mode even if mode was already folder while collapsed", () => {
    useAppStore.setState({ sidebarCollapsed: true, sidebarMode: "folder" });
    useAppStore.getState().toggleExplorer();
    const s = useAppStore.getState();
    expect(s.sidebarCollapsed).toBe(false);
    expect(s.sidebarMode).toBe("folder");
  });

  it("switches expanded sidebar from chat to folder", () => {
    useAppStore.setState({ sidebarCollapsed: false, sidebarMode: "chat" });
    useAppStore.getState().toggleExplorer();
    const s = useAppStore.getState();
    expect(s.sidebarCollapsed).toBe(false);
    expect(s.sidebarMode).toBe("folder");
  });

  it("closes the explorer (back to chat) when sidebar is expanded and mode is folder", () => {
    useAppStore.setState({ sidebarCollapsed: false, sidebarMode: "folder" });
    useAppStore.getState().toggleExplorer();
    const s = useAppStore.getState();
    expect(s.sidebarCollapsed).toBe(false);
    expect(s.sidebarMode).toBe("chat");
  });
});
