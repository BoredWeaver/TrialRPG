// src/state/gameEvents.js
// Tiny local-only event bus for in-game events.
// API: gameEvents.on(event, fn), gameEvents.emit(event, payload), gameEvents.once(event, fn)

const listeners = new Map();

/* ---------------- Subscription API ---------------- */

export function on(eventName, fn) {
  if (typeof eventName !== "string" || typeof fn !== "function") {
    throw new TypeError("on(eventName: string, fn: function) required");
  }
  if (!listeners.has(eventName)) listeners.set(eventName, new Set());
  listeners.get(eventName).add(fn);
  return () => {
    const set = listeners.get(eventName);
    if (set) set.delete(fn);
  };
}

export function off(eventName, fn) {
  if (!listeners.has(eventName)) return;
  const set = listeners.get(eventName);
  set.delete(fn);
  if (set.size === 0) listeners.delete(eventName);
}

export function once(eventName, fn) {
  const unsub = on(eventName, (payload, meta) => {
    try { fn(payload, meta); } finally { unsub(); }
  });
  return unsub;
}

/* ---------------- Emit ---------------- */

export function emit(eventName, payload = {}, meta = {}) {
  const set = listeners.get(eventName);
  if (!set) return;
  const handlers = Array.from(set); // ensure safe iteration
  for (const handler of handlers) {
    try {
      handler(payload, meta);
    } catch (err) {
      console.error(`gameEvents handler for "${eventName}" failed:`, err);
    }
  }
}

/* ---------------- Reset (test helpers) ---------------- */
export function clearAll() {
  listeners.clear();
}

/* ============================================================
   Unified namespace export — REQUIRED for imports everywhere
   ============================================================ */
export const gameEvents = {
  on,
  off,
  once,
  emit,
  clearAll,
};
