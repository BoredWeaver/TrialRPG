// src/state/quests.js
// Simple quest system backed by saveProgress/loadProgress (playerProgress.js).
// Exports helpers to list definitions, get available quests, accept, update progress, complete, abandon.

import QUESTS_RAW from "../db/quests.json";
import { loadProgress, saveProgress } from "./playerProgress.js";
import { on } from "./gameEvents.js"; // <- subscribe to in-game events

/* ---------- Helpers over raw definitions ---------- */

const QUESTS = (typeof QUESTS_RAW === "object" && QUESTS_RAW) ? QUESTS_RAW : {};

export function getAllQuestDefs() {
  return Object.values(QUESTS);
}

export function getQuestDef(id) {
  return QUESTS[id] || null;
}

/* ---------- Player state helpers ---------- */

// returns normalized player quest state (guarantees shape)
export function loadPlayerQuests(progress = null) {
  const prog = progress || loadProgress() || {};
  const q = prog.quests || {};
  return {
    active: q.active || {},
    completed: Array.isArray(q.completed) ? q.completed.slice() : []
  };
}

// persist given quests state into progress and return merged progress
export function savePlayerQuests(questsState) {
  const merged = saveProgress({ quests: questsState });
  return merged;
}

/* ---------- Availability & listing ---------- */

// returns quest defs that meet the player's minLevel and are not already completed
export function getAvailableQuestsForPlayer(progress = null) {
  const prog = progress || loadProgress() || {};
  const level = Number.isFinite(Number(prog.level)) ? Number(prog.level) : 1;
  const playerQuests = loadPlayerQuests(prog);
  const completedSet = new Set(playerQuests.completed || []);
  const activeSet = new Set(Object.keys(playerQuests.active || {}));

  return getAllQuestDefs().filter((q) => {
    if (completedSet.has(q.id)) return false;
    if (activeSet.has(q.id)) return false;
    const minL = Number.isFinite(Number(q.minLevel)) ? Number(q.minLevel) : 1;
    return level >= minL;
  });
}

/* ---------- Quest lifecycle ---------- */

function makeEmptyProgressForQuest(qDef) {
  // progress structure varies by type
  switch (qDef.type) {
    case "kill":
      return { killed: 0 };
    case "collect":
      return { collected: 0 };
    case "visit":
    case "travel":
      return { visited: false };
    case "clear_dungeon":
      // track whether dungeon cleared (boolean) — flexible for future extension
      return { cleared: false };
    default:
      return { progress: 0 };
  }
}

export function acceptQuest(questId) {
  const qDef = getQuestDef(questId);
  if (!qDef) return { success: false, reason: "no-quest" };

  const prog = loadProgress() || {};
  const quests = loadPlayerQuests(prog);

  if (quests.completed.includes(questId)) return { success: false, reason: "already-completed" };
  if (quests.active[questId]) return { success: false, reason: "already-active" };

  const newActive = { ...quests.active };
  newActive[questId] = {
    status: "active",
    progress: makeEmptyProgressForQuest(qDef),
    acceptedAt: Date.now()
  };

  const mergedQuests = { active: newActive, completed: quests.completed.slice() };
  const merged = savePlayerQuests(mergedQuests);
  return { success: true, progress: merged };
}

export function abandonQuest(questId) {
  const prog = loadProgress() || {};
  const quests = loadPlayerQuests(prog);
  if (!quests.active[questId]) return { success: false, reason: "not-active" };
  const newActive = { ...quests.active };
  delete newActive[questId];
  const merged = savePlayerQuests({ active: newActive, completed: quests.completed.slice() });
  return { success: true, progress: merged };
}

/* ---------- Update progress (game events call this) ---------- */

/**
 * updateQuestProgress(event)
 * event shape examples:
 *  - { type: "kill", enemyId: "goblin", qty: 1 }
 *  - { type: "collect", itemId: "slime_gel", qty: 1 }
 *  - { type: "visit", locationId: "central-zone-3" }
 *  - { type: "dungeon_clear", dungeonKey: "goblin-den", runId: "run-..." }
 *
 * This function returns { updated: [questId,...], completed: [questId,...], progress: mergedProgress }
 */
