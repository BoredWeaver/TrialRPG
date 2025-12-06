// /src/engine/status/effects.js
import { recomputeDerivedPreserveHP, recomputeDerivedAndHeal } from "../engine.js"; // circular-safe: engine exports these helpers at file end

export function ensureStatuses(entity) {
  console.log("Ensuring statuses..."); // Added simple debug log
  if (!entity) return;
  if (!Array.isArray(entity.statuses)) entity.statuses = [];
  console.log(`Entity statuses for ${entity.name || entity.id}:`, entity.statuses);
}

/**
 * pushStatus(entity, effect, source)
 * effect: { type, id?, stat?, value?, turns?, ... }
 * Transforms into runtime status object:
 * { id, type, stat, value, turnsLeft, source }
 */
export function pushStatus(entity, effect, source = null) {
  console.log("Pushing status..."); // Added simple debug log
  if (!entity || !effect || typeof effect !== "object") return null;
  ensureStatuses(entity);

  const s = {
    id: effect.id || effect.type || `status-${Date.now()}`,
    type: effect.type,
    stat: effect.stat,
    value: Number.isFinite(Number(effect.value)) ? Number(effect.value) : (effect.value || 0),
    turnsLeft: Number.isFinite(Number(effect.turns)) ? Math.max(0, Number(effect.turns)) : (Number.isFinite(Number(effect.turnsLeft)) ? effect.turnsLeft : 1),
    source: source || effect.source || null,
    _applied: false // internal: whether we've applied persistent stat changes for buff/debuff
  };

  entity.statuses.push(s);
  console.log(`Status pushed for ${entity.name || entity.id}:`, s);
  return s;
}

export function hasStatus(entity, typeOrId) {
  console.log("Checking if status exists..."); // Added simple debug log
  if (!entity || !Array.isArray(entity.statuses)) return false;
  const hasStatus = entity.statuses.some(st => st && (st.type === typeOrId || st.id === typeOrId));
  console.log(`Does ${entity.name || entity.id} have status ${typeOrId}?`, hasStatus);
  return hasStatus;
}

export function removeStatus(entity, statusObj) {
  console.log("Removing status..."); // Added simple debug log
  if (!entity || !Array.isArray(entity.statuses)) return;
  const idx = entity.statuses.indexOf(statusObj);
  if (idx >= 0) {
    entity.statuses.splice(idx, 1);
    console.log(`Removed status from ${entity.name || entity.id}:`, statusObj);
  }
}

/**
 * applyStatusEffects(entity, state, ctx)
 * - Runs start-of-turn triggers for statuses:
 *    - dot: deal damage (value)
 *    - stun: just noted (skip handled by caller reading status)
 *    - buff/debuff: ensure stat application (applied once when pushed)
 *
 * ctx must minimally provide:
 *  - addLog(state, line)
 *  - onEnemyDeathMut(state, enemy)
 *  - emit (optional)
 *  - isPlayer boolean detection handled by caller
 */
export function applyStatusEffects(entity, state = null, ctx = {}) {
  console.log("Applying status effects..."); // Added simple debug log
  if (!entity) return { died: false, stunned: false };
  ensureStatuses(entity);

  let died = false;
  let stunned = false;

  for (const st of entity.statuses.slice()) {
    if (!st || !st.type) continue;

    console.log(`Applying status effect on ${entity.name || entity.id}:`, st);

    if (st.type === "dot") {
      const dmg = Number(st.value) | 0;
      if (dmg > 0) {
        const before = Number(entity.hp) || 0;
        entity.hp = Math.max(0, Math.floor(before - dmg));
        if (ctx && typeof ctx.addLog === "function") {
          const who = (entity.name ? entity.name : (entity.id || "Target"));
          ctx.addLog(state, `${who} suffers ${dmg} damage from ${st.id || st.type}. (${who} HP ${entity.hp}/${entity.maxHP})`);
        }
        if (entity.hp <= 0) {
          died = true;
          if (ctx && typeof ctx.onEnemyDeathMut === "function" && entity.id) {
            try { ctx.onEnemyDeathMut(state, entity); } catch (e) { console.error(e); }
          }
        }
      }
    } else if (st.type === "stun") {
      stunned = true;
      if (ctx && typeof ctx.addLog === "function") {
        const who = (entity.name ? entity.name : (entity.id || "Target"));
        ctx.addLog(state, `${who} is stunned and cannot act!`);
      }
    } else if (st.type === "buff" || st.type === "debuff") {
      // apply persistent stat modification once (mark _applied)
      if (!st._applied) {
        const v = Number(st.value) || 0;
        console.log(`Applying ${st.type} on ${entity.name || entity.id}:`, st.stat, v);

        // Buffs/debuffs target a stat name: atk/def/mDef/maxHP/maxMP etc.
        if (entity && entity.level !== undefined) {
          // assume player: modify player.stats if stat present there
          if (st.stat && typeof st.stat === "string") {
            entity.stats = entity.stats || {};
            entity.stats[st.stat] = (Number(entity.stats[st.stat]) || 0) + v;
            // recompute derived but preserve HP/MP
            try { recomputeDerivedPreserveHP(entity); } catch (e) { /* ignore */ }
          }
        } else {
          // enemy: modify direct numeric fields
          if (st.stat && typeof st.stat === "string") {
            const statKey = st.stat;
            // apply to numeric fields if exist; else set as numeric
            entity[statKey] = (Number(entity[statKey]) || 0) + v;
          }
        }
        st._applied = true;
        console.log(`Applied ${st.type} to ${entity.name || entity.id}:`, st);
      }
    }
  }

  return { died, stunned };
}

/**
 * decayStatuses(entity)
 * - subtracts 1 from turnsLeft, removes expired statuses and
 *   reverts any applied buff/debuff effects if necessary.
 */
export function decayStatuses(entity) {
  console.log("Decaying statuses..."); // Added simple debug log
  if (!entity) return;
  ensureStatuses(entity);
  for (let i = entity.statuses.length - 1; i >= 0; i--) {
    const st = entity.statuses[i];
    if (!st) continue;
    st.turnsLeft = (Number(st.turnsLeft) | 0) - 1;

    console.log(`Decaying status on ${entity.name || entity.id}:`, st);

    if (st.turnsLeft <= 0) {
      // revert buff/debuff if it was applied
      if (st._applied && (st.type === "buff" || st.type === "debuff")) {
        const v = Number(st.value) || 0;
        if (entity && entity.level !== undefined) {
          // player
          if (st.stat && typeof st.stat === "string") {
            entity.stats = entity.stats || {};
            entity.stats[st.stat] = (Number(entity.stats[st.stat]) || 0) - v;
            try { recomputeDerivedPreserveHP(entity); } catch (e) {}
          }
        } else {
          // enemy
          if (st.stat && typeof st.stat === "string") {
            entity[st.stat] = (Number(entity[st.stat]) || 0) - v;
          }
        }
      }
      // remove
      entity.statuses.splice(i, 1);
      console.log(`Removed expired status from ${entity.name || entity.id}:`, st);
    }
  }
}
