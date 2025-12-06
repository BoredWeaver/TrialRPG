// src/state/locations.js
// Helpers to read location data and compute availability for the player.
//
// Supports nested `locations.json` with structure { regions: [ { id, name, locations: [...] } ] }
// Backwards-compatible API: getAllLocations(), getLocationsForPlayer(progress), findLocation(id), unlockLocation(id)
// Adds helpers to set the player's current location (persisted via saveProgress).

import RAW from "../db/locations.json";
import { loadProgress, saveProgress } from "./playerProgress.js";

// --- Internal index/cache for O(1) lookups ---
let _regions = Array.isArray(RAW?.regions) ? RAW.regions.slice() : [];
const idToNode = new Map(); // id -> { type, regionId, data }

/**
 * Build index for fast lookup.
 * Each region is indexed (id -> region node) and each location is indexed (id -> location node).
 */
function buildIndex() {
  idToNode.clear();
  _regions = Array.isArray(RAW?.regions) ? RAW.regions.slice() : [];

  for (const region of _regions) {
    if (!region || !region.id) continue;
    // region entry (type "region" so callers can detect)
    idToNode.set(region.id, { type: "region", regionId: region.id, data: region });

    // locations within region
    for (const loc of region.locations || []) {
      if (!loc || !loc.id) continue;
      const type = loc.type || loc.kind || "location";
      // store normalized node
      idToNode.set(loc.id, { type, regionId: region.id, data: loc });
    }
  }
}
// initial build
buildIndex();

/* ===========================
   Basic exports (backwards)
   =========================== */

/**
 * Return all locations as a flat array (order preserved by regions -> locations order).
 */
export function getAllLocations() {
  const out = [];
  for (const region of _regions) {
    for (const loc of region.locations || []) {
      out.push(loc);
    }
  }
  return out.slice();
}

/**
 * Given player progress (or none), return locations annotated with computed flags
 * (isLocked, unlockedByPlayer, meetsLevel, available).
 *
 * If `progress` is omitted, this will read persisted progress via loadProgress().
 */
export function getLocationsForPlayer(progress) {
  const prog = progress || loadProgress() || {};
  const locs = getAllLocations();
  const unlocked = new Set(Array.isArray(prog.unlockedLocations) ? prog.unlockedLocations : []);
  const level = Number.isFinite(Number(prog.level)) ? Number(prog.level) : 1;

  return locs.map((L) => {
    const explicitLocked = !!L.locked;
    const unlockedByPlayer = unlocked.has(L.id);
    const minLevelReq = Number.isFinite(Number(L.minLevel)) ? Number(L.minLevel) : null;
    const meetsLevel = minLevelReq === null ? true : level >= minLevelReq;
    const isLocked = explicitLocked && !unlockedByPlayer;
    return {
      ...L,
      isLocked,
      unlockedByPlayer,
      minLevel: minLevelReq,
      meetsLevel,
      available: !isLocked && meetsLevel,
    };
  });
}

/**
 * Unlock the given location for the player and persist progress.
 * Returns the merged progress object returned by saveProgress(), or null on failure.
 */
export function unlockLocation(locationId) {
  if (!locationId || typeof locationId !== "string") return null;

  // Validate that the location exists
  const exists = !!idToNode.get(locationId);
  if (!exists) return null;

  const progress = loadProgress() || {};
  const prev = Array.isArray(progress.unlockedLocations) ? progress.unlockedLocations : [];
  const unlocked = Array.from(new Set([...prev, locationId]));

  try {
    const merged = saveProgress({ unlockedLocations: unlocked });
    return merged || null;
  } catch (e) {
    return null;
  }
}

/**
 * Check if location exists by id and return raw location object (or null).
 */
export function findLocation(id) {
  if (!id) return null;
  const meta = idToNode.get(id);
  return meta ? meta.data : null;
}

/* ===========================
   Meta & region helpers
   =========================== */

/**
 * Return meta for a given id: { type, regionId, data } or null
 */
export function getLocationMeta(id) {
  return idToNode.get(id) || null;
}

/**
 * Get list of regions: [{ id, name }]
 */
export function getRegions() {
  return _regions.map((r) => ({ id: r.id, name: r.name }));
}

/**
 * Return all locations for a region (raw objects array).
 */
export function getLocationsForRegion(regionId) {
  const r = _regions.find((rr) => rr.id === regionId);
  return r ? (r.locations || []).slice() : [];
}

/**
 * Return only zone-like locations for a region.
 */
export function getZonesForRegion(regionId) {
  return getLocationsForRegion(regionId).filter((l) => (l.type === "zone" || l.kind === "dungeon" || l.type === "outpost"));
}

/**
 * Return the city location object for a region, or null.
 */
export function getCityForRegion(regionId) {
  return getLocationsForRegion(regionId).find((l) => l.type === "city") || null;
}

/* ===========================
   Runtime helpers
   =========================== */

/**
 * Unlock a location in-memory (useful for runtime changes). Returns true if found.
 * This mutates the underlying location object; call refreshIndex() if you replace RAW entirely.
 */
export function unlockLocationRuntime(locationId) {
  const meta = idToNode.get(locationId);
  if (!meta) return false;
  // if data exists and has .locked flag, clear it
  if (meta.data && Object.prototype.hasOwnProperty.call(meta.data, "locked")) {
    meta.data.locked = false;
  } else if (meta.data) {
    // ensure a consistent presence of flag
    meta.data.locked = false;
  }
  return true;
}

/**
 * If you change the JSON or mutate structure externally, call this to rebuild the index.
 */
export function refreshIndex() {
  buildIndex();
}

/* ===========================
   New: set current player location (persisted)
   ===========================
   Provides a single canonical place to move the player around. This ensures:
     - validation of location id
     - region association is also persisted (currentRegion) for UI convenience
     - saveProgress(...) is used (which will trigger travel/visit emits)
*/
export function setCurrentLocation(locationId) {
  if (!locationId || typeof locationId !== "string") return { success: false, reason: "invalid-id" };

  const meta = idToNode.get(locationId);
  if (!meta) return { success: false, reason: "not-found" };

  const regionId = meta.regionId || null;

  try {
    // Persist both currentLocation and currentRegion (region may be used by UI)
    const merged = saveProgress({ currentLocation: locationId, currentRegion: regionId });
    if (!merged) return { success: false, reason: "save-failed" };
    return { success: true, progress: merged };
  } catch (e) {
    console.error("setCurrentLocation failed", e);
    return { success: false, reason: "save-failed" };
  }
}

/**
 * Convenience: move to a region hub (city) by region id.
 * Will find the city location for the region and call setCurrentLocation on it.
 */
export function goToRegionCity(regionId) {
  if (!regionId) return { success: false, reason: "invalid-region" };
  const city = getCityForRegion(regionId);
  if (!city || !city.id) return { success: false, reason: "no-city" };
  return setCurrentLocation(city.id);
}

/**
 * Persist currentRegion directly without changing currentLocation.
 * Useful when user picks a region in UI but you don't immediately change location.
 */
export function setCurrentRegion(regionId) {
  if (!regionId || typeof regionId !== "string") return { success: false, reason: "invalid-id" };
  const exists = _regions.find((r) => r.id === regionId);
  if (!exists) return { success: false, reason: "not-found" };
  try {
    const merged = saveProgress({ currentRegion: regionId });
    if (!merged) return { success: false, reason: "save-failed" };
    return { success: true, progress: merged };
  } catch (e) {
    console.error("setCurrentRegion failed", e);
    return { success: false, reason: "save-failed" };
  }
}

/* expose raw regions for advanced uses (read-only reference) */
export const _rawRegions = _regions;
