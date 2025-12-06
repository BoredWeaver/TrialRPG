// src/engine/status/turnStart.js
import { tickCooldowns, isOnCooldown } from "./cooldowns.js";
import { applyStatusEffects, decayStatuses, ensureStatuses } from "./effects.js";

/**
 * runTurnStartFor(entity, state, ctx)
 * Returns: { skipTurn: bool, died: bool }
 *
 * ctx must provide:
 *  - addLog(state, line)
 *  - onEnemyDeathMut(state, enemy)
 *  - emit (optional)
 */
export function runTurnStartFor(entity, state = null, ctx = {}) {
  console.log("START");
  console.log(entity);
  console.log(state);
  if (!entity) return { skipTurn: false, died: false };

  ensureStatuses(entity);
  // 1) tick cooldowns
  try { tickCooldowns(entity); } catch (e) { console.error(e); }

  // 2) apply status effects (DOT, buff application, stun logs)
  const applied = applyStatusEffects(entity, state, ctx);
  const died = !!applied.died;
  const stunned = !!applied.stunned;

  // If DOT killed the entity, we still decay (we want statuses cleaned up)
  // 3) decay durations
  try { decayStatuses(entity); } catch (e) { console.error(e); }

  // return whether the unit's turn should be skipped (stun)
  return { skipTurn: stunned, died };
}
