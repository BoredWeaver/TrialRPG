// src/state/playerProgress.js
import { emit } from "./gameEvents.js"; // local tiny bus (gameEvents.emit)

const KEY = "rpg.progress.v1";

/* ---------------- Debugging / instrumentation ----------------
   Installs a lightweight watcher so we can see who writes the key.
   This is safe to ship temporarily in dev; remove once root cause found.
----------------------------------------------------------------*/
(function installDebugWatchers() {
  try {
    // storage event (other tabs/windows)
    window.addEventListener("storage", (ev) => {
      if (ev.key === KEY) {
        try {
          console.info("[playerProgress.watch][storage event] key changed by external tab/window", {
            oldValue: safeParse(ev.oldValue),
            newValue: safeParse(ev.newValue),
            url: ev.url || ev.uri || null,
            time: new Date().toISOString(),
          });
        } catch (e) {
          console.info("[playerProgress.watch][storage event] key changed (parse failed)", { time: new Date().toISOString() });
        }
      }
    });

    // Monkeypatch setItem to detect writes *in this tab* (non-invasive)
    const rawLS = window.localStorage;
    if (rawLS && !rawLS.__setItemPatchedForPP) {
      const origSet = rawLS.setItem.bind(rawLS);
      rawLS.setItem = function (k, v) {
        if (k === KEY) {
          try {
            // Capture stack without throwing (works in most browsers)
            const stack = (new Error()).stack;
            console.debug("[playerProgress.watch][localStorage.setItem] writing key:", {
              key: k,
              time: new Date().toISOString(),
              stack: stack ? stack.split("\n").slice(1, 6).map(l => l.trim()) : undefined,
              attemptedValueSummary: summarizeRawValue(v),
            });
          } catch (e) {
            console.debug("[playerProgress.watch][localStorage.setItem] writing key (no stack)", { key: k, time: new Date().toISOString() });
          }
        }
        return origSet(k, v);
      };
      rawLS.__setItemPatchedForPP = true;
    }
  } catch (e) {
    // Never fail app boot because of watcher
    // eslint-disable-next-line no-console
    console.warn("[playerProgress.watch] watcher install failed", e);
  }

  // Helpers used by watcher
  function safeParse(s) {
    try {
      return s ? JSON.parse(s) : null;
    } catch { return s; }
  }
  function summarizeRawValue(v) {
    try {
      if (!v) return null;
      const parsed = JSON.parse(v);
      return {
        gold: parsed.gold,
        inventoryKeys: Object.keys(parsed.inventory || {}).slice(0, 20),
        spellsLen: Array.isArray(parsed.spells) ? parsed.spells.length : undefined,
        savedAt: parsed.__savedAt,
      };
    } catch {
      return { rawLength: String(v).length };
    }
  }
})();

/* ---------------- Helpers ---------------- */

function clamp01(n) {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function expToNext(level = 1) {
  const L = Math.max(1, Math.floor(Number(level) || 1));
  return 100 * L;
}

function computeProgressDerived(progress = {}) {
  const level = Number.isFinite(Number(progress.level)) ? Math.max(1, Math.floor(Number(progress.level))) : 1;
  const exp = Number.isFinite(Number(progress.exp)) ? Math.max(0, Math.floor(Number(progress.exp))) : 0;
  const unspentPoints = Number.isFinite(Number(progress.unspentPoints)) ? Math.max(0, Math.floor(Number(progress.unspentPoints))) : 0;

  const next = expToNext(level);
  const pct = next > 0 ? clamp01(exp / next) : 0;

  return {
    ...progress,
    level,
    exp,
    unspentPoints,
    // backward-compatible aliases
    points: unspentPoints,
    pct,
    nextExp: next,
  };
}

function emitDomProgressUpdate(payload) {
  try {
    const ev = new CustomEvent("rpg.progress.updated", { detail: payload });
    window.dispatchEvent(ev);
  } catch (e) {
    // ignore
  }
}

/* ---------------- Public API ---------------- */

export function loadProgress() {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (typeof data !== "object" || data === null) return null;
    return computeProgressDerived(data);
  } catch {
    return null;
  }
}

/**
 * saveProgress(partial)
 * - Merge + normalize fields, persist to localStorage
 * - Dispatch DOM CustomEvent "rpg.progress.updated"
 * - Emit gameEvents 'travel' and 'visit' if currentLocation changed (prev -> new)
 *
 * NOTE: If caller provides `partial.inventory` or `partial.items`, treat that
 * as a full replacement (not a patch merge). This ensures removals (deleting keys)
 * behave correctly when saving updated inventory objects.
 *
 * This implementation also emits debug logs and writes a small __savedAt timestamp.
 */
