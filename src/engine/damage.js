// src/engine/damage.js
// ------------------------------------------------------
// Damage helpers: elemental multipliers, crit system,
// clamp HP/MP, and basic damage math.
// ------------------------------------------------------

/**
 * Safely clamp HP.
 */
export function clampHP(n, max) {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(max, Math.floor(x)));
}

/**
 * Safely clamp MP.
 */
export function clampMP(n, max) {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(max, Math.floor(x)));
}

/**
 * Basic physical damage formula.
 */
export function calcDamage(atk, def) {
  return Math.max(1, atk - def);
}

/* ============================================================
   Elemental modifiers (from original engine)
   ============================================================ */

function getElementMultiplierForEnemy(enemy, element) {
  if (!element) return 1.0;
  if (!enemy || typeof enemy !== "object") return 1.0;

  const mods = enemy.elementMods || {};
  const m = mods[element];

  if (typeof m === "number") return m;
  if (typeof m === "string" && m.trim() !== "") {
    const parsed = Number(m);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 1.0;
}

/**
 * Apply elemental multiplier to base damage.
 */
export function applyElementalMultiplier(baseDamage, element, enemy) {
  const mult = getElementMultiplierForEnemy(enemy, element);
  const raw = Math.floor(baseDamage * mult);
  const final = Math.max(1, raw);
  return { final, mult };
}

/* ============================================================
   Crit system
   ============================================================ */

export const CRIT_CONFIG = {
  BASE_CRIT_CHANCE: 0.05,
  DEX_TO_CHANCE: 0.004,
  MAX_CRIT_CHANCE: 0.5,

  BASE_CRIT_MULT: 1.5,
  CRITDMG_TO_MULT: 0.01,
  MAX_CRIT_MULT: 3.0,
};

function clampNumber(n, min, max) {
  const x = Number(n);
  if (!Number.isFinite(x)) return min;
  return Math.max(min, Math.min(max, x));
}

/**
 * Compute player's crit chance based on stats.
 */
export function computeCritChanceFromPlayer(player) {
  const dex = Number(player.stats?.DEX) || 0;
  const flatCrit = Number(player.stats?.CRIT) || 0;
  const flatDecimal = flatCrit * 0.01;

  const raw =
    CRIT_CONFIG.BASE_CRIT_CHANCE +
    dex * CRIT_CONFIG.DEX_TO_CHANCE +
    flatDecimal;

  return clampNumber(raw, 0, CRIT_CONFIG.MAX_CRIT_CHANCE);
}

/**
 * Compute player's crit damage multiplier.
 */
export function computeCritMultiplierFromPlayer(player) {
  const critDmg = Number(player.stats?.CRITDMG) || 0;
  const raw =
    CRIT_CONFIG.BASE_CRIT_MULT +
    critDmg * CRIT_CONFIG.CRITDMG_TO_MULT;

  return clampNumber(raw, 1, CRIT_CONFIG.MAX_CRIT_MULT);
}

/**
 * Items with `canCrit=false` should respect that.
 */
export function canItemCrit(spec) {
  if (!spec || typeof spec !== "object") return false;
  if (Object.prototype.hasOwnProperty.call(spec, "canCrit"))
    return !!spec.canCrit;
  return true;
}

/**
 * Spells with `canCrit=false` should respect that.
 */
export function canSpellCrit(spell) {
  if (!spell || typeof spell !== "object") return false;
  if (Object.prototype.hasOwnProperty.call(spell, "canCrit"))
    return !!spell.canCrit;
  return true;
}
