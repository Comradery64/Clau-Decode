import { useState, useEffect, useRef } from "react";
import { OverlayScrollbarsComponent } from "overlayscrollbars-react";
import type { DirEntry } from "../../api/types";
import { api } from "../../api/client";
import { useAppStore } from "../../store";
import { SCROLLBAR_OPTIONS } from "../ScrollContainer";

// In-memory stale-while-revalidate cache for listDir results. Survives
// component remount (e.g. toggling sidebar mode) so repeat folder visits
// paint instantly while a background refresh keeps entries fresh.
const _dirCache = new Map<string, DirEntry[]>();
const _DIR_CACHE_MAX = 50;
function cacheGet(path: string): DirEntry[] | undefined {
  const v = _dirCache.get(path);
  if (v !== undefined) {
    _dirCache.delete(path);
    _dirCache.set(path, v);
  }
  return v;
}
function cacheSet(path: string, entries: DirEntry[]): void {
  _dirCache.delete(path);
  _dirCache.set(path, entries);
  if (_dirCache.size > _DIR_CACHE_MAX) {
    _dirCache.delete(_dirCache.keys().next().value!);
  }
}

function IconFolderOpen() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 19a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h4l2 2h4a2 2 0 0 1 2 2v1" />
      <path d="M20.5 12H3.5a1 1 0 0 0-1 1.1l1 8a1 1 0 0 0 1 .9h15a1 1 0 0 0 1-.9l1-8a1 1 0 0 0-1-1.1z" />
    </svg>
  );
}

function IconFile() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  );
}

