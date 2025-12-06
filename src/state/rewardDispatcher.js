// src/state/rewardDispatcher.js
// Responsible for dispatching reward events and (optionally) applying them directly
// so old callers that expect immediate persistence still get consistent behavior.

import { emit } from "./gameEvents.js";
import { loadProgress, saveProgress } from "./playerProgress.js";
import { applyExpGain } from "./progression.js";

/**
 * Options:
 *  - emitOnly: if true, only emit events and do NOT write to persisted progress
 *  - silent: if true, suppress console logs
 */
const DEFAULT_OPTS = { emitOnly: false, silent: false };

function safeLog(silent, ...args) {
  if (!silent) console.log(...args);
}

/* ------------------ low-level helpers ------------------ */

export function grantItems(items = [], opts = {}) {
  const { emitOnly, silent } = { ...DEFAULT_OPTS, ...opts };
  if (!Array.isArray(items) || items.length === 0) return null;

  // Emit events for listeners
  for (const it of items) {
    if (!it || !it.id) continue;
    const qty = Number(it.qty || 1);
    if (qty <= 0) continue;
    try {
      emit("collect", { itemId: it.id, qty });
    } catch (err) {
      // swallow
      console.error("[rewardDispatcher] emit collect failed", err);
    }
  }

  // Optionally apply directly to saved progress (fallback)
  if (!emitOnly) {
    try {
      const prog = loadProgress() || {};
      prog.inventory = prog.inventory || {};
      for (const it of items) {
        if (!it || !it.id) continue;
        const qty = Math.max(0, Number(it.qty || 1));
        if (qty <= 0) continue;
        prog.inventory[it.id] = (Number(prog.inventory[it.id] || 0) + qty);
      }
      saveProgress(prog);
      safeLog(silent, "[rewardDispatcher] applied items to progress", items);
      // Also emit a higher-level event in case listeners want the whole package
      try { emit("items_applied", { items }); } catch (e) {}
      return prog;
    } catch (err) {
      console.error("[rewardDispatcher] apply items failed", err);
    }
  }

  return null;
}

export function grantGold(amount = 0, opts = {}) {
  const { emitOnly, silent } = { ...DEFAULT_OPTS, ...opts };
  const n = Number(amount || 0);
  if (!Number.isFinite(n) || n <= 0) return null;

  try {
    emit("gold", { amount: n });
  } catch (err) {
    console.error("[rewardDispatcher] emit gold failed", err);
  }

  if (!emitOnly) {
    try {
      const prog = loadProgress() || {};
      prog.gold = Number(prog.gold || 0) + n;
      saveProgress(prog);
      safeLog(silent, "[rewardDispatcher] applied gold to progress", n);
      try { emit("gold_applied", { amount: n }); } catch (e) {}
      return prog;
    } catch (err) {
      console.error("[rewardDispatcher] apply gold failed", err);
    }
  }

  return null;
}

export function grantExp(amount = 0, opts = {}) {
  const { emitOnly, silent } = { ...DEFAULT_OPTS, ...opts };
  const n = Number(amount || 0);
  if (!Number.isFinite(n) || n <= 0) return null;

  try {
    emit("exp", { amount: n });
  } catch (err) {
    console.error("[rewardDispatcher] emit exp failed", err);
  }

  if (!emitOnly) {
    try {
      // Prefer progression util so level-up + derived changes are handled consistently.
      const res = applyExpGain(n);
      if (res && res.progress) {
        // applyExpGain should return the updated progress object; persist it
        try {
          saveProgress(res.progress);
        } catch (e) {
          console.error("[rewardDispatcher] saveProgress after applyExpGain failed", e);
        }
        safeLog(silent, "[rewardDispatcher] applied exp via progression", n);
        try { emit("exp_applied", { amount: n, progress: res.progress }); } catch (e) {}
        return res.progress;
      } else {
        // fallback: directly bump saved progress.exp
        const prog = loadProgress() || {};
        prog.exp = Number(prog.exp || 0) + n;
        saveProgress(prog);
        safeLog(silent, "[rewardDispatcher] fallback applied exp", n);
        try { emit("exp_applied", { amount: n, progress: prog }); } catch (e) {}
        return prog;
      }
    } catch (err) {
      console.error("[rewardDispatcher] applyExpGain failed", err);
    }
  }

  return null;
}

