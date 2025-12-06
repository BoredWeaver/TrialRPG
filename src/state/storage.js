// src/state/storage.js
// ---------------------
// Clean no-version snapshot storage.
// Saves/loads raw snapshot objects exactly as given.

const STORAGE_KEY = "rpg.turnbased.snapshot";

/* ---------------- Utilities ---------------- */

function storageAvailable() {
  try {
    const testKey = "__rpg_test__";
    window.localStorage.setItem(testKey, "1");
    window.localStorage.removeItem(testKey);
    return true;
  } catch (_) {
    return false;
  }
}

/* ---------------- Save ---------------- */

export function saveSnapshot(snapshot) {
  if (!storageAvailable()) return;
  try {
    // Save raw object directly
    const json = JSON.stringify(snapshot);
    window.localStorage.setItem(STORAGE_KEY, json);
  } catch (_) {
    // swallow silently
  }
}

/* ---------------- Load ---------------- */

export function loadSnapshot() {
  if (!storageAvailable()) return null;
  try {
    const json = window.localStorage.getItem(STORAGE_KEY);
    if (!json) return null;

    const data = JSON.parse(json);

    // Must be an object – nothing else is valid
    if (typeof data !== "object" || data === null) return null;

    return data;
  } catch (_) {
    return null;
  }
}

/* ---------------- Clear ---------------- */

export function clearSnapshot() {
  if (!storageAvailable()) return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch (_) {
    // swallow
  }
}

/* ---------------- Optional: Size estimate ---------------- */

export function estimateSnapshotSize(snapshot) {
  try {
    const json = JSON.stringify(snapshot || {});
    return json.length * 2; // approx UTF-16 bytes
  } catch (_) {
    return 0;
  }
}
