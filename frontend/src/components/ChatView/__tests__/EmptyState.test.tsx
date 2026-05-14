import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { EmptyState, MessageSkeleton } from "../EmptyState";

describe("EmptyState", () => {
  it("renders default empty state message", () => {
    render(<EmptyState />);
    expect(screen.getByText("Select a conversation to view")).toBeInTheDocument();
  });

  it("renders subtitle hint", () => {
    render(<EmptyState />);
    expect(
      screen.getByText("Browse sessions in the sidebar or use keyboard shortcuts")
    ).toBeInTheDocument();
  });

  it("renders the logo icon", () => {
    const { container } = render(<EmptyState />);
    expect(container.querySelector("svg")).toBeInTheDocument();
  });

  it("applies centering styles", () => {
    const { container } = render(<EmptyState />);
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.style.display).toBe("flex");
    expect(wrapper.style.alignItems).toBe("center");
    expect(wrapper.style.justifyContent).toBe("center");
  });
});

describe("MessageSkeleton", () => {
  it("renders default number of skeleton rows", () => {
    const { container } = render(<MessageSkeleton />);
    expect(container.querySelectorAll("[data-skeleton]").length).toBe(4);
  });

  it("renders configurable number of skeleton rows", () => {
    const { container } = render(<MessageSkeleton rows={5} />);
    expect(container.querySelectorAll("[data-skeleton]").length).toBe(5);
  });

  it("exposes loading status to screen readers", () => {
    render(<MessageSkeleton />);
    const status = screen.getByRole("status");
    expect(status).toHaveAttribute("aria-label", "Loading conversation");
  });
});
