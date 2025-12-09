// src/engine/engine.js
// -----------------------------------------------------------
// Main battle engine – now clean, delegated, and modular.
// Status, cooldown, turn-start, and damage helpers are imported
// from dedicated modules.
// -----------------------------------------------------------

import playerBase from "../db/player.json";
import enemies from "../db/enemies.json";
import itemsCatalog from "../db/items.json";
import spellsCatalog from "../db/spells.json";

import { loadProgress, applyProgress } from "../state/playerProgress.js";
import { applyExpGain } from "../state/progression.js";
import { emit } from "../state/gameEvents.js";

// Imported modules:
import {
  clampHP,
  clampMP,
  calcDamage,
  applyElementalMultiplier,
  computeCritChanceFromPlayer,
  computeCritMultiplierFromPlayer,
  canItemCrit,
  canSpellCrit,
} from "./damage.js";
import {
  performEnemyAction
} from "./enemyAI.js";

import {
  ensureRuntimeFieldsForEntity,
  pushStatusOntoEntity,
  recomputeDerivedWithStatuses,
  isEnemy, decayStatusesForEntity,
} from "./statuses.js";

import {
  tickCooldownsForEntity,
  setCooldownOnEntity,
} from "./cooldowns.js";

import { startUnitTurn } from "./turnStart.js";

// Enemy builder & scaler (extracted)
import {
  parseScaledId,
  setExpScalingMode,
  setDungeonExpMultiplier,
  scaleEnemyTemplate,
  buildEnemyRuntimeFromSource,
  setDungeonLevel,     // <-- ADD THIS
} from "./enemyBuilder.js";

// ------------------------------------------------------------

const ITEM_MAP = itemsCatalog;
const SPELL_MAP = spellsCatalog;

const DEFAULT_ENEMY_ID = "goblin";
const LOG_TAIL = 50;

// ============================================================
// Lightweight next-state preparer
// ============================================================
function prepareNextState(prev = {}) {
  const next = { ...prev };

  next.player = { ...(prev.player || {}) };

  if (Array.isArray(prev.enemies) && prev.enemies.length > 0) {
    next.enemies = prev.enemies.map(e => ({ ...(e || {}) }));
    next.enemy = next.enemies[0] ? { ...next.enemies[0] } : null;
  } else if (prev.enemy) {
    next.enemies = [{ ...(prev.enemy || {}) }];
    next.enemy = { ...(prev.enemy || {}) };
  } else {
    next.enemies = [];
    next.enemy = null;
  }

  next.log = Array.isArray(prev.log) ? prev.log.slice() : [];

  return next;
}

// fallback deep clone
function deepCloneFallback(obj) {
  if (typeof structuredClone === "function") {
    try {
      return structuredClone(obj);
    } catch { }
  }
  try {
    return JSON.parse(JSON.stringify(obj));
  } catch {
    return { ...(obj || {}) };
  }
}

// ============================================================
// Enemy building (delegated to enemyBuilder.js)
// NOTE: engine now calls buildEnemyRuntimeFromSource(id, enemies)
// ============================================================

// ============================================================
// ENHANCEMENTS: summon helpers
// ============================================================

/**
 * spawnSummonsMut(state, sourceEntity, summonSpec)
 *
 * summonSpec supports:
 * - id: "goblin" or "goblin-lv4" or { baseId: "goblin", level: 4 }
 * - count: number (default 1)
 * - level: explicit level (optional) — if provided it overrides other heuristics
 * - levelOffset: number (optional) — relative to sourceEntity._scaledLevel or player.level
 *
 * The spawned enemies are inserted into state.enemies and marked with _summon true,
 * and have _summonOwner set to sourceEntity.id or sourceEntity.name so you can identify them.
 */
// ============================================================
// SUMMON FIXED IMPLEMENTATION
// ============================================================

function resolveBaseLevelForSummon(state, sourceEntity) {
  // Player summons => use player level
  if (sourceEntity === state.player) {
    return Number(state.player.level) || 1;
  }

  // Enemy summons
  if (sourceEntity && Number.isFinite(Number(sourceEntity._scaledLevel))) {
    return Number(sourceEntity._scaledLevel);
  }

  // Enemy with no scaling data (common) ⇒ treat as level 1
  return 1;
}

