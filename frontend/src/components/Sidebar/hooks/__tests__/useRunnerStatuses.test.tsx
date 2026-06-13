import { renderHook, act } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RunnerStatus } from "../../../../api/types";
import { useRunnerStatuses } from "../useRunnerStatuses";

function makeStatus(busy: boolean): RunnerStatus {
  return {
    busy,
    last_error: null,
    permission_mode: busy ? "default" : null,
  };
}

// Drain microtasks so awaited fetcher promises and the subsequent state
// update can settle before assertions. setInterval ticks are driven with
// vi.advanceTimersByTimeAsync.
async function flushMicrotasks() {
  for (let i = 0; i < 5; i++) {
    await Promise.resolve();
  }
}

describe("useRunnerStatuses", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  // Batch fetcher: one call per tick returning a status-by-id map.
  const batch = (fn: (id: string) => RunnerStatus) =>
    vi.fn(async (ids: string[]) =>
      Object.fromEntries(ids.map((id) => [id, fn(id)])),
    );

  it("fetches all ids in ONE batched call and exposes a Map", async () => {
    const fetcher = batch((id) => makeStatus(id === "busy-id"));

    const { result } = renderHook(() =>
      useRunnerStatuses(["busy-id", "idle-id"], { intervalMs: 3000, fetcher }),
    );

    await act(async () => {
      await flushMicrotasks();
    });

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledWith(["busy-id", "idle-id"]);
    expect(result.current.get("busy-id")?.busy).toBe(true);
    expect(result.current.get("idle-id")?.busy).toBe(false);
  });

  it("re-polls on the interval (one call per tick)", async () => {
    const fetcher = batch(() => makeStatus(true));
    renderHook(() => useRunnerStatuses(["a"], { intervalMs: 3000, fetcher }));

    await act(async () => {
      await flushMicrotasks();
    });
    expect(fetcher).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(fetcher).toHaveBeenCalledTimes(2);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it("does not fetch when the id list is empty", async () => {
    const fetcher = batch(() => makeStatus(false));
    renderHook(() => useRunnerStatuses([], { intervalMs: 3000, fetcher }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(6000);
    });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("drops ids that are no longer visible", async () => {
    const fetcher = batch(() => makeStatus(true));
    const { result, rerender } = renderHook(
      ({ ids }: { ids: string[] }) =>
        useRunnerStatuses(ids, { intervalMs: 3000, fetcher }),
      { initialProps: { ids: ["a", "b"] } },
    );
    await act(async () => {
      await flushMicrotasks();
    });
    expect(result.current.size).toBe(2);

    rerender({ ids: ["a"] });
    await act(async () => {
      await flushMicrotasks();
    });
    expect(result.current.size).toBe(1);
    expect(result.current.has("b")).toBe(false);
  });

  it("swallows fetcher errors without throwing", async () => {
    const fetcher = vi
      .fn<(ids: string[]) => Promise<Record<string, RunnerStatus>>>()
      .mockRejectedValue(new Error("boom"));
    const { result } = renderHook(() =>
      useRunnerStatuses(["a"], { intervalMs: 3000, fetcher }),
    );
    await act(async () => {
      await flushMicrotasks();
    });
    expect(fetcher).toHaveBeenCalled();
    expect(result.current.get("a")).toBeUndefined();
  });
});
