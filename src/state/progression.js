// src/state/progression.js
// --------------------------------------------------
// Central progression: EXP, leveling, stat rewards,
// AND "spell choice per milestone" system.
// --------------------------------------------------

import { loadProgress, saveProgress } from "./playerProgress.js";

/* ============================================================
   EXP CURVE
   ============================================================ */
export function calculateExpToNextLevel(level) {
  const L = Number(level) || 1;
  return Math.ceil(100 * Math.pow(1.2, Math.max(0, L - 1)));
}

/* ============================================================
   SPELL CHOICE TABLE (every 5 levels)
   Example structure:
   5: ["ice_spike", "rock_shot"]
   10: ["heal", "dark_orb"]
   etc.
   ============================================================ */
const SPELL_CHOICE_TABLE = {
  2:["firebolt","multi-shot"],
  5: ["ice_spike", "rock_shot"],
  10: ["freeze", "dark_orb"],
  15: ["burn", "freeze"],
  20: ["shield", "thunderbolt"],
  27: ["summon-skeletons", "split"],
};

/* ============================================================
   SPELLS GIVEN FOR FREE (no choice)
   ============================================================ */
const FIXED_SPELL_UNLOCKS = {
  1: ["firebolt"], // auto unlocked at level 1
};

/* ============================================================
   Helpers to query unlock tables
   ============================================================ */
export function getSpellChoicesAt(level) {
  return SPELL_CHOICE_TABLE[level] || [];
}

export function getFixedSpellsAt(level) {
  return FIXED_SPELL_UNLOCKS[level] || [];
}

/* ============================================================
   FREE UNLOCK (manual unlock for NPC / quest rewards)
   - Adds a spell to saved progress.spells and persists.
   - Returns updated progress or null on failure.
   ============================================================ */
export function freeUnlockSpell(spellId) {
  const progress = loadProgress() || null;
  if (!progress) return null;

  const set = new Set(progress.spells || []);
  set.add(spellId);
  progress.spells = Array.from(set);

  return saveProgress(progress);
}

/* ============================================================
   APPLY LEVEL REWARDS
   - +1 stat point
   - fixed spells auto added
   - returns array of choice options (strings) if any for this level
   ============================================================ */
export function applyLevelRewards(progress, newLevel) {
  if (!progress) return [];

  // +1 stat point
  progress.unspentPoints = (progress.unspentPoints | 0) + 1;

  // Fixed unlocks
  const fixed = getFixedSpellsAt(newLevel);
  if (fixed.length > 0) {
    const set = new Set(progress.spells || []);
    for (const s of fixed) set.add(s);
    progress.spells = Array.from(set);
  }

  // Choice unlocks
  const choices = getSpellChoicesAt(newLevel);
  return Array.isArray(choices) && choices.length > 0 ? choices.slice() : [];
}

/* ============================================================
   COMMIT A SPELL CHOICE
   - level: milestone level that produced the choice (number)
   - spellId: chosen spell id (string)
   Behavior:
     - adds spell to progress.spells
     - removes any pendingSpellChoices entries for that level
     - persists and returns updated progress (or null)
   ============================================================ */
export function commitChosenSpell(level, spellId) {
  if (!spellId) return null;

  // support legacy single-arg signature: commitChosenSpell(spellId)
  let lvl = null;
  let sid = spellId;
  if (typeof level === "string" && typeof spellId === "undefined") {
    sid = level;
    lvl = null;
  } else {
    lvl = Number.isFinite(Number(level)) ? Number(level) : null;
  }

  const progress = loadProgress() || null;
  if (!progress) return null;

  // add the spell (ensure uniqueness)
  const set = new Set(progress.spells || []);
  set.add(sid);
  progress.spells = Array.from(set);

  // Normalize pending shape: expect array of {level, options}
  const pending = Array.isArray(progress.pendingSpellChoices) ? progress.pendingSpellChoices.slice() : [];

  // Remove entries whose level matches provided level (if level provided)
  if (lvl !== null) {
    const filtered = pending.filter((p) => Number(p.level) !== lvl);
    progress.pendingSpellChoices = filtered.length > 0 ? filtered : [];
  } else {
    // If no level provided, attempt to remove any pending entry that contains the chosen spell
    const filtered = pending.filter((p) => !Array.isArray(p.options) || !p.options.includes(sid));
    progress.pendingSpellChoices = filtered.length > 0 ? filtered : [];
  }

  // Persist only the intentionally-changed fields to avoid accidental merges
  return saveProgress({
    spells: progress.spells,
    pendingSpellChoices: progress.pendingSpellChoices || [],
  });
}


/* ============================================================
   CHECK LEVEL-UP
   ============================================================ */
export function checkLevelUp(progress) {
  if (!progress) return false;
  return progress.exp >= calculateExpToNextLevel(progress.level);
}

/* ============================================================
   MAIN ENTRY — APPLY EXP
   Returns:
     {
       progress,            // updated persisted progress
       pendingChoices: []   // array of { level, options } for UI to optionally prompt immediately
     }
   Side-effect: when choices exist, they are appended to persisted progress.pendingSpellChoices
   ============================================================ */
export function applyExpGain(amount) {
  if (!Number.isFinite(amount) || amount <= 0)
    return { progress: loadProgress() || null, pendingChoices: [] };

  const progress = loadProgress() || {
    level: 1,
    exp: 0,
    unspentPoints: 0,
    stats: { STR: 3, DEX: 3, MAG: 3, CON: 3 },
    spells: [],
    inventory: {},
    gold: 0,
    equipped: {},
    pendingSpellChoices: [],
  };

  progress.exp = Number(progress.exp || 0) + Math.floor(amount);

  const pendingChoices = [];

  // Level loop: allow multiple levels if sufficient EXP
  let guard = 100;
  while (guard-- > 0) {
    const need = calculateExpToNextLevel(progress.level);
    if (progress.exp < need) break;

    progress.exp -= need;
    progress.level += 1;

    const choices = applyLevelRewards(progress, progress.level);
    if (choices.length > 0) {
      // record for immediate UI prompt and persist
      pendingChoices.push({ level: progress.level, options: choices.slice() });
    }
  }

  // If there are pending choices, append them to progress.pendingSpellChoices (persisted)
  if (!Array.isArray(progress.pendingSpellChoices)) progress.pendingSpellChoices = [];
  if (pendingChoices.length > 0) {
    // append (avoid duplicates for same level)
    const existingLevels = new Set(progress.pendingSpellChoices.map((p) => Number(p.level)));
    for (const pc of pendingChoices) {
      if (!existingLevels.has(Number(pc.level))) {
        progress.pendingSpellChoices.push(pc);
      } else {
        // Replace existing same-level entry with fresh options (safer)
        progress.pendingSpellChoices = progress.pendingSpellChoices.map((p) =>
          Number(p.level) === Number(pc.level) ? pc : p
        );
      }
    }
  }

  const saved = saveProgress(progress);

  return {
    progress: saved,
    pendingChoices,
  };
}