function spawnSummonsMut(state, sourceEntity, summonSpec = {}) {
  if (!state || !state.enemies) return [];

  let count = Number(summonSpec.count) || 1;
  let idOrObj = summonSpec.id || summonSpec.baseId || null;

  if (!idOrObj && typeof summonSpec === "string") idOrObj = summonSpec;

  // Fix: correct base-level logic
  const baseLevel = resolveBaseLevelForSummon(state, sourceEntity);

  let desiredLevel = undefined;

  if (Number.isFinite(Number(summonSpec.level))) {
    desiredLevel = Number(summonSpec.level);

  } else if (Number.isFinite(Number(summonSpec.levelOffset))) {
    desiredLevel = Math.max(1, baseLevel + Number(summonSpec.levelOffset));
  }

  const created = [];

  for (let i = 0; i < count; i++) {
    let spawnRef = idOrObj;

    if (typeof spawnRef === "string" && desiredLevel) {
      const parsed = parseScaledId(spawnRef);
      if (!parsed) spawnRef = `${spawnRef}-lv${desiredLevel}`;
    } else if (typeof spawnRef === "object" && desiredLevel) {
      spawnRef = { ...spawnRef, level: desiredLevel };
    }

    const { enemies: built } = buildEnemyRuntimeFromSource(spawnRef, enemies);
    if (!built || built.length === 0) continue;

    for (const n of built) {
      n._summon = true;
      n._summonOwner = sourceEntity ? (sourceEntity.id || sourceEntity.name || "unknown") : "unknown";

      // Prevent re-acting in same turn
      n._justSummoned = true;

      // Unique runtime ID
      n.id = `${n.id || "summon"}-${Date.now()}-${(Math.random() * 1000) | 0}`;

      ensureRuntimeFieldsForEntity(n);
      recomputeDerivedWithStatuses(n, state);

      state.enemies.push(n);
      created.push(n);
    }
  }

  // Fix primary enemy reference (no more copying -> no desync)
  state.enemy = state.enemies[0] || null;

  return created;
}

function processEffectForEntity(state, sourceEntity, effect) {
  if (!effect || !effect.type) return;

  if (effect.type === "summon") {
    const spec = {
      id: effect.id || effect.baseId,
      count: Number(effect.count) || 1
    };

    if (Number.isFinite(Number(effect.level))) spec.level = Number(effect.level);
    if (Number.isFinite(Number(effect.levelOffset))) spec.levelOffset = Number(effect.levelOffset);

    const created = spawnSummonsMut(state, sourceEntity, spec);

    if (created.length > 0) {
      const names = created.map(c => c.name || c.id).join(", ");
      addLog(state, `${sourceEntity?.name || "An entity"} summons ${created.length} × ${names}!`);

      try {
        emit("toast", {
          message: `${sourceEntity?.name || "Enemy"} summoned ${created.length} minion(s).`,
          type: "info"
        });
      } catch {}
    }
    return;
  }

  // otherwise: normal status
  pushStatusOntoEntity(sourceEntity, effect);
}


// export spawn helper so enemyAI or other modules can call it directly
export { spawnSummonsMut };

// ============================================================
// Enemy access utils
// ============================================================
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

// ============================================================
// Derived combat from stats
// ============================================================
function deriveCombatFromStats(stats = {}, level = 1) {
  const STR = Number(stats.STR) || 0;
  const DEX = Number(stats.DEX) || 0;
  const MAG = Number(stats.MAG) || 0;
  const CON = Number(stats.CON) || 0;

  return {
    atk: 2 + STR * 2 + Math.floor(level / 2),
    def: 1 + Math.floor((CON + DEX) / 2),
    maxHP: 20 + CON * 8 + level * 2,
    maxMP: 5 + MAG * 5 + Math.floor(level / 2),
    mAtk: 2 + MAG * 2 + Math.floor(level / 2),
    mDef: 1 + Math.floor((MAG + CON) / 2),
  };
}

function applyEquipmentToStats(baseStats = {}, equipped = {}) {
  const out = { ...baseStats };
  for (const slot of Object.keys(equipped || {})) {
    const id = equipped[slot];
    if (!id) continue;

    const spec = ITEM_MAP[id];
    if (!spec || spec.kind !== "equipment") continue;

    const bonus = spec.bonus || {};
    if (bonus.stats) {
      for (const k of Object.keys(bonus.stats)) {
        out[k] = (out[k] || 0) + (Number(bonus.stats[k]) || 0);
      }
    }
  }
  return out;
}

