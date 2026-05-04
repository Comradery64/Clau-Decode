/**
 * Module-level toggle state for Ctrl+O expand-all.
 * Bypasses Zustand to avoid any subscription-propagation issues.
 */

let _expanded = false;
const _listeners = new Set<(v: boolean) => void>();

export function getBlocksExpanded(): boolean {
  return _expanded;
}

export function toggleBlocksExpanded(): void {
  _expanded = !_expanded;
  _listeners.forEach((fn) => fn(_expanded));
}

export function subscribeBlocksExpanded(fn: (v: boolean) => void): () => void {
  _listeners.add(fn);
  return () => _listeners.delete(fn);
}
