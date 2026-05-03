import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import type { Components } from "react-markdown";
import type { ClassAttributes, HTMLAttributes } from "react";
import type { ExtraProps } from "react-markdown";

type CodeProps = ClassAttributes<HTMLElement> &
  HTMLAttributes<HTMLElement> &
  ExtraProps & { inline?: boolean };

const components: Components = {
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

interface TextBlockProps {
  text: string;
  isUser?: boolean;
}

export function TextBlock({ text }: TextBlockProps) {
  return (
    <div className="prose-content">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        components={components}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}