function applyEquipmentToDerived(derived = {}, equipped = {}) {
  const out = { ...derived };
  for (const slot of Object.keys(equipped || {})) {
    const id = equipped[slot];
    if (!id) continue;

    const spec = ITEM_MAP[id];
    if (!spec || spec.kind !== "equipment") continue;

    const bonus = spec.bonus || {};

    if (Number.isFinite(Number(bonus.atk))) out.atk += Number(bonus.atk);
    if (Number.isFinite(Number(bonus.def))) out.def += Number(bonus.def);
    if (Number.isFinite(Number(bonus.mAtk))) out.mAtk += Number(bonus.mAtk);
    if (Number.isFinite(Number(bonus.maxHP))) out.maxHP += Number(bonus.maxHP);
    if (Number.isFinite(Number(bonus.maxMP))) out.maxMP += Number(bonus.maxMP);
    if (Number.isFinite(Number(bonus.mDef))) out.mDef += Number(bonus.mDef);
  }
  return out;
}

// Exposed for statuses.js usage
export { deriveCombatFromStats as deriveFromStats };
export { applyEquipmentToDerived };

// ============================================================
// Player building
// ============================================================
function buildPlayerFromBase(base) {
  const progress = loadProgress();
  const merged = applyProgress(base, progress);

  const stats = applyEquipmentToStats({ ...(merged.stats || {}) }, merged.equipped);
  const level = merged.level ?? 1;

  const d0 = deriveCombatFromStats(stats, level);
  const derived = applyEquipmentToDerived({ ...d0 }, merged.equipped);

  return {
    name: merged.name || base.name,
    stats,
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

    spells:
      Array.isArray(merged.spellbook)
        ? [...merged.spellbook]
        : Array.isArray(merged.spells)
          ? [...merged.spells]
          : Array.isArray(base.spellbook)
            ? [...base.spellbook]
            : [],

    items: { ...(merged.inventory ?? base.inventory ?? {}) },
    inventory: { ...(merged.inventory ?? base.inventory ?? {}) },

    gold: Number(merged.gold ?? base.gold ?? 0),

    equipped: { ...(merged.equipped || {}) },

    statuses: [],
    _cooldowns: {},
  };
}

// ============================================================
// EXP + Level-up
// ============================================================
function grantExpAndMaybeLevelUp(state, amount) {
  if (amount <= 0) return;

  state.log.push(`Gained ${amount} EXP.`);

  const prevLevel = Number(state.player.level) || 1;
  const result = applyExpGain(amount);
  const updated = result?.progress;

  if (!updated) return;

  state.player.level = updated.level;
  state.player.exp = updated.exp;
  state.player.unspentPoints = updated.unspentPoints;
  state.player.stats = { ...updated.stats };
  state.player.spells = [...(updated.spells || [])];
  state.player.gold = updated.gold ?? state.player.gold;
  state.player.equipped = { ...(updated.equipped || {}) };

  const newLevel = updated.level;
  if (newLevel > prevLevel) {
    const d = deriveCombatFromStats(state.player.stats, state.player.level);
    const applied = applyEquipmentToDerived({ ...d }, state.player.equipped);

    state.player.atk = applied.atk;
    state.player.def = applied.def;
    state.player.maxHP = applied.maxHP;
    state.player.maxMP = applied.maxMP;
    state.player.mAtk = applied.mAtk;
    state.player.mDef = applied.mDef;

    state.player.hp = state.player.maxHP;
    state.player.mp = state.player.maxMP;

    state.log.push(`Level Up! You are now level ${updated.level}.`);
  } else {
    const beforeHP = state.player.hp;
    const beforeMP = state.player.mp;

    const d = deriveCombatFromStats(state.player.stats, state.player.level);
    const applied = applyEquipmentToDerived({ ...d }, state.player.equipped);

    state.player.atk = applied.atk;
    state.player.def = applied.def;
    state.player.maxHP = applied.maxHP;
    state.player.maxMP = applied.maxMP;
    state.player.mAtk = applied.mAtk;
    state.player.mDef = applied.mDef;

    state.player.hp = Math.min(beforeHP, state.player.maxHP);
    state.player.mp = Math.min(beforeMP, state.player.maxMP);
  }
}

// ============================================================
// START / RESET BATTLE
// ============================================================
export function startBattle(id = DEFAULT_ENEMY_ID, opts = {}) {
// Dungeon level scaling hook
  let dungeonLevel = null;

  if (opts && Number.isFinite(Number(opts.dungeonLevel))) {
    dungeonLevel = Number(opts.dungeonLevel);
    try {
      setDungeonLevel(dungeonLevel);   // tell enemyBuilder before building enemies
    } catch (e) {
      console.error("[engine] setDungeonLevel failed", e);
    }
  }
  const player = buildPlayerFromBase(playerBase);
  // pass enemies DB into builder so it can resolve templates
  const { enemies: runtimeEnemies, primary } = buildEnemyRuntimeFromSource(id, enemies);
  console.log(dungeonLevel,"AHHHH");
  // Build initial state first (so recomputeDerivedWithStatuses has state context)
  const state = {
    enemyId: Array.isArray(id) ? id[0] : id,
    player,
    enemies: runtimeEnemies,
    enemy: primary ? { ...primary } : null,
    turn: "player",
    over: false,
    result: null,
    log: [`A wild ${primary ? primary.name : "enemy"} appears! ${player.name} prepares for battle.`],
    _dungeonLevel: dungeonLevel,

    // required by statuses.js to recompute stats
    deriveFromStats: deriveCombatFromStats,
    applyEquipmentToDerived,
  };

  // Ensure runtime fields and recompute derived with full state context
  for (const en of state.enemies) {
    ensureRuntimeFieldsForEntity(en);
    recomputeDerivedWithStatuses(en, state);
  }

  // Initial player turn start
  const after = startUnitTurn(state, "player");
  return after;
}

