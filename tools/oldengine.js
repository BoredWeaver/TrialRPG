// src/engine/engine.js
// --------------------
// Pure (non-mutating) combat engine with elemental modifiers + multi-enemy support.
// Public functions accept a state (or build a fresh one) and return a new state object.
// NOTE: this file tries to be a minimal refactor of your previous logic to avoid
// behavioral changes while removing in-place mutation.

import playerBase from "../db/player.json";
import { loadProgress, applyProgress } from "../state/playerProgress.js";
import { emit } from "../state/gameEvents.js"; // using the tiny local emitter

import { applyExpGain } from "../state/progression.js";

import enemies from "../db/enemies.json";
import itemsCatalog from "../db/items.json";
import spellsCatalog from "../db/spells.json";

const ITEM_MAP = itemsCatalog;
const SPELL_MAP = spellsCatalog;

const DEFAULT_ENEMY_ID = "goblin";
const LOG_TAIL = 50; // keep last N log lines

/* ===========================================================
   Lightweight "next state" preparer
   - produce a new shallow-root state that isolates the
     parts we mutate: player, enemies array (each enemy),
     enemy (singular), and log array.
   - keeps everything else by reference.
   =========================================================== */
function prepareNextState(prev = {}) {
  const next = { ...prev };

  // clone player shallowly (we mutate player.* fields)
  next.player = { ...(prev.player || {}) };

  // normalize and shallow-clone enemies
  if (Array.isArray(prev.enemies) && prev.enemies.length > 0) {
    next.enemies = prev.enemies.map(e => ({ ...(e || {}) }));
    next.enemy = next.enemies[0] ? { ...next.enemies[0] } : null;
  } else if (prev.enemy) {
    // keep both forms for backward compatibility
    next.enemies = [{ ...(prev.enemy || {}) }];
    next.enemy = { ...(prev.enemy || {}) };
  } else {
    next.enemies = [];
    next.enemy = null;
  }

  // clone log array (we push/pop)
  next.log = Array.isArray(prev.log) ? prev.log.slice() : [];

  // other fields (turn, over, etc.) are kept by value in next = {...prev}
  return next;
}

/* ===========================================================
   (legacy deepClone kept only as a fallback for callers that
   might still supply external raw objects)
   =========================================================== */
function deepCloneFallback(obj) {
  if (typeof structuredClone === "function") {
    try {
      return structuredClone(obj);
    } catch (e) {
      // fall through
    }
  }
  try {
    return JSON.parse(JSON.stringify(obj));
  } catch {
    return { ...(obj || {}) };
  }
}

/* ===========================================================
   Crit system configuration
   =========================================================== */
const CRIT_CONFIG = {
  BASE_CRIT_CHANCE: 0.05,
  DEX_TO_CHANCE: 0.004,
  MAX_CRIT_CHANCE: 0.5,
  BASE_CRIT_MULT: 1.5,
  CRITDMG_TO_MULT: 0.01,
  MAX_CRIT_MULT: 3.0,
};

/* ===========================================================
   Element helpers
   =========================================================== */
