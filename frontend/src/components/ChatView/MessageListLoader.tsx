/**
 * Bridge module: re-exports MessageList so that Agent 3's ChatView.tsx
 * can import it from a predictable ChatView-relative path without a
 * circular dependency on the Messages folder directly.
 *
 * Usage in ChatView.tsx:
 *   import { MessageList } from "./MessageListLoader";
 */
export { default as MessageList } from "../Messages/MessageList";