export function saveProgress(partial = {}) {
  try {
    // read raw localStorage snapshot (avoid using loadProgress here because
    // that returns a computed/derived view which can mask the true persisted shape)
    let rawPrev = null;
    try {
      rawPrev = window.localStorage.getItem(KEY);
    } catch (e) {
      rawPrev = null;
    }
    let prevRawObj = {};
    if (rawPrev) {
      try {
        const parsed = JSON.parse(rawPrev);
        if (typeof parsed === "object" && parsed !== null) {
          prevRawObj = parsed;
        }
      } catch (e) {
        // if parse failed, continue with empty existing object but log
        console.warn("[saveProgress] warning: failed to parse existing localStorage value, starting fresh", e);
        prevRawObj = {};
      }
    }

    // Existing 'computed' view useful for fallbacks
    const prevComputed = loadProgress() || {};

    // For debug/tracing
    const enterTime = new Date().toISOString();
    console.debug("[saveProgress] enter time:" + enterTime, {
      partialKeys: Object.keys(partial || {}),
      prevGold: Number(prevRawObj.gold ?? prevComputed.gold ?? 0),
      prevInventoryKeys: Object.keys(prevRawObj.inventory || {}),
    });

    // Start from the raw persisted object then overlay top-level partial keys
    const existing = { ...(prevRawObj || {}) };

    // Start from existing then overlay partial where appropriate
    const merged = { ...existing, ...partial };

    // Normalize main numeric fields — keep previous values as fallback
    merged.level = Number.isFinite(Number(merged.level))
      ? Math.max(1, Math.floor(merged.level))
      : (existing.level || prevComputed.level || 1);

    merged.exp = Number.isFinite(Number(merged.exp))
      ? Math.max(0, Math.floor(merged.exp))
      : (existing.exp || prevComputed.exp || 0);

    merged.unspentPoints = Number.isFinite(Number(merged.unspentPoints))
      ? Math.max(0, Math.floor(merged.unspentPoints))
      : (existing.unspentPoints || prevComputed.unspentPoints || 0);

    // Stats: merge patch (partial.stats is treated as patch)
    merged.stats = { ...(existing.stats || { STR: 3, DEX: 3, MAG: 3, CON: 3 }), ...(partial.stats || {}) };

    // Inventory/items handling: if caller supplied either key treat it as full replacement.
    // We then ensure BOTH keys exist and are identical so older code reading either shape behaves.
    if (Object.prototype.hasOwnProperty.call(partial, "inventory")) {
      merged.inventory = { ...(partial.inventory || {}) };
      // keep legacy `items` in sync if partial.items not explicitly provided
      if (!Object.prototype.hasOwnProperty.call(partial, "items")) {
        merged.items = { ...(merged.inventory) };
      }
    } else if (Object.prototype.hasOwnProperty.call(partial, "items")) {
      // partial.items provided: treat as full replacement and sync inventory
      merged.items = { ...(partial.items || {}) };
      merged.inventory = { ...(merged.items) };
    } else {
      // No replacement requested: preserve existing shapes (fall back to each other if one missing)
      merged.inventory = { ...(existing.inventory || prevComputed.inventory || {}) };
      merged.items = { ...(existing.items || prevComputed.items || merged.inventory) };
    }

    // Spells: if caller supplied partial.spells treat as replacement; otherwise preserve existing
    if (Object.prototype.hasOwnProperty.call(partial, "spells")) {
      merged.spells = Array.isArray(partial.spells) ? Array.from(new Set(partial.spells)) : [];
    } else {
      merged.spells = Array.isArray(existing.spells)
        ? existing.spells.slice()
        : (Array.isArray(prevComputed.spells) ? prevComputed.spells.slice() : (Array.isArray(merged.spells) ? merged.spells.slice() : []));
    }

    // Gold
    merged.gold = Number.isFinite(Number(merged.gold)) ? Number(merged.gold) : (existing.gold ?? prevComputed.gold ?? 0);

    // Equipped: merge patch behavior for convenience (caller may pass partial.equipped to change one slot)
    if (Object.prototype.hasOwnProperty.call(partial, "equipped")) {
      merged.equipped = { ...(existing.equipped || {}), ...(partial.equipped || {}) };
      // Remove explicit null/undefined keys (meaning: unequip)
      for (const k of Object.keys(merged.equipped)) {
        if (merged.equipped[k] === null || typeof merged.equipped[k] === "undefined") {
          delete merged.equipped[k];
        }
      }
    } else {
      merged.equipped = { ...(existing.equipped || prevComputed.equipped || {}) };
    }

    // unlocked locations normalization
    merged.unlockedLocations = Array.isArray(merged.unlockedLocations)
      ? Array.from(new Set(merged.unlockedLocations))
      : (existing.unlockedLocations || prevComputed.unlockedLocations || []);

    // pendingSpellChoices: replace when provided, otherwise preserve
    if (Object.prototype.hasOwnProperty.call(partial, "pendingSpellChoices")) {
      merged.pendingSpellChoices = Array.isArray(partial.pendingSpellChoices) ? partial.pendingSpellChoices.slice() : [];
    } else {
      merged.pendingSpellChoices = Array.isArray(existing.pendingSpellChoices)
        ? existing.pendingSpellChoices.slice()
        : (Array.isArray(prevComputed.pendingSpellChoices) ? prevComputed.pendingSpellChoices.slice() : []);
    }

    // Ensure shapes are present (avoid undefined keys)
    if (!merged.inventory) merged.inventory = {};
    if (!merged.items) merged.items = {};
    if (!Array.isArray(merged.spells)) merged.spells = [];
    if (!Array.isArray(merged.pendingSpellChoices)) merged.pendingSpellChoices = [];

    // Add a small timestamp marker so we can detect who wrote most recently when debugging
    merged.__savedAt = new Date().toISOString();

    // Derived and persist (compute progress fields for consumers)
    const withDerived = computeProgressDerived(merged);

    // Write to localStorage (atomic)
    try {
      window.localStorage.setItem(KEY, JSON.stringify(withDerived));
    } catch (e) {
      console.error("[saveProgress] failed to write to localStorage", e, { withDerivedSnapshot: { gold: withDerived.gold, inventoryKeys: Object.keys(withDerived.inventory || {}) } });
      throw e;
    }

    // Debug: write succeeded — show key small summary
    try {
      console.debug("[saveProgress] wrote", {
        time: new Date().toISOString(),
        gold: withDerived.gold,
        inventoryKeys: Object.keys(withDerived.inventory || {}),
        spells: (withDerived.spells || []).slice(0,10),
        __savedAt: withDerived.__savedAt,
      });
    } catch (e) {
      // ignore debug errors
    }

    // DOM event for UI listeners
    try { emitDomProgressUpdate(withDerived); } catch (e) { /* ignore */ }

    // Emit travel/visit events when location changed
    try {
      const prevLoc = prevComputed?.currentLocation ?? null;
      const newLoc = withDerived?.currentLocation ?? null;
      if (newLoc && prevLoc !== newLoc) {
        try { emit("travel", { from: prevLoc, to: newLoc }); } catch (e) { console.error("gameEvents.emit travel failed", e); }
        try { emit("visit", { locationId: newLoc }); } catch (e) { console.error("gameEvents.emit visit failed", e); }
      }
    } catch (e) {
      console.error("playerProgress: emit travel/visit failed", e);
    }

    return withDerived;
  } catch (err) {
    console.error("saveProgress failed", err);
    return null;
  }
}