/**
 * grantClearRewards
 *  - rewards: { gold, exp, items: [{id,qty}, ...] }
 *  - options: passed down to subcalls
 *
 * Emits:
 *  - collect (per item)
 *  - gold
 *  - exp
 *  - dungeon_clear (once, with full package)
 *
 * Also applies directly (unless emitOnly=true)
 */
export function grantClearRewards(rewards = {}, opts = {}) {
  const { emitOnly, silent } = { ...DEFAULT_OPTS, ...opts };
  const r = {
    gold: Number(rewards?.gold || 0),
    exp: Number(rewards?.exp || 0),
    items: Array.isArray(rewards?.items) ? rewards.items.map(it => ({ id: it.id, qty: Number(it.qty || 0) })) : [],
  };

  // Emit components (collect/gold/exp) — individual events may be useful to listeners
  if (Array.isArray(r.items) && r.items.length > 0) {
    for (const it of r.items) {
      if (!it || !it.id || Number(it.qty || 0) <= 0) continue;
      try { emit("collect", { itemId: it.id, qty: Number(it.qty) }); } catch (e) { console.error(e); }
    }
  }
  if (Number.isFinite(r.gold) && r.gold > 0) {
    try { emit("gold", { amount: r.gold }); } catch (e) { console.error(e); }
  }
  if (Number.isFinite(r.exp) && r.exp > 0) {
    try { emit("exp", { amount: r.exp }); } catch (e) { console.error(e); }
  }

  // Emit package-level event
  try {
    emit("dungeon_clear", { rewards: r });
  } catch (e) {
    console.error("[rewardDispatcher] emit dungeon_clear failed", e);
  }

  // Optionally also apply directly so older code paths keep working
  if (!emitOnly) {
    // apply items
    if (Array.isArray(r.items) && r.items.length > 0) {
      try {
        const prog = loadProgress() || {};
        prog.inventory = prog.inventory || {};
        for (const it of r.items) {
          if (!it || !it.id) continue;
          const qty = Math.max(0, Number(it.qty || 0));
          if (qty <= 0) continue;
          prog.inventory[it.id] = (Number(prog.inventory[it.id] || 0) + qty);
        }
        saveProgress(prog);
        safeLog(silent, "[rewardDispatcher] applied clear items to progress", r.items);
      } catch (err) {
        console.error("[rewardDispatcher] apply clear items failed", err);
      }
    }

    // apply gold
    if (Number.isFinite(r.gold) && r.gold > 0) {
      try {
        const prog = loadProgress() || {};
        prog.gold = Number(prog.gold || 0) + r.gold;
        saveProgress(prog);
        safeLog(silent, "[rewardDispatcher] applied clear gold", r.gold);
      } catch (err) {
        console.error("[rewardDispatcher] apply clear gold failed", err);
      }
    }

    // apply exp via progression util
    if (Number.isFinite(r.exp) && r.exp > 0) {
      try {
        const res = applyExpGain(r.exp);
        if (res && res.progress) {
          try { saveProgress(res.progress); } catch (e) { console.error("[rewardDispatcher] saveProgress after applyExpGain failed", e); }
          safeLog(silent, "[rewardDispatcher] applied clear exp via progression", r.exp);
        } else {
          // fallback increment
          const prog = loadProgress() || {};
          prog.exp = Number(prog.exp || 0) + r.exp;
          saveProgress(prog);
          safeLog(silent, "[rewardDispatcher] applied clear exp fallback", r.exp);
        }
      } catch (err) {
        console.error("[rewardDispatcher] apply clear exp failed", err);
      }
    }

    try { emit("dungeon_clear_applied", { rewards: r }); } catch (e) {}
  }

  return r;
}

/* convenience default export */
const dispatcher = {
  grantItems,
  grantGold,
  grantExp,
  grantClearRewards,
};

export default dispatcher;
