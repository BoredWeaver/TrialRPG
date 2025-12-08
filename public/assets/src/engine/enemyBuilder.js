// src/engine/enemyBuilder.js
// --------------------------------------------------
// Enemy template lookup, scaling and runtime construction.
// Extracted from engine.js to keep responsibilities separated.
// Exported functions:
//   parseScaledId(id)
//   setExpScalingMode(mode)
//   setDungeonExpMultiplier(m)
//   scaleEnemyTemplate(baseSpec, level)
//   buildEnemyRuntimeFromSource(enemyIdOrArray, enemiesDb)
// --------------------------------------------------

/**
 * Configurable growth rates. These are tuned to:
 * - HP: exponential growth to keep higher-level encounters feel significantly tougher
 * - ATK / mAtk: linear growth
 * - DEF / mDef: small linear growth
 * - maxMP: small linear growth
 * - EXP: configurable linear or exponential mode
 */
const GROWTH = {
  hp: 0.10,      // used as exponent base (1 + hp)
  atk: 0.06,     // linear per level
  mAtk: 0.08,    // linear per level (casters scale faster)
  def: 0.04,     // linear per level
  mDef: 0.04,
  maxMP: 0.05,
  exp: 0.16      // linear fraction per level if linear mode used
};

const BOSS_EXP_MULT = 1.5;

let EXP_SCALING_MODE = "linear"; // "linear" or "exponential"
let CURRENT_DUNGEON_EXP_MULT = 1.0;

// Setters
export function setExpScalingMode(mode) {
  if (mode === "linear" || mode === "exponential") EXP_SCALING_MODE = mode;
}
export function setDungeonExpMultiplier(m) {
  const n = Number(m);
  CURRENT_DUNGEON_EXP_MULT = Number.isFinite(n) ? Math.max(0, n) : 1.0;
}

// parseScaledId: recognizes 'goblin-lv5' or 'goblin_lv5'
export function parseScaledId(id) {
  if (!id || typeof id !== "string") return null;
  const m = id.match(/^(.+?)[-_]lv(\d+)$/i);
  if (!m) return null;
  return { baseId: m[1], level: Number(m[2]) };
}

// Linear scaling helper
function scaleLinear(base, level, rate) {
  const lv = Number(level) || 1;
  const b = Number(base) || 0;
  if (!Number.isFinite(b) || lv <= 1) return Math.max(0, Math.floor(b));
  // simple linear increment for each level beyond 1
  return Math.max(0, Math.floor(b + (lv - 1) * (b * (rate || 0))));
}

// Exponential scaling helper (for HP)
function scaleExponential(base, level, rate) {
  const lv = Number(level) || 1;
  const b = Number(base) || 0;
  if (!Number.isFinite(b) || lv <= 1) return Math.max(0, Math.floor(b));
  const factor = Math.pow(1 + (rate || 0), lv - 1);
  return Math.max(0, Math.floor(b * factor));
}

// EXP scaling
// Note: preserve zero EXP if baseExp is zero (some templates intentionally give 0).
function scaleExp(baseExp, level) {
  const b = Number(baseExp) || 0;
  const lv = Number(level) || 1;
  if (lv <= 1 || b <= 0) return Math.max(0, Math.floor(b));
  if (EXP_SCALING_MODE === "exponential") {
    const factor = Math.pow(1 + (GROWTH.exp || 0), lv - 1);
    return Math.max(0, Math.floor(b * factor));
  }
  // linear
  return Math.max(0, Math.floor(b * (1 + (lv - 1) * (GROWTH.exp || 0))));
}

/**
 * scaleEnemyTemplate(baseSpec, level)
 * - HP uses exponential scaling controlled by GROWTH.hp
 * - Atk/mAtk use linear scaling
 * - Def/mDef small linear scaling
 * - maxMP small linear scaling
 * - Exp scales by mode and uses boss/dungeon multipliers
 */
