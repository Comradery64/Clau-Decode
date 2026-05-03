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
