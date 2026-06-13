import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { SessionItem } from "../SessionItem";
import type { Session } from "../../../api/types";
import { api } from "../../../api/client";
import { emit } from "../../../utils/events";
import { LS, lsGetMap } from "../../../utils/localStorage";

const baseSession: Session = {
  id: "rename-test-id",
  project_id: "proj-1",
  file_path: "/tmp/test.jsonl",
  title: "Parsed Title",
  custom_title: null,
  archived_at: null,
  starred_at: null,
  viewed_at: null,
  model: "claude-sonnet-4-6",
  started_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  message_count: 5,
  user_message_count: 3,
  cwd: "/test",
  git_branch: "main",
  is_worktree: false,
  is_fork: false,
  permission_mode: "default",
  last_message_role: null,
};

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("SessionItem — server-synced rename (issue #11)", () => {
  it("prefers server custom_title over parsed title and localStorage", () => {
    // localStorage says one thing, but the server-side custom_title wins.
    const m: Record<string, string> = { [baseSession.id]: "Local Cache" };
    localStorage.setItem(LS.RENAMED, JSON.stringify(m));

    render(
      <SessionItem
        session={{ ...baseSession, custom_title: "Server Says" }}
        isActive={false}
        onClick={() => {}}
      />,
    );
    expect(screen.getByText("Server Says")).toBeInTheDocument();
  });

  it("falls back to localStorage cache when custom_title is null", () => {
    const m: Record<string, string> = { [baseSession.id]: "Cached Rename" };
    localStorage.setItem(LS.RENAMED, JSON.stringify(m));

    render(
      <SessionItem
        session={{ ...baseSession, custom_title: null }}
        isActive={false}
        onClick={() => {}}
      />,
    );
    expect(screen.getByText("Cached Rename")).toBeInTheDocument();
  });

  it("commitRename calls api.setSessionTitle, updates the cache, and emits", async () => {
    const setTitle = vi
      .spyOn(api, "setSessionTitle")
      .mockResolvedValue({ ok: true, id: baseSession.id, custom_title: "My New Title" });

    render(<SessionItem session={baseSession} isActive={false} onClick={() => {}} />);

    // Open the menu, click Rename, then commit via the RenameInput.
    fireEvent.click(screen.getByLabelText("Session options"));
    fireEvent.click(screen.getByText("Rename"));

    const input = await screen.findByRole("textbox");
    fireEvent.change(input, { target: { value: "My New Title" } });
    fireEvent.keyDown(input, { key: "Enter" });

    // API is called with the trimmed value, not null.
    expect(setTitle).toHaveBeenCalledWith(baseSession.id, "My New Title");

    // Optimistic UI: paints the new title immediately.
    expect(await screen.findByText("My New Title")).toBeInTheDocument();

    // Write-through to localStorage cache.
    await waitFor(() => {
      expect(lsGetMap(LS.RENAMED)[baseSession.id]).toBe("My New Title");
    });
  });

  it("a remote rename with empty title clears the local override + cache", async () => {
    // Seed local cache so we can observe it being cleared.
    localStorage.setItem(LS.RENAMED, JSON.stringify({ [baseSession.id]: "Old" }));

    render(
      <SessionItem
        session={{ ...baseSession, custom_title: "Old" }}
        isActive={false}
        onClick={() => {}}
      />,
    );
    expect(screen.getByText("Old")).toBeInTheDocument();

    // A SSE session-meta with null title arrives → App.tsx emits rename
    // with an empty string. SessionItem treats empty as "clear".
    act(() => {
      emit("rename", { id: baseSession.id, title: "" });
    });

    await waitFor(() => {
      expect(baseSession.id in lsGetMap(LS.RENAMED)).toBe(false);
    });
    expect(screen.getByText("Parsed Title")).toBeInTheDocument();
  });

  it("reconciles to a remote rename event from the bus", async () => {
    render(
      <SessionItem
        session={baseSession}
        isActive={false}
        onClick={() => {}}
      />,
    );
    expect(screen.getByText("Parsed Title")).toBeInTheDocument();

    // Another client renamed this session — App.tsx fans session-meta SSE
    // into a "rename" emit on the bus, which SessionItem listens to.
    act(() => {
      emit("rename", { id: baseSession.id, title: "Renamed From Afar" });
    });

    expect(await screen.findByText("Renamed From Afar")).toBeInTheDocument();
    // And the cache picked it up so a reload still shows the override.
    expect(lsGetMap(LS.RENAMED)[baseSession.id]).toBe("Renamed From Afar");
  });

  it("ignores rename events for a different session id", () => {
    render(
      <SessionItem session={baseSession} isActive={false} onClick={() => {}} />,
    );
    act(() => {
      emit("rename", { id: "other-session", title: "Should Not Appear" });
    });
    expect(screen.queryByText("Should Not Appear")).not.toBeInTheDocument();
    expect(screen.getByText("Parsed Title")).toBeInTheDocument();
  });
});
