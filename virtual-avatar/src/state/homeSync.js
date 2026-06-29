export const HOME_SYNC_KEY = "boss-home-active-demo";
export const HOME_SYNC_SCENARIO_KEY = "boss-home-active-scenario";

export function readSyncedDemoId(fallbackId) {
  if (typeof window === "undefined") return fallbackId;
  return window.localStorage.getItem(HOME_SYNC_KEY) || fallbackId;
}

export function readSyncedScenario() {
  if (typeof window === "undefined") return null;
  try {
    const value = window.localStorage.getItem(HOME_SYNC_SCENARIO_KEY);
    return value ? JSON.parse(value) : null;
  } catch {
    return null;
  }
}

export function writeSyncedDemoId(demoId) {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(HOME_SYNC_SCENARIO_KEY);
  window.localStorage.setItem(HOME_SYNC_KEY, demoId);
  window.dispatchEvent(new CustomEvent("boss-home-demo-change", { detail: demoId }));
}

export function writeSyncedScenario(scenario) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(HOME_SYNC_KEY, scenario.id);
  window.localStorage.setItem(HOME_SYNC_SCENARIO_KEY, JSON.stringify(scenario));
  window.dispatchEvent(new CustomEvent("boss-home-demo-change", {
    detail: { demoId: scenario.id, scenario },
  }));
}
