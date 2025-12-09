// src/engine/enemyBuilder.js
// --------------------------------------------------
// Enemy template lookup, scaling and runtime construction.
// --------------------------------------------------

/**
 * Configurable growth rates.
 * b2 model:
 * - HP: controlled exponential (capped past lv20)
 * - ATK / mAtk: proportional linear growth
 * - DEF / mDef: weaker proportional linear growth
 * - maxMP: small linear
 * - EXP: linear or exponential mode toggle
 */
const GROWTH = {
  hp: 0.05,
  atk: 0.05,
  mAtk: 0.04,
  def: 0.00,
  mDef: 0.00,
  maxMP: 0.05,
  exp: 0.16
};

const BOSS_EXP_MULT = 1.5;

let EXP_SCALING_MODE = "linear";
let CURRENT_DUNGEON_EXP_MULT = 1.0;

// dungeon-level global (used when set)
let CURRENT_DUNGEON_LEVEL = null;

// --------------------------------------------------
// Setters
// --------------------------------------------------
export function setExpScalingMode(mode) {
  if (mode === "linear" || mode === "exponential") EXP_SCALING_MODE = mode;
}

export function setDungeonExpMultiplier(m) {
  const n = Number(m);
  CURRENT_DUNGEON_EXP_MULT = Number.isFinite(n) ? Math.max(0, n) : 1.0;
}

// set dungeon level used for scaling — when set, this WILL OVERRIDE any explicit -lvX/object.level
export function setDungeonLevel(lv) {
  const n = Number(lv);
  CURRENT_DUNGEON_LEVEL = 50;
}

// --------------------------------------------------
// ID parser: "goblin-lv5" (kept for fallback when dungeon level NOT set)
// --------------------------------------------------
export function parseScaledId(id) {
  if (!id || typeof id !== "string") return null;
  const m = id.match(/^(.+?)[-_]lv(\d+)$/i);
  if (!m) return null;
  return { baseId: m[1], level: Number(m[2]) };
}

// --------------------------------------------------
// Scaling helpers
// --------------------------------------------------
function scaleLinear(base, level, rate) {
  const lv = Number(level) || 1;
  const b = Number(base) || 0;
  if (lv <= 1) return Math.max(0, Math.floor(b));
  return Math.max(1, Math.floor(b * (1 + rate * (lv - 1))));
}

function scaleExponential(base, level, rate) {
  const lv = Number(level) || 1;
  const b = Number(base) || 0;
  if (lv <= 1) return Math.max(0, Math.floor(b));
  const cappedLv = Math.min(lv - 1, 20);
  const factor = Math.pow(1 + rate, cappedLv);
  return Math.max(1, Math.floor(b * factor));
}

function scaleExp(baseExp, level) {
  const b = Number(baseExp) || 0;
  const lv = Number(level) || 1;
  if (lv <= 1 || b <= 0) return Math.max(0, Math.floor(b));
  if (EXP_SCALING_MODE === "exponential") {
    const factor = Math.pow(1 + (GROWTH.exp || 0), lv - 1);
    return Math.max(0, Math.floor(b * factor));
  }
  return Math.max(0, Math.floor(b * (1 + (lv - 1) * (GROWTH.exp || 0))));
}

// --------------------------------------------------
// scaleEnemyTemplate
// --------------------------------------------------
export function scaleEnemyTemplate(baseSpec = {}, level = 1) {
  const lv = Number(level) || 1;

  const bAtk = Number.isFinite(Number(baseSpec.atk)) ? Number(baseSpec.atk) : 1;
  const bDef = Number.isFinite(Number(baseSpec.def)) ? Number(baseSpec.def) : 0;
  const bMAtk = Number.isFinite(Number(baseSpec.mAtk)) ? Number(baseSpec.mAtk) : bAtk;
  const bMDef = Number.isFinite(Number(baseSpec.mDef)) ? Number(baseSpec.mDef) : bDef;
  const bMaxHP = Number.isFinite(Number(baseSpec.maxHP)) ? Number(baseSpec.maxHP) : 10;
  const bMaxMP = Number.isFinite(Number(baseSpec.maxMP)) ? Number(baseSpec.maxMP) : 0;
  const bExp = Number.isFinite(Number(baseSpec.expReward)) ? Number(baseSpec.expReward) : 0;

  const scaledMaxHP = scaleExponential(bMaxHP, lv, GROWTH.hp);
  const scaledMaxMP = scaleLinear(bMaxMP, lv, GROWTH.maxMP);
  const scaledAtk = scaleLinear(bAtk, lv, GROWTH.atk);
  const scaledMAtk = scaleLinear(bMAtk, lv, GROWTH.mAtk);
  const scaledDef = scaleLinear(bDef, lv, GROWTH.def);
  const scaledMDef = scaleLinear(bMDef, lv, GROWTH.mDef);

  let scaledExp = scaleExp(bExp, lv);

  if (baseSpec.boss) scaledExp = Math.floor(scaledExp * BOSS_EXP_MULT);
  scaledExp = Math.floor(scaledExp * (Number(CURRENT_DUNGEON_EXP_MULT) || 1));

  return {
    ...baseSpec,
    maxHP: scaledMaxHP,
    maxMP: scaledMaxMP,
    atk: scaledAtk,
    mAtk: scaledMAtk,
    def: scaledDef,
    mDef: scaledMDef,
    expReward: scaledExp,
    _scaledLevel: lv,
  };
}

