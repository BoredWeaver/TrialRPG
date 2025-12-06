// src/engine/statuses.js
// -------------------------------------------------------
// Status system (DOT, stun, buff, debuff) + derived recompute
// -------------------------------------------------------

import { clampHP, clampMP } from "./damage.js";

/**
 * Ensure statuses + cooldown containers exist on an entity.
 */
export function ensureRuntimeFieldsForEntity(ent) {
  if (!ent) return;

  ent.statuses = Array.isArray(ent.statuses) ? ent.statuses : [];
  ent._cooldowns = ent._cooldowns && typeof ent._cooldowns === "object"
    ? { ...ent._cooldowns }
    : {};

  // Create base snapshot for enemies if missing
  if (!ent._base && (ent.atk !== undefined || ent.def !== undefined || ent.maxHP !== undefined)) {
    ent._base = {
      atk: Number(ent.atk) || 0,
      def: Number(ent.def) || 0,
      mDef: Number(ent.mDef) || Number(ent.def) || 0,
      maxHP: Number(ent.maxHP) || 0,
      maxMP: Number(ent.maxMP) || 0,
    };
  }
}

/**
 * Push a status onto an entity (mutates entity).
 */
export function pushStatusOntoEntity(ent, effect) {
  if (!ent || !effect) return;

  const turns = Number(effect.turns) || Number(effect.turnsLeft) || 0;
  if (turns <= 0) return;

  const copy = {
    id: effect.id || effect.type || String(Math.random()).slice(2),
    type: effect.type,
    value: effect.value,
    stat: effect.stat,
    turnsLeft: turns,
    source: effect.source || null,
  };

  ent.statuses = ent.statuses || [];
  ent.statuses.push(copy);
}

/**
 * Start-of-turn effects:
 * - Apply DOT damage
 * - Check stun
 * Returns { skipped, died }
 */
export function applyStartOfTurnStatuses(state, ent) {
  if (!ent) return { skipped: false, died: false };

  let died = false;

  // DOT damage
  for (const st of ent.statuses || []) {
    if (!st || st.type !== "dot" || st.turnsLeft <= 0) continue;

    const dmg = Number(st.value) || 0;
    if (dmg > 0) {
      const before = ent.hp || 0;
      ent.hp = clampHP(before - dmg, ent.maxHP || before);

      // safe log push
      state.log = state.log || [];
      state.log.push(
        `${ent.name || ent.id || "Target"} suffers ${dmg} damage from ${st.id}. (${ent.hp}/${ent.maxHP})`
      );

      if (before > 0 && ent.hp <= 0) {
        died = true;
        if (isEnemy(ent)) {
          // mark pending enemy death for upstream handling
          state._pendingEnemyDeath = state._pendingEnemyDeath || [];
          state._pendingEnemyDeath.push(ent);
        } else {
          state.over = true;
          state.result = "loss";
          state.log.push(`${ent.name || "You"} succumbed to ${st.id}...`);
        }
      }
    }
  }

  if (died) return { skipped: false, died: true };

  // Stun check
  const stunned = (ent.statuses || []).some(
    s => s && s.type === "stun" && s.turnsLeft > 0
  );
  if (stunned) {
    state.log = state.log || [];
    state.log.push(`${ent.name || ent.id || "Target"} is stunned and cannot act!`);
    return { skipped: true, died: false };
  }

  return { skipped: false, died: false };
}

/**
 * Decrease status duration, remove expired.
 * Then recompute stats.
 */
export function decayStatusesForEntity(state, ent) {
  if (!ent || !Array.isArray(ent.statuses)) return;

  for (const s of ent.statuses) {
    s.turnsLeft = Math.max(0, (Number(s.turnsLeft) || 0) - 1);
  }

  ent.statuses = ent.statuses.filter(s => s.turnsLeft > 0);

  // Recompute derived stats after buffs/debuffs change
  recomputeDerivedWithStatuses(ent, state);
}

/**
 * Recompute combat values based on statuses.
 * - Player recalculates from stats + equip
 * - Enemy recalculates from _base
 *
 * Supports modifiers that target:
 * - Base stats (STR/DEX/MAG/CON etc) by using the ent.stats path.
 * - Derived stats (atk, def, mAtk, mDef, maxHP, maxMP) directly via status.stat = "mDef" etc.
 *
 * The 'state' parameter is optional and, if provided, may contain helper functions:
 * - state.deriveFromStats(stats, level)
 * - state.applyEquipmentToDerived(derived, equipped)
 *
 * If those helpers aren't present we fall back to a local derive implementation.
 */
