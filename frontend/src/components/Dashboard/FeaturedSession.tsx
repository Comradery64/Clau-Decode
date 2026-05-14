import type { DashboardSession } from "../../api/types";
import { formatRelative } from "../../utils/formatRelative";
import { fmtModel, fmtUsd, modelColor } from "./fmt";

export function FeaturedSession({ session, onClick }: { session: DashboardSession; onClick: () => void }) {
  const isWaiting = session.last_message_role === "assistant";
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "14px",
        padding: "20px 22px",
        background: "var(--bg-tool-block)",
        border: "1px solid var(--border-subtle)",
        borderRadius: "var(--radius-md)",
        cursor: "pointer",
        textAlign: "left",
        width: "100%",
        fontFamily: "inherit",
        color: "inherit",
        transition: "border-color 0.15s, background 0.15s",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = "var(--border-default)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = "var(--border-subtle)";
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
        <span style={{
          fontSize: "10.5px",
          color: "var(--text-tertiary)",
          textTransform: "uppercase",
          letterSpacing: "0.09em",
          fontWeight: 600,
        }}>
          Pick up where you left off
        </span>
        {isWaiting && (
          <span style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "5px",
            fontSize: "10.5px",
            color: "var(--accent-orange)",
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: "0.06em",
          }}>
            <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "var(--accent-orange)" }} />
            awaiting you
          </span>
        )}
      </div>

      <div style={{
        fontSize: "18px",
        fontWeight: 500,
        color: "var(--text-primary)",
        lineHeight: 1.35,
        overflow: "hidden",
        display: "-webkit-box",
        WebkitLineClamp: 2,
        WebkitBoxOrient: "vertical",
      }}>
        {session.title || "Untitled session"}
      </div>

      <div style={{
        display: "flex",
        alignItems: "center",
        gap: "14px",
        flexWrap: "wrap",
        fontSize: "12px",
        color: "var(--text-tertiary)",
      }}>
        <span>{session.message_count} message{session.message_count !== 1 ? "s" : ""}</span>
        <span style={{ opacity: 0.4 }}>·</span>
        <span>{formatRelative(session.updated_at)}</span>
        {session.models.length > 0 && (
          <>
            <span style={{ opacity: 0.4 }}>·</span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
              <span style={{
                width: "8px",
                height: "8px",
                borderRadius: "2px",
                background: modelColor(session.models[0]),
              }} />
              {session.models.map(fmtModel).join(", ")}
            </span>
          </>
        )}
        <span style={{ opacity: 0.4 }}>·</span>
        <span style={{ fontFamily: "var(--font-mono)", color: "var(--accent-orange)" }}>
          {fmtUsd(session.total_usd)}
        </span>
        <span style={{ marginLeft: "auto", color: "var(--accent-orange)", fontWeight: 500 }}>
          Continue →
        </span>
      </div>
    </button>
  );
}

export function SessionRow({ session, onClick }: { session: DashboardSession; onClick: () => void }) {
  const needsAttention = session.last_message_role === "assistant";
  return (
    <div
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "12px",
        padding: "10px 12px",
        background: "transparent",
        borderRadius: "var(--radius-md)",
        cursor: "pointer",
        transition: "background 0.12s",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = "var(--bg-tool-block)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "transparent";
      }}
    >
      {session.models[0] && (
        <span style={{
          width: "8px",
          height: "8px",
          borderRadius: "2px",
          background: modelColor(session.models[0]),
          flexShrink: 0,
        }}
          title={session.models.map(fmtModel).join(", ")}
        />
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: "13px", color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {session.title || "Untitled session"}
        </div>
        <div style={{ display: "flex", gap: "8px", marginTop: "3px", fontSize: "11px", color: "var(--text-tertiary)" }}>
          <span>{session.message_count} msgs</span>
          <span style={{ opacity: 0.4 }}>·</span>
          <span>{formatRelative(session.updated_at)}</span>
        </div>
      </div>
      {needsAttention && (
        <div style={{
          width: "7px",
          height: "7px",
          borderRadius: "50%",
          background: "var(--accent-orange)",
          flexShrink: 0,
        }}
          title="Awaiting your reply"
        />
      )}
      <div style={{ fontSize: "12px", fontFamily: "var(--font-mono)", color: "var(--accent-orange)", flexShrink: 0, minWidth: "52px", textAlign: "right" }}>
        {fmtUsd(session.total_usd)}
      </div>
    </div>
  );
}
