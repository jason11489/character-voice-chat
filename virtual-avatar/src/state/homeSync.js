export const HOME_SYNC_KEY = "boss-home-active-demo";

export function readSyncedDemoId(fallbackId) {
  if (typeof window === "undefined") return fallbackId;
  return window.localStorage.getItem(HOME_SYNC_KEY) || fallbackId;
}

export function writeSyncedDemoId(demoId) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(HOME_SYNC_KEY, demoId);
  window.dispatchEvent(new CustomEvent("boss-home-demo-change", { detail: demoId }));
}
