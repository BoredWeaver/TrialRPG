// src/state/dungeonStorage.js
export const ROOT_KEY = "rpg.dungeons.v1";
const ACTIVE_MARKER = "_active";

/* internal helpers */
function readAll() {
  try {
    const raw = window.localStorage.getItem(ROOT_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (typeof parsed === "object" && parsed !== null) return parsed;
    return {};
  } catch (e) {
    console.error("[dungeonStorage] readAll failed", e);
    return {};
  }
}

function writeAll(obj) {
  try {
    const safe = JSON.parse(JSON.stringify(obj || {}));
    window.localStorage.setItem(ROOT_KEY, JSON.stringify(safe));
    return true;
  } catch (e) {
    console.error("[dungeonStorage] writeAll failed", e);
    return false;
  }
}

/* Backwards-compatible functions (keep these) */
export function saveDungeonSnapshot(snapshot) {
  if (!snapshot || !snapshot.id) throw new Error("snapshot must have id");
  const all = readAll();
  const copy = { ...all, [snapshot.id]: { ...snapshot, updatedAt: Date.now() } };
  const ok = writeAll(copy);
  if (!ok) {
    console.error("[dungeonStorage] saveDungeonSnapshot writeAll returned false");
    return null;
  }
  try {
    const back = readAll()[snapshot.id];
    if (!back) {
      console.error("[dungeonStorage] verification failed — snapshot not present after write", snapshot.id);
      return null;
    }
    return { ...back };
  } catch (e) {
    console.error("[dungeonStorage] verification read failed", e);
    return null;
  }
}

export function loadDungeonSnapshot(id) {
  if (!id) return null;
  const all = readAll();
  const snap = all[id];
  return snap ? { ...snap } : null;
}

export function loadAllDungeons() {
  const all = readAll();
  return Object.keys(all)
    .filter((k) => k && String(k) !== ACTIVE_MARKER)
    .map((k) => {
      const snap = all[k] || {};
      const id = (snap && snap.id) ? snap.id : k;
      return { ...snap, id };
    });
}

export function clearDungeon(id) {
  const all = readAll();
  if (!Object.prototype.hasOwnProperty.call(all, id)) return false;
  delete all[id];
  if (all[ACTIVE_MARKER] === id) delete all[ACTIVE_MARKER];
  const ok = writeAll(all);
  if (!ok) console.error("[dungeonStorage] clearDungeon writeAll failed for", id);
  return ok;
}

export function clearAllDungeons() {
  try {
    window.localStorage.removeItem(ROOT_KEY);
    return true;
  } catch (e) {
    console.error("[dungeonStorage] clearAll failed", e);
    return false;
  }
}

/* New helpers for single-active-run behavior */

export function setActiveRunId(id) {
  if (!id) return false;
  const all = readAll();
  all[ACTIVE_MARKER] = id;
  return writeAll(all);
}

export function getActiveRunId() {
  const all = readAll();
  const id = all[ACTIVE_MARKER];
  return id ? String(id) : null;
}

export function loadActiveDungeon() {
  const id = getActiveRunId();
  if (!id) return null;
  return loadDungeonSnapshot(id);
}

/**
 * clearActiveRun
 * - deletes the active snapshot and clears the active marker
 */
export function clearActiveRun() {
  try {
    const all = readAll();
    const id = all[ACTIVE_MARKER];
    if (id && Object.prototype.hasOwnProperty.call(all, id)) {
      delete all[id];
    }
    if (all[ACTIVE_MARKER]) delete all[ACTIVE_MARKER];
    const ok = writeAll(all);
    if (!ok) console.error("[dungeonStorage] clearActiveRun writeAll failed");
    return ok;
  } catch (e) {
    console.error("[dungeonStorage] clearActiveRun failed", e);
    return false;
  }
}

/**
 * saveActiveDungeonSnapshot(snapshot)
 * - convenience: wipe other runs and save this snapshot as the only stored run and mark it active.
 */
export function saveActiveDungeonSnapshot(snapshot) {
  if (!snapshot || !snapshot.id) throw new Error("snapshot must have id");
  try {
    const out = {
      [snapshot.id]: { ...snapshot, updatedAt: Date.now() },
      [ACTIVE_MARKER]: snapshot.id,
    };
    const ok = writeAll(out);
    if (!ok) {
      console.error("[dungeonStorage] saveActiveDungeonSnapshot writeAll returned false");
      return null;
    }
    const back = readAll();
    if (!back || !back[snapshot.id]) {
      console.error("[dungeonStorage] saveActiveDungeonSnapshot verification failed for", snapshot.id);
      return null;
    }
    return { ...back[snapshot.id] };
  } catch (e) {
    console.error("[dungeonStorage] saveActiveDungeonSnapshot failed", e);
    return null;
  }
}

/* Utility: return raw object (including marker) when needed */
export function readAllSnapshotsRaw() {
  return readAll();
}