export function recomputeDerivedWithStatuses(ent, state = null) {
  if (!ent) return;

  // local fallback derive function (same formula used elsewhere)
  function deriveCombatFromStatsFallback(stats = {}, level = 1) {
    const STR = Number.isFinite(Number(stats.STR)) ? Number(stats.STR) : 0;
    const DEX = Number.isFinite(Number(stats.DEX)) ? Number(stats.DEX) : 0;
    const MAG = Number.isFinite(Number(stats.MAG)) ? Number(stats.MAG) : 0;
    const CON = Number.isFinite(Number(stats.CON)) ? Number(stats.CON) : 0;

    const atk   = 2 + STR * 2 + Math.floor(level / 2);
    const def   = 1 + Math.floor((CON + DEX) / 2);
    const maxHP = 20 + CON * 8 + level * 2;
    const maxMP = 5 + MAG * 5 + Math.floor(level / 2);
    const mAtk  = 2 + MAG * 2 + Math.floor(level / 2);
    const mDef  = 1 + Math.floor((MAG + CON) / 2);

    return { atk, def, maxHP, maxMP, mAtk, mDef };
  }

  // PLAYER TYPE: uses ent.stats + equipment, plus accepts derived stat modifiers
  if (ent.stats) {
    // collect modifiers that target base stats (STR/DEX/MAG/CON etc) and derived fields separately
    const baseStatMods = {};   // e.g. { STR: +2, MAG: +3 }
    const derivedMods = { atk: 0, def: 0, mAtk: 0, mDef: 0, maxHP: 0, maxMP: 0 };

    for (const s of ent.statuses || []) {
      if (!s || !(s.type === "buff" || s.type === "debuff") || !s.stat) continue;

      const raw = String(s.stat).trim();
      const val = Number(s.value) || 0;
      const up = raw.toUpperCase();
      const low = raw.toLowerCase();

      // Base stats (common tokens)
      if (/^(STR|DEX|MAG|CON|INT|WIS|LUC|CRIT|CRITDMG)$/.test(up)) {
        baseStatMods[up] = (baseStatMods[up] || 0) + val;
        continue;
      }

      // Derived stat mapping (for common variations)
      const map = {
        atk: "atk",
        attack: "atk",
        def: "def",
        defense: "def",
        matk: "mAtk",
        "matk": "mAtk",
        "matkatk": "mAtk",
        "matkat": "mAtk",
        "matk": "mAtk",
        mdef: "mDef",
        "mdef": "mDef",
        "mdefense": "mDef",
        maxhp: "maxHP",
        "maxhp": "maxHP",
        maxmp: "maxMP",
        "maxmp": "maxMP",
      };

      const mapped = map[low] || null;
      if (mapped && derivedMods.hasOwnProperty(mapped)) {
        derivedMods[mapped] += val;
        continue;
      }

      // If stat looks like an uppercase short token (fallback to base stat)
      if (/^[A-Z]{2,5}$/.test(raw)) {
        baseStatMods[raw] = (baseStatMods[raw] || 0) + val;
        continue;
      }

      // unknown token => ignore
    }

    // Build final base stats by applying baseStatMods onto ent.stats
    const finalStats = { ...(ent.stats || {}) };
    for (const k of Object.keys(baseStatMods)) {
      finalStats[k] = (finalStats[k] || 0) + baseStatMods[k];
    }

    // Derive combat values (use state-provided derive if available, else fallback)
    const deriveFn = (state && typeof state.deriveFromStats === "function") ? state.deriveFromStats : deriveCombatFromStatsFallback;
    const derived = deriveFn(finalStats, ent.level || 1);

    // Apply equipment if helper exists on state, otherwise use derived directly
    const applied = (state && typeof state.applyEquipmentToDerived === "function")
      ? state.applyEquipmentToDerived({ ...derived }, ent.equipped || {})
      : { ...derived };

    // Apply derived stat modifiers (these are absolute additive deltas)
    applied.atk  = (applied.atk  || 0) + (derivedMods.atk  || 0);
    applied.def  = (applied.def  || 0) + (derivedMods.def  || 0);
    applied.mAtk = (applied.mAtk || 0) + (derivedMods.mAtk || 0);
    applied.mDef = (applied.mDef || 0) + (derivedMods.mDef || 0);
    applied.maxHP= (applied.maxHP|| 0) + (derivedMods.maxHP|| 0);
    applied.maxMP= (applied.maxMP|| 0) + (derivedMods.maxMP|| 0);

    // Commit derived values back to entity (clamp hp/mp)
    ent.atk  = applied.atk;
    ent.def  = applied.def;
    ent.mAtk = applied.mAtk;
    ent.mDef = applied.mDef;

    ent.maxHP = Math.max(1, applied.maxHP || 1);
    ent.maxMP = Math.max(0, applied.maxMP || 0);

    ent.hp = Math.min(ent.hp || 0, ent.maxHP);
    ent.mp = Math.min(ent.mp || 0, ent.maxMP);

    return;
  }

  // ENEMY TYPE (unchanged)
  if (ent._base) {
    const base = { ...ent._base };
    const mods = { atk: 0, def: 0, mAtk: 0, mDef: 0, maxHP: 0, maxMP: 0 };

    for (const s of ent.statuses || []) {
      if (s.type !== "buff" && s.type !== "debuff") continue;

      if (s.stat && mods.hasOwnProperty(s.stat)) {
        mods[s.stat] += Number(s.value) || 0;
      } else if (typeof s.value === "number") {
        mods.atk += Number(s.value) || 0;
      }
    }

    ent.atk = Math.max(0, base.atk + mods.atk);
    ent.def = Math.max(0, base.def + mods.def);
    ent.mDef = Math.max(0, base.mDef + mods.mDef);
    ent.maxHP = Math.max(1, base.maxHP + mods.maxHP);
    ent.maxMP = Math.max(0, base.maxMP + mods.maxMP);

    ent.hp = Math.min(ent.hp || 0, ent.maxHP);
    ent.mp = Math.min(ent.mp || 0, ent.maxMP);
  }
}

/**
 * Determine whether an object is an enemy.
 */
export function isEnemy(obj) {
  return obj && (obj._base || obj.expReward !== undefined || obj.drops !== undefined);
}
