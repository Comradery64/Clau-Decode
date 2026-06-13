export const SCROLL = {
  NEAR_BOTTOM_PX: 80,
  SNAP_THRESHOLD_PX: 24,
  SNAP_TIMEOUT_MS: 5000,
  SEARCH_HIGHLIGHT_MS: 1800,
} as const;

export const STREAMING = {
  ELAPSED_TICK_MS: 1000,
  THINKING_CYCLE_MS: 3000,
  TIP_CYCLE_MS: 9000,
} as const;

/**
 * Sidebar layout — all widths in px.
 *
 * - `MIN_WIDTH`            minimum width while expanded; the sidebar will not
 *                          allow being dragged narrower than this except when
 *                          crossing into the snapped-collapsed state.
 * - `COLLAPSED_WIDTH`      width when the sidebar is collapsed to icons only.
 * - `SNAP_THRESHOLD`       drag-release width below which we snap to collapsed
 *                          and above which we snap to expanded.
 * - `DEFAULT_WIDTH`        the width used when no persisted width is found.
 * - `MIN_MAIN_PANE`        minimum space reserved for the main pane next to
 *                          the sidebar; auto-collapses if the viewport is too
 *                          narrow to honour both.
 * - `FADE_TEXT_MIN_PX`     during a drag, widths below this px treat text as
 *                          collapsed (icons stay, labels fade out).
 * - `FADE_TEXT_MAX_PX`     hard ceiling on `FADE_TEXT_MIN_PX` — kept as a
 *                          named constant for symmetry / future tuning.
 */
export const SIDEBAR = {
  MIN_WIDTH: 200,
  COLLAPSED_WIDTH: 52,
  SNAP_THRESHOLD: 130,
  DEFAULT_WIDTH: 260,
  MIN_MAIN_PANE: 360,
  FADE_TEXT_MIN_PX: 141,
  FADE_TEXT_MAX_PX: 180,
} as const;

export const UI = {
  /** Bell fade-out duration in `SessionItem` — must match `--transition-medium` family. */
  BELL_FADE_MS: 450,
} as const;
