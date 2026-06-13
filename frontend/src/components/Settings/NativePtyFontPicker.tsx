import type { NativePtyFontFamily } from "../../api/types";
import { NATIVE_PTY_FONT_OPTIONS } from "../../constants/nativePtyFonts";

interface NativePtyFontPickerProps {
  value: NativePtyFontFamily;
  onChange: (value: NativePtyFontFamily) => void;
}

/**
 * Font picker that previews each option in its own typeface (each row is
 * rendered with that font's family stack). Bundled OFL fonts render on any
 * machine; fonts that can't be redistributed are tagged "install" and listed
 * below with links to obtain them, plus a note on importing custom fonts.
 *
 * A native <select> can't style font-family per option reliably, so this is a
 * custom listbox.
 */
export function NativePtyFontPicker({ value, onChange }: NativePtyFontPickerProps) {
  const notBundled = NATIVE_PTY_FONT_OPTIONS.filter((o) => o.bundled === false);

  return (
    <div>
      <div
        role="listbox"
        aria-label="PTY font"
        style={{
          maxHeight: "240px",
          overflowY: "auto",
          border: "1px solid var(--border-default)",
          borderRadius: "var(--radius-sm)",
          background: "var(--bg-input)",
        }}
      >
        {NATIVE_PTY_FONT_OPTIONS.map((option) => {
          const selected = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              role="option"
              aria-selected={selected}
              aria-label={option.label}
              onClick={() => onChange(option.value)}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "10px",
                width: "100%",
                padding: "8px 11px",
                border: "none",
                borderBottom: "1px solid var(--border-subtle)",
                textAlign: "left",
                cursor: "pointer",
                background: selected ? "var(--accent-orange-subtle)" : "transparent",
                color: "var(--text-primary)",
              }}
            >
              <span style={{ fontFamily: option.stack, fontSize: "13px", lineHeight: 1.3 }}>
                {option.label}
              </span>
              {option.bundled === false && (
                <span
                  style={{
                    flexShrink: 0,
                    fontSize: "10px",
                    textTransform: "uppercase",
                    letterSpacing: "0.04em",
                    color: "var(--text-tertiary)",
                    border: "1px solid var(--border-subtle)",
                    borderRadius: "var(--radius-sm)",
                    padding: "1px 6px",
                    fontFamily: "var(--font-ui)",
                  }}
                >
                  install
                </span>
              )}
            </button>
          );
        })}
      </div>
      <div style={{ fontSize: "12px", color: "var(--text-tertiary)", marginTop: "8px", lineHeight: 1.5 }}>
        Each name is shown in its own font. Bundled fonts render everywhere.
        {notBundled.length > 0 && (
          <>
            {" "}Fonts tagged <strong>install</strong> aren't shipped (their licenses don't
            allow redistribution) — install them on your Mac to use them:{" "}
            {notBundled.map((o, i) => (
              <span key={o.value}>
                {i > 0 ? " · " : ""}
                <a href={o.acquireUrl} target="_blank" rel="noreferrer" style={{ color: "var(--text-accent)" }}>
                  {o.label}
                </a>
              </span>
            ))}
            .
          </>
        )}
        {" "}To add any other font, install it system-wide (it renders if its name matches) or,
        for local builds, drop a <code style={{ fontFamily: "var(--font-mono)" }}>.woff2</code> into{" "}
        <code style={{ fontFamily: "var(--font-mono)" }}>frontend/src/assets/fonts/</code> with an
        {" "}<code style={{ fontFamily: "var(--font-mono)" }}>@font-face</code>.
      </div>
    </div>
  );
}
