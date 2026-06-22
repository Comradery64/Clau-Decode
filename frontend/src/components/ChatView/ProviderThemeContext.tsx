/**
 * ProviderThemeContext — carries the active session's provider identifier
 * ("claude" | "codex" | ...) AND its effective capabilities through the
 * component tree without prop-drilling.
 *
 * Usage:
 *   Wrap ChatView's subtree in <ProviderThemeProvider value={{ provider, caps }}>
 *   then read from any descendant via useProviderTheme().
 */
import { createContext, useContext } from "react";
import type { ReactNode } from "react";
import type { ProviderCaps, ProviderInfo } from "../../api/types";

interface ProviderThemeValue {
  /** The provider identifier, e.g. "claude" or "codex". */
  provider: string;
  /** Effective caps (static caps reconciled with runtime drivability). */
  caps: ProviderCaps;
}

/**
 * Fallback effective caps when /api/providers hasn't loaded yet. Claude keeps
 * its full interactive surface (its direct-PTY path is always available on
 * POSIX); any other provider is treated as read-only until the real caps
 * arrive — fail safe, never advertise a control that would misfire.
 */
export function defaultCapsFor(provider: string): ProviderCaps {
  const full = provider === "claude";
  return {
    can_send: full,
    can_resume: full,
    can_fork: full,
    can_edit: full,
  };
}

/**
 * Resolve the effective caps for `provider` from the store's providers map,
 * falling back to {@link defaultCapsFor} when not yet loaded / unknown.
 */
export function resolveCaps(
  providers: Record<string, ProviderInfo> | null,
  provider: string,
): ProviderCaps {
  return providers?.[provider]?.effective ?? defaultCapsFor(provider);
}

const ProviderThemeContext = createContext<ProviderThemeValue>({
  provider: "claude",
  caps: defaultCapsFor("claude"),
});

export function ProviderThemeProvider({
  value,
  children,
}: {
  value: ProviderThemeValue;
  children: ReactNode;
}) {
  return (
    <ProviderThemeContext.Provider value={value}>
      {children}
    </ProviderThemeContext.Provider>
  );
}

/** Hook for consuming the provider theme anywhere below ProviderThemeProvider. */
export function useProviderTheme(): ProviderThemeValue {
  return useContext(ProviderThemeContext);
}
