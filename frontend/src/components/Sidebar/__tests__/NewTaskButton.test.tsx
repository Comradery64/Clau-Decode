import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NewTaskButton, startNewSession } from "../NewTaskButton";
import { api } from "../../../api/client";

beforeEach(() => {
  // reset hash so navigateTo lands cleanly
  window.location.hash = "";
  vi.restoreAllMocks();
});

afterEach(() => {
  window.location.hash = "";
});

describe("NewTaskButton — issue #9 'New Task' + Cmd+Shift+O", () => {
  it("button click posts to /api/sessions/new and navigates to the new session", async () => {
    const newId = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
    const spy = vi
      .spyOn(api, "newSession")
      .mockResolvedValue({
        session_id: newId,
        cwd: "/tmp/proj",
        permission_mode: "dontAsk",
      });

    render(<NewTaskButton />);

    fireEvent.click(screen.getByLabelText(/new task/i));

    await waitFor(() => expect(spy).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(window.location.hash).toBe(`#/chat/${newId}`),
    );
  });

  it("Cmd+Shift+O fires the same flow via the document-level handler", async () => {
    const newId = "11111111-2222-4333-8444-555555555555";
    const spy = vi
      .spyOn(api, "newSession")
      .mockResolvedValue({
        session_id: newId,
        cwd: "/tmp/proj",
        permission_mode: "dontAsk",
      });

    render(<NewTaskButton />);

    act(() => {
      document.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "O",
          code: "KeyO",
          metaKey: true,
          shiftKey: true,
          bubbles: true,
        }),
      );
    });

    await waitFor(() => expect(spy).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(window.location.hash).toBe(`#/chat/${newId}`),
    );
  });

  it("startNewSession resolves with the new session id (helper is reusable)", async () => {
    const newId = "deadbeef-1111-4222-8333-444444444444";
    vi.spyOn(api, "newSession").mockResolvedValue({
      session_id: newId,
      cwd: "/tmp/proj",
      permission_mode: "dontAsk",
    });

    const id = await startNewSession();
    expect(id).toBe(newId);
    expect(window.location.hash).toBe(`#/chat/${newId}`);
  });

  it("survives a failed POST without throwing (button stays clickable)", async () => {
    vi.spyOn(api, "newSession").mockRejectedValue(new Error("boom"));

    render(<NewTaskButton />);

    // Should not throw past act/render — error is swallowed so the UI
    // doesn't unmount on a transient backend hiccup.
    fireEvent.click(screen.getByLabelText(/new task/i));
    await waitFor(() => expect(api.newSession).toHaveBeenCalled());
    // Hash unchanged on failure — caller stays where they were.
    expect(window.location.hash).toBe("");
  });
});