function getElementMultiplierForEnemy(enemy, element) {
  if (!element) return 1.0;
  if (!enemy || typeof enemy !== "object") return 1.0;
  const mods = enemy.elementMods || {};
  const m = mods[element];

  if (m !== undefined) {
    console.debug("[ELEM lookup] enemy:", enemy?.id || enemy?.name, "element:", element, "mods:", enemy?.elementMods);
  } else {
    console.debug("[ELEM lookup] enemy:", enemy?.id || enemy?.name, "element:", element, "no specific mod -> default 1.0");
  }

  if (typeof m === "number") return m;
  if (typeof m === "string" && m.trim() !== "") {
    const parsed = Number(m);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 1.0;
}

function applyElementalMultiplier(baseDamage, element, enemy) {
  const mult = getElementMultiplierForEnemy(enemy, element);
  const raw = Math.floor(baseDamage * mult);
  const final = Math.max(1, raw);

  if (mult !== 1) {
    console.debug("[ELEM apply] base:", baseDamage, "element:", element, "enemy:", enemy?.name || enemy?.id, "mult:", mult, "final:", final);
  } else {
    console.debug("[ELEM apply] base:", baseDamage, "element:", element, "enemy:", enemy?.name || enemy?.id, "final (no mult):", final);
  }

  return { final, mult };
}

/* ===========================================================
   Crit helpers
   =========================================================== */
function clampNumber(n, min, max) {
  const x = Number(n);
  if (!Number.isFinite(x)) return min;
  return Math.max(min, Math.min(max, x));
}

function computeCritChanceFromPlayer(player) {
  const dex = Number.isFinite(Number(player.stats?.DEX)) ? Number(player.stats.DEX) : 0;
  const flatFromStats = Number.isFinite(Number(player.stats?.CRIT)) ? Number(player.stats.CRIT) : 0; // percent points
  const flatDecimal = flatFromStats * 0.01;
  const raw = CRIT_CONFIG.BASE_CRIT_CHANCE + dex * CRIT_CONFIG.DEX_TO_CHANCE + flatDecimal;
  return clampNumber(raw, 0, CRIT_CONFIG.MAX_CRIT_CHANCE);
}

function computeCritMultiplierFromPlayer(player) {
  const critDmg = Number.isFinite(Number(player.stats?.CRITDMG)) ? Number(player.stats.CRITDMG) : 0; // percent points
  const raw = CRIT_CONFIG.BASE_CRIT_MULT + critDmg * CRIT_CONFIG.CRITDMG_TO_MULT;
  return clampNumber(raw, 1, CRIT_CONFIG.MAX_CRIT_MULT);
}

function canItemCrit(spec) {
  if (!spec || typeof spec !== "object") return false;
  if (Object.prototype.hasOwnProperty.call(spec, "canCrit")) {
    return !!spec.canCrit;
  }
  return true;
}
function canSpellCrit(spell) {
  if (!spell || typeof spell !== "object") return false;
  if (Object.prototype.hasOwnProperty.call(spell, "canCrit")) {
    return !!spell.canCrit;
  }
  return true;
}

/* ===========================================================
   Utility: normalize enemy source into runtime enemy objects
   =========================================================== */
function buildEnemyRuntimeFromSource(enemyIdOrArray) {
  const ids = Array.isArray(enemyIdOrArray) ? enemyIdOrArray.slice() : [enemyIdOrArray];

  const list = ids.map((id) => {
    const e = (typeof id === "string" ? enemies[id] : null) || {};
    return {
      id: id || null,
      name: e.name || String(id || "Unknown"),
      maxHP: Number.isFinite(Number(e.maxHP)) ? Number(e.maxHP) : 10,
      hp: Number.isFinite(Number(e.maxHP)) ? Number(e.maxHP) : 10,
      atk: Number.isFinite(Number(e.atk)) ? Number(e.atk) : 1,
      def: Number.isFinite(Number(e.def)) ? Number(e.def) : 0,
      mDef: Number.isFinite(Number(e.mDef))
        ? Number(e.mDef)
        : (Number.isFinite(Number(e.def)) ? Number(e.def) : 0),
      expReward: Number.isFinite(Number(e.expReward)) ? Number(e.expReward) : 0,
      element: e.element,
      elementMods: e.elementMods ? { ...e.elementMods } : undefined,
      drops: Array.isArray(e.drops) ? e.drops.map(d => ({ id: d.id, qty: Number(d.qty) || 0 })) : [],
      _deathProcessed: false,
    };
  });

  return { enemies: list, primary: list[0] || null };
}

/* ===========================================================
   Helpers for enemy access (single or multi)
   - NOTE: these operate on the state passed in (which should be a clone)
   =========================================================== */
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

/* ===========================================================
   Non-mutating public API helpers:
   - Each exported function prepares a new shallow-cloned state,
     mutates that clone, and returns it.
   =========================================================== */

/* ----------------- state construction ----------------- */
export function startBattle(enemyIdOrArray = DEFAULT_ENEMY_ID) {
  console.debug("[START] startBattle:", enemyIdOrArray);
  const player = buildPlayerFromBase(playerBase);

  const { enemies: runtimeEnemies, primary } = buildEnemyRuntimeFromSource(enemyIdOrArray);

  const state = {
    enemyId: Array.isArray(enemyIdOrArray) ? (enemyIdOrArray[0] || DEFAULT_ENEMY_ID) : (enemyIdOrArray || DEFAULT_ENEMY_ID),
    player,
    enemies: runtimeEnemies,
    enemy: primary ? { ...primary } : null,
    turn: "player",
    over: false,
    result: null,
    log: [`A wild ${primary ? primary.name : "enemy"} appears! ${player.name} prepares for battle.`],
  };

  console.debug("[START] built battle:", {
    enemyCount: state.enemies.length,
    first: state.enemies[0]?.name,
    playerName: player.name,
  });

  return state;
}
export function resetBattle(enemyIdOrArray = DEFAULT_ENEMY_ID) {
  return startBattle(enemyIdOrArray);
}

/* ===========================================================
   Derived combat from stats (pure)
   =========================================================== */
function deriveCombatFromStats(stats = {}, level = 1) {
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

/* ===========================================================
   Equipment helpers (pure)
   =========================================================== */
function applyEquipmentToStats(baseStats = {}, equipped = {}) {
  const out = { ...(baseStats || {}) };
  if (!equipped || typeof equipped !== "object") return out;
  for (const slot of Object.keys(equipped)) {
    const id = equipped[slot];
    if (!id) continue;
    const spec = ITEM_MAP[id];
    if (!spec || spec.kind !== "equipment") continue;
    const bonus = spec.bonus || {};
    if (bonus.stats && typeof bonus.stats === "object") {
      for (const k of Object.keys(bonus.stats)) {
        const add = Number(bonus.stats[k]) || 0;
        out[k] = (out[k] || 0) + add;
      }
    }
  }
  return out;
}

function applyEquipmentToDerived(derived = {}, equipped = {}) {
  const out = { ...(derived || {}) };
  if (!equipped || typeof equipped !== "object") return out;
  for (const slot of Object.keys(equipped)) {
    const id = equipped[slot];
    if (!id) continue;
    const spec = ITEM_MAP[id];
    if (!spec || spec.kind !== "equipment") continue;
    const bonus = spec.bonus || {};
    if (Number.isFinite(Number(bonus.atk)))   out.atk   += Number(bonus.atk);
    if (Number.isFinite(Number(bonus.def)))   out.def   += Number(bonus.def);
    if (Number.isFinite(Number(bonus.mAtk)))  out.mAtk  += Number(bonus.mAtk);
    if (Number.isFinite(Number(bonus.maxHP))) out.maxHP += Number(bonus.maxHP);
    if (Number.isFinite(Number(bonus.maxMP))) out.maxMP += Number(bonus.maxMP);
    if (Number.isFinite(Number(bonus.mDef)))  out.mDef  += Number(bonus.mDef);
  }
  return out;
}

/* ===========================================================
   Player build & recompute (pure)
   =========================================================== */
function buildPlayerFromBase(base) {
  const progress = loadProgress();
  const merged = applyProgress(base, progress);

  const baseStats = { ...(merged.stats || {}) };
  const statsWithEquip = applyEquipmentToStats(baseStats, merged.equipped);
  const level = merged.level ?? 1;
  const derivedBefore = deriveCombatFromStats(statsWithEquip, level);
  const derived = applyEquipmentToDerived({ ...derivedBefore }, merged.equipped);

  console.debug("[PLAYER build] name:", merged.name ?? base.name, "level:", level, "atk:", derived.atk, "mAtk:", derived.mAtk, "maxHP:", derived.maxHP, "maxMP:", derived.maxMP);

  return {
    name: merged.name ?? base.name,
    stats: statsWithEquip,
    level,
    exp: merged.exp ?? 0,
    unspentPoints: merged.unspentPoints ?? 0,

    atk: derived.atk,
    def: derived.def,
    maxHP: derived.maxHP,
    maxMP: derived.maxMP,
    mAtk: derived.mAtk,
    mDef: derived.mDef,

    hp: derived.maxHP,
    mp: derived.maxMP,

    spells: Array.isArray(merged.spellbook) ? [...merged.spellbook]
            : Array.isArray(merged.spells) ? [...merged.spells]
            : Array.isArray(base.spellbook) ? [...base.spellbook]
            : [],

    items: { ...(merged.inventory ?? merged.items ?? base.inventory ?? {}) },
    inventory: { ...(merged.inventory ?? merged.items ?? base.inventory ?? {}) },

    gold: Number.isFinite(Number(merged.gold)) ? Number(merged.gold) : (base.gold || 0),

    equipped: { ...(merged.equipped || {}) },
  };
}
// src/engine/engine.js
// ... (top of the file unchanged) ...

/* ===========================================================
   Player build & recompute (pure)
   =========================================================== */
// ... existing functions unchanged ...

function recomputeDerivedAndHeal(player) {
  const d = deriveCombatFromStats(player.stats, player.level);
  const applied = applyEquipmentToDerived({ ...d }, player.equipped || {});
  player.atk = applied.atk;
  player.def = applied.def;
  player.maxHP = applied.maxHP;
  player.maxMP = applied.maxMP;
  player.mAtk = applied.mAtk;
  player.mDef = applied.mDef;
  player.hp = player.maxHP;
  player.mp = player.maxMP;
}

/**
 * recomputeDerivedPreserveHP
 * Recompute derived stats but preserve current HP/MP (clamped to new max).
 */
function recomputeDerivedPreserveHP(player) {
  const beforeHP = Number.isFinite(Number(player.hp)) ? Number(player.hp) : 0;
  const beforeMP = Number.isFinite(Number(player.mp)) ? Number(player.mp) : 0;
  const d = deriveCombatFromStats(player.stats, player.level);
  const applied = applyEquipmentToDerived({ ...d }, player.equipped || {});
  player.atk = applied.atk;
  player.def = applied.def;
  player.maxHP = applied.maxHP;
  player.maxMP = applied.maxMP;
  player.mAtk = applied.mAtk;
  player.mDef = applied.mDef;
  // preserve HP/MP but clamp to new maxima
  player.hp = Math.min(beforeHP, player.maxHP);
  player.mp = Math.min(beforeMP, player.maxMP);
}

/* ===========================================================
   EXP curve & leveling (mutates local state)
   =========================================================== */
/* ===========================================================
   EXP + LEVELING NOW HANDLED BY progression.js
   -----------------------------------------------------------
   Engine no longer calculates EXP thresholds or level-ups.
   It simply notifies progression.js to update stored progress.
   =========================================================== */
function grantExpAndMaybeLevelUp(state, amount) {
  if (amount <= 0) return;

  // UI log for battle
  addLog(state, `Gained ${amount} EXP.`);

  // remember previous level to detect real level-ups
  const prevLevel = Number.isFinite(Number(state.player?.level)) ? Number(state.player.level) : 1;

  // progression.js handles EXP, level-ups, saving, and pending choices
  const result = applyExpGain(amount);
  const updated = result?.progress || null;

  if (updated) {
    // Sync battle's player with updated persistent progress
    state.player.level = updated.level;
    state.player.exp = updated.exp;
    state.player.unspentPoints = updated.unspentPoints;
    state.player.stats = { ...updated.stats };
    state.player.spells = Array.isArray(updated.spells) ? [...updated.spells] : [];
    state.player.gold = updated.gold ?? state.player.gold;
    state.player.equipped = { ...(updated.equipped || {}) };

    // Only fully recompute + heal when the level actually increased
    const newLevel = Number.isFinite(Number(updated.level)) ? Number(updated.level) : prevLevel;
    if (newLevel > prevLevel) {
      // level up: recompute and heal
      recomputeDerivedAndHeal(state.player);
      addLog(state, `Level Up! You are now level ${updated.level}.`);
    } else {
      // no level change: recompute derived stats but preserve HP/MP (clamp to new maxima)
      recomputeDerivedPreserveHP(state.player);
      // don't emit "Level Up!" log
    }
  }
}

 // ... rest of file unchanged (combat actions etc.) ...




/* ===========================================================
   Allocation (mutates local state via prepared clone)
   =========================================================== */
export function allocateStat(state, statKey) {
  const s = prepareNextState(state);
  if (!["STR", "DEX", "MAG", "CON"].includes(statKey)) return s;
  if ((s.player.unspentPoints | 0) <= 0) return s;

  s.player.unspentPoints -= 1;
  s.player.stats[statKey] = (s.player.stats[statKey] | 0) + 1;

  const beforeHP = s.player.hp;
  const beforeMP = s.player.mp;

  const d = deriveCombatFromStats(s.player.stats, s.player.level);
  const applied = applyEquipmentToDerived({ ...d }, s.player.equipped || {});
  s.player.atk = applied.atk;
  s.player.def = applied.def;
  s.player.maxHP = applied.maxHP;
  s.player.maxMP = applied.maxMP;
  s.player.mAtk = applied.mAtk;
  s.player.mDef = applied.mDef;

  s.player.hp = Math.min(beforeHP, s.player.maxHP);
  s.player.mp = Math.min(beforeMP, s.player.maxMP);

  addLog(s, `Allocated +1 ${statKey}.`);
  return s;
}

/* ===========================================================
   Core math helpers
   =========================================================== */
function calcDamage(atk, def) {
  return Math.max(1, atk - def);
}

function clampHP(n, max) {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(max, Math.floor(x)));
}
function clampMP(n, max) {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(max, Math.floor(x)));
}

