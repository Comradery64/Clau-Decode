import { render, screen } from "@testing-library/react";
import { UserMessage } from "../UserMessage";
import type { Message } from "../../../api/types";

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
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper).toHaveStyle({ justifyContent: "flex-end" });
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
