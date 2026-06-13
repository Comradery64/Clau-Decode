import { act, render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NativeTerminalView } from "../NativeTerminalView";
import { api } from "../../../api/client";
import { emit } from "../../../utils/events";

const { fitDimensions, configSource, fitAddonInstances, terminalInstances, MockFitAddon, MockTerminal } = vi.hoisted(() => {
  const fitDimensions = {
    current: { cols: 100, rows: 36 } as { cols: number; rows: number } | undefined,
  };
  const configSource = {
    current: {
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
      claude_recap_idle_minutes: 5,
    },
  };

  class MockFitAddon {
    activate = vi.fn();
    dispose = vi.fn();
    proposeDimensions = vi.fn(() => fitDimensions.current);

    constructor() {
      fitAddonInstances.push(this);
    }
  }

  class MockTerminal {
    options: Record<string, unknown>;
    cols = 100;
    rows = 40;
    writes: Array<string | Uint8Array> = [];
    dataHandler: ((data: string) => void) | null = null;
    open = vi.fn();
    clear = vi.fn();
    scrollToBottom = vi.fn();
    dispose = vi.fn();
    write = vi.fn((data: string | Uint8Array) => {
      this.writes.push(data);
    });
    loadAddon = vi.fn((addon: { activate?: (terminal: MockTerminal) => void }) => {
      addon.activate?.(this);
    });
    resize = vi.fn((cols: number, rows: number) => {
      this.cols = cols;
      this.rows = rows;
    });
    onData = vi.fn((handler: (data: string) => void) => {
      this.dataHandler = handler;
      return { dispose: vi.fn() };
    });

    constructor(options: Record<string, unknown>) {
      this.options = options;
      terminalInstances.push(this);
    }
  }
  const fitAddonInstances: MockFitAddon[] = [];
  const terminalInstances: MockTerminal[] = [];
  return { fitDimensions, configSource, fitAddonInstances, terminalInstances, MockFitAddon, MockTerminal };
});

vi.mock("@xterm/xterm", () => ({ Terminal: MockTerminal }));
vi.mock("@xterm/addon-fit", () => ({ FitAddon: MockFitAddon }));
vi.mock("@xterm/xterm/css/xterm.css", () => ({}));

vi.mock("../../../api/client", () => ({
  api: {
    ptyNativeSnapshot: vi.fn(),
    ptyFocus: vi.fn(),
    ptyInput: vi.fn(),
    ptyResize: vi.fn(),
    ptyBlur: vi.fn(),
    ptyKillKeepalive: vi.fn(),
  },
  getCachedConfig: vi.fn(() => configSource.current),
  getConfigCached: vi.fn(() => Promise.resolve(configSource.current)),
}));

function bytesToText(data: string | Uint8Array): string {
  if (typeof data === "string") return data;
  return new TextDecoder().decode(data);
}

function textToBase64(text: string): string {
  return btoa(text);
}

