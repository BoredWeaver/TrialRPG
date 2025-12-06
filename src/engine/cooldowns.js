// src/engine/cooldowns.js
// -----------------------------------------------
// Cooldown handling for player & enemies
// -----------------------------------------------

/**
 * Tick cooldowns for a single entity (mutates entity).
 * Decreases all cooldowns by 1. Removes any that reach 0.
 */
export function tickCooldownsForEntity(ent) {
  if (!ent || !ent._cooldowns) return;

  for (const key of Object.keys(ent._cooldowns)) {
    const v = Number(ent._cooldowns[key]) || 0;
    if (v <= 0) {
      delete ent._cooldowns[key];
    } else {
      const next = Math.max(0, v - 1);
      if (next === 0) delete ent._cooldowns[key];
      else ent._cooldowns[key] = next;
    }
  }
}

/**
 * Set a cooldown on an entity (mutates entity).
 * key = spellId / itemId
 */
export function setCooldownOnEntity(ent, key, cooldown) {
  if (!ent || !key) return;

  const cd = Number(cooldown) || 0;
  if (cd <= 0) return;

  ent._cooldowns = ent._cooldowns || {};
  ent._cooldowns[key] = Math.max(0, Math.floor(cd));
}

/**
 * Get cooldown remaining for a spell/item.
 * Returns 0 if none.
 */
export function getCooldown(ent, key) {
  if (!ent || !ent._cooldowns) return 0;
  return Number(ent._cooldowns[key]) || 0;
}