function IconChevronRight() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function FileExplorer() {
  const fileExplorerRoot = useAppStore((s) => s.fileExplorerRoot);
  const setViewingFilePath = useAppStore((s) => s.setViewingFilePath);
  const [currentPath, setCurrentPath] = useState<string | null>(fileExplorerRoot);
  const [entries, setEntries] = useState<DirEntry[]>(() =>
    fileExplorerRoot ? cacheGet(fileExplorerRoot) ?? [] : [],
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hostRef = useRef<React.ComponentRef<typeof OverlayScrollbarsComponent>>(null);
  const viewportRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const instance = hostRef.current?.osInstance();
    if (instance) viewportRef.current = instance.elements().viewport;
  });

  useEffect(() => {
    if (fileExplorerRoot) {
      setCurrentPath(fileExplorerRoot);
    }
  }, [fileExplorerRoot]);

  useEffect(() => {
    if (!currentPath) return;
    let cancelled = false;
    // Stale-while-revalidate: paint cached entries instantly, suppress the
    // "Loading…" placeholder, and refresh in the background.
    const cached = cacheGet(currentPath);
    if (cached) {
      setEntries(cached);
      setLoading(false);
    } else {
      setEntries([]);
      setLoading(true);
    }
    setError(null);
    api.listDir(currentPath)
      .then((data) => {
        if (cancelled) return;
        cacheSet(currentPath, data.entries);
        setEntries(data.entries);
      })
      .catch((err) => {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : String(err);
        // If the path doesn't exist (404), auto-navigate up to the nearest existing parent
        if (msg.includes("404") || msg.includes("Not a directory")) {
          const parent = currentPath.split("/").slice(0, -1).join("/") || "/";
          if (parent !== currentPath) {
            setCurrentPath(parent);
            return;
          }
        }
        setError(msg);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [currentPath]);

  // Scroll to top on navigation
  useEffect(() => {
    if (viewportRef.current) viewportRef.current.scrollTop = 0;
  }, [currentPath]);

  const navigateTo = (path: string) => setCurrentPath(path);

  // Compact breadcrumb format for deep paths:
  //   <first-4-chars-of-root>… / … / parent / cwd
  // The root segment is truncated to 4 chars + ellipsis so very long root
  // names (e.g. "Volumes") don't dominate the bar. The middle ellipsis
  // stands in for elided intermediate segments. Parent and cwd are shown
  // in full — sidebar drag-resize lets the user widen the panel to see
  // long names without truncation.
  const segments = currentPath ? currentPath.split("/").filter(Boolean) : [];
  const breadcrumbs = segments.map((part, i) => ({
    label: part,
    path: "/" + segments.slice(0, i + 1).join("/"),
    isLast: i === segments.length - 1,
  }));
  // Collapse the middle whenever there's a segment between root and the
  // last-two pair (i.e. more than 3 total segments).
  const showEllipsis = breadcrumbs.length > 3;
  // Truncate the root label to 4 chars + ellipsis when the original is
  // longer; leave shorter segments alone.
  const rootCrumb = breadcrumbs[0];
  const truncatedRootLabel =
    rootCrumb && rootCrumb.label.length > 4
      ? rootCrumb.label.slice(0, 4) + "…"
      : rootCrumb?.label;

  if (!currentPath) {
    return (
      <div style={{ padding: "32px 20px", fontSize: "13px", color: "var(--text-tertiary)", textAlign: "center", lineHeight: 1.6 }}>
        Select a session first, then switch to folder view to browse its directory.
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Breadcrumb bar — gradient fade into content */}
      <div
        style={{
          padding: "6px 12px 8px",
          flexShrink: 0,
          background: "linear-gradient(to bottom, var(--bg-sidebar) 60%, transparent)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            flexWrap: "nowrap",
            columnGap: "2px",
            fontSize: "12px",
            fontFamily: "var(--font-ui)",
            color: "var(--text-tertiary)",
            overflow: "hidden",
            whiteSpace: "nowrap",
          }}
        >
          {showEllipsis && rootCrumb && truncatedRootLabel ? (
            <>
              <Crumb
                label={truncatedRootLabel}
                path={rootCrumb.path}
                onClick={navigateTo}
                // When the label was truncated, show the original segment name
                // on hover instead of the path. (When label matches the segment,
                // the default `path` tooltip is more useful.)
                title={truncatedRootLabel !== rootCrumb.label ? rootCrumb.label : undefined}
              />
              <span style={{ opacity: 0.4, padding: "0 2px" }}>/</span>
              <span
                title={breadcrumbs.slice(1, -2).map((bc) => bc.label).join(" / ")}
                style={{ opacity: 0.5, cursor: "help" }}
              >
                …
              </span>
              <span style={{ opacity: 0.4, padding: "0 2px" }}>/</span>
              {breadcrumbs.slice(-2).map((bc, i) => (
                <span key={bc.path} style={{ display: "inline-flex", alignItems: "center" }}>
                  {i > 0 && <span style={{ opacity: 0.4, padding: "0 2px" }}>/</span>}
                  <CrumbOrTail bc={bc} onClick={navigateTo} />
                </span>
              ))}
            </>
          ) : (
            breadcrumbs.map((bc, i) => (
              <span key={bc.path} style={{ display: "inline-flex", alignItems: "center" }}>
                {i > 0 && <span style={{ opacity: 0.4, padding: "0 2px" }}>/</span>}
                <CrumbOrTail bc={bc} onClick={navigateTo} />
              </span>
            ))
          )}
        </div>
      </div>

      {/* File list */}
      <OverlayScrollbarsComponent
        ref={hostRef}
        options={SCROLLBAR_OPTIONS}
        style={{ flex: 1, padding: "4px 0" }}
      >
        {loading && (
          <div style={{ padding: "20px", fontSize: "13px", color: "var(--text-tertiary)", textAlign: "center" }}>
            Loading…
          </div>
        )}
        {error && (
          <div style={{ padding: "20px", fontSize: "13px", color: "var(--tool-error-border)", textAlign: "center" }}>
            {error}
          </div>
        )}
        {!loading && !error && entries.map((entry) => (
          <FileRow
            key={entry.name}
            entry={entry}
            currentPath={currentPath}
            onNavigate={navigateTo}
            onViewFile={setViewingFilePath}
          />
        ))}
        {!loading && !error && entries.length === 0 && (
          <div style={{ padding: "24px 20px", fontSize: "13px", color: "var(--text-tertiary)", textAlign: "center" }}>
            Empty directory.
          </div>
        )}
      </OverlayScrollbarsComponent>
    </div>
  );
}

function Crumb({ label, path, onClick, title }: {
  label: string;
  path: string;
  onClick: (p: string) => void;
  // Optional native tooltip — set when the displayed label is a truncated
  // form of the actual path segment (e.g. "Volu…" for "Volumes"). When
  // unset, the path itself is shown so users can see what they'd navigate
  // to without clicking.
  title?: string;
}) {
  return (
    <button
      onClick={() => onClick(path)}
      title={title ?? path}
      style={{
        background: "none",
        border: "none",
        cursor: "pointer",
        color: "var(--text-tertiary)",
        fontSize: "12px",
        fontFamily: "var(--font-ui)",
        padding: "1px 3px",
        borderRadius: "3px",
        transition: "color var(--transition-fast), background var(--transition-fast)",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLButtonElement).style.color = "var(--text-primary)";
        (e.currentTarget as HTMLButtonElement).style.background = "var(--bg-sidebar-hover)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLButtonElement).style.color = "var(--text-tertiary)";
        (e.currentTarget as HTMLButtonElement).style.background = "none";
      }}
    >
      {label}
    </button>
  );
}

function CrumbOrTail({ bc, onClick }: { bc: { label: string; path: string; isLast: boolean }; onClick: (p: string) => void }) {
  if (bc.isLast) {
    return <span style={{ color: "var(--text-secondary)", fontWeight: 500 }}>{bc.label}</span>;
  }
  return <Crumb label={bc.label} path={bc.path} onClick={onClick} />;
}

function FileRow({ entry, currentPath, onNavigate, onViewFile }: {
  entry: DirEntry;
  currentPath: string;
  onNavigate: (path: string) => void;
  onViewFile: (path: string) => void;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => {
        if (entry.type === "dir") onNavigate(`${currentPath}/${entry.name}`);
        else onViewFile(`${currentPath}/${entry.name}`);
      }}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") {
        if (entry.type === "dir") onNavigate(`${currentPath}/${entry.name}`);
        else onViewFile(`${currentPath}/${entry.name}`);
      }}}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "10px",
        padding: "7px 12px",
        cursor: "pointer",
        background: hovered ? "var(--bg-sidebar-hover)" : "transparent",
        borderRadius: "var(--radius-sm)",
        margin: "1px 6px",
        transition: "background var(--transition-fast)",
        userSelect: "none",
        outline: "none",
      }}
    >
      <span style={{ flexShrink: 0, display: "flex", color: "var(--text-tertiary)" }}>
        {entry.type === "dir" ? <IconFolderOpen /> : <IconFile />}
      </span>
      <span
        style={{
          flex: 1,
          fontSize: "15px",
          color: "var(--text-primary)",
          fontFamily: "var(--font-ui)",
          fontWeight: entry.type === "dir" ? 500 : 400,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {entry.name}
      </span>
      {entry.type === "dir" && (
        <span style={{ flexShrink: 0, color: "var(--text-tertiary)", display: "flex", marginLeft: "4px" }}>
          <IconChevronRight />
        </span>
      )}
      {entry.type === "file" && entry.size !== null && (
        <span style={{ flexShrink: 0, fontSize: "11px", color: "var(--text-tertiary)", fontFamily: "var(--font-ui)", marginLeft: "6px" }}>
          {formatSize(entry.size)}
        </span>
      )}
    </div>
  );
}
