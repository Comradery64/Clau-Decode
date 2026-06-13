import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import SearchOverlay from "../SearchOverlay";
import { api } from "../../../api/client";

describe("SearchOverlay", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(api, "getAllSessions").mockResolvedValue([]);
  });

  it("renders visible provenance for ephemeral /btw hits", async () => {
    vi.spyOn(api, "search").mockResolvedValue([
      {
        message_id: "e-1",
        session_id: "s-1",
        project_id: "p-1",
        role: "assistant",
        session_title: "Test Session",
        timestamp: "2026-06-04T00:00:00+00:00",
        snippet: "answer said four",
        source: "ephemeral",
        kind: "btw",
        responds_to: 1,
      },
    ]);

    render(<SearchOverlay />);

    fireEvent.change(screen.getByPlaceholderText(/search conversations/i), {
      target: { value: "four" },
    });

    await waitFor(() => {
      expect(screen.getByLabelText(/ephemeral btw/i)).toBeInTheDocument();
    });
    expect(screen.getByText("BTW")).toBeInTheDocument();
  });
});
