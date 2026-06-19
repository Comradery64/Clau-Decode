/**
 * ProviderThemeContext — carries the active session's provider identifier
 * ("claude" | "codex" | ...) through the component tree without prop-drilling.
 *
 * Usage:
 *   Wrap ChatView's subtree in <ProviderThemeProvider value={{ provider }}>
 *   then read from any descendant via useProviderTheme().
 */
import { createContext, useContext } from "react";
import type { ReactNode } from "react";

interface ProviderThemeValue {
  /** The provider identifier, e.g. "claude" or "codex". */
  provider: string;
}

const ProviderThemeContext = createContext<ProviderThemeValue>({ provider: "claude" });

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
