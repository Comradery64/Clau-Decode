import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { NativeActionBanner } from "../NativeActionBanner";
import { nativeNeedsAction } from "../ChatView";
import type { NativePtyState } from "../../../api/types";

describe("NativeActionBanner", () => {
  it("renders the heading and a Switch to Native button that fires onSwitchToNative", () => {
    const onSwitch = vi.fn();
    render(
      <NativeActionBanner
        state="permission_prompt"
        decodedInputSafe={false}
        onSwitchToNative={onSwitch}
      />,
    );
    expect(screen.getByText("Native input required")).toBeInTheDocument();
    const btn = screen.getByRole("button", { name: "Switch to Native" });
    fireEvent.click(btn);
    expect(onSwitch).toHaveBeenCalledTimes(1);
  });

  it("uses role=alert for a permission prompt (progress is halted)", () => {
    render(
      <NativeActionBanner
        state="permission_prompt"
        decodedInputSafe={false}
        onSwitchToNative={vi.fn()}
      />,
    );
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("uses role=status (not alert) for a btw modal", () => {
    render(
      <NativeActionBanner
        state="btw_modal"
        decodedInputSafe
        onSwitchToNative={vi.fn()}
      />,
    );
    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("warns the decoded box won't reach the prompt when input is unsafe", () => {
    render(
      <NativeActionBanner
        state="trust_prompt"
        decodedInputSafe={false}
        onSwitchToNative={vi.fn()}
      />,
    );
    expect(screen.getByText(/won't reach the prompt/)).toBeInTheDocument();
  });

  it("omits the decoded-box warning when input is safe", () => {
    render(
      <NativeActionBanner
        state="btw_modal"
        decodedInputSafe
        onSwitchToNative={vi.fn()}
      />,
    );
    expect(screen.queryByText(/won't reach the prompt/)).not.toBeInTheDocument();
  });
});

describe("nativeNeedsAction", () => {
  it.each<[NativePtyState, boolean]>([
    ["permission_prompt", true],
    ["ask_user_question", true],
    ["trust_prompt", true],
    ["btw_modal", true],
    // Non-blocked states must NOT trip the banner — an in-flight or idle
    // agent isn't waiting on the user.
    ["idle_chat_input", false],
    ["running", false],
    ["assistant_streaming", false],
    ["booting", false],
    ["login_required", false],
    ["model_selector", false],
    ["slash_palette_open", false],
    ["unknown_interactive", false],
    ["native_input_required", false],
  ])("state %s needs action = %s", (state, expected) => {
    expect(nativeNeedsAction(state)).toBe(expected);
  });

  it("returns false for null/undefined", () => {
    expect(nativeNeedsAction(null)).toBe(false);
    expect(nativeNeedsAction(undefined)).toBe(false);
  });
});
