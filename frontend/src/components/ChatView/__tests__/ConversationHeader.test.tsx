import { render, screen, fireEvent } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConversationHeader } from "../ConversationHeader";
import type { Session } from "../../../api/types";
import { useAppStore } from "../../../store";

vi.mock("../../../api/client", () => ({
  api: {
    exportSession: vi.fn(),
    openTerminal: vi.fn(),
  },
}));

const session: Session = {
  id: "sess-switcher",
  project_id: "project",
  file_path: "/tmp/session.jsonl",
  title: "Native switcher",
  custom_title: null,
  archived_at: null,
  starred_at: null,
  viewed_at: null,
  model: "glm-5.1",
  started_at: null,
  updated_at: null,
  message_count: 1,
  user_message_count: 1,
  cwd: "/tmp",
  git_branch: null,
  is_worktree: false,
  is_fork: false,
  permission_mode: null,
  last_message_role: "user",
};

describe("ConversationHeader", () => {
  beforeEach(() => {
    useAppStore.setState({ hostInfo: null });
  });

  it("renders the Decoded/Native view switcher", () => {
    const onViewModeChange = vi.fn();

    render(
      <ConversationHeader
        session={session}
        ownership={null}
        viewMode="decoded"
        onViewModeChange={onViewModeChange}
      />,
    );

    expect(screen.getByRole("group", { name: "Conversation view" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Decoded" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "Native" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );

    fireEvent.click(screen.getByRole("button", { name: "Native" }));
    expect(onViewModeChange).toHaveBeenCalledWith("native");
  });
});