export function resetBattle(id = DEFAULT_ENEMY_ID) {
  return startBattle(id);
}

// ============================================================
// PLAYER ACTIONS
// ============================================================
function addLog(state, line) {
  state.log.push(line);
  if (state.log.length > LOG_TAIL) state.log.shift();
}

function canPlayerAct(state) {
  return !state.over && state.turn === "player";
}

// ------------------------------------------------------------
// PLAYER ATTACK
// ------------------------------------------------------------
export function playerAttack(state, targetIndex = null) {
  const s =
    state && state.player ? prepareNextState(state) : deepCloneFallback(state);

  if (!canPlayerAct(s)) return s;

  s.enemies = s.enemies.map(e => ({ ...e }));
  s.enemy = s.enemies[0] ? { ...s.enemies[0] } : null;

  const list = getEnemiesList(s);
  const idx = targetIndex == null ? list.findIndex(e => e.hp > 0) : targetIndex;
  const target = getEnemyByIndex(s, idx);
  if (!target) return s;

  const prevHp = target.hp;
  const base = Math.max(1, s.player.atk - target.def);

  const { final: elemDmg, mult } = applyElementalMultiplier(base, "physical", target);

  const critChance = computeCritChanceFromPlayer(s.player);
  const critMult = computeCritMultiplierFromPlayer(s.player);
  const isCrit = Math.random() < critChance;
  const dmg = Math.max(1, isCrit ? Math.floor(elemDmg * critMult) : elemDmg);

  target.hp = clampHP(prevHp - dmg, target.maxHP);

  addLog(
    s,
    `${s.player.name} attacks ${target.name} for ${dmg} physical damage` +
    (mult !== 1 ? ` (×${mult})` : "") +
    (isCrit ? ` CRIT ×${critMult}` : "") +
    `. (${target.name} HP ${target.hp}/${target.maxHP})`
  );

  if (prevHp > 0 && target.hp <= 0) {
    onEnemyDeathMut(s, target);
  }

  pruneDeadEnemiesMut(s);
  checkEndMut(s);

  if (!s.over) s.turn = "enemy";
  return s;
}

