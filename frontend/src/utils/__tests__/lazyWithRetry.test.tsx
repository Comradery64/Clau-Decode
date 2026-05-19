import React from "react";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { lazyWithRetry, isChunkLoadError } from "../lazyWithRetry";

// jsdom's `location.reload` is non-configurable by default — wrap it manually
// so we can assert it was called without trying to redefine the property.
function stubReload() {
  const original = window.location;
  const reload = vi.fn();
  // Replace the whole `location` object with a proxy-like stand-in.
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { ...original, reload },
  });
  return {
    reload,
    restore: () =>
      Object.defineProperty(window, "location", {
        configurable: true,
        value: original,
      }),
  };
}

describe("isChunkLoadError", () => {
  it("matches Vite's dynamic import failure message", () => {
    const err = new Error(
      "Failed to fetch dynamically imported module: http://x/assets/Foo-abc.js",
    );
    expect(isChunkLoadError(err)).toBe(true);
  });

  it("matches webpack-style ChunkLoadError name", () => {
    const err = new Error("Loading chunk 3 failed.");
    err.name = "ChunkLoadError";
    expect(isChunkLoadError(err)).toBe(true);
  });

  it("matches MIME-type rejection (stale-cache served HTML)", () => {
    const err = new Error(
      'Failed to load module script: Expected a JavaScript module script but the server responded with a MIME type of "text/html".',
    );
    expect(isChunkLoadError(err)).toBe(true);
  });

  it("does NOT match unrelated runtime errors", () => {
    expect(isChunkLoadError(new Error("undefined is not a function"))).toBe(false);
  });
});

describe("lazyWithRetry", () => {
  let reloadStub: ReturnType<typeof stubReload>;

  beforeEach(() => {
    reloadStub = stubReload();
    // Silence the expected React error log when the import rejects.
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    reloadStub.restore();
    vi.restoreAllMocks();
  });

  it("renders the module's default export when the import resolves", async () => {
    const Lazy = lazyWithRetry(async () => ({
      default: () => <div>loaded ok</div>,
    }));
    render(
      <React.Suspense fallback={<div>loading</div>}>
        <Lazy />
      </React.Suspense>,
    );
    await waitFor(() => {
      expect(screen.getByText("loaded ok")).toBeInTheDocument();
    });
  });

  it("renders a reload prompt (not a crash) when the chunk fails to load", async () => {
    const Lazy = lazyWithRetry(async () => {
      throw new Error(
        "Failed to fetch dynamically imported module: http://x/assets/Foo-abc.js",
      );
    });
    render(
      <React.Suspense fallback={<div>loading</div>}>
        <Lazy />
      </React.Suspense>,
    );
    const reloadBtn = await screen.findByRole("button", { name: /reload/i });
    expect(reloadBtn).toBeInTheDocument();
    fireEvent.click(reloadBtn);
    expect(reloadStub.reload).toHaveBeenCalledTimes(1);
  });
});
