import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ToolUseBlock } from "../ToolUseBlock";
import type { ToolUseBlock as ToolUseBlockType, ToolResultBlock } from "../../../api/types";

const mockToolUse: ToolUseBlockType = {
  type: "tool_use",
  id: "toolu_001",
  name: "Read",
  input: { file_path: "/home/user/test.py" },
};

const mockToolResult: ToolResultBlock = {
  type: "tool_result",
  tool_use_id: "toolu_001",
  content: "print('hello')",
  is_error: false,
};

describe("ToolUseBlock", () => {
  it("shows tool name", () => {
    render(<ToolUseBlock toolUse={mockToolUse} toolResult={null} />);
    expect(screen.getByText(/Read/)).toBeInTheDocument();
  });

  it("shows file path hint", () => {
    render(<ToolUseBlock toolUse={mockToolUse} toolResult={null} />);
    // The hint appears in the summary span; getAllByText handles the duplicate
    // in the expanded JSON pre-block
    const matches = screen.getAllByText(/test\.py/);
    expect(matches.length).toBeGreaterThan(0);
  });

  it("renders a collapsible toggle button", () => {
    render(<ToolUseBlock toolUse={mockToolUse} toolResult={mockToolResult} />);
    expect(document.querySelector("button")).toBeInTheDocument();
  });

  it("shows error styling for error results", () => {
    const errorResult: ToolResultBlock = { ...mockToolResult, is_error: true };
    const { container } = render(
      <ToolUseBlock toolUse={mockToolUse} toolResult={errorResult} />
    );
    expect(container.firstChild).toBeTruthy();
    const block = container.firstChild as HTMLElement;
    expect(block.style.background).toBe("var(--tool-error-bg)");
  });

  it("shows no hint when first param is absent", () => {
    const noInput: ToolUseBlockType = { ...mockToolUse, input: {} };
    render(<ToolUseBlock toolUse={noInput} toolResult={null} />);
    expect(screen.getByText("Read")).toBeInTheDocument();
  });

  it("does not show result section when toolResult is null", () => {
    render(<ToolUseBlock toolUse={mockToolUse} toolResult={null} />);
    expect(screen.queryByText(/Result:/i)).not.toBeInTheDocument();
  });

  it("shows result section when toolResult is provided", () => {
    render(<ToolUseBlock toolUse={mockToolUse} toolResult={mockToolResult} />);
    expect(screen.getByText(/Result/i)).toBeInTheDocument();
  });

  it("renders array content in tool result", () => {
    const arrayResult: ToolResultBlock = {
      ...mockToolResult,
      content: [{ type: "text", text: "array output" }],
    };
    render(<ToolUseBlock toolUse={mockToolUse} toolResult={arrayResult} />);
    expect(screen.getByText(/array output/)).toBeInTheDocument();
  });

  it("toggle button has aria-expanded=false when collapsed", () => {
    render(<ToolUseBlock toolUse={mockToolUse} toolResult={null} />);
    const btn = document.querySelector("button") as HTMLButtonElement;
    expect(btn).toHaveAttribute("aria-expanded", "false");
  });

  it("toggle button has descriptive aria-label", () => {
    render(<ToolUseBlock toolUse={mockToolUse} toolResult={null} />);
    const btn = document.querySelector("button") as HTMLButtonElement;
    expect(btn).toHaveAttribute("aria-label");
    expect(btn.getAttribute("aria-label")).toContain("Read");
  });

  it("toggle button updates aria-expanded when clicked", () => {
    render(<ToolUseBlock toolUse={mockToolUse} toolResult={null} />);
    const btn = document.querySelector("button") as HTMLButtonElement;
    fireEvent.click(btn);
    expect(btn).toHaveAttribute("aria-expanded", "true");
  });
});