function addLog(state, line) {
  state.log = state.log || [];
  state.log.push(line);
  if (state.log.length > LOG_TAIL) state.log.shift();
}

function canPlayerAct(state) {
  return !state.over && state.turn === "player";
}

/* ===========================================================
   Public UI helpers (pure)
   =========================================================== */
export function getSpells(state) {
  const ids = Array.isArray(state?.player?.spells) ? state.player.spells : [];
  if (!ids || ids.length === 0) return [];

  const out = [];
  for (const id of ids) {
    if (!id) continue;

    // Try direct lookup, then common variants (underscores <-> hyphens)
    let s = SPELL_MAP[id] || SPELL_MAP[String(id).replace(/_/g, "-")] || SPELL_MAP[String(id).replace(/-/g, "_")];

    if (!s) {
      // not found — skip
      continue;
    }

    // Ensure we return a fresh object and include the id & name
    let obj = { id: String(id), ...s, name: s.name || String(id) };

    // Backward-compatible fallback: damage spells without damageType => magical
    if (obj.kind === "damage" && !obj.damageType) {
      obj = { ...obj, damageType: "magical" };
    }

    out.push(obj);
  }

  return out;
}


export function getItems(state) {
  const inv = state.player.items || {};
  const out = [];
  for (const [id, qty] of Object.entries(inv)) {
    const n = Number(qty) | 0;
    if (n > 0 && ITEM_MAP[id]) {
      out.push({ ...ITEM_MAP[id], qty: n });
    }
  }
  out.sort((a, b) => String(a.name).localeCompare(String(b.name)));
  return out;
}

