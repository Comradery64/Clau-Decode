import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ChatInput } from "../ChatInput";
import { api } from "../../../api/client";

// F1 (docs/pty-runner-plan.md) — chat send is PTY-only. The regression we
// still want to catch is `handleSend` reaching `api.ptySubmit` with the right
// args.
describe("ChatInput — F1 send path", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    // ptyStatus is hit by the on-focus warm-up. Stub it as "alive" so the
    // warm-up early-returns and we don't have to mock ptyFocus too.
    vi.spyOn(api, "ptyStatus").mockResolvedValue({
      alive: true,
      last_activity_ms: 0,
      last_input_ms: 0,
      last_pty_output_ms: 0,
      idle_kill_at_ms: null,
    });
    vi.spyOn(api, "ptyBlur").mockResolvedValue({ ok: true });
    vi.spyOn(api, "getSession").mockResolvedValue({
      id: "sess-test",
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
    });
  });

  it("calls api.ptySubmit when the user hits Enter", async () => {
    const ptySubmit = vi
      .spyOn(api, "ptySubmit")
      .mockResolvedValue({ ok: true });

    render(
      <ChatInput
        sessionId="sess-1"
        isStreaming={false}
        onStop={() => {}}
        defaultPermissionMode="dontAsk"
      />
    );

    const textarea = screen.getByPlaceholderText(/how can i help/i);
    fireEvent.change(textarea, { target: { value: "hello world" } });
    fireEvent.keyDown(textarea, { key: "Enter" });

    await waitFor(() => expect(ptySubmit).toHaveBeenCalledTimes(1));
    expect(ptySubmit).toHaveBeenCalledWith("sess-1", "hello world", undefined);
  });

  it("clears the composer immediately while ptySubmit is still pending", async () => {
    let resolveSubmit!: (value: { ok: true }) => void;
    vi.spyOn(api, "ptySubmit").mockReturnValue(
      new Promise((resolve) => {
        resolveSubmit = resolve;
      })
    );
    const onSubmitStart = vi.fn();

    render(
      <ChatInput
        sessionId="sess-pending-submit"
        isStreaming={false}
        onStop={() => {}}
        onSubmitStart={onSubmitStart}
        defaultPermissionMode="dontAsk"
      />
    );

    const textarea = screen.getByPlaceholderText(/how can i help/i) as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "first cold prompt" } });
    fireEvent.keyDown(textarea, { key: "Enter" });

    await waitFor(() => expect(textarea.value).toBe(""));
    expect(onSubmitStart).toHaveBeenCalledWith({
      kind: "message",
      content: "first cold prompt",
    });

    resolveSubmit({ ok: true });
  });

  it("shows the active send shortcut next to the submit button", () => {
    render(
      <ChatInput
        sessionId="sess-shortcut-label"
        isStreaming={false}
        onStop={() => {}}
        defaultPermissionMode="default"
        chatSendShortcut="enter"
      />
    );

    expect(screen.getByText("Enter")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /send message/i })).toHaveAttribute(
      "title",
      "Send (Enter)"
    );
  });

  it("uses Cmd/Ctrl+Enter when configured and leaves plain Enter as a newline", async () => {
    const ptySubmit = vi
      .spyOn(api, "ptySubmit")
      .mockResolvedValue({ ok: true });

    render(
      <ChatInput
        sessionId="sess-mod-enter"
        isStreaming={false}
        onStop={() => {}}
        defaultPermissionMode="default"
        chatSendShortcut="modEnter"
      />
    );

    const textarea = screen.getByPlaceholderText(/how can i help/i);
    fireEvent.change(textarea, { target: { value: "line one" } });
    fireEvent.keyDown(textarea, { key: "Enter" });
    expect(ptySubmit).not.toHaveBeenCalled();

    fireEvent.keyDown(textarea, { key: "Enter", metaKey: true });
    await waitFor(() => expect(ptySubmit).toHaveBeenCalledTimes(1));
    expect(ptySubmit).toHaveBeenCalledWith("sess-mod-enter", "line one", undefined);
  });

  it("does not warn for the native-compatible default permission mode", () => {
    render(
      <ChatInput
        sessionId="sess-default-mode"
        isStreaming={false}
        onStop={() => {}}
        defaultPermissionMode="default"
      />
    );

    expect(screen.queryByText(/assistant will hang/i)).not.toBeInTheDocument();
  });

  it("forwards the model picker selection to ptySubmit", async () => {
    const ptySubmit = vi
      .spyOn(api, "ptySubmit")
      .mockResolvedValue({ ok: true });

    render(
      <ChatInput
        sessionId="sess-2"
        isStreaming={false}
        onStop={() => {}}
        defaultPermissionMode="dontAsk"
      />
    );

    const textarea = screen.getByPlaceholderText(/how can i help/i);
    fireEvent.change(textarea, { target: { value: "ping" } });
    fireEvent.keyDown(textarea, { key: "Enter" });

    // Default model picker value → undefined argument so the server picks
    // the spawn-time default. The test fixes the contract: "default" must
    // never leak into the model arg.
    await waitFor(() => expect(ptySubmit).toHaveBeenCalledTimes(1));
    expect(ptySubmit.mock.calls[0][2]).toBeUndefined();
  });

  it("blocks normal and foreground slash messages while streaming but allows leading /btw", async () => {
    const ptySubmit = vi
      .spyOn(api, "ptySubmit")
      .mockResolvedValue({ ok: true });

    render(
      <ChatInput
        sessionId="sess-stream"
        isStreaming={true}
        onStop={() => {}}
        defaultPermissionMode="dontAsk"
      />
    );

    const textarea = screen.getByPlaceholderText(/how can i help/i);

    fireEvent.change(textarea, { target: { value: "regular while busy" } });
    fireEvent.keyDown(textarea, { key: "Enter" });
    expect(ptySubmit).not.toHaveBeenCalled();

    fireEvent.change(textarea, { target: { value: "/help" } });
    fireEvent.keyDown(textarea, { key: "Enter" });
    expect(ptySubmit).not.toHaveBeenCalled();

    fireEvent.change(textarea, { target: { value: "/btw side question" } });
    fireEvent.keyDown(textarea, { key: "Enter" });

    await waitFor(() => expect(ptySubmit).toHaveBeenCalledTimes(1));
    expect(ptySubmit).toHaveBeenCalledWith("sess-stream", "/btw side question", undefined);
  });

  it("shows a send control for a /btw draft while the main turn remains active", () => {
    render(
      <ChatInput
        sessionId="sess-stream-button"
        isStreaming={true}
        onStop={() => {}}
        defaultPermissionMode="dontAsk"
      />
    );

    const textarea = screen.getByPlaceholderText(/how can i help/i);
    fireEvent.change(textarea, { target: { value: "/btw side question" } });

    expect(screen.getByRole("button", { name: /send message/i })).toBeInTheDocument();
  });

  it("blocks all submits while a /btw capture is active", async () => {
    const ptySubmit = vi
      .spyOn(api, "ptySubmit")
      .mockResolvedValue({ ok: true });

    render(
      <ChatInput
        sessionId="sess-btw-active"
        isStreaming={false}
        btwCaptureActive={true}
        onStop={() => {}}
        defaultPermissionMode="dontAsk"
      />
    );

    const textarea = screen.getByPlaceholderText(/how can i help/i);

    fireEvent.change(textarea, { target: { value: "/brief" } });
    fireEvent.keyDown(textarea, { key: "Enter" });

    expect(ptySubmit).not.toHaveBeenCalled();
    expect(await screen.findByText(/btw response is still being captured/i)).toBeInTheDocument();
  });

  it("notifies the parent when ptySubmit rejects after optimistic submit start", async () => {
    vi.spyOn(api, "ptySubmit").mockRejectedValue(new Error("busy"));
    const onSubmitStart = vi.fn();
    const onSubmitFailed = vi.fn();

    render(
      <ChatInput
        sessionId="sess-submit-reject"
        isStreaming={false}
        onStop={() => {}}
        onSubmitStart={onSubmitStart}
        onSubmitFailed={onSubmitFailed}
        defaultPermissionMode="dontAsk"
      />
    );

    const textarea = screen.getByPlaceholderText(/how can i help/i);
    fireEvent.change(textarea, { target: { value: "/brief" } });
    fireEvent.keyDown(textarea, { key: "Enter" });

    await waitFor(() => {
      expect(onSubmitStart).toHaveBeenCalledWith({ kind: "slash", content: "/brief" });
      expect(onSubmitFailed).toHaveBeenCalledWith({ kind: "slash", content: "/brief" });
    });
  });

  it("does not blur on unmount when the textarea was never focused", () => {
    const { unmount } = render(
      <ChatInput
        sessionId="sess-never-focused"
        isStreaming={false}
        onStop={() => {}}
        defaultPermissionMode="dontAsk"
      />
    );

    unmount();

    expect(api.ptyBlur).not.toHaveBeenCalled();
  });

  it("blurs on unmount after focus intent warmed the PTY", async () => {
    const { unmount } = render(
      <ChatInput
        sessionId="sess-focused"
        isStreaming={false}
        onStop={() => {}}
        defaultPermissionMode="dontAsk"
      />
    );

    fireEvent.focus(screen.getByPlaceholderText(/how can i help/i));
    await waitFor(() => expect(api.ptyStatus).toHaveBeenCalledWith("sess-focused"));

    unmount();

    expect(api.ptyBlur).toHaveBeenCalledWith("sess-focused");
  });
});
