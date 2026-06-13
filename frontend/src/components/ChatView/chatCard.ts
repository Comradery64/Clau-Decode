import type { CSSProperties } from "react";

// Shared "chat card" surface. The composer input is a rounded card on
// `--bg-input`, centered in the message column with margin all around, laid out
// as content on top + an actions row below. Take-over / native-input banners
// and other inline popups reuse these styles so they read as the same
// component family rather than ad-hoc strips.

// Outer wrapper: full-width band with padding so the card floats with margin.
export const chatCardOuterStyle: CSSProperties = {
  flexShrink: 0,
  padding: "8px 24px",
  background: "var(--bg-base)",
};

// Centered column matching the message width.
export const chatCardColumnStyle: CSSProperties = {
  maxWidth: "var(--message-max-width)",
  margin: "0 auto",
};

// The card surface itself (mirrors the composer input card).
export const chatCardStyle: CSSProperties = {
  background: "var(--bg-input)",
  border: "1px solid var(--border-default)",
  borderRadius: "18px",
  padding: "14px 18px",
  boxShadow: "0 1px 2px rgba(0, 0, 0, 0.04)",
};

// A pill button used in card action rows.
export const chatCardButtonStyle: CSSProperties = {
  padding: "7px 14px",
  background: "var(--bg-base)",
  border: "1px solid var(--border-default)",
  borderRadius: "var(--radius-sm)",
  fontFamily: "var(--font-content)",
  fontSize: "13px",
  color: "var(--text-primary)",
  cursor: "pointer",
  whiteSpace: "nowrap",
};
