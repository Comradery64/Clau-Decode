import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

// Mock the api client so the hooks don't try to hit a real network.
vi.mock("../../api/client", () => ({
  api: {
    getAllSessions: vi.fn(),
    setArchived: vi.fn(),
    setStarred: vi.fn(),
    setViewedAt: vi.fn(),
    migrateLocalStorage: vi.fn(),
  },
}));

import { api } from "../../api/client";
import {
  useArchivedSet,
  useStarredSet,
  useViewedAt,
  applySessionMetaEvent,
  refetchSessionMeta,
  __test,
} from "../sessionMeta";

const apiMock = api as unknown as {
  getAllSessions: ReturnType<typeof vi.fn>;
  setArchived: ReturnType<typeof vi.fn>;
  setStarred: ReturnType<typeof vi.fn>;
  setViewedAt: ReturnType<typeof vi.fn>;
};

beforeEach(() => {
  __test.reset();
  apiMock.getAllSessions.mockReset();
  apiMock.setArchived.mockReset();
  apiMock.setStarred.mockReset();
  apiMock.setViewedAt.mockReset();
  // Default-resolved mocks so toggles don't error.
  apiMock.setArchived.mockResolvedValue({ ok: true, id: "x", archived_at: null });
  apiMock.setStarred.mockResolvedValue({ ok: true, id: "x", starred_at: null });
  apiMock.setViewedAt.mockResolvedValue({ ok: true, id: "x", viewed_at: null });
});

describe("useArchivedSet", () => {
  it("returns the seeded archived ids", () => {
    __test.seed({ archived: ["sid-a", "sid-b"] });
    const { result } = renderHook(() => useArchivedSet());
    expect(result.current.has("sid-a")).toBe(true);
    expect(result.current.has("sid-b")).toBe(true);
    expect(result.current.has("sid-c")).toBe(false);
  });

  it("toggle optimistically updates the cache and calls setArchived", async () => {
    const { result } = renderHook(() => useArchivedSet());
    act(() => result.current.toggle("sid-x"));
    expect(result.current.has("sid-x")).toBe(true);
    await waitFor(() => expect(apiMock.setArchived).toHaveBeenCalledWith("sid-x", true));
  });

  it("toggle rolls back on API failure", async () => {
    apiMock.setArchived.mockRejectedValueOnce(new Error("boom"));
    const { result } = renderHook(() => useArchivedSet());
    act(() => result.current.toggle("sid-x"));
    expect(result.current.has("sid-x")).toBe(true);  // optimistic
    await waitFor(() => expect(result.current.has("sid-x")).toBe(false));  // rolled back
  });

  it("add is a no-op when already archived", async () => {
    __test.seed({ archived: ["sid-a"] });
    const { result } = renderHook(() => useArchivedSet());
    act(() => result.current.add("sid-a"));
    expect(apiMock.setArchived).not.toHaveBeenCalled();
  });
});

describe("useStarredSet", () => {
  it("toggle calls setStarred and updates cache", async () => {
    const { result } = renderHook(() => useStarredSet());
    act(() => result.current.toggle("sid-z"));
    expect(result.current.has("sid-z")).toBe(true);
    await waitFor(() => expect(apiMock.setStarred).toHaveBeenCalledWith("sid-z", true));
  });
});

describe("useViewedAt", () => {
  it("set updates the map and calls setViewedAt with the timestamp", async () => {
    const { result } = renderHook(() => useViewedAt());
    act(() => result.current.set("sid-v", "2026-05-28T10:00:00"));
    expect(result.current.get("sid-v")).toBe("2026-05-28T10:00:00");
    await waitFor(() =>
      expect(apiMock.setViewedAt).toHaveBeenCalledWith("sid-v", "2026-05-28T10:00:00")
    );
  });

  it("clear removes the entry and calls setViewedAt with null", async () => {
    __test.seed({ viewed: { "sid-v": "2026-05-28T10:00:00" } });
    const { result } = renderHook(() => useViewedAt());
    expect(result.current.get("sid-v")).toBe("2026-05-28T10:00:00");
    act(() => result.current.clear("sid-v"));
    expect(result.current.get("sid-v")).toBeNull();
    await waitFor(() => expect(apiMock.setViewedAt).toHaveBeenCalledWith("sid-v", null));
  });

  it("set rolls back on API failure", async () => {
    apiMock.setViewedAt.mockRejectedValueOnce(new Error("boom"));
    __test.seed({ viewed: { "sid-v": "old" } });
    const { result } = renderHook(() => useViewedAt());
    act(() => result.current.set("sid-v", "new"));
    expect(result.current.get("sid-v")).toBe("new");  // optimistic
    await waitFor(() => expect(result.current.get("sid-v")).toBe("old"));  // rolled back
  });
});

describe("applySessionMetaEvent", () => {
  it("adds an id when archived_at flips from null to a value", () => {
    const { result } = renderHook(() => useArchivedSet());
    expect(result.current.has("sid-q")).toBe(false);
    act(() => applySessionMetaEvent({ id: "sid-q", archived_at: "2026-05-28T11:00:00" }));
    expect(result.current.has("sid-q")).toBe(true);
  });

  it("removes an id when archived_at flips to null", () => {
    __test.seed({ archived: ["sid-q"] });
    const { result } = renderHook(() => useArchivedSet());
    expect(result.current.has("sid-q")).toBe(true);
    act(() => applySessionMetaEvent({ id: "sid-q", archived_at: null }));
    expect(result.current.has("sid-q")).toBe(false);
  });

  it("doesn't clobber unrelated fields when only one is in the payload", () => {
    __test.seed({ archived: ["sid-q"], starred: ["sid-q"], viewed: { "sid-q": "ts" } });
    // Event only mentions archived_at — starred and viewed must stay.
    act(() => applySessionMetaEvent({ id: "sid-q", archived_at: null }));
    expect(__test.snapshot().archived.has("sid-q")).toBe(false);
    expect(__test.snapshot().starred.has("sid-q")).toBe(true);
    expect(__test.snapshot().viewed.get("sid-q")).toBe("ts");
  });
});

describe("refetchSessionMeta", () => {
  it("rebuilds the cache from /api/sessions", async () => {
    apiMock.getAllSessions.mockResolvedValueOnce([
      { id: "s1", archived_at: "t1", starred_at: null, viewed_at: null } as any,
      { id: "s2", archived_at: null, starred_at: "t2", viewed_at: "t3" } as any,
    ]);
    await refetchSessionMeta();
    const snap = __test.snapshot();
    expect(snap.archived.has("s1")).toBe(true);
    expect(snap.starred.has("s2")).toBe(true);
    expect(snap.viewed.get("s2")).toBe("t3");
  });
});