export function canCast(state, spellId) {
  if (!canPlayerAct(state)) return false;
  const spell = SPELL_MAP[spellId];
  if (!spell) return false;
  const mpOK = state.player.mp >= (spell.cost ?? 0);
  if (!mpOK) return false;
  if (spell.kind === "heal") {
    return state.player.hp < state.player.maxHP;
  }
  return true;
}

export function canUseItem(state, itemId) {
  if (!canPlayerAct(state)) return false;
  const spec = ITEM_MAP[itemId];
  if (!spec) return false;
  const hasQty = (state.player.items?.[itemId] || 0) > 0;
  if (!hasQty) return false;
  if (spec.kind === "heal") return state.player.hp < state.player.maxHP;
  if (spec.kind === "mana") return state.player.mp < state.player.maxMP;
  return true;
}

/* ===========================================================
   Internal helpers that mutate the provided (cloned) state
   =========================================================== */

function pruneDeadEnemiesMut(state) {
  if (!Array.isArray(state.enemies)) {
    return;
  }
  const before = state.enemies.length;
  const kept = state.enemies.filter(e => (e.hp || 0) > 0);
  state.enemies = kept;
  state.enemy = kept.length > 0 ? { ...kept[0] } : null;
  const after = kept.length;
  if (before !== after) {
    console.debug(`[PRUNE] removed ${before - after} dead enemy(ies); remaining: ${after}`);
  }
}