describe("NativeTerminalView", () => {
  let resizeObserverCallbacks: Array<() => void> = [];

  beforeEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
    fitDimensions.current = { cols: 100, rows: 36 };
    configSource.current = {
      ...configSource.current,
      native_pty_font_family: "monaspace-argon",
      native_pty_cols: 100,
    };
    fitAddonInstances.length = 0;
    terminalInstances.length = 0;
    resizeObserverCallbacks = [];
    vi.stubGlobal("ResizeObserver", class {
      constructor(callback: () => void) {
        resizeObserverCallbacks.push(callback);
      }
      observe = vi.fn();
      disconnect = vi.fn();
    });
    document.documentElement.style.setProperty("--bg-base", "#faf9f5");
    document.documentElement.style.setProperty("--text-primary", "#484846");
    document.documentElement.style.setProperty("--accent-orange-subtle", "rgba(139, 115, 85, 0.08)");
    vi.mocked(api.ptyNativeSnapshot).mockResolvedValue({
      session_id: "sess-native",
      ring_b64: textToBase64("hello"),
      rows: 36,
      cols: 100,
      alive: true,
      native_state: "idle_chat_input",
      decoded_input_safe: true,
    });
    vi.mocked(api.ptyInput).mockResolvedValue({ ok: true });
    vi.mocked(api.ptyResize).mockResolvedValue({ ok: true });
    vi.mocked(api.ptyFocus).mockResolvedValue({ ok: true });
    vi.mocked(api.ptyBlur).mockResolvedValue({ ok: true });
    vi.mocked(api.ptyKillKeepalive).mockReturnValue(true);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("creates an xterm terminal with the configured width, font, and decoded theme", async () => {
    render(<NativeTerminalView sessionId="sess-native" />);

    await waitFor(() => expect(terminalInstances[0]).toBeTruthy());

    expect(terminalInstances[0].options).toMatchObject({
      fontSize: 13,
      scrollback: expect.any(Number),
      fontFamily: expect.stringContaining("Monaspace Argon"),
      theme: expect.objectContaining({ background: "#faf9f5", foreground: "#484846" }),
    });
    expect(screen.getByTestId("native-terminal-view")).toHaveStyle({
      background: "var(--bg-base)",
    });
  });

  it("marks the host with the native PTY build marker", async () => {
    render(<NativeTerminalView sessionId="sess-native" />);
    await waitFor(() => expect(terminalInstances[0]).toBeTruthy());
    expect(screen.getByTestId("native-terminal-host")).toHaveAttribute(
      "data-native-pty-build",
      "native-pty-xterm-2026-06-10",
    );
  });

  it("pins the terminal to the configured width and tracks rows from the fit addon", async () => {
    fitDimensions.current = { cols: 250, rows: 36 };
    render(<NativeTerminalView sessionId="sess-native" />);
    await waitFor(() => expect(terminalInstances[0]).toBeTruthy());
    // cols pinned to native_pty_cols (100), NOT the fit's 250; rows tracked.
    expect(terminalInstances[0].resize).toHaveBeenCalledWith(100, 36);
  });

  it("sends an initial resize to the backend at the pinned width", async () => {
    render(<NativeTerminalView sessionId="sess-native" />);
    await waitFor(() => expect(api.ptyResize).toHaveBeenCalled());
    expect(api.ptyResize).toHaveBeenCalledWith("sess-native", 36, 100);
  });

  it("replays the snapshot ring and scrolls to the bottom", async () => {
    render(<NativeTerminalView sessionId="sess-native" />);
    await waitFor(() => {
      expect(terminalInstances[0].writes.map(bytesToText).join("")).toContain("hello");
    });
    expect(terminalInstances[0].scrollToBottom).toHaveBeenCalled();
  });

  it("writes incoming live pty-output-chunk events", async () => {
    render(<NativeTerminalView sessionId="sess-native" />);
    await waitFor(() => expect(terminalInstances[0]).toBeTruthy());
    await waitFor(() => expect(api.ptyResize).toHaveBeenCalled());

    emit("pty-output-chunk", { session_id: "sess-native", data_b64: textToBase64("world") });
    await waitFor(() => {
      expect(terminalInstances[0].writes.map(bytesToText).join("")).toContain("world");
    });
  });

  it("forwards terminal input to api.ptyInput", async () => {
    render(<NativeTerminalView sessionId="sess-native" />);
    await waitFor(() => expect(terminalInstances[0]?.dataHandler).toBeTruthy());
    terminalInstances[0].dataHandler?.("x");
    expect(api.ptyInput).toHaveBeenCalledWith("sess-native", "x");
  });

  it("applies theme changes in place without recreating the terminal", async () => {
    render(<NativeTerminalView sessionId="sess-native" />);
    await waitFor(() => expect(terminalInstances[0]).toBeTruthy());

    document.documentElement.style.setProperty("--bg-base", "#262624");
    act(() => {
      document.documentElement.setAttribute("data-theme", "dark");
    });

    await waitFor(() => {
      expect((terminalInstances[0].options.theme as { background?: string })?.background).toBe("#262624");
    });
    // Still exactly one terminal — no remount.
    expect(terminalInstances).toHaveLength(1);
  });

  it("applies a font change from config in place", async () => {
    render(<NativeTerminalView sessionId="sess-native" />);
    await waitFor(() => expect(terminalInstances[0]).toBeTruthy());

    act(() => {
      emit("config-updated", { ...configSource.current, native_pty_font_family: "fira-code" } as never);
    });

    await waitFor(() => {
      expect(terminalInstances[0].options.fontFamily as string).toContain("Fira Code");
    });
    expect(terminalInstances).toHaveLength(1);
  });

  it("emits a notice when the native PTY has stopped", async () => {
    const onNotice = vi.fn();
    render(<NativeTerminalView sessionId="sess-native" onNotice={onNotice} />);
    await waitFor(() => expect(terminalInstances[0]).toBeTruthy());

    act(() => {
      emit("pty-native-state", { session_id: "sess-native", state: "dead", decoded_input_safe: false });
    });

    await waitFor(() => {
      expect(onNotice).toHaveBeenCalledWith(
        expect.objectContaining({ kind: "info", text: "Native PTY stopped" }),
      );
    });
  });

  it("renders the native terminal region", () => {
    render(<NativeTerminalView sessionId="sess-native" />);
    expect(screen.getByTestId("native-terminal-view")).toBeInTheDocument();
    expect(screen.getByTestId("native-terminal-host")).toBeInTheDocument();
  });

  it("blurs on unmount and kills the keepalive on page close", async () => {
    const { unmount } = render(<NativeTerminalView sessionId="sess-native" />);
    await waitFor(() => expect(terminalInstances[0]).toBeTruthy());

    window.dispatchEvent(new Event("pagehide"));
    expect(api.ptyKillKeepalive).toHaveBeenCalledWith("sess-native");

    unmount();
    expect(api.ptyBlur).toHaveBeenCalledWith("sess-native");
  });
});
