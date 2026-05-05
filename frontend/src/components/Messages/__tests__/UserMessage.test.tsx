import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { vi } from "vitest";
import { UserMessage } from "../UserMessage";
import type { Message } from "../../../api/types";

vi.mock("../../../api/client", () => ({
  api: {
    patchMessage: vi.fn().mockResolvedValue({ ok: true }),
    deleteMessage: vi.fn().mockResolvedValue({ ok: true }),
  },
}));

function makeMessage(overrides: Partial<Message> = {}): Message {
  return {
    id: "msg_001",
    session_id: "sess_001",
    parent_id: null,
    role: "user",
    content_blocks: [{ type: "text", text: "Hello, Claude!" }],
    timestamp: null,
    model: null,
    is_sidechain: false,
    is_meta: false,
    cwd: null,
    git_branch: null,
    source_tool_assistant_uuid: null,
    usage: null,
    ...overrides,
  };
}

describe("UserMessage", () => {
  it("renders the message text", () => {
    render(<UserMessage message={makeMessage()} />);
    expect(screen.getByText("Hello, Claude!")).toBeInTheDocument();
  });

  it("returns null when is_meta is true", () => {
    const { container } = render(
      <UserMessage message={makeMessage({ is_meta: true })} />
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders right-aligned layout", () => {
    const { container } = render(<UserMessage message={makeMessage()} />);
    // The outer element is the hover wrapper; the inner flex row holds the bubble
    const flexRow = container.firstChild?.firstChild as HTMLElement;
    expect(flexRow).toHaveStyle({ justifyContent: "flex-end" });
  });

  it("skips tool_result blocks in content", () => {
    const message = makeMessage({
      content_blocks: [
        { type: "text", text: "My question" },
        {
          type: "tool_result",
          tool_use_id: "toolu_x",
          content: "some result",
          is_error: false,
        },
      ],
    });
    render(<UserMessage message={message} />);
    expect(screen.getByText("My question")).toBeInTheDocument();
    // tool_result content should not be rendered
    expect(screen.queryByText("some result")).not.toBeInTheDocument();
  });

  it("renders multiple text blocks", () => {
    const message = makeMessage({
      content_blocks: [
        { type: "text", text: "First block" },
        { type: "text", text: "Second block" },
      ],
    });
    render(<UserMessage message={message} />);
    expect(screen.getByText("First block")).toBeInTheDocument();
    expect(screen.getByText("Second block")).toBeInTheDocument();
  });
});

describe("UserMessage — edit", () => {
  it("shows edit button for user messages with text", () => {
    render(<UserMessage message={makeMessage()} />);
    expect(screen.getByTitle("Edit message")).toBeInTheDocument();
  });

  it("does not show edit button for assistant messages", () => {
    render(<UserMessage message={makeMessage({ role: "assistant" })} />);
    expect(screen.queryByTitle("Edit message")).not.toBeInTheDocument();
  });

  it("clicking edit shows a textarea with the message text", () => {
    render(<UserMessage message={makeMessage()} />);
    fireEvent.click(screen.getByTitle("Edit message"));
    const textarea = screen.getByRole("textbox");
    expect(textarea).toBeInTheDocument();
    expect((textarea as HTMLTextAreaElement).value).toBe("Hello, Claude!");
  });

  it("clicking cancel hides the textarea", () => {
    render(<UserMessage message={makeMessage()} />);
    fireEvent.click(screen.getByTitle("Edit message"));
    fireEvent.click(screen.getByText("Cancel"));
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("clicking save calls api.patchMessage and dispatches session-mutated", async () => {
    const { api } = await import("../../../api/client");
    const dispatched: string[] = [];
    window.addEventListener("clau-decode:session-mutated", (e) => {
      dispatched.push((e as CustomEvent<string>).detail);
    });

    render(<UserMessage message={makeMessage({ session_id: "sess_x" })} />);
    fireEvent.click(screen.getByTitle("Edit message"));
    fireEvent.click(screen.getByText("Save"));

    await waitFor(() => {
      expect(api.patchMessage).toHaveBeenCalledWith("msg_001", [
        { type: "text", text: "Hello, Claude!" },
      ]);
      expect(dispatched).toContain("sess_x");
    });
  });
});

describe("UserMessage — delete", () => {
  it("shows delete button", () => {
    render(<UserMessage message={makeMessage()} />);
    expect(screen.getByTitle("Delete message")).toBeInTheDocument();
  });

  it("clicking delete shows confirm dialog", () => {
    render(<UserMessage message={makeMessage()} />);
    fireEvent.click(screen.getByTitle("Delete message"));
    expect(screen.getByText("Delete message?")).toBeInTheDocument();
  });

  it("clicking Cancel in dialog hides it", () => {
    render(<UserMessage message={makeMessage()} />);
    fireEvent.click(screen.getByTitle("Delete message"));
    fireEvent.click(screen.getByText("Cancel"));
    expect(screen.queryByText("Delete message?")).not.toBeInTheDocument();
  });

  it("confirming delete calls api.deleteMessage and dispatches session-mutated", async () => {
    const { api } = await import("../../../api/client");
    const dispatched: string[] = [];
    window.addEventListener("clau-decode:session-mutated", (e) => {
      dispatched.push((e as CustomEvent<string>).detail);
    });

    render(<UserMessage message={makeMessage({ session_id: "sess_y" })} />);
    fireEvent.click(screen.getByTitle("Delete message"));
    fireEvent.click(screen.getByText("Delete"));

    await waitFor(() => {
      expect(api.deleteMessage).toHaveBeenCalledWith("msg_001");
      expect(dispatched).toContain("sess_y");
    });
  });
});