// --------------------------------------------------
// Runtime enemy builder
// - STRICT: if CURRENT_DUNGEON_LEVEL is set it always overrides any explicit level.
// - finalId keeps base id when using dungeon level (no -lvX suffix).
// --------------------------------------------------
export function buildEnemyRuntimeFromSource(enemyIdOrArray, enemiesDb = {}) {
  const ids = Array.isArray(enemyIdOrArray) ? enemyIdOrArray.slice() : [enemyIdOrArray];

  const list = ids.map((id) => {
    let rawSpec = {};
    let runtimeLevel = null;
    let finalId = id;

    try {
      // If dungeon level is set -> enforce it (strict override)
      if (Number.isFinite(Number(CURRENT_DUNGEON_LEVEL))) {
        runtimeLevel = Number(CURRENT_DUNGEON_LEVEL);

        if (typeof id === "string") {
          // resolve base template if possible
          rawSpec = enemiesDb?.[id] || {};
          finalId = id; // keep base id (no -lvX)
        } else if (id && typeof id === "object") {
          if (id.baseId) {
            rawSpec = enemiesDb?.[id.baseId] || {};
            rawSpec = { ...rawSpec, ...id };
            finalId = id.id || id.baseId;
          } else {
            // provided object without baseId — treat as direct spec but still scale by dungeon level
            rawSpec = { ...id };
            finalId = id.id || finalId;
          }
        } else {
          rawSpec = {};
        }
      } else {
        // No dungeon-level override: fall back to explicit lvX or object.level if present
        if (typeof id === "string") {
          const parsed = parseScaledId(id);
          if (parsed) {
            rawSpec = enemiesDb?.[parsed.baseId] || {};
            runtimeLevel = parsed.level;
            finalId = `${parsed.baseId}-lv${parsed.level}`;
          } else {
            rawSpec = enemiesDb?.[id] || {};
            finalId = id;
          }
        } else if (id && typeof id === "object") {
          if (id.baseId && Number.isFinite(Number(id.level))) {
            rawSpec = enemiesDb?.[id.baseId] || {};
            runtimeLevel = Number(id.level);
            rawSpec = { ...rawSpec, ...id };
            finalId = id.id || `${id.baseId}-lv${runtimeLevel}`;
          } else if (id.baseId) {
            rawSpec = enemiesDb?.[id.baseId] || {};
            rawSpec = { ...rawSpec, ...id };
            finalId = id.id || id.baseId;
          } else {
            rawSpec = { ...id };
            finalId = id.id || finalId;
          }
        } else {
          rawSpec = {};
        }
      }
    } catch {
      rawSpec = {};
    }

    // Final safety: if runtimeLevel still null and CURRENT_DUNGEON_LEVEL is set, enforce it
    if (runtimeLevel === null && Number.isFinite(Number(CURRENT_DUNGEON_LEVEL))) {
      runtimeLevel = Number(CURRENT_DUNGEON_LEVEL);
    }

    // Scale if needed
    const e = runtimeLevel ? scaleEnemyTemplate(rawSpec, runtimeLevel) : { ...rawSpec };

    const spells = Array.isArray(e.spells) ? e.spells.slice() : [];

    const baseAtk = Number(e.atk) || 1;
    const baseDef = Number(e.def) || 0;
    const baseMDef = Number(e.mDef) || baseDef;
    const baseMAtk = Number(e.mAtk) || baseAtk;
    const baseMaxHP = Number(e.maxHP) || 10;
    const baseMaxMP = Number(e.maxMP) || 0;

    const name = e.name || String(finalId || "Unknown");

    return {
      id: finalId || null,
      name,
      maxHP: baseMaxHP,
      hp: baseMaxHP,
      maxMP: baseMaxMP,
      mp: baseMaxMP,
      atk: baseAtk,
      def: baseDef,
      mAtk: baseMAtk,
      mDef: baseMDef,
      spells,
      expReward: Number(e.expReward) || 0,
      element: e.element,
      elementMods: e.elementMods ? { ...e.elementMods } : undefined,
      drops: Array.isArray(e.drops)
        ? e.drops.map((d) => ({ id: d.id, qty: Number(d.qty) || 0 }))
        : [],
      _deathProcessed: false,
      ai: e.ai || undefined,
      spellWeights: Array.isArray(e.spellWeights)
        ? e.spellWeights.slice()
        : undefined,
      statuses: [],
      _cooldowns: {},
      _base: {
        atk: baseAtk,
        def: baseDef,
        mAtk: baseMAtk,
        mDef: baseMDef,
        maxHP: baseMaxHP,
        maxMP: baseMaxMP,
      },
      boss: e.boss || undefined,
      notes: e.notes || undefined,
      _scaledLevel: e._scaledLevel || undefined,
    };
  });

  return { enemies: list, primary: list[0] || null };
}

export default {
  parseScaledId,
  setExpScalingMode,
  setDungeonExpMultiplier,
  setDungeonLevel,
  scaleEnemyTemplate,
  buildEnemyRuntimeFromSource,
};
