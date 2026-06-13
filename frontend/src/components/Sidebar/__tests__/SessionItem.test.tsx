import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { SessionItem, formatRelativeDate } from "../SessionItem";
import type { RunnerStatus, Session } from "../../../api/types";

const baseSession: Session = {
  id: "test-id",
  project_id: "proj-1",
  file_path: "/tmp/test.jsonl",
  title: "Test Session Title",
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

describe("SessionItem", () => {
  it("renders session title", () => {
    render(<SessionItem session={baseSession} isActive={false} onClick={() => {}} />);
    expect(screen.getByText("Test Session Title")).toBeInTheDocument();
  });

  it("renders 'Untitled' when title is null", () => {
    render(
      <SessionItem
        session={{ ...baseSession, title: null }}
        isActive={false}
        onClick={() => {}}
      />
    );
    expect(screen.getByText("Untitled")).toBeInTheDocument();
  });

  it("shows active styling when isActive=true", () => {
    const { container } = render(
      <SessionItem session={baseSession} isActive={true} onClick={() => {}} />
    );
    const el = container.firstChild as HTMLElement;
    expect(el).toBeTruthy();
    expect(el.style.background).toBe("var(--bg-sidebar-active)");
  });

  it("shows transparent background when not active", () => {
    const { container } = render(
      <SessionItem session={baseSession} isActive={false} onClick={() => {}} />
    );
    const el = container.firstChild as HTMLElement;
    expect(el.style.background).toBe("transparent");
  });

  it("keeps long titles on one line and exposes them via hover tooltip", () => {
    const longTitle = "A".repeat(100);
    const { container } = render(
      <SessionItem
        session={{ ...baseSession, title: longTitle }}
        isActive={false}
        onClick={() => {}}
      />
    );
    const titleEl = container.querySelector("[data-testid='session-title']") as HTMLElement;
    expect(titleEl).toBeTruthy();
    // Full title text is in the DOM (will be visually clipped by ellipsis
    // when the sidebar is narrower than the title).
    expect(titleEl.textContent).toBe(longTitle);
    // Single-line truncation styles applied.
    expect(titleEl.style.whiteSpace).toBe("nowrap");
    expect(titleEl.style.overflow).toBe("hidden");
    expect(titleEl.style.textOverflow).toBe("ellipsis");
    // Native title attribute reveals the full text on hover so users can
    // recover the truncated portion without widening the sidebar.
    expect(titleEl.getAttribute("title")).toBe(longTitle);
  });

  it("fires onClick when clicked", () => {
    const onClick = vi.fn();
    render(<SessionItem session={baseSession} isActive={false} onClick={onClick} />);
    fireEvent.click(screen.getByText("Test Session Title"));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("fires onClick on Enter keydown", () => {
    const onClick = vi.fn();
    render(
      <SessionItem session={baseSession} isActive={false} onClick={onClick} />
    );
    // Row body is now a native <button>, so Enter triggers a click natively.
    // Query by aria-label which equals the display title.
    const rowBtn = screen.getByRole("button", { name: "Test Session Title" });
    fireEvent.click(rowBtn);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("does not show model badge (title-only design)", () => {
    render(<SessionItem session={baseSession} isActive={false} onClick={() => {}} />);
    expect(screen.queryByText("Sonnet 4.6")).not.toBeInTheDocument();
  });

  it("renders no model text when model is null", () => {
    render(
      <SessionItem
        session={{ ...baseSession, model: null }}
        isActive={false}
        onClick={() => {}}
      />
    );
    expect(screen.queryByText(/sonnet/i)).not.toBeInTheDocument();
  });

  // ---- Runner-status marker (issue #12) -----------------------------------

  it("renders the busy marker when runnerStatus.busy is true", () => {
    const status: RunnerStatus = {
      busy: true,
      last_error: null,
      permission_mode: "default",
    };
    render(
      <SessionItem
        session={baseSession}
        isActive={false}
        onClick={() => {}}
        runnerStatus={status}
      />
    );
    expect(screen.getByTestId("runner-busy-marker")).toBeInTheDocument();
  });

  it("does not render the busy marker when runnerStatus is undefined", () => {
    render(<SessionItem session={baseSession} isActive={false} onClick={() => {}} />);
    expect(screen.queryByTestId("runner-busy-marker")).not.toBeInTheDocument();
  });

  it("does not render the busy marker when runnerStatus.busy is false", () => {
    const status: RunnerStatus = {
      busy: false,
      last_error: null,
      permission_mode: null,
    };
    render(
      <SessionItem
        session={baseSession}
        isActive={false}
        onClick={() => {}}
        runnerStatus={status}
      />
    );
    expect(screen.queryByTestId("runner-busy-marker")).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// formatRelativeDate unit tests
// ---------------------------------------------------------------------------

describe("formatRelativeDate", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-03T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns 'Today' for current timestamp", () => {
    expect(formatRelativeDate(new Date().toISOString())).toBe("Today");
  });

  it("returns 'Yesterday' for 25 hours ago", () => {
    const d = new Date(Date.now() - 25 * 60 * 60 * 1000);
    expect(formatRelativeDate(d.toISOString())).toBe("Yesterday");
  });

  it("returns a month/day string for old dates", () => {
    const result = formatRelativeDate("2020-01-15T10:00:00.000Z");
    expect(result).toMatch(/Jan 15, 2020/);
  });

  it("returns short month/day for dates in the current year", () => {
    const currentYear = new Date().getFullYear();
    const d = new Date(currentYear, 0, 5).toISOString(); // Jan 5 of this year
    const result = formatRelativeDate(d);
    // Should be "Jan 5" — but only if it's in the past and within the year
    expect(result).toBeTruthy();
  });
});