export function scaleEnemyTemplate(baseSpec = {}, level = 1) {
  const bAtk = Number.isFinite(Number(baseSpec.atk)) ? Number(baseSpec.atk) : 1;
  const bDef = Number.isFinite(Number(baseSpec.def)) ? Number(baseSpec.def) : 0;
  const bMAtk = Number.isFinite(Number(baseSpec.mAtk)) ? Number(baseSpec.mAtk) : bAtk;
  const bMDef = Number.isFinite(Number(baseSpec.mDef)) ? Number(baseSpec.mDef) : bDef;
  const bMaxHP = Number.isFinite(Number(baseSpec.maxHP)) ? Number(baseSpec.maxHP) : 10;
  const bMaxMP = Number.isFinite(Number(baseSpec.maxMP)) ? Number(baseSpec.maxMP) : 0;
  const bExp = Number.isFinite(Number(baseSpec.expReward)) ? Number(baseSpec.expReward) : 0;

  const scaledMaxHP = scaleExponential(bMaxHP, level, GROWTH.hp);
  const scaledMaxMP = scaleLinear(bMaxMP, level, GROWTH.maxMP);
  const scaledAtk = scaleLinear(bAtk, level, GROWTH.atk);
  const scaledMAtk = scaleLinear(bMAtk, level, GROWTH.mAtk);
  const scaledDef = scaleLinear(bDef, level, GROWTH.def);
  const scaledMDef = scaleLinear(bMDef, level, GROWTH.mDef);

  let scaledExp = scaleExp(bExp, level);

  if (baseSpec.boss) scaledExp = Math.max(0, Math.floor(scaledExp * BOSS_EXP_MULT));
  scaledExp = Math.max(0, Math.floor(scaledExp * (Number(CURRENT_DUNGEON_EXP_MULT) || 1)));

  const out = {
    ...baseSpec,
    maxHP: scaledMaxHP,
    maxMP: scaledMaxMP,
    atk: scaledAtk,
    mAtk: scaledMAtk,
    def: scaledDef,
    mDef: scaledMDef,
    expReward: scaledExp,
    _scaledLevel: Number(level) || 1,
  };

  return out;
}

/**
 * buildEnemyRuntimeFromSource(enemyIdOrArray, enemiesDb)
 * - enemiesDb: the JSON map (passed from engine)
 *
 * Supports:
 * - id string referencing enemiesDb
 * - 'id-lvN' string to scale by N
 * - object { baseId, level, ... } to provide overrides
 * - direct object enemy spec
 *
 * Returns: { enemies: [...runtimeEnemies], primary: first }
 */
export function buildEnemyRuntimeFromSource(enemyIdOrArray, enemiesDb = {}) {
  const ids = Array.isArray(enemyIdOrArray) ? enemyIdOrArray.slice() : [enemyIdOrArray];

  const list = ids.map((id) => {
    let rawSpec = {};
    let runtimeLevel = null;
    let finalId = id;

    try {
      if (typeof id === "string") {
        const parsed = parseScaledId(id);
        if (parsed) {
          rawSpec = (typeof enemiesDb === "object" && enemiesDb && enemiesDb[parsed.baseId]) ? enemiesDb[parsed.baseId] : {};
          runtimeLevel = parsed.level;
          finalId = `${parsed.baseId}-lv${parsed.level}`;
        } else {
          rawSpec = (typeof enemiesDb === "object" && enemiesDb && enemiesDb[id]) ? enemiesDb[id] : {};
          finalId = id;
        }
      } else if (id && typeof id === "object") {
        if (id.baseId && Number.isFinite(Number(id.level))) {
          rawSpec = (typeof enemiesDb === "object" && enemiesDb && enemiesDb[id.baseId]) ? enemiesDb[id.baseId] : {};
          runtimeLevel = Number(id.level);
          rawSpec = { ...rawSpec, ...id };
          finalId = id.id || `${id.baseId}-lv${runtimeLevel}`;
        } else {
          // direct spec object
          rawSpec = { ...id };
          finalId = id.id || finalId;
        }
      } else {
        rawSpec = {};
      }
    } catch (err) {
      rawSpec = {};
    }

    // Scale if needed
    const e = runtimeLevel ? scaleEnemyTemplate(rawSpec, runtimeLevel) : { ...rawSpec };

    const spells = Array.isArray(e.spells) ? e.spells.slice() : [];

    const baseAtk = Number.isFinite(Number(e.atk)) ? Number(e.atk) : 1;
    const baseDef = Number.isFinite(Number(e.def)) ? Number(e.def) : 0;
    const baseMDef = Number.isFinite(Number(e.mDef)) ? Number(e.mDef) : (Number.isFinite(Number(e.def)) ? Number(e.def) : 0);
    const baseMAtk = Number.isFinite(Number(e.mAtk)) ? Number(e.mAtk) : baseAtk;
    const baseMaxHP = Number.isFinite(Number(e.maxHP)) ? Number(e.maxHP) : 10;
    const baseMaxMP = Number.isFinite(Number(e.maxMP)) ? Number(e.maxMP) : 0;

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
      expReward: Number.isFinite(Number(e.expReward)) ? Number(e.expReward) : 0,
      element: e.element,
      elementMods: e.elementMods ? { ...e.elementMods } : undefined,
      drops: Array.isArray(e.drops) ? e.drops.map(d => ({ id: d.id, qty: Number(d.qty) || 0 })) : [],
      _deathProcessed: false,
      ai: e.ai || undefined,
      spellWeights: Array.isArray(e.spellWeights) ? e.spellWeights.slice() : undefined,
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

// default export (optional)
export default {
  parseScaledId,
  setExpScalingMode,
  setDungeonExpMultiplier,
  scaleEnemyTemplate,
  buildEnemyRuntimeFromSource
};