// ------------------------------------------------------------
// PLAYER CAST
// ------------------------------------------------------------
export function playerCast(state, spellId, targetIndex = null) {
  const s =
    state && state.player ? prepareNextState(state) : deepCloneFallback(state);
  if (!canPlayerAct(s)) return s;

  const spell = SPELL_MAP[spellId];
  if (!spell) return s;
  if (!canCast(s, spellId)) return s;

  // Spend MP
  s.player.mp = clampMP(s.player.mp - (spell.cost || 0), s.player.maxMP);
  addLog(
    s,
    `${s.player.name} spends ${spell.cost || 0} MP (MP ${s.player.mp}/${s.player.maxMP}).`
  );

  // Cooldown
  if (spell.cooldown) {
    setCooldownOnEntity(s.player, spell.id || spellId, spell.cooldown);
  }

  // DAMAGE SPELLS
  if (spell.kind === "damage") {
    const type = spell.damageType === "physical" ? "physical" : "magical";
    const elem = spell.element || (type === "physical" ? "physical" : "magical");
    const isAoe = spell.target === "aoe" || spell.aoe === true;

    s.enemies = s.enemies.map(e => ({ ...e }));
    s.enemy = s.enemies[0] ? { ...s.enemies[0] } : null;

    if (isAoe) {
      const enemiesList = getEnemiesList(s);
      for (const en of enemiesList) {
        if (!en || en.hp <= 0) continue;

        ensureRuntimeFieldsForEntity(en);
        const prev = en.hp;

        if (type === "physical") {
          const base = Math.max(1, s.player.atk - en.def);
          const scaled = Math.max(1, Math.floor(base * (spell.powerMult || 1)));
          const { final: elemDmg, mult } = applyElementalMultiplier(scaled, elem, en);

          const chance = computeCritChanceFromPlayer(s.player);
          const cMult = computeCritMultiplierFromPlayer(s.player);
          const isCrit = canSpellCrit(spell) && Math.random() < chance;

          const dmg = Math.max(1, isCrit ? Math.floor(elemDmg * cMult) : elemDmg);
          en.hp = clampHP(prev - dmg, en.maxHP);

          addLog(
            s,
            `${s.player.name} uses ${spell.name} (AOE) on ${en.name} for ${dmg} physical damage` +
            (mult !== 1 ? ` (×${mult})` : "") +
            (isCrit ? ` CRIT ×${cMult}` : "") +
            `. (${en.name} HP ${en.hp}/${en.maxHP})`
          );
        } else {
          const base = Math.max(1, s.player.mAtk - (en.mDef || en.def));
          const scaled = Math.max(1, Math.floor(base * (spell.powerMult || 1)));
          const { final: dmg, mult } = applyElementalMultiplier(scaled, elem, en);

          en.hp = clampHP(prev - dmg, en.maxHP);
          addLog(
            s,
            `${s.player.name} casts ${spell.name} (AOE) on ${en.name} for ${dmg} magic damage` +
            (mult !== 1 ? ` (×${mult})` : "") +
            `. (${en.name} HP ${en.hp}/${en.maxHP})`
          );
        }

        // Effects (special-case 'summon')
        if (Array.isArray(spell.effects)) {
          for (const eff of spell.effects) {
            // for AOE spells, treat source as s.player and process effect
            if (eff && eff.type === "summon") {
              processEffectForEntity(s, s.player, eff);
            } else {
              // Normal status effects are pushed onto the target entity
              pushStatusOntoEntity(en, { ...eff, source: spell.id || spellId });
            }
          }
          // Recompute derived for enemies since statuses / summons may have changed the battlefield
          for (const en2 of enemiesList) {
            recomputeDerivedWithStatuses(en2, s);
          }
        }

        if (prev > 0 && en.hp <= 0) onEnemyDeathMut(s, en);
      }
    } else {
      const target = getEnemyByIndex(s, targetIndex);
      if (!target) return s;

      ensureRuntimeFieldsForEntity(target);

      const prev = target.hp;
      if (type === "physical") {
        const base = Math.max(1, s.player.atk - target.def);
        const scaled = Math.max(1, Math.floor(base * (spell.powerMult || 1)));
        const { final: elemDmg, mult } = applyElementalMultiplier(scaled, elem, target);

        const critChance = computeCritChanceFromPlayer(s.player);
        const critMult = computeCritMultiplierFromPlayer(s.player);
        const isCrit = canSpellCrit(spell) && Math.random() < critChance;

        const dmg = Math.max(1, isCrit ? Math.floor(elemDmg * critMult) : elemDmg);
        target.hp = clampHP(prev - dmg, target.maxHP);

        addLog(
          s,
          `${s.player.name} uses ${spell.name} on ${target.name} for ${dmg} physical damage` +
          (mult !== 1 ? ` (×${mult})` : "") +
          (isCrit ? ` CRIT ×${critMult}` : "") +
          `! (${target.name} HP ${target.hp}/${target.maxHP})`
        );
      } else {
        const base = Math.max(1, s.player.mAtk - (target.mDef || target.def));
        const scaled = Math.max(1, Math.floor(base * (spell.powerMult || 1)));
        const { final: dmg, mult } = applyElementalMultiplier(scaled, elem, target);

        target.hp = clampHP(prev - dmg, target.maxHP);

        addLog(
          s,
          `${s.player.name} casts ${spell.name} on ${target.name} for ${dmg} magic damage` +
          (mult !== 1 ? ` (×${mult})` : "") +
          `! (${target.name} HP ${target.hp}/${target.maxHP})`
        );
      }

      if (Array.isArray(spell.effects)) {
        for (const eff of spell.effects) {
          // If effect is summon handle it (summons don't attach to the target)
          if (eff && eff.type === "summon") {
            processEffectForEntity(s, s.player, eff);
          } else {
            pushStatusOntoEntity(target, { ...eff, source: spell.id || spellId });
            recomputeDerivedWithStatuses(target, s);
          }
        }
      }

      if (prev > 0 && target.hp <= 0) onEnemyDeathMut(s, target);
    }
  }

  // HEAL SPELLS
  if (spell.kind === "heal") {
    const before = s.player.hp;
    const to = clampHP(before + (spell.healAmount || 0), s.player.maxHP);
    const gained = to - before;
    s.player.hp = to;

    addLog(
      s,
      `${s.player.name} casts ${spell.name} and heals ${gained}. (${s.player.name} HP ${s.player.hp}/${s.player.maxHP})`
    );

    if (Array.isArray(spell.effects)) {
      for (const eff of spell.effects) {
        // Summon effect on heal (rare) — treat as originating from player
        if (eff && eff.type === "summon") {
          processEffectForEntity(s, s.player, eff);
        } else {
          pushStatusOntoEntity(s.player, { ...eff, source: spell.id || spellId });
        }
      }
      recomputeDerivedWithStatuses(s.player, s);
    }
  }

  pruneDeadEnemiesMut(s);
  checkEndMut(s);

  if (!s.over) s.turn = "enemy";
  return s;
}

