import type { CSSProperties } from "react";
import type { NativePtyState } from "../../api/types";
import {
  chatCardButtonStyle,
  chatCardColumnStyle,
  chatCardOuterStyle,
  chatCardStyle,
} from "./chatCard";

// Prominent, actionable banner shown in Decoded & Split views whenever the
// driven agent is blocked waiting for the user to act in the Native pane — a
// permission/approval prompt, a trust prompt, a question, or a btw modal
// (see docs/native-input-required-plan.md, Part B).
//
// In Decoded-only the user can't see the live terminal, so a blocking prompt
// otherwise looks like the agent is "stuck". This banner surfaces it loudly,
// with a one-click "Switch to Native" action. It is persistent (not a toast):
// it stays until the blocking state clears, which is correct for a prompt that
// genuinely halts progress. Mirrors OwnershipBanner's structure so the two
// read as the same component family above the composer.

// One short, state-specific explanation of WHAT the agent is waiting for, so
// the banner tells the user why they need to switch — not just that they do.
function nativeActionDescriptor(state: NativePtyState): string {
  switch (state) {
    case "permission_prompt":
      return "It's asking permission to run a command.";
    case "trust_prompt":
      return "It's asking to trust this directory.";
    case "ask_user_question":
      return "It asked a question and is waiting for your answer.";
    case "btw_modal":
      return "A dialog is open.";
    default:
      return "It's waiting for your input.";
  }
}

// Amber-tinted card surface — the only deviation from the neutral chatCardStyle.
// The border + faint background tint carry the urgency so the banner can't be
// missed the way the 12px header chip can. Uses the same --accent-amber token
// the ownership "open in terminal" dot already relies on (with its fallback).
const bannerCardStyle: CSSProperties = {
  ...chatCardStyle,
  background: "rgba(201, 184, 112, 0.10)",
  borderColor: "var(--accent-amber, #c9b870)",
};

const bannerButtonStyle: CSSProperties = {
  ...chatCardButtonStyle,
  background: "var(--accent-amber, #c9b870)",
  borderColor: "var(--accent-amber, #c9b870)",
  color: "var(--bg-base)",
  fontWeight: 600,
};

export function NativeActionBanner({
  state,
  decodedInputSafe,
  onSwitchToNative,
}: {
  state: NativePtyState;
  decodedInputSafe: boolean;
  onSwitchToNative: () => void;
}) {
  // A permission/login block is genuinely alert-level (progress is halted and
  // the agent can't proceed without the user); the rest are status-level.
  const role: "alert" | "status" =
    state === "permission_prompt" || state === "login_required" ? "alert" : "status";

  return (
    <div role={role} style={{ ...chatCardOuterStyle, paddingBottom: 0 }}>
      <div style={chatCardColumnStyle}>
        <div
          style={{
            // The "popup" card sits BEHIND; the composer below rises up over
            // its bottom edge (flushTop adds a negative margin + higher z-index).
            // Square bottom corners + deep bottom padding mirror OwnershipBanner
            // so no rounded corner peeks through the composer's rounded top.
            ...bannerCardStyle,
            position: "relative",
            zIndex: 1,
            marginTop: "-8px",
            paddingBottom: "30px",
            borderBottomLeftRadius: 0,
            borderBottomRightRadius: 0,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "20px" }}>
            <div style={{ minWidth: 0, fontFamily: "var(--font-content)", lineHeight: 1.45 }}>
              <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--text-primary)" }}>
                Native input required
              </div>
              <div style={{ fontSize: "14px", color: "var(--text-secondary)" }}>
                {nativeActionDescriptor(state)} Switch to Native to respond.
                {!decodedInputSafe && " (Don't type in the Decoded box — it won't reach the prompt.)"}
              </div>
            </div>
            <button
              type="button"
              onClick={onSwitchToNative}
              style={{ ...bannerButtonStyle, flexShrink: 0 }}
            >
              Switch to Native
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