export function updateQuestProgress(event = {}) {
  if (!event || !event.type) return { updated: [], completed: [], progress: loadProgress() };

  const prog = loadProgress() || {};
  const quests = loadPlayerQuests(prog);
  const active = { ...quests.active };
  const completed = new Set(quests.completed || []);
  const updated = [];
  const completedNow = [];

  for (const [qid, state] of Object.entries(active)) {
    const qDef = getQuestDef(qid);
    if (!qDef) continue;

    let changed = false;

    switch (qDef.type) {
      case "kill":
        if (event.type === "kill" && event.enemyId === qDef.target.enemyId) {
          const prev = Number(state.progress.killed) || 0;
          const add = Number.isFinite(Number(event.qty)) ? Math.max(1, Math.floor(event.qty)) : 1;
          state.progress.killed = prev + add;
          changed = true;
        }
        if ((Number(state.progress.killed) || 0) >= (Number(qDef.target.qty) || 0) && (Number(qDef.target.qty) || 0) > 0) {
          // complete
          completed.add(qid);
          delete active[qid];
          completedNow.push(qid);
        }
        break;

      case "collect":
        if (event.type === "collect" && event.itemId === qDef.target.itemId) {
          const prevC = Number(state.progress.collected) || 0;
          const addC = Number.isFinite(Number(event.qty)) ? Math.max(1, Math.floor(event.qty)) : 1;
          state.progress.collected = prevC + addC;
          changed = true;
        }
        if ((Number(state.progress.collected) || 0) >= (Number(qDef.target.qty) || 0) && (Number(qDef.target.qty) || 0) > 0) {
          completed.add(qid);
          delete active[qid];
          completedNow.push(qid);
        }
        break;

      case "visit":
        if (event.type === "visit" && event.locationId === qDef.target.locationId) {
          state.progress.visited = true;
          changed = true;
          completed.add(qid);
          delete active[qid];
          completedNow.push(qid);
        }
        break;

      case "travel":
        if (event.type === "travel" && event.from === qDef.target.from && event.to === qDef.target.to) {
          state.progress.visited = true;
          changed = true;
          completed.add(qid);
          delete active[qid];
          completedNow.push(qid);
        }
        break;

      case "clear_dungeon":
        // Accept either event.type === "dungeon_clear" or a generic "dungeon_clear" forwarded event
        if (event.type === "dungeon_clear" || event.type === "dungeon_clear_event" || event.type === "dungeonClear") {
          // event may provide dungeonKey, dungeonId or both — match against qDef.target.dungeonId or dungeonKey
          const incomingDungeonKey = event.dungeonKey || event.dungeonId || event.dungeon || null;
          const targetDungeon = qDef.target?.dungeonId || qDef.target?.dungeonKey || qDef.target?.dungeon || null;
          if (incomingDungeonKey && targetDungeon && String(incomingDungeonKey) === String(targetDungeon)) {
            state.progress.cleared = true;
            changed = true;
            completed.add(qid);
            delete active[qid];
            completedNow.push(qid);
          }
        }
        break;

      default:
        break;
    }

    if (changed && !completedNow.includes(qid)) {
      // write back updated progress for the active quest
      active[qid] = state;
      updated.push(qid);
    }
  }

  const mergedQuests = { active, completed: Array.from(completed) };
  const mergedProgress = savePlayerQuests(mergedQuests);

  // When completing, also apply rewards immediately
  for (const qid of completedNow) {
    tryApplyQuestRewards(qid);
  }

  return { updated, completed: completedNow, progress: mergedProgress };
}

/* ---------- Completion rewards ---------- */

function tryApplyQuestRewards(questId) {
  const q = getQuestDef(questId);
  if (!q || !q.rewards) return;
  const rewards = q.rewards || {};
  const progress = loadProgress() || {};

  const newInv = { ...(progress.inventory || {}) };
  if (Array.isArray(rewards.items)) {
    for (const it of rewards.items) {
      const id = it.id;
      const qty = Number.isFinite(Number(it.qty)) ? Number(it.qty) : 1;
      newInv[id] = (Number(newInv[id]) || 0) + qty;
    }
  }

  const newGold = (Number(progress.gold) || 0) + (Number(rewards.gold) || 0);
  const newExp = (Number(progress.exp) || 0) + (Number(rewards.exp) || 0);

  // persist merged rewards (also keeps quests state persisted which was saved prior)
  saveProgress({
    gold: newGold,
    exp: newExp,
    inventory: newInv
  });
}

/* ---------- Utility: mark quest completed manually (force) ---------- */

export function completeQuestManually(questId) {
  const prog = loadProgress() || {};
  const quests = loadPlayerQuests(prog);
  if (quests.completed.includes(questId)) return { success: false, reason: "already-completed" };
  const newCompleted = quests.completed.concat([questId]);
  const newActive = { ...quests.active };
  if (newActive[questId]) delete newActive[questId];
  const merged = savePlayerQuests({ active: newActive, completed: newCompleted });
  tryApplyQuestRewards(questId);
  return { success: true, progress: merged };
}

/* ---------- Auto-subscribe to local game events ---------- */
/* This keeps Battle/UI clean — emit events from engine/BattleContext: emit('kill', {enemyId, qty}) etc.
   Subscriptions below will call updateQuestProgress(...) which updates/save quests and applies rewards. */

on("kill", (payload = {}) => {
  try {
    updateQuestProgress({ type: "kill", enemyId: payload.enemyId, qty: payload.qty || 1 });
  } catch (e) {
    console.error("quest handler kill failed", e);
  }
});

on("collect", (payload = {}) => {
  try {
    updateQuestProgress({ type: "collect", itemId: payload.itemId, qty: payload.qty || 1 });
  } catch (e) {
    console.error("quest handler collect failed", e);
  }
});

on("visit", (payload = {}) => {
  try {
    updateQuestProgress({ type: "visit", locationId: payload.locationId });
  } catch (e) {
    console.error("quest handler visit failed", e);
  }
});

on("travel", (payload = {}) => {
  try {
    updateQuestProgress({ type: "travel", from: payload.from, to: payload.to });
  } catch (e) {
    console.error("quest handler travel failed", e);
  }
});

/* ---------- Dungeon-clear subscription ---------- */
/* The dungeon system emits 'dungeon_clear' with { dungeonKey, runId, rewards } (see useDungeon.claimDungeonRewards).
   Normalize and forward to updateQuestProgress so clear_dungeon quests complete automatically.
*/
on("dungeon_clear", (payload = {}) => {
  try {
    // payload may have dungeonKey or dungeonId — forward both in a normalized event
    const event = { type: "dungeon_clear", dungeonKey: payload.dungeonKey || payload.dungeonId || payload.dungeon, runId: payload.runId, rewards: payload.rewards || null };
    updateQuestProgress(event);
  } catch (e) {
    console.error("quest handler dungeon_clear failed", e);
  }
});