// ------------------------------------------------------------
// PLAYER USE ITEM
// ------------------------------------------------------------
export function playerUseItem(state, itemId, targetIndex = null) {
  const s =
    state && state.player ? prepareNextState(state) : deepCloneFallback(state);
  if (!canPlayerAct(s)) return s;

  const spec = ITEM_MAP[itemId];
  if (!spec) return s;
  if (!canUseItem(s, itemId)) return s;

  s.player.items[itemId] = Math.max(0, (s.player.items[itemId] || 0) - 1);
  addLog(s, `${s.player.name} uses ${spec.name}.`);

  if (spec.cooldown) {
    setCooldownOnEntity(s.player, spec.id || itemId, spec.cooldown);
  }

  // HEAL
  if (spec.kind === "heal") {
    const before = s.player.hp;
    const to = clampHP(before + (spec.healAmount || 0), s.player.maxHP);
    const gained = to - before;
    s.player.hp = to;

    addLog(s, `Restored ${gained} HP. (${s.player.name} HP ${s.player.hp}/${s.player.maxHP})`);
  }

  // MANA
  else if (spec.kind === "mana") {
    const before = s.player.mp;
    const to = clampMP(before + (spec.mpAmount || 0), s.player.maxMP);
    const gained = to - before;
    s.player.mp = to;

    addLog(s, `Recovered ${gained} MP. (MP ${s.player.mp}/${s.player.maxMP})`);
  }

  // DAMAGE ITEMS
  else if (spec.kind === "damage") {
    const isAoe = spec.target === "aoe" || spec.aoe === true;
    const elem = spec.element || "physical";

    s.enemies = s.enemies.map(e => ({ ...e }));
    s.enemy = s.enemies[0] ? { ...s.enemies[0] } : null;

    if (isAoe) {
      for (const en of getEnemiesList(s)) {
        if (!en || en.hp <= 0) continue;

        ensureRuntimeFieldsForEntity(en);

        const prev = en.hp;
        const base = Math.max(1, spec.damage || 0);
        const { final: elemDmg, mult } = applyElementalMultiplier(base, elem, en);

        let dmg = elemDmg;

        if (elem === "physical") {
          const critChance = computeCritChanceFromPlayer(s.player);
          const critMult = computeCritMultiplierFromPlayer(s.player);
          const isCrit = canItemCrit(spec) && Math.random() < critChance;

          dmg = Math.max(1, isCrit ? Math.floor(elemDmg * critMult) : elemDmg);

          addLog(
            s,
            `${spec.name} hits ${en.name} for ${dmg} damage` +
            (mult !== 1 ? ` (×${mult})` : "") +
            (isCrit ? ` CRIT ×${critMult}` : "") +
            `! (${en.name} HP ${en.hp}/${en.maxHP})`
          );
        } else {
          addLog(
            s,
            `${spec.name} hits ${en.name} for ${elemDmg} damage` +
            (mult !== 1 ? ` (×${mult})` : "") +
            `! (${en.name} HP ${en.hp}/${en.maxHP})`
          );
        }

        en.hp = clampHP(prev - dmg, en.maxHP);

        if (Array.isArray(spec.effects)) {
          for (const eff of spec.effects) {
            // Support summon effects on items too
            if (eff && eff.type === "summon") {
              processEffectForEntity(s, s.player, eff);
            } else {
              pushStatusOntoEntity(en, { ...eff, source: spec.id || itemId });
            }
          }
          recomputeDerivedWithStatuses(en, s);
        }

        if (prev > 0 && en.hp <= 0) {
          onEnemyDeathMut(s, en);
        }
      }
    } else {
      const target = getEnemyByIndex(s, targetIndex);
      if (!target) return s;

      ensureRuntimeFieldsForEntity(target);

      const prev = target.hp;
      const base = Math.max(1, spec.damage || 0);
      const { final: elemDmg, mult } = applyElementalMultiplier(base, elem, target);

      let dmg = elemDmg;

      if (elem === "physical") {
        const chance = computeCritChanceFromPlayer(s.player);
        const cMult = computeCritMultiplierFromPlayer(s.player);
        const isCrit = canItemCrit(spec) && Math.random() < chance;

        dmg = Math.max(1, isCrit ? Math.floor(elemDmg * cMult) : elemDmg);

        addLog(
          s,
          `${spec.name} deals ${dmg} damage to ${target.name}` +
          (mult !== 1 ? ` (×${mult})` : "") +
          (isCrit ? ` CRIT ×${cMult}` : "") +
          `! (${target.name} HP ${target.hp}/${target.maxHP})`
        );
      } else {
        addLog(
          s,
          `${spec.name} deals ${elemDmg} damage to ${target.name}` +
          (mult !== 1 ? ` (×${mult})` : "") +
          `! (${target.name} HP ${target.hp}/${target.maxHP})`
        );
      }

      target.hp = clampHP(prev - dmg, target.maxHP);

      if (Array.isArray(spec.effects)) {
        for (const eff of spec.effects) {
          if (eff && eff.type === "summon") {
            processEffectForEntity(s, s.player, eff);
          } else {
            pushStatusOntoEntity(target, { ...eff, source: spec.id || itemId });
          }
        }
        recomputeDerivedWithStatuses(target, s);
      }

      if (prev > 0 && target.hp <= 0) {
        onEnemyDeathMut(s, target);
      }
    }
  }

  pruneDeadEnemiesMut(s);
  checkEndMut(s);

  if (!s.over) s.turn = "enemy";
  return s;
}