function onEnemyDeathMut(state, enemy) {
  if (!enemy || enemy._deathProcessed) return;
  enemy._deathProcessed = true;

  addLog(state, `${enemy.name} falls!`);

  const exp = enemy.expReward || 0;
  if (exp > 0) {
    grantExpAndMaybeLevelUp(state, exp);
    console.debug("[DEATH] awarded exp:", exp, "for", enemy.name);
  } else {
    console.debug("[DEATH] no exp for", enemy.name);
  }

  if (Array.isArray(enemy.drops) && enemy.drops.length > 0) {
    for (const d of enemy.drops) {
      if (!d || !d.id) continue;
      const qty = Number.isFinite(Number(d.qty)) ? Number(d.qty) : 0;
      if (qty <= 0) continue;
      let itemId=d.id;
      console.log(d);
      emit("collect", {itemId,qty });
      
      state.player.items = state.player.items || {};
      state.player.items[d.id] = (state.player.items[d.id] || 0) + qty;
      addLog(state, `${enemy.name} dropped ${qty} × ${ITEM_MAP[d.id]?.name || d.id}.`);
      console.debug("[DEATH drop] gave", qty, "x", d.id, "from", enemy.name);
    }
  }
}

/* ===========================================================
   Combat actions (pure public wrappers -> mutate cloned state)
   - use prepareNextState() to keep clones lightweight
   =========================================================== */

/* ---- Basic Attack ---- */
export function playerAttack(state, targetIndex = null) {
  // prefer lightweight clone path; fall back to deep clone if input is not shape-compatible
  const s = (state && state.player && (Array.isArray(state.enemies) || state.enemy)) ? prepareNextState(state) : deepCloneFallback(state);
  if (!canPlayerAct(s)) return s;

  // normalize enemies list already prepared by prepareNextState
  s.enemies = Array.isArray(s.enemies) ? s.enemies.map(e => ({ ...(e || {}) })) : (s.enemy ? [{ ...s.enemy }] : []);
  s.enemy = s.enemies[0] ? { ...s.enemies[0] } : null;

  const list = getEnemiesList(s);
  const idx = (targetIndex == null) ? list.findIndex(e => (e.hp || 0) > 0) : targetIndex;
  const target = getEnemyByIndex(s, idx);
  if (!target) {
    console.debug("[ATTACK] no valid target");
    return s;
  }

  const prevHp = target.hp || 0;
  const base = Math.max(1, s.player.atk - target.def);
  const { final: elemDmg, mult } = applyElementalMultiplier(base, "physical", target);

  // crit
  const chance = computeCritChanceFromPlayer(s.player);
  const critMult = computeCritMultiplierFromPlayer(s.player);
  const isCrit = Math.random() < chance;
  const rawAfterCrit = isCrit ? Math.floor(elemDmg * critMult) : elemDmg;
  const dmg = Math.max(1, rawAfterCrit);

  // apply damage
  target.hp = clampHP(prevHp - dmg, target.maxHP);

  console.debug("[ATTACK] player.atk:", s.player.atk, "target:", target.name, "def:", target.def, "dmg:", dmg, "elemMult:", mult, "isCrit:", isCrit, "critMult:", critMult, "hpNow:", target.hp);

  const multNote = mult !== 1 ? ` (×${mult})` : "";
  const critNote = isCrit ? ` CRIT ×${critMult}` : "";
  addLog(s, `${s.player.name} attacks ${target.name} for ${dmg} physical damage${multNote}${critNote}. (${target.name} HP ${target.hp}/${target.maxHP})`);

  if (prevHp > 0 && (target.hp || 0) <= 0) {
    onEnemyDeathMut(s, target);
  }

  pruneDeadEnemiesMut(s);

  checkEndMut(s);
  if (!s.over) s.turn = "enemy";
  return s;
}

