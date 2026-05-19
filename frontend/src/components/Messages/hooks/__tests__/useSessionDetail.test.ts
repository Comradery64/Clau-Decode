import { describe, it, expect, vi, afterEach } from "vitest";
import { logUnlessExpected404 } from "../useSessionDetail";

afterEach(() => {
  vi.restoreAllMocks();
});

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