// ============================================================
// ENEMY TURN
// ============================================================
export function enemyAct(state) {
  const s =
    state && state.player ? prepareNextState(state) : deepCloneFallback(state);
  if (s.over || s.turn !== "enemy") return s;

  s.enemies = s.enemies.map(e => ({ ...e }));
  s.enemy = s.enemies[0] ? { ...s.enemies[0] } : null;

  const list = getEnemiesList(s);

  for (let i = 0; i < list.length; i++) {
    const en = list[i];
    if (!en) continue;

    // Run start-of-turn for this enemy (applies DOT/stun etc)
    const withTick = startUnitTurn(s, "enemy", { enemyIndex: i });
    // startUnitTurn mutates and returns state; update our local s
    Object.assign(s, withTick);

    // refresh enemies after possible pruning
    const updatedList = getEnemiesList(s);
    if (updatedList.length === 0) break;

    const active = updatedList[i] || updatedList.find(e => e.hp > 0);
    if (!active || active.hp <= 0) continue;

    // examine the authoritative start result (set by turnStart)
    const lastRes = s._lastStartResult || {};
    const processedIndex = Number.isFinite(Number(lastRes.enemyIndex)) ? Number(lastRes.enemyIndex) : null;
    const processedId = lastRes.entityId || null;
    const tick = lastRes.tick || s._turnTick || 0;

    // If the startUnitTurn reported 'skipped' for this same entity/tick, honor that
    const wasSkippedByStart =
      lastRes.unitType === "enemy" &&
      lastRes.skipped === true &&
      (processedIndex === i || processedId === active.id || processedId === active.name);

    if (wasSkippedByStart) {
      // we still want to decay the enemy's statuses at end-of-turn (stun consumed)
      try {
        decayStatusesForEntity(s, active, { tick });
      } catch (e) {
        console.error("[DECAY] enemy decay failed (stunned):", e);
      }
      // skip acting this turn
      continue;
    }

    // enemy action (spell or basic attack)
    performEnemyAction(s, active);


    // End-of-this-enemy's turn: decay statuses
    try {
      decayStatusesForEntity(s, active, { tick });
    } catch (e) {
      console.error("[DECAY] enemy decay failed (after attack):", e);
    }

    if (s.player.hp <= 0) break;
  }


  pruneDeadEnemiesMut(s);
  checkEndMut(s);

  if (!s.over) {
    const after = startUnitTurn(s, "player");
    Object.assign(s, after);

    if (!s.over) {
      s.turn = "player";
      addLog(s, "Your turn.");
    }
  }

  return s;
}

// ============================================================
// ENEMY DEATH HANDLING
// ============================================================
function pruneDeadEnemiesMut(state) {
  if (!Array.isArray(state.enemies)) return;

  const keep = state.enemies.filter(e => e.hp > 0);
  state.enemies = keep;
  state.enemy = keep.length > 0 ? { ...keep[0] } : null;
}

