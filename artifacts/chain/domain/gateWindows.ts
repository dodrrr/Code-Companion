export type IdentifiedGateWindow = { id: string };

/** Remove one saved window without mutating the collection used by the UI. */
export function removeGateWindow<T extends IdentifiedGateWindow>(windows: T[], windowId: string) {
  return windows.filter((window) => window.id !== windowId);
}
