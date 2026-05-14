import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { TextBlock } from "../TextBlock";

describe("TextBlock", () => {
  it("renders plain text", () => {
    render(<TextBlock text="Hello world" />);
    expect(screen.getByText("Hello world")).toBeInTheDocument();
  });

  it("renders markdown headers", () => {
    render(<TextBlock text="# My Header" />);
    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
  });

  it("renders h4 headings", () => {
    render(<TextBlock text="#### Subheading" />);
    expect(screen.getByRole("heading", { level: 4 })).toBeInTheDocument();
  });

  it("renders h5 headings", () => {
    render(<TextBlock text="##### Minor heading" />);
    expect(screen.getByRole("heading", { level: 5 })).toBeInTheDocument();
  });

  it("renders h6 headings", () => {
    render(<TextBlock text="###### Tiny heading" />);
    expect(screen.getByRole("heading", { level: 6 })).toBeInTheDocument();
  });

  it("renders blockquotes with content", () => {
    const { container } = render(<TextBlock text="> This is a quote" />);
    const blockquote = container.querySelector("blockquote");
    expect(blockquote).toBeInTheDocument();
    expect(blockquote?.textContent).toContain("This is a quote");
  });

  it("renders nested lists", () => {
    const md = "- item 1\n  - nested item\n- item 2";
    const { container } = render(<TextBlock text={md} />);
    const lists = container.querySelectorAll("ul");
    expect(lists.length).toBeGreaterThanOrEqual(2);
  });

  it("renders ordered lists", () => {
    const md = "1. First\n2. Second\n3. Third";
    const { container } = render(<TextBlock text={md} />);
    expect(container.querySelector("ol")).toBeInTheDocument();
  });

  it("renders bold and italic text", () => {
    const { container } = render(<TextBlock text="This is **bold** and *italic*" />);
    expect(container.querySelector("strong")).toBeInTheDocument();
    expect(container.querySelector("em")).toBeInTheDocument();
  });

  it("renders horizontal rule", () => {
    const { container } = render(<TextBlock text={"Above\n\n---\n\nBelow"} />);
    expect(container.querySelector("hr")).toBeInTheDocument();
  });

  it("renders table with rounded wrapper", () => {
    const md = `| A | B |\n|---|---|\n| 1 | 2 |`;
    const { container } = render(<TextBlock text={md} />);
    expect(container.querySelector(".table-wrap")).toBeInTheDocument();
  });

  it("renders table with alternating row shading", () => {
    const md = `| A | B |\n|---|---|\n| 1 | 2 |\n| 3 | 4 |`;
    const { container } = render(<TextBlock text={md} />);
    const evenRow = container.querySelector("tbody tr:nth-child(even) td");
    expect(evenRow).toBeInTheDocument();
  });

  it("renders code block with language label", () => {
    render(<TextBlock text={"```python\nprint('hello')\n```"} />);
    expect(screen.getByText("python")).toBeInTheDocument();
  });

  it("renders copy button in code block", () => {
    render(<TextBlock text={"```js\nconst x = 1;\n```"} />);
    expect(screen.getByLabelText("Copy code")).toBeInTheDocument();
  });

  it("copy button calls clipboard.writeText with code content", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
    render(<TextBlock text={"```js\nconst x = 1;\n```"} />);
    const btn = screen.getByLabelText("Copy code");
    btn.click();
    expect(writeText).toHaveBeenCalled();
    const arg = writeText.mock.calls[0][0] as string;
    expect(arg).toContain("const x = 1;");
  });

  it("renders code blocks", () => {
    render(<TextBlock text={"```python\nprint('hi')\n```"} />);
    const code = document.querySelector("pre");
    expect(code).toBeInTheDocument();
  });

  it("renders inline code", () => {
    render(<TextBlock text="Use `npm install` to install" />);
    const code = document.querySelector("code");
    expect(code).toBeInTheDocument();
  });

  it("applies prose-content class", () => {
    const { container } = render(<TextBlock text="test" />);
    expect(container.firstChild).toHaveClass("prose-content");
  });

  it("renders with isUser prop without error", () => {
    const { container } = render(<TextBlock text="test" isUser />);
    expect(container.firstChild).toHaveClass("prose-content");
  });

  it("renders GFM tables", () => {
    const md = `| A | B |\n|---|---|\n| 1 | 2 |`;
    render(<TextBlock text={md} />);
    expect(document.querySelector("table")).toBeInTheDocument();
  });

  it("renders links", () => {
    render(<TextBlock text="Visit [example](https://example.com)" />);
    const link = screen.getByRole("link", { name: "example" });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute("href", "https://example.com");
  });
});