function onEnemyDeathMut(state, enemy) {
  if (!enemy || enemy._deathProcessed) return;
  enemy._deathProcessed = true;

  addLog(state, `${enemy.name} falls!`);

  // EXP
  const exp = enemy.expReward || 0;
  if (exp > 0) {
    grantExpAndMaybeLevelUp(state, exp);

    try {
      emit("toast", {
        message: `+${exp} EXP`,
        type: "success"
      });
    } catch {}
  }

  // LOOT
  if (Array.isArray(enemy.drops)) {
    for (const d of enemy.drops) {
      if (!d || !d.id) continue;

      const qty = Number(d.qty) || 0;
      if (qty <= 0) continue;

      try {
        emit("collect", { itemId: d.id, qty });
      } catch {}

      state.player.items = state.player.items || {};
      state.player.items[d.id] = (state.player.items[d.id] || 0) + qty;

      const itemName = ITEM_MAP[d.id]?.name || d.id;

      addLog(state, `${enemy.name} dropped ${qty} × ${itemName}.`);

      // --- NEW TOAST HERE ---
      try {
        emit("toast", {
          message: `Loot: ${qty}× ${itemName}`,
          type: "info"
        });
      } catch {}
    }
  }
}

// ============================================================
// END CONDITIONS
// ============================================================
function checkEndMut(state) {
  const pDead = state.player.hp <= 0;
  const aliveEnemies = getEnemiesList(state).filter(e => e.hp > 0).length;

  if (pDead && aliveEnemies === 0) {
    state.over = true;
    state.result = "win";
    addLog(state, "Both sides fall — you prevail!");
  } else if (aliveEnemies === 0) {
    state.over = true;
    state.result = "win";
    addLog(state, "Victory!");
  } else if (pDead) {
    state.over = true;
    state.result = "loss";
    addLog(state, "Defeat...");
  }
}

// ============================================================
// UI HELPERS
// ============================================================
export function getSpells(state) {
  const ids = state?.player?.spells || [];
  const out = [];

  for (const id of ids) {
    if (!id) continue;

    let s =
      SPELL_MAP[id] ||
      SPELL_MAP[id.replace(/_/g, "-")] ||
      SPELL_MAP[id.replace(/-/g, "_")];

    if (!s) continue;

    let obj = { id, ...s, name: s.name || id };

    if (obj.kind === "damage" && !obj.damageType) {
      obj = { ...obj, damageType: "magical" };
    }

    obj._cooldownRemaining = state.player._cooldowns?.[obj.id] || 0;

    out.push(obj);
  }

  return out;
}

export function getItems(state) {
  const inv = state.player.items || {};
  const out = [];

  for (const [id, qty] of Object.entries(inv)) {
    const n = Number(qty) || 0;
    if (n > 0 && ITEM_MAP[id]) {
      const spec = { ...ITEM_MAP[id], qty: n };
      spec._cooldownRemaining = state.player._cooldowns?.[spec.id] || 0;
      out.push(spec);
    }
  }

  out.sort((a, b) => String(a.name).localeCompare(String(b.name)));
  return out;
}

export function canCast(state, spellId) {
  if (!canPlayerAct(state)) return false;

  const spell = SPELL_MAP[spellId];
  if (!spell) return false;

  const cd = state.player._cooldowns?.[spellId] || 0;
  if (cd > 0) return false;

  if (state.player.mp < (spell.cost || 0)) return false;

  if (spell.kind === "heal") {
    return state.player.hp < state.player.maxHP;
  }

  return true;
}

export function canUseItem(state, itemId) {
  if (!canPlayerAct(state)) return false;

  const spec = ITEM_MAP[itemId];
  if (!spec) return false;

  const qty = state.player.items?.[itemId] || 0;
  if (qty <= 0) return false;

  const cd = state.player._cooldowns?.[itemId] || 0;
  if (cd > 0) return false;

  if (spec.kind === "heal") return state.player.hp < state.player.maxHP;
  if (spec.kind === "mana") return state.player.mp < state.player.maxMP;

  return true;
}
// restore allocation API (keeps original behaviour)
export function allocateStat(state, statKey) {
  const s = (state && state.player ? prepareNextState(state) : deepCloneFallback(state));
  // validate key
  if (!["STR", "DEX", "MAG", "CON"].includes(statKey)) return s;
  if ((s.player.unspentPoints | 0) <= 0) return s;

  s.player.unspentPoints -= 1;
  s.player.stats = s.player.stats || {};
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

// ============================================================
// Export scaling setters for external use (re-export from enemyBuilder)
// ============================================================
export { setExpScalingMode, setDungeonExpMultiplier };
