import { describe, it, expect, vi, afterEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { api } from "../../../../api/client";
import type { SessionDetail } from "../../../../api/types";
import { emit } from "../../../../utils/events";
import { logUnlessExpected404, useSessionDetail } from "../useSessionDetail";

afterEach(() => {
  vi.restoreAllMocks();
});

function makeDetail(id: string): SessionDetail {
  return {
    id,
    project_id: "project-1",
    file_path: "/tmp/session.jsonl",
    title: "Test Session",
    custom_title: null,
    archived_at: null,
    starred_at: null,
    viewed_at: null,
    model: null,
    started_at: null,
    updated_at: null,
    message_count: 0,
    user_message_count: 0,
    cwd: "/tmp",
    git_branch: null,
    is_worktree: false,
    is_fork: false,
    permission_mode: null,
    last_message_role: null,
    cwd_exists: true,
    messages: [],
  };
}

function makeDetailWithText(id: string, title: string, assistantText: string): SessionDetail {
  const base = makeDetail(id);
  return {
    ...base,
    title,
    updated_at: "2026-06-05T03:45:01.000Z",
    message_count: 2,
    user_message_count: 1,
    last_message_role: "assistant",
    messages: [
      {
        id: `${id}-user`,
        session_id: id,
        parent_id: null,
        role: "user",
        timestamp: "2026-06-05T03:45:00.000Z",
        model: null,
        is_sidechain: false,
        is_meta: false,
        cwd: "/tmp",
        git_branch: null,
        source_tool_assistant_uuid: null,
        content_blocks: [{ type: "text", text: "Prompt" }],
        usage: null,
      },
      {
        id: `${id}-assistant`,
        session_id: id,
        parent_id: `${id}-user`,
        role: "assistant",
        timestamp: "2026-06-05T03:45:01.000Z",
        model: "glm-5.1",
        is_sidechain: false,
        is_meta: false,
        cwd: "/tmp",
        git_branch: null,
        source_tool_assistant_uuid: null,
        content_blocks: [{ type: "text", text: assistantText }],
        usage: null,
      },
    ],
  };
}

describe("logUnlessExpected404 — issue #9 fresh-id 404 suppression", () => {
  it("silently ignores the GET /api/sessions/<id> → 404 from api.client", () => {
    // api.client formats fetch errors as `GET ${path} → ${status}`.
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const err = new Error("GET /api/sessions/abc → 404");
    logUnlessExpected404(err);
    expect(spy).not.toHaveBeenCalled();
  });

  it("still logs non-404 errors so real failures stay visible", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    logUnlessExpected404(new Error("GET /api/sessions/abc → 500"));
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockClear();
    logUnlessExpected404(new TypeError("Network error"));
    expect(spy).toHaveBeenCalledTimes(1);
  });
});

describe("useSessionDetail — /btw ephemeral refresh", () => {
  it("refetches ephemerals when a /btw input row is persisted", async () => {
    vi.spyOn(api, "getSession").mockResolvedValue(makeDetail("sess-1"));
    const ptyEphemerals = vi.spyOn(api, "ptyEphemerals").mockResolvedValue([]);

    renderHook(() => useSessionDetail("sess-1"));

    await waitFor(() => expect(ptyEphemerals).toHaveBeenCalledTimes(1));

    act(() => {
      emit("ephemeral-input-persisted", {
        session_id: "other-session",
        input_id: 1,
        kind: "btw",
      });
    });
    expect(ptyEphemerals).toHaveBeenCalledTimes(1);

    act(() => {
      emit("ephemeral-input-persisted", {
        session_id: "sess-1",
        input_id: 2,
        kind: "btw",
      });
    });

    await waitFor(() => expect(ptyEphemerals).toHaveBeenCalledTimes(2));
  });

  it("refetches ephemerals when /btw reaches a terminal submit state", async () => {
    vi.spyOn(api, "getSession").mockResolvedValue(makeDetail("sess-1"));
    const ptyEphemerals = vi.spyOn(api, "ptyEphemerals").mockResolvedValue([]);

    renderHook(() => useSessionDetail("sess-1"));

    await waitFor(() => expect(ptyEphemerals).toHaveBeenCalledTimes(1));

    act(() => {
      emit("pty-submit-completed", {
        session_id: "sess-1",
        kind: "slash",
        status: "acknowledged",
        input_id: null,
        response_id: null,
      });
    });
    expect(ptyEphemerals).toHaveBeenCalledTimes(1);

    act(() => {
      emit("pty-submit-completed", {
        session_id: "other-session",
        kind: "btw",
        status: "timed_out",
        input_id: 1,
        response_id: null,
      });
    });
    expect(ptyEphemerals).toHaveBeenCalledTimes(1);

    act(() => {
      emit("pty-submit-completed", {
        session_id: "sess-1",
        kind: "btw",
        status: "timed_out",
        input_id: 1,
        response_id: null,
      });
    });

    await waitFor(() => expect(ptyEphemerals).toHaveBeenCalledTimes(2));
  });
});

describe("useSessionDetail — live refresh reconciliation", () => {
  it("updates detail when refresh returns changed content with the same message shape", async () => {
    const first = makeDetailWithText("sess-refresh", "Untitled", "partial");
    const second = {
      ...makeDetailWithText("sess-refresh", "Respond with exactly: e2e-ready", "e2e-ready"),
      updated_at: "2026-06-05T03:45:02.000Z",
    };
    const getSession = vi.spyOn(api, "getSession")
      .mockResolvedValueOnce(first)
      .mockResolvedValueOnce(second);
    vi.spyOn(api, "ptyEphemerals").mockResolvedValue([]);

    const { result } = renderHook(() => useSessionDetail("sess-refresh"));

    await waitFor(() => expect(result.current.detail?.title).toBe("Untitled"));

    act(() => {
      emit("refresh", undefined);
    });

    await waitFor(() => {
      expect(getSession).toHaveBeenCalledTimes(2);
      expect(result.current.detail?.title).toBe("Respond with exactly: e2e-ready");
      expect(result.current.detail?.messages[1]?.content_blocks[0]).toMatchObject({
        type: "text",
        text: "e2e-ready",
      });
    });
  });
});
