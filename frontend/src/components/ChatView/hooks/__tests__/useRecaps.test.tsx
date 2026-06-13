import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppConfig, Recap } from "../../../../api/types";
import { api } from "../../../../api/client";
import { LS, lsPutMap } from "../../../../utils/localStorage";
import { useRecaps } from "../useRecaps";

vi.mock("../../../../api/client", () => ({
  api: {
    listRecaps: vi.fn(),
    generateRecap: vi.fn(),
    dismissRecap: vi.fn(),
  },
}));

const config: AppConfig = {
  data_paths: [],
  profiles: [],
  active_profile_id: null,
  theme: "system",
  auto_open_browser: false,
  port: 4242,
  host: "127.0.0.1",
  edit_enabled: true,
  claude_default_permission_mode: "dontAsk",
  chat_send_shortcut: "enter",
  native_pty_font_family: "monaspace-argon",
  native_pty_cols: 100,
  claude_auto_stop_quiet_default_turns: false,
  claude_recap_enabled: true,
  claude_recap_idle_minutes: 5,
};

const recap: Recap = {
  id: 1,
  session_id: "sess-recap",
  text: "summary",
  created_at: "2026-06-06T17:00:00.000Z",
  covers_until_message_uuid: "msg-last",
  dismissed: false,
};

describe("useRecaps", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    vi.mocked(api.listRecaps).mockResolvedValue([]);
    vi.mocked(api.generateRecap).mockResolvedValue(recap);
    vi.mocked(api.dismissRecap).mockResolvedValue({ ok: true, dismissed: true });
  });

  afterEach(() => {
    vi.useRealTimers();
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("prompts for an eligible recap instead of generating automatically", async () => {
    const lastSubmit = Date.now() - 10 * 60_000;
    const lastActivity = new Date(lastSubmit + 1000).toISOString();
    lsPutMap(LS.LAST_SUBMIT_AT, { "sess-recap": String(lastSubmit) });

    const { result } = renderHook(() =>
      useRecaps("sess-recap", config, 8, lastActivity, true)
    );

    await act(async () => {
      await Promise.resolve();
    });
    expect(api.listRecaps).toHaveBeenCalledWith("sess-recap");

    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(result.current.recapPromptPending).toBe(true);
    expect(api.generateRecap).not.toHaveBeenCalled();

    await act(async () => {
      await result.current.generateRecap("sess-recap");
    });

    expect(api.generateRecap).toHaveBeenCalledWith("sess-recap");
    expect(result.current.recapPromptPending).toBe(false);
    expect(result.current.recaps).toEqual([recap]);
  });
});
