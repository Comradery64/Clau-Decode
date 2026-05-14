import { useState, Children, isValidElement } from "react";
import type { ReactNode, ReactElement } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { OverlayScrollbarsComponent } from "overlayscrollbars-react";
import { SCROLLBAR_OPTIONS_X } from "../ScrollContainer";
import type { Components } from "react-markdown";
import type { ClassAttributes, HTMLAttributes } from "react";
import type { ExtraProps } from "react-markdown";

type CodeProps = ClassAttributes<HTMLElement> &
  HTMLAttributes<HTMLElement> &
  ExtraProps & { inline?: boolean };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function extractText(node: ReactNode): string {
  if (typeof node === "string") return node;
  if (typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(extractText).join("");
  if (isValidElement(node)) {
    const el = node as ReactElement<{ children?: ReactNode }>;
    return extractText(el.props.children);
  }
  return "";
}

// ---------------------------------------------------------------------------
// SVG icons
// ---------------------------------------------------------------------------

function CopyIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
      <rect x="4" y="4" width="7.5" height="7.5" rx="1.5" stroke="currentColor" strokeWidth="1.25" />
      <path d="M8.5 4V2.5A1.5 1.5 0 0 0 7 1H2.5A1.5 1.5 0 0 0 1 2.5V7A1.5 1.5 0 0 0 2.5 8.5H4" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
      <path d="M2 6.5l3 3L10 2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// CopyButton — inline copy button for code blocks
// ---------------------------------------------------------------------------

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  return (
    <button
      onClick={handleCopy}
      aria-label={copied ? "Copied!" : "Copy code"}
      title={copied ? "Copied!" : "Copy code"}
      style={{
        background: "none",
        border: "none",
        cursor: "pointer",
        color: copied ? "var(--accent-orange)" : "var(--text-code-lang)",
        fontSize: "11px",
        fontFamily: "var(--font-ui)",
        padding: "2px 6px",
        display: "flex",
        alignItems: "center",
        gap: "5px",
        borderRadius: "4px",
        transition: "color var(--transition-fast)",
        lineHeight: 1,
      }}
    >
      {copied ? <CheckIcon /> : <CopyIcon />}
    </button>
  );
}

// ---------------------------------------------------------------------------
// CodeBlockWrapper — dark container with header (language + copy)
// ---------------------------------------------------------------------------

function CodeBlockWrapper({ children }: { children: ReactNode }) {
  let language = "";
  let codeText = "";

  Children.forEach(children, (child) => {
    if (isValidElement(child)) {
      const el = child as ReactElement<{ className?: string; children?: ReactNode }>;
      const cls = (el.props.className as string) || "";
      const match = cls.match(/language-(\w+)/);
      if (match) language = match[1];
      codeText = extractText(el.props.children);
    }
  });

  return (
    <div
      className="code-block-wrap"
      style={{
        background: "var(--bg-code-block)",
        borderRadius: "var(--radius-md)",
        margin: "0 0 14px 0",
        overflow: "hidden",
        border: "1px solid var(--border-code-block)",
      }}
    >
      {/* Header: language label + copy button */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "6px 10px 6px 14px",
          background: "var(--bg-code-block-header)",
          borderBottom: "1px solid var(--border-code-block)",
        }}
      >
          {language && (
          <span
            style={{
              fontSize: "11px",
              fontFamily: "var(--font-mono)",
              color: "var(--text-code-lang)",
              letterSpacing: "0.03em",
            }}
          >
            {language}
          </span>
        )}
        {codeText && <CopyButton text={codeText} />}
      </div>
      {/* Code content */}
      <OverlayScrollbarsComponent
        options={SCROLLBAR_OPTIONS_X}
        style={{ overflow: "hidden" }}
      >
        <pre
          style={{
            margin: 0,
            padding: "14px 16px",
            fontFamily: "var(--font-mono)",
            fontSize: "13px",
            lineHeight: 1.6,
            background: "transparent",
            border: "none",
            borderRadius: 0,
          }}
        >
          {children}
        </pre>
      </OverlayScrollbarsComponent>
    </div>
  );
}

// ---------------------------------------------------------------------------
// react-markdown component overrides
// ---------------------------------------------------------------------------

const components: Components = {
  table({ children, node, ...props }) {
    void node;
    return (
      <div className="table-wrap">
        <OverlayScrollbarsComponent
          options={SCROLLBAR_OPTIONS_X}
          style={{ overflow: "hidden" }}
        >
          <table {...props}>{children}</table>
        </OverlayScrollbarsComponent>
      </div>
    );
  },
  pre({ children }) {
    return <CodeBlockWrapper>{children}</CodeBlockWrapper>;
  },
  code({ inline, className, children, ...props }: CodeProps) {
    if (inline) {
      return (
        <code
          className={className}
          style={{
            background: "var(--bg-inline-code)",
            padding: "0.1em 0.4em",
            borderRadius: "4px",
            fontSize: "0.875em",
            fontFamily: "var(--font-mono)",
          }}
          {...props}
        >
          {children}
        </code>
      );
    }
    return (
      <code className={className} {...props}>
        {children}
      </code>
    );
  },
};

// ---------------------------------------------------------------------------
// TextBlock
// ---------------------------------------------------------------------------

interface TextBlockProps {
  text: string;
  isUser?: boolean;
}

export function TextBlock({ text }: TextBlockProps) {
  return (
    <div className="prose-content">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[[rehypeHighlight, { detect: true, ignoreMissing: true }]]}
        components={components}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}
