// src/engine/enemyAI.js
// -----------------------------------------------------------
// Minimal scalable enemy AI system
// -----------------------------------------------------------

import spellsCatalog from "../db/spells.json";
import { applyElementalMultiplier, clampHP } from "./damage.js";
import { pushStatusOntoEntity } from "./statuses.js";
import { setCooldownOnEntity } from "./cooldowns.js";
import { calcDamage } from "./damage.js";

// -----------------------------------------------------------
// Retrieve enemy spell definitions
// -----------------------------------------------------------
export function getEnemySpells(enemy) {
  if (!enemy || !Array.isArray(enemy.spells)) return [];
  return enemy.spells
    .map(id => spellsCatalog[id])
    .filter(Boolean)
    .map(sp => ({ ...sp, id: sp.id }));
}

// -----------------------------------------------------------
// Pick simplest spell: first available off cooldown
// -----------------------------------------------------------
export function chooseEnemySpell(enemy) {
  const skills = getEnemySpells(enemy);
  if (!skills.length) return null;

  for (const sk of skills) {
    const cd = enemy._cooldowns?.[sk.id] || 0;
    if (cd <= 0) return sk;
  }
  return null;
}

// -----------------------------------------------------------
// Spell execution
// -----------------------------------------------------------
export function enemyUseSpell(state, enemy, spell) {
  const player = state.player;

  // Heal spell
  if (spell.kind === "heal") {
    const before = enemy.hp;
    const to = clampHP(before + (spell.healAmount || 0), enemy.maxHP);
    enemy.hp = to;

    state.log.push(
      `${enemy.name} casts ${spell.name} and heals ${to - before}. (${enemy.name} HP ${enemy.hp}/${enemy.maxHP})`
    );

    if (Array.isArray(spell.effects)) {
      for (const eff of spell.effects) {
        pushStatusOntoEntity(enemy, { ...eff, source: spell.id });
      }
    }

    setCooldownOnEntity(enemy, spell.id, spell.cooldown || 1);
    return;
  }

  // Damage spell
  const type = spell.damageType === "physical" ? "physical" : "magical";
  const elem = spell.element || type;

  const base =
    type === "physical"
      ? Math.max(1, enemy.atk - player.def)
      : Math.max(1, enemy.mAtk - player.mDef);

  const scaled = Math.max(1, Math.floor(base * (spell.powerMult || 1)));

  const { final: dmg, mult } = applyElementalMultiplier(scaled, elem, player);

  const before = player.hp;
  player.hp = clampHP(before - dmg, player.maxHP);

  state.log.push(
    `${enemy.name} uses ${spell.name} for ${dmg} ${type} damage` +
      (mult !== 1 ? ` (×${mult})` : "") +
      `. (${player.name} HP ${player.hp}/${player.maxHP})`
  );

  if (Array.isArray(spell.effects)) {
    for (const eff of spell.effects) {
      pushStatusOntoEntity(player, { ...eff, source: spell.id });
    }
  }

  setCooldownOnEntity(enemy, spell.id, spell.cooldown || 1);
}

// -----------------------------------------------------------
// Basic fallback attack
// -----------------------------------------------------------
export function enemyBasicAttack(state, enemy) {
  const player = state.player;

  const dmg = calcDamage(enemy.atk, player.def);
  const before = player.hp;
  player.hp = clampHP(before - dmg, player.maxHP);

  state.log.push(
    `${enemy.name} hits ${player.name} for ${dmg} physical damage. (${player.name} HP ${player.hp}/${player.maxHP})`
  );
}

// -----------------------------------------------------------
// MAIN exported function: performs *one* enemy action
// -----------------------------------------------------------
export function performEnemyAction(state, enemy) {
  const chosen = chooseEnemySpell(enemy);

  if (chosen) {
    enemyUseSpell(state, enemy, chosen);
  } else {
    enemyBasicAttack(state, enemy);
  }
}
