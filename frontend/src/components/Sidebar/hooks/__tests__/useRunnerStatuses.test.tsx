import { renderHook, act } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RunnerStatus } from "../../../../api/types";
import { useRunnerStatuses } from "../useRunnerStatuses";

function makeStatus(busy: boolean): RunnerStatus {
  return {
    busy,
    last_error: null,
    permission_mode: busy ? "default" : null,
    quiet_age_seconds: busy ? 0.1 : null,
    quiet_warning: false,
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

  it("fetches status for each id on mount and exposes a Map", async () => {
    const fetcher = vi.fn(async (id: string) => makeStatus(id === "busy-id"));

    const { result } = renderHook(() =>
      useRunnerStatuses(["busy-id", "idle-id"], { intervalMs: 3000, fetcher }),
    );

    await act(async () => {
      await flushMicrotasks();
    });

    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(result.current.get("busy-id")?.busy).toBe(true);
    expect(result.current.get("idle-id")?.busy).toBe(false);
  });

  it("re-polls on the interval", async () => {
    const fetcher = vi.fn(async () => makeStatus(true));
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
    const fetcher = vi.fn(async () => makeStatus(false));
    renderHook(() => useRunnerStatuses([], { intervalMs: 3000, fetcher }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(6000);
    });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("drops ids that are no longer visible", async () => {
    const fetcher = vi.fn(async () => makeStatus(true));
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
      .fn<(id: string) => Promise<RunnerStatus>>()
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
