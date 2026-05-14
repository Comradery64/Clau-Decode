import { Fragment, type ReactNode } from "react";

// SQLite FTS5 wraps matched terms in `<b>...</b>` tokens (configured in db.py).
// React's JSX escapes those, so they render as literal text. Split on the
// tokens and emit real <strong> nodes — no innerHTML, no sanitizer needed
// because the surrounding text is never parsed as HTML.
export function renderSnippet(snippet: string): ReactNode {
  const parts = snippet.split(/<b>|<\/b>/);
  return parts.map((part, i) =>
    i % 2 === 1 ? <strong key={i}>{part}</strong> : <Fragment key={i}>{part}</Fragment>,
  );
}
