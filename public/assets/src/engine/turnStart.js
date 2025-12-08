// src/engine/turnStart.js
// ----------------------------------------------------
// startUnitTurn() — runs cooldowns, DOT, stun, buff/debuff,
// status decay, recompute, prune dead, and end-check.
// This file ONLY handles turn-start logic.
// ----------------------------------------------------

import { tickCooldownsForEntity } from "./cooldowns.js";
import {
  ensureRuntimeFieldsForEntity,
  applyStartOfTurnStatuses,
  decayStatusesForEntity,
  recomputeDerivedWithStatuses,
  isEnemy,
} from "./statuses.js";

/**
 * Helper: get list of enemies from state (same as engine's logic)
 */
function getEnemiesList(state) {
  if (Array.isArray(state.enemies) && state.enemies.length > 0) return state.enemies;
  if (state.enemy) return [state.enemy];
  return [];
}

function getEnemyByIndex(state, idx) {
  const list = getEnemiesList(state);
  if (list.length === 0) return null;

  if (idx == null) {
    const alive = list.find(e => (e.hp || 0) > 0);
    return alive || list[0];
  }

  const i = Number(idx);
  if (!Number.isFinite(i) || i < 0 || i >= list.length) {
    const alive = list.find(e => (e.hp || 0) > 0);
    return alive || list[0];
  }

  return list[i];
}

/**
 * Removed-dead-enemies logic.
 */
function pruneDeadEnemiesMut(state) {
  if (!Array.isArray(state.enemies)) return;

  const keep = state.enemies.filter(e => (e.hp || 0) > 0);
  state.enemies = keep;
  state.enemy = keep.length > 0 ? { ...keep[0] } : null;
}

/**
 * End condition checks
 */
function checkEndMut(state) {
  const pDead = state.player.hp <= 0;
  const aliveEnemies = getEnemiesList(state).filter(e => (e.hp || 0) > 0).length;

  if (pDead && aliveEnemies === 0) {
    state.over = true;
    state.result = "win";
    state.log = state.log || [];
    state.log.push("Both sides fall — you prevail!");
  } else if (aliveEnemies === 0) {
    state.over = true;
    state.result = "win";
    state.log = state.log || [];
    state.log.push("Victory!");
  } else if (pDead) {
    state.over = true;
    state.result = "loss";
    state.log = state.log || [];
    state.log.push("Defeat...");
  }
}

/**
 * START OF TURN PROCESSING
 * unitType: "player" or "enemy"
 * opts.enemyIndex used only for enemies
 *
 * This implementation increments a per-state tick id and passes it into
 * the status helpers so that applying/decaying statuses is idempotent
 * for a single logical start-of-turn invocation.
 */
export function startUnitTurn(state, unitType = "player", opts = {}) {
  if (!state) return state;

  // --- Ensure a per-start tick id to avoid double-processing ---
  state._turnTick = (state._turnTick || 0) + 1;
  const tick = state._turnTick;
  // ----------------------------------------------------------

  // We'll write a small runtime result object here for callers to consult.
  // This is a transient field used only by the engine in the current tick.
  state._lastStartResult = {
    unitType,
    enemyIndex: Number.isFinite(Number(opts.enemyIndex)) ? Number(opts.enemyIndex) : null,
    tick,
    skipped: false,
    died: false,
    entityId: null,
  };

  // PLAYER TURN START
  if (unitType === "player") {
    ensureRuntimeFieldsForEntity(state.player);

    tickCooldownsForEntity(state.player);

    // apply statuses (DOT/stun) — pass tick so helpers are idempotent
    const res = applyStartOfTurnStatuses(state, state.player, { tick });

    // recompute derived after any buff changes
    recomputeDerivedWithStatuses(state.player, state);

    // populate runtime result for callers
    state._lastStartResult.skipped = !!res.skipped;
    state._lastStartResult.died = !!res.died;
    state._lastStartResult.entityId = state.player?.id || state.player?.name || null;

    if (res.died) {
      checkEndMut(state);
      return state;
    }

    return state;
  }

  // ENEMY TURN START
  if (unitType === "enemy") {
    const list = getEnemiesList(state);
    const idx = Number.isFinite(Number(opts.enemyIndex)) ? Number(opts.enemyIndex) : null;

    const ent = idx == null
      ? getEnemyByIndex(state, undefined)
      : getEnemyByIndex(state, idx);

    if (!ent) {
      // no entity processed: record that and return
      state._lastStartResult.entityId = null;
      return state;
    }

    ensureRuntimeFieldsForEntity(ent);

    tickCooldownsForEntity(ent);

    // apply statuses (DOT/stun) — pass tick
    const res = applyStartOfTurnStatuses(state, ent, { tick });

    // recompute derived after any buff changes
    recomputeDerivedWithStatuses(ent, state);

    // populate runtime result for callers
    state._lastStartResult.skipped = !!res.skipped;
    state._lastStartResult.died = !!res.died;
    state._lastStartResult.entityId = ent.id || ent.name || null;

    // don't clear _pendingEnemyDeath here (upstream handles it)
    pruneDeadEnemiesMut(state);
    checkEndMut(state);

    return state;
  }

  return state;
}

