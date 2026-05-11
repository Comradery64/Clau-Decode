import { useAppStore } from "../../store";
import { ScrollContainer } from "../ScrollContainer";

const sections = [
  {
    title: "Browsing Sessions",
    items: [
      "The sidebar shows all your Claude Code conversation sessions grouped by project.",
      "Click a session to open it. Use the sort buttons to switch between recent, oldest, or project order.",
      "Star frequently used sessions for quick access. Archive sessions you no longer need.",
    ],
  },
  {
    title: "Search",
    items: [
      "Press ⌘K to open search. Search across all session content including tool use, file paths, and thinking blocks.",
    ],
  },
  {
    title: "Profiles",
    items: [
      "Switch between profiles to view sessions from different Claude Code config directories.",
      "Click the avatar in the bottom-left to open the profile switcher.",
      "Manage profiles and their data paths in Settings.",
    ],
  },
  {
    title: "Analytics",
    items: [
      "View token usage, cost estimates, and usage trends over time.",
      "Open Analytics from the bottom-left menu.",
    ],
  },
  {
    title: "Reading Conversations",
    items: [
      "Tool use blocks show files read, commands run, and edits made.",
      "Thinking blocks reveal Claude's reasoning process.",
      "Press ⌘O to expand or collapse all tool and thinking blocks at once.",
      "Press ⌘E to toggle full tool output without truncation.",
    ],
  },
];

export default function HelpPopup() {
  const closeHelp = useAppStore((s) => s.closeHelp);

  const onClose = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) closeHelp();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Help"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        background: "var(--bg-modal-overlay)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "16px",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "520px",
          background: "var(--bg-modal)",
          borderRadius: "var(--radius-lg)",
          boxShadow: "var(--shadow-lg)",
          maxHeight: "calc(100vh - 64px)",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "20px 24px 16px", borderBottom: "1px solid var(--border-subtle)" }}>
          <h2 style={{ margin: 0, fontSize: "16px", fontWeight: 600, color: "var(--text-primary)" }}>Help</h2>
          <button onClick={closeHelp} aria-label="Close help" style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-tertiary)", fontSize: "20px", lineHeight: 1, padding: "4px" }}>×</button>
        </div>
        <ScrollContainer style={{ flex: 1, padding: "20px 24px" }}>
          {sections.map((s) => (
            <div key={s.title} style={{ marginBottom: "20px" }}>
              <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)", marginBottom: "6px" }}>{s.title}</div>
              <ul style={{ margin: 0, paddingLeft: "18px", display: "flex", flexDirection: "column", gap: "4px" }}>
                {s.items.map((item, i) => (
                  <li key={i} style={{ fontSize: "13px", color: "var(--text-secondary)", lineHeight: 1.5 }}>{item}</li>
                ))}
              </ul>
            </div>
          ))}
        </ScrollContainer>
      </div>
    </div>
  );
}