/* ---- Cast ---- */
export function playerCast(state, spellId, targetIndex = null) {
  const s = (state && state.player && (Array.isArray(state.enemies) || state.enemy)) ? prepareNextState(state) : deepCloneFallback(state);
  if (!canPlayerAct(s)) return s;
  const spell = SPELL_MAP[spellId];
  console.debug("[CAST] casting:", spellId, "spell:", spell);
  if (!spell) return s;
  if (!canCast(s, spellId)) return s;

  s.player.mp = clampMP(s.player.mp - (spell.cost || 0), s.player.maxMP);
  addLog(s, `${s.player.name} spends ${spell.cost || 0} MP (MP ${s.player.mp}/${s.player.maxMP}).`);

  if (spell.kind === "damage") {
    const type = spell.damageType === "physical" ? "physical" : "magical";
    const elem = spell.element || (type === "physical" ? "physical" : "magical");
    const isAoe = (spell.target === "aoe" || spell.aoe === true);

    // ensure enemies array exists and are clones
    s.enemies = Array.isArray(s.enemies) ? s.enemies.map(e => ({ ...(e || {}) })) : (s.enemy ? [{ ...s.enemy }] : []);
    s.enemy = s.enemies[0] ? { ...s.enemies[0] } : null;

    if (isAoe) {
      const enemiesList = getEnemiesList(s);
      for (let i = 0; i < enemiesList.length; i++) {
        const en = enemiesList[i];
        if (!en || (en.hp || 0) <= 0) continue;
        const prevHp = en.hp || 0;

        if (type === "physical") {
          const base = Math.max(1, s.player.atk - en.def);
          const scaled = Math.max(1, Math.floor(base * (spell.powerMult ?? 1)));
          const { final: elemDmg, mult } = applyElementalMultiplier(scaled, elem, en);

          const chance = computeCritChanceFromPlayer(s.player);
          const critMult = computeCritMultiplierFromPlayer(s.player);
          const isCrit = Math.random() < chance;
          const rawAfterCrit = isCrit ? Math.floor(elemDmg * critMult) : elemDmg;
          const dmg = Math.max(1, rawAfterCrit);

          en.hp = clampHP(prevHp - dmg, en.maxHP);
          const multNote = mult !== 1 ? ` (×${mult})` : "";
          const critNote = isCrit ? ` CRIT ×${critMult}` : "";
          addLog(s, `${s.player.name} uses ${spell.name} (AOE) on ${en.name} for ${dmg} physical damage${multNote}${critNote}. (${en.name} HP ${en.hp}/${en.maxHP})`);
          console.debug("[CAST AOE physical]", spellId, "target:", en.name, "baseScaled:", scaled, "dmg:", dmg, "mult:", mult);
        } else {
          const enemyMDef = Number.isFinite(Number(en.mDef)) ? Number(en.mDef) : en.def;
          const base = Math.max(1, s.player.mAtk - enemyMDef);
          const scaled = Math.max(1, Math.floor(base * (spell.powerMult ?? 1)));
          const { final: dmg, mult } = applyElementalMultiplier(scaled, elem, en);
          en.hp = clampHP(prevHp - dmg, en.maxHP);
          const multNote = mult !== 1 ? ` (×${mult})` : "";
          addLog(s, `${s.player.name} casts ${spell.name} (AOE) on ${en.name} for ${dmg} magic damage${multNote}. (${en.name} HP ${en.hp}/${en.maxHP})`);
          console.debug("[CAST AOE magical]", spellId, "target:", en.name, "scaled:", scaled, "dmg:", dmg, "mult:", mult);
        }

        if (prevHp > 0 && (en.hp || 0) <= 0) {
          onEnemyDeathMut(s, en);
        }
      }
    } else {
      const target = getEnemyByIndex(s, targetIndex == null ? undefined : targetIndex);
      if (!target) {
        console.debug("[CAST] no valid single target for", spellId);
      } else {
        const prevHp = target.hp || 0;
        if (type === "physical") {
          const base = Math.max(1, s.player.atk - target.def);
          const scaled = Math.max(1, Math.floor(base * (spell.powerMult ?? 1)));
          const { final: elemDmg, mult } = applyElementalMultiplier(scaled, elem, target);

          let isCrit = false;
          let rawAfterCrit = elemDmg;
          if (canSpellCrit(spell) && Math.random() < computeCritChanceFromPlayer(s.player)) {
            isCrit = true;
            rawAfterCrit = Math.floor(elemDmg * computeCritMultiplierFromPlayer(s.player));
          }

          const dmg = Math.max(1, rawAfterCrit);

          target.hp = clampHP(prevHp - dmg, target.maxHP);
          const multNote = mult !== 1 ? ` (×${mult})` : "";
          const critNote = isCrit ? ` CRIT ×${computeCritMultiplierFromPlayer(s.player)}` : "";
          addLog(s, `${s.player.name} uses ${spell.name} on ${target.name} for ${dmg} physical damage${multNote}${critNote}! (${target.name} HP ${target.hp}/${target.maxHP})`);
          console.debug("[CAST single physical]", spellId, "target:", target.name, "scaled:", scaled, "dmg:", dmg, "mult:", mult);
        } else {
          const enemyMDef = Number.isFinite(Number(target.mDef)) ? Number(target.mDef) : target.def;
          const base = Math.max(1, s.player.mAtk - enemyMDef);
          const scaled = Math.max(1, Math.floor(base * (spell.powerMult ?? 1)));
          const { final: dmg, mult } = applyElementalMultiplier(scaled, elem, target);
          target.hp = clampHP(prevHp - dmg, target.maxHP);
          const multNote = mult !== 1 ? ` (×${mult})` : "";
          addLog(s, `${s.player.name} casts ${spell.name} on ${target.name} for ${dmg} magic damage${multNote}! (${target.name} HP ${target.hp}/${target.maxHP})`);
          console.debug("[CAST single magical]", spellId, "target:", target.name, "scaled:", scaled, "dmg:", dmg, "mult:", mult);
        }

        if (prevHp > 0 && (target.hp || 0) <= 0) {
          onEnemyDeathMut(s, target);
        }
      }
    }
  } else if (spell.kind === "heal") {
    const before = s.player.hp;
    const healedTo = clampHP(before + (spell.healAmount ?? 0), s.player.maxHP);
    const gained = healedTo - before;
    s.player.hp = healedTo;
    addLog(s, `${s.player.name} casts ${spell.name} and heals ${gained}. (${s.player.name} HP ${s.player.hp}/${s.player.maxHP})`);
    console.debug("[CAST heal] healed:", gained, "player.hp:", s.player.hp);
  }

  pruneDeadEnemiesMut(s);

  checkEndMut(s);
  if (!s.over) s.turn = "enemy";
  return s;
}

