import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { AppConfig } from "../../../api/types";
import SettingsModal from "../SettingsModal";
import { api } from "../../../api/client";

const baseConfig: AppConfig = {
  data_paths: [],
  profiles: [],
  active_profile_id: null,
  theme: "system",
  auto_open_browser: false,
  port: 4242,
  host: "127.0.0.1",
  edit_enabled: true,
  claude_default_permission_mode: "default",
  chat_send_shortcut: "enter",
  native_pty_font_family: "monaspace-argon",
  native_pty_cols: 100,
  claude_auto_stop_quiet_default_turns: false,
  claude_recap_enabled: false,
  claude_recap_idle_minutes: 10,
};

vi.mock("../../../api/client", () => ({
  api: {
    updateConfig: vi.fn().mockResolvedValue(undefined),
  },
  getCachedConfig: vi.fn(() => baseConfig),
  getConfigCached: vi.fn(),
}));

describe("SettingsModal", () => {
  beforeEach(() => {
    vi.mocked(api.updateConfig).mockClear();
  });

  it("lets the user switch the decoded composer send shortcut", () => {
    render(<SettingsModal />);

    // Settings is a left-rail panel: open the "Chat" category first.
    fireEvent.click(screen.getByRole("button", { name: "Chat" }));
    fireEvent.click(screen.getByRole("button", { name: "Cmd/Ctrl+Enter" }));

    expect(api.updateConfig).toHaveBeenCalledWith({
      ...baseConfig,
      chat_send_shortcut: "modEnter",
    });
  });

  it("lets the user choose the native PTY font from the preview list", () => {
    render(<SettingsModal />);

    fireEvent.click(screen.getByRole("button", { name: "Terminal" }));
    // Custom listbox with per-font previews (not a <select>): click the option.
    fireEvent.click(screen.getByRole("option", { name: "Xanh Mono" }));

    expect(api.updateConfig).toHaveBeenCalledWith({
      ...baseConfig,
      native_pty_font_family: "xanh-mono",
    });
  });

  it("widens the native terminal in column steps", () => {
    render(<SettingsModal />);

    fireEvent.click(screen.getByRole("button", { name: "Terminal" }));
    fireEvent.click(screen.getByRole("button", { name: "Wider terminal" }));

    expect(api.updateConfig).toHaveBeenCalledWith({
      ...baseConfig,
      native_pty_cols: 110,
    });
  });
});