export function clearProgress() {
  try {
    window.localStorage.removeItem(KEY);
    try { emitDomProgressUpdate(null); } catch (e) { /* ignore */ }
    try { emit("travel", { from: null, to: null }); } catch (e) { /* noop */ }
    try { emit("visit", { locationId: null }); } catch (e) { /* noop */ }
  } catch { /* ignore */ }
}

export function applyProgress(basePlayer = {}, progress = null) {
  if (!progress) return { ...basePlayer };

  const out = { ...basePlayer };

  if (Number.isFinite(Number(progress.level))) out.level = Math.max(1, Math.floor(Number(progress.level)));
  if (Number.isFinite(Number(progress.exp))) out.exp = Math.max(0, Math.floor(Number(progress.exp)));
  if (Number.isFinite(Number(progress.unspentPoints))) out.unspentPoints = Math.max(0, Math.floor(Number(progress.unspentPoints)));

  out.stats = { ...(basePlayer.stats || { STR: 3, DEX: 3, MAG: 3, CON: 3 }), ...(progress.stats || {}) };
  out.inventory = { ...(basePlayer.inventory || {}), ...(progress.inventory || {}) };
  out.spellbook = Array.isArray(progress.spells) ? Array.from(new Set(progress.spells)) : (basePlayer.spellbook || []);
  out.gold = Number.isFinite(Number(progress.gold)) ? Number(progress.gold) : (basePlayer.gold || 0);
  out.unlockedLocations = Array.isArray(progress.unlockedLocations) ? progress.unlockedLocations.slice() : (basePlayer.unlockedLocations || []);
  out.equipped = Object.assign({}, basePlayer.equipped || {}, progress.equipped || {});

  const derived = computeProgressDerived(out);
  out.points = derived.points;
  out.pct = derived.pct;
  out.nextExp = derived.nextExp;

  return out;
}