/* ---- Use item ---- */
export function playerUseItem(state, itemId, targetIndex = null) {
  const s = (state && state.player && (Array.isArray(state.enemies) || state.enemy)) ? prepareNextState(state) : deepCloneFallback(state);
  if (!canPlayerAct(s)) return s;
  const spec = ITEM_MAP[itemId];
  if (!spec) return s;
  if (!canUseItem(s, itemId)) return s;

  s.player.items[itemId] = Math.max(0, (s.player.items[itemId] || 0) - 1);
  addLog(s, `${s.player.name} uses ${spec.name}.`);

  if (spec.kind === "heal") {
    const before = s.player.hp;
    const healedTo = clampHP(before + (spec.healAmount ?? 0), s.player.maxHP);
    const gained = healedTo - before;
    s.player.hp = healedTo;
    addLog(s, `Restored ${gained} HP. (${s.player.name} HP ${s.player.hp}/${s.player.maxHP})`);
    console.debug("[ITEM heal] healed:", gained, "player.hp:", s.player.hp);
  } else if (spec.kind === "mana") {
    const before = s.player.mp;
    const to = clampMP(before + (spec.mpAmount ?? 0), s.player.maxMP);
    const gained = to - before;
    s.player.mp = to;
    addLog(s, `Recovered ${gained} MP. (MP ${s.player.mp}/${s.player.maxMP})`);
    console.debug("[ITEM mana] recovered:", gained, "player.mp:", s.player.mp);
  } else if (spec.kind === "damage") {
    const isAoe = (spec.target === "aoe" || spec.aoe === true);
    const elem = spec.element || "physical";

    // ensure enemies array clones
    s.enemies = Array.isArray(s.enemies) ? s.enemies.map(e => ({ ...(e || {}) })) : (s.enemy ? [{ ...s.enemy }] : []);
    s.enemy = s.enemies[0] ? { ...s.enemies[0] } : null;

    if (isAoe) {
      const enemiesList = getEnemiesList(s);
      for (let i = 0; i < enemiesList.length; i++) {
        const en = enemiesList[i];
        if (!en || (en.hp || 0) <= 0) continue;
        const prevHp = en.hp || 0;
        const base = Math.max(1, spec.damage ?? 0);
        const { final: elemDmg, mult } = applyElementalMultiplier(base, elem, en);

        // crit only for physical items
        let dmg = elemDmg;
        if (elem === "physical") {
          let isCrit = false;
          let after = elemDmg;
          if (canItemCrit(spec) && Math.random() < computeCritChanceFromPlayer(s.player)) {
            isCrit = true;
            after = Math.floor(elemDmg * computeCritMultiplierFromPlayer(s.player));
          }
          dmg = Math.max(1, after);

          const multNote = mult !== 1 ? ` (×${mult})` : "";
          const critNote = isCrit ? ` CRIT ×${computeCritMultiplierFromPlayer(s.player)}` : "";
          en.hp = clampHP(prevHp - dmg, en.maxHP);
          addLog(s, `${spec.name} hits ${en.name} for ${dmg} damage${multNote}${critNote}! (${en.name} HP ${en.hp}/${en.maxHP})`);
          console.debug("[ITEM AOE damage]", spec.id || itemId, "target:", en.name, "dmg:", dmg, "mult:", mult);
        } else {
          en.hp = clampHP(prevHp - elemDmg, en.maxHP);
          const multNote = mult !== 1 ? ` (×${mult})` : "";
          addLog(s, `${spec.name} hits ${en.name} for ${elemDmg} damage${multNote}! (${en.name} HP ${en.hp}/${en.maxHP})`);
          console.debug("[ITEM AOE damage magical]", spec.id || itemId, "target:", en.name, "dmg:", elemDmg, "mult:", mult);
        }

        if (prevHp > 0 && (en.hp || 0) <= 0) {
          onEnemyDeathMut(s, en);
        }
      }
    } else {
      const target = getEnemyByIndex(s, targetIndex == null ? undefined : targetIndex);
      if (!target) {
        console.debug("[ITEM] no valid single target for", itemId);
      } else {
        const prevHp = target.hp || 0;
        const base = Math.max(1, spec.damage ?? 0);
        const { final: elemDmg, mult } = applyElementalMultiplier(base, elem, target);

        let dmg = elemDmg;
        if (elem === "physical") {
          const isCrit = Math.random() < computeCritChanceFromPlayer(s.player);
          dmg = Math.max(1, isCrit ? Math.floor(elemDmg * computeCritMultiplierFromPlayer(s.player)) : elemDmg);
          const multNote = mult !== 1 ? ` (×${mult})` : "";
          const critNote = isCrit ? ` CRIT ×${computeCritMultiplierFromPlayer(s.player)}` : "";
          target.hp = clampHP(prevHp - dmg, target.maxHP);
          addLog(s, `${spec.name} deals ${dmg} damage to ${target.name}${multNote}${critNote}! (${target.name} HP ${target.hp}/${target.maxHP})`);
          console.debug("[ITEM single damage]", spec.id || itemId, "target:", target.name, "dmg:", dmg, "mult:", mult);
        } else {
          target.hp = clampHP(prevHp - elemDmg, target.maxHP);
          const multNote = mult !== 1 ? ` (×${mult})` : "";
          addLog(s, `${spec.name} deals ${elemDmg} damage to ${target.name}${multNote}! (${target.name} HP ${target.hp}/${target.maxHP})`);
          console.debug("[ITEM single damage magical]", spec.id || itemId, "target:", target.name, "dmg:", elemDmg, "mult:", mult);
        }

        if (prevHp > 0 && (target.hp || 0) <= 0) {
          onEnemyDeathMut(s, target);
        }
      }
    }
  }

  pruneDeadEnemiesMut(s);

  checkEndMut(s);
  if (!s.over) s.turn = "enemy";
  return s;
}

/* ===========================================================
   Enemy action (pure wrapper -> mutate clone)
   =========================================================== */
export function enemyAct(state) {
  const s = (state && state.player && (Array.isArray(state.enemies) || state.enemy)) ? prepareNextState(state) : deepCloneFallback(state);
  if (s.over || s.turn !== "enemy") return s;

  // ensure enemies clones
  s.enemies = Array.isArray(s.enemies) ? s.enemies.map(e => ({ ...(e || {}) })) : (s.enemy ? [{ ...s.enemy }] : []);
  s.enemy = s.enemies[0] ? { ...s.enemies[0] } : null;

  const enemiesList = getEnemiesList(s);
  console.debug("[ENEMY TURN] count:", enemiesList.length);

  for (let i = 0; i < enemiesList.length; i++) {
    const en = enemiesList[i];
    if (!en || (en.hp || 0) <= 0) continue;

    const dmg = calcDamage(en.atk, s.player.def);
    const beforeHP = s.player.hp;
    s.player.hp = clampHP(beforeHP - dmg, s.player.maxHP);

    addLog(s, `${en.name} hits ${s.player.name} for ${dmg} physical damage. (${s.player.name} HP ${s.player.hp}/${s.player.maxHP})`);
    console.debug("[ENEMY ACT] enemy:", en.name, "atk:", en.atk, "dmg:", dmg, "player.hpNow:", s.player.hp);

    if (s.player.hp <= 0) break;
  }

  pruneDeadEnemiesMut(s);

  checkEndMut(s);
  if (!s.over) {
    s.turn = "player";
    addLog(s, "Your turn.");
  }
  return s;
}

/* ===========================================================
   End conditions & rewards (mutates local state)
   =========================================================== */
function checkEndMut(state) {
  const pDead = state.player.hp <= 0;
  const enemiesList = getEnemiesList(state);
  const aliveCount = enemiesList.filter(e => (e.hp || 0) > 0).length;

  console.debug("[CHECK END] player.hp:", state.player.hp, "aliveEnemies:", aliveCount, "turn:", state.turn);

  if (pDead && aliveCount === 0) {
    state.over = true;
    state.result = "win";
    addLog(state, "Both sides fall — you prevail!");
    console.debug("[CHECK END] both dead -> win");
  } else if (aliveCount === 0) {
    state.over = true;
    state.result = "win";
    addLog(state, "Victory!");
    console.debug("[CHECK END] enemies dead -> win");
  } else if (pDead) {
    state.over = true;
    state.result = "loss";
    addLog(state, "Defeat...");
    console.debug("[CHECK END] player dead -> loss");
  }
}

/* ===========================================================
   Exports for UI helpers remain the same
   =========================================================== */

/* Note: some snapshot/restore helpers in useBattle rely on deriveFromStats/clamp helpers.
   Provide small wrappers with identical semantics. */
function clamp(value, min, max, fallback) {
  const x = Number(value);
  if (!Number.isFinite(x)) return fallback;
  return Math.max(min, Math.min(max, x));
}

function deriveFromStats(stats, level) {
  const STR = stats.STR | 0;
  const DEX = stats.DEX | 0;
  const MAG = stats.MAG | 0;
  const CON = stats.CON | 0;

  return {
    atk:   2 + STR * 2 + Math.floor(level / 2),
    def:   1 + Math.floor((CON + DEX) / 2),
    maxHP: 20 + CON * 8 + level * 2,
    maxMP: 5 + MAG * 5 + Math.floor(level / 2),
    mAtk:  2 + MAG * 2 + Math.floor(level / 2),
    mDef:  1 + Math.floor((MAG + CON) / 2),
  };
}

/* Re-export some helper names used elsewhere */
export { deriveFromStats as deriveCombatFromStatsHelper };
export { deriveFromStats };

