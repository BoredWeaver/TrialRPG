// src/state/useBattle.js
// ----------------------------------
// Backwards-compatible, multi-enemy ready version
// Pure-friendly: engine.* are treated as pure functions that return a new state.
import { useEffect, useMemo, useRef, useState } from "react";

import {
  startBattle,
  playerAttack,
  playerCast,
  playerUseItem,
  enemyAct,
  getSpells,
  canCast,
  getItems,
  canUseItem,
  allocateStat,
} from "../engine/engine.js";

import { saveProgress } from "./playerProgress.js";
import { loadSnapshot, saveSnapshot, clearSnapshot } from "./storage.js";
import { emit } from "./gameEvents.js"; // using the tiny local emitter

const DEFAULT_ENEMY_ID = "goblin";
const DEFAULT_ENEMY_DELAY_MS = 600;

/* ============================================================
   HOOK
   - Backwards compatible: handles single `enemy` or `enemies` array
   - Adds selectedTarget and multi-target aware actions
   ============================================================ */
export function useBattle() {
  const [battle, setBattle] = useState(() => loadInitialBattle());
  const [busy, setBusy] = useState(false);

  // Which enemy index the player currently has selected (UI convenience)
  const [selectedTarget, setSelectedTarget] = useState(getInitialSelectedTarget());

  const enemyDelayMs = useRef(DEFAULT_ENEMY_DELAY_MS);
  const timerRef = useRef(null);

  // Track which enemy(s) this battle belongs to (ids as started)
  const currentEnemyIdRef = useRef(battle?.enemyId || DEFAULT_ENEMY_ID);
  // initialEnemyIdsRef stores the initial enemy id list for this battle (handles multi-type)
  const initialEnemyIdsRef = useRef(
    Array.isArray(battle?.enemies) && battle.enemies.length > 0
      ? battle.enemies.map((e) => e.id || DEFAULT_ENEMY_ID)
      : [(battle?.enemy?.id || battle?.enemyId) || DEFAULT_ENEMY_ID]
  );

  // Keep previous battle snapshot for diffing (inventory / result transitions)
  // NOTE: initialize to null so we can skip the initial auto-save that would stomp persisted progress.
  const prevBattleRef = useRef(null);

  // onFinish callback ref for the currently-active battle (set in startWithEnemy)
  const onFinishRef = useRef(null);
  // ensure we call onFinish only once per started battle
  const finishCalledRef = useRef(false);

  /* ------------------ Derived UI Structs ------------------ */

  const spells = useMemo(() => getSpells(battle) || [], [battle]);
  const items  = useMemo(() => getItems(battle) || [],  [battle]);

  const actions = useMemo(() => {
    const canAct = !battle.over && battle.turn === "player" && !busy;

    const spellMap = {};
    for (const sp of (spells || [])) {
      if (!sp) continue;
      spellMap[sp.id] = canAct && canCast(battle, sp.id);
    }

    const itemMap = {};
    for (const it of (items || [])) {
      if (!it) continue;
      itemMap[it.id] = canAct && canUseItem(battle, it.id);
    }

    return {
      canAttack: canAct,
      spells: spellMap,
      items: itemMap,
    };
  }, [battle, busy, spells, items]);

  const progress = useMemo(() => {
    const need = expNeededFor(battle.player.level);
    const exp = battle.player.exp;
    const pct = need > 0 ? Math.min(1, exp / need) : 0;
    const points = battle.player.unspentPoints | 0;
    return { level: battle.player.level, exp, need, pct, points };
  }, [battle.player]);

  /* ============================================================
     AUTO SAVE — Snapshot + persistent progress
     - IMPORTANT: skip initial mount save to avoid overwriting persisted progress
       (some code builds a fresh player from playerBase before other systems finish).
     ============================================================ */
  useEffect(() => {
    // If prevBattleRef.current is null, this is the initial mount — seed prevBattleRef and skip persisting.
    if (prevBattleRef.current === null) {
      // seed and return: next updates will persist as normal
      prevBattleRef.current = buildSnapshotObject(battle);
      return;
    }

    // On subsequent changes, persist snapshot + progress
    saveSnapshot(buildSnapshotObject(battle));

    saveProgress({
      level: battle.player.level,
      exp: battle.player.exp,
      unspentPoints: battle.player.unspentPoints,
      stats: battle.player.stats,
      inventory: battle.player.items,
      spells: battle.player.spells,
      gold: battle.player.gold,
      equipped: battle.player.equipped,
    });
    // do not update prevBattleRef here; prevBattleRef is updated in the transition effect
  }, [battle]);

  /* ============================================================
     EMIT QUEST / GAME EVENTS ON WIN TRANSITION (multi-enemy aware)
     - Emits only once when result transitions to "win".
     ============================================================ */
  useEffect(() => {
    const prev = prevBattleRef.current;
    const prevResult = prev?.result;
    const curResult = battle?.result;

    // only act on transition into win (and ensure we had a prev)
    if (prev && prevResult !== "win" && curResult === "win") {
      // ensure progress persisted (saveProgress called in other effect, but call again to be explicit)
      saveProgress({
        level: battle.player.level,
        exp: battle.player.exp,
        unspentPoints: battle.player.unspentPoints,
        stats: battle.player.stats,
        inventory: battle.player.items,
        spells: battle.player.spells,
        gold: battle.player.gold,
        equipped: battle.player.equipped,
      });

      // 1) kill events: aggregate by enemy id from initialEnemyIdsRef
      const started = Array.isArray(initialEnemyIdsRef.current)
        ? initialEnemyIdsRef.current.slice()
        : [(initialEnemyIdsRef.current || DEFAULT_ENEMY_ID)];

      const killsAgg = {};
      for (const id of started) {
        const key = String(id || DEFAULT_ENEMY_ID);
        killsAgg[key] = (killsAgg[key] || 0) + 1;
      }
      for (const [enemyId, qty] of Object.entries(killsAgg)) {
        try {
          emit("kill", { enemyId, qty });
        } catch (e) {
          console.error("[useBattle] emit kill failed:", e);
        }
      }

      // 2) collect events: compare prev.inventory -> current inventory and emit positive deltas
      const prevInv = (prev.player && prev.player.items) ? prev.player.items : {};
      const curInv = (battle.player && battle.player.items) ? battle.player.items : {};
      const collectedAgg = {};
      for (const [itemId, curQtyRaw] of Object.entries(curInv)) {
        const curQty = Number(curQtyRaw) || 0;
        const prevQty = Number(prevInv[itemId]) || 0;
        const delta = curQty - prevQty;
        if (delta > 0) {
          collectedAgg[itemId] = (collectedAgg[itemId] || 0) + delta;
        }
      }
      for (const [itemId, qty] of Object.entries(collectedAgg)) {
        try {
          emit("collect", { itemId, qty });
        } catch (e) {
          console.error("[useBattle] emit collect failed:", e);
        }
      }

      // 3) generic battle_win meta event (includes list of started enemies)
      try {
        emit("battle_win", { enemies: started.slice(), timestamp: Date.now() });
      } catch (e) {
        console.error("[useBattle] emit battle_win failed:", e);
      }
    }

    // update prevBattleRef for next transition detection
    prevBattleRef.current = battle;
  }, [battle]);

  /* ============================================================
     AUTO ENEMY TURN (calls pure engine.enemyAct)
     ============================================================ */
  useEffect(() => {
    if (battle.over || battle.turn !== "enemy") return;
    if (timerRef.current) return;

    setBusy(true);
    timerRef.current = setTimeout(() => {
      setBattle((prev) => {
        try {
          // engine.enemyAct is pure: pass prev, get a new state back
          const next = enemyAct(prev);
          return next || prev;
        } catch (e) {
          console.error("[useBattle] enemyAct threw:", e);
          return prev;
        }
      });
      setBusy(false);
      timerRef.current = null;
    }, enemyDelayMs.current);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
        setBusy(false);
      }
    };
  }, [battle.turn, battle.over]);

  /* ============================================================
     CALL ONFINISH WHEN BATTLE ENDS
     - Ensures the provided onFinish is called exactly once for the started battle.
     - Calls the user-provided onFinish as: onFinish(battle, meta)
     ============================================================ */
  useEffect(() => {
    // Only proceed when a battle has ended and we have an onFinish handler set
    if (!battle) return;
    if (!onFinishRef.current) return;
    if (!battle.over) return;
    if (finishCalledRef.current) return;

    try {
      const wrapper = onFinishRef.current;
      finishCalledRef.current = true;
      try {
        // wrapper will internally call user's onFinish(battle, meta)
        wrapper(battle);
      } catch (err) {
        console.error("[useBattle] onFinish callback threw:", err);
      }
    } finally {
      // cleanup - clear ref so it won't be called again
      onFinishRef.current = null;
    }
  }, [battle.over, battle.result, battle]);

  /* ============================================================
     Keep selectedTarget valid when enemies change or die
     ============================================================ */
  useEffect(() => {
    const all = getAllEnemies(battle);
    if (!all || all.length === 0) {
      setSelectedTarget(0);
      return;
    }

    const currentIdx = selectedTarget | 0;
    if (currentIdx < all.length && (all[currentIdx]?.hp | 0) > 0) return;

    const firstAlive = all.findIndex(e => (e.hp | 0) > 0);
    setSelectedTarget(firstAlive >= 0 ? firstAlive : 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [battle.enemies, battle.enemy, battle?.log?.length]);

  /* ============================================================
     PLAYER ACTIONS (now accept optional targetIndex)
     - Calls engine functions as pure functions (they return new state)
     ============================================================ */

  function doAttack(targetIndex = null) {
    if (battle.turn !== "player" || busy || battle.over) return;
    setBattle((prev) => {
      const target = targetIndex ?? selectedTarget;
      try {
        const next = playerAttack(prev, target);
        return next || prev;
      } catch (e) {
        console.error("[useBattle] playerAttack threw (with target). Falling back:", e);
        try {
          const next = playerAttack(prev);
          return next || prev;
        } catch (e2) {
          console.error("[useBattle] playerAttack fallback threw:", e2);
          return prev;
        }
      }
    });
  }

  function doCast(spellId, targetIndex = null) {
    if (battle.turn !== "player" || busy || battle.over) return;
    if (!canCast(battle, spellId)) return;

    setBattle((prev) => {
      const target = targetIndex ?? selectedTarget;
      try {
        const next = playerCast(prev, spellId, target);
        return next || prev;
      } catch (e) {
        console.error("[useBattle] playerCast threw (with target). Falling back:", e);
        try {
          const next = playerCast(prev, spellId);
          return next || prev;
        } catch (e2) {
          console.error("[useBattle] playerCast fallback threw:", e2);
          return prev;
        }
      }
    });
  }

  function doUse(itemId, targetIndex = null) {
    if (battle.turn !== "player" || busy || battle.over) return;
    if (!canUseItem(battle, itemId)) return;

    setBattle((prev) => {
      const target = targetIndex ?? selectedTarget;
      try {
        const next = playerUseItem(prev, itemId, target);
        return next || prev;
      } catch (e) {
        console.error("[useBattle] playerUseItem threw (with target). Falling back:", e);
        try {
          const next = playerUseItem(prev, itemId);
          return next || prev;
        } catch (e2) {
          console.error("[useBattle] playerUseItem fallback threw:", e2);
          return prev;
        }
      }
    });
  }

  function doAllocate(statKey) {
    setBattle((prev) => {
      try {
        const next = allocateStat(prev, statKey);
        return next || prev;
      } catch (e) {
        console.error("[useBattle] allocateStat threw:", e);
        return prev;
      }
    });
  }

  /* ============================================================
     TARGETING helpers (UI)
     ============================================================ */

  function selectTarget(idx) {
    setSelectedTarget(idx | 0);
  }

  function getAliveEnemies() {
    return getAllEnemies(battle).filter(e => (e.hp | 0) > 0);
  }

  function getAllEnemies(stateObj) {
    const s = stateObj || battle;
    if (Array.isArray(s.enemies) && s.enemies.length > 0) return s.enemies;
    if (s.enemy) return [s.enemy];
    return [];
  }

  /* ============================================================
     NEW BATTLE START (accepts string id or array of ids)
     - New signature:
        startWithEnemy(enemyIdOrArray, playerOverrides = null, opts = {})
       where playerOverrides = { hp, mp } and opts = { onFinish, meta, ... }
     - Backwards compatible: callers can still call startWithEnemy(enemyIdOrArray)
     ============================================================ */

  function startWithEnemy(enemyIdOrArray, playerOverrides = null, opts = {}) {
    clearSnapshot();

    let id;
    let idsArray = null;
    if (Array.isArray(enemyIdOrArray)) {
      id = (enemyIdOrArray[0]) || DEFAULT_ENEMY_ID;
      idsArray = enemyIdOrArray.slice();
    } else {
      id = (enemyIdOrArray && String(enemyIdOrArray).trim()) || DEFAULT_ENEMY_ID;
      idsArray = [id];
    }
    currentEnemyIdRef.current = id;
    // store the *initial* list for later event emission (handles multi-type)
    initialEnemyIdsRef.current = idsArray.map((x) => String(x || DEFAULT_ENEMY_ID));

    // register onFinish callback (if provided) and wrap to include opts.meta
    if (opts && typeof opts.onFinish === "function") {
      const userOnFinish = opts.onFinish;
      const meta = opts.meta; // may be undefined/null
      // store a wrapper that calls user's callback with (battle, meta)
      onFinishRef.current = function(battleState) {
        try {
          userOnFinish(battleState, meta);
        } catch (err) {
          // surface error but don't crash the engine
          console.error("[useBattle] user onFinish threw:", err);
        }
      };
      finishCalledRef.current = false;
    } else {
      onFinishRef.current = null;
      finishCalledRef.current = false;
    }

    cancelEnemyTimer();
    setBusy(false);

    const fresh = startBattle(enemyIdOrArray);
    fresh.enemyId = id;

    // Apply playerOverrides to the fresh battle state if provided
    if (playerOverrides && typeof playerOverrides === "object") {
      try {
        // only set numeric values and clamp sensibly
        if (Number.isFinite(Number(playerOverrides.hp))) {
          const hpVal = Math.floor(Number(playerOverrides.hp));
          // clamp between 0 and fresh.player.maxHP if available
          if (Number.isFinite(Number(fresh.player?.maxHP))) {
            fresh.player.hp = Math.max(0, Math.min(fresh.player.maxHP, hpVal));
          } else {
            fresh.player.hp = Math.max(0, hpVal);
          }
        }
        if (Number.isFinite(Number(playerOverrides.mp))) {
          const mpVal = Math.floor(Number(playerOverrides.mp));
          if (Number.isFinite(Number(fresh.player?.maxMP))) {
            fresh.player.mp = Math.max(0, Math.min(fresh.player.maxMP, mpVal));
          } else {
            fresh.player.mp = Math.max(0, mpVal);
          }
        }
      } catch (e) {
        console.error("[useBattle] applying playerOverrides failed", e);
      }
    }

    setBattle(fresh);
    setSelectedTarget(getFirstAliveIndex(fresh));
    // seed prevBattleRef so transition detection behaves
    prevBattleRef.current = fresh;
  }

  /* ============================================================
     MANUAL LOAD/SAVE (OPTIONAL UI)
     ============================================================ */

  function load() {
    const snap = loadSnapshot();
    if (!snap) return;
    const restored = restoreSnapshot(snap);
    setBattle(restored);
    setSelectedTarget(getFirstAliveIndex(restored));
  }

  function save() {
    saveSnapshot(buildSnapshotObject(battle));
  }

  function clearSave() {
    clearSnapshot();
  }

  function setEnemyDelay(ms) {
    const n = Number(ms);
    if (Number.isFinite(n)) {
      enemyDelayMs.current = Math.min(Math.max(0, n), 2000);
    }
  }

  /* ============================================================
     RETURN API
     ============================================================ */
  return {
    battle,
    busy,
    spells,
    items,
    actions,
    progress,

    // targeting helpers
    selectedTarget,
    selectTarget,
    getAliveEnemies,
    getAllEnemies: () => getAllEnemies(battle),

    // actions
    doAttack,
    doCast,
    doUse,
    doAllocate,

    startWithEnemy,
    // retry removed on purpose (UI should show "Return to City")
    load,
    save,
    clearSave,
    setEnemyDelay,
  };

  /* ============================================================
     INTERNAL HELPERS
     ============================================================ */

  function cancelEnemyTimer() {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }

  function getFirstAliveIndex(b) {
    const list = Array.isArray(b.enemies) && b.enemies.length > 0 ? b.enemies
               : b.enemy ? [b.enemy] : [];
    for (let i = 0; i < list.length; i++) {
      if ((list[i].hp | 0) > 0) return i;
    }
    return 0;
  }

  function getInitialSelectedTarget() {
    try {
      const snap = loadSnapshot();
      if (!snap) return 0;

      if (Array.isArray(snap.enemies) && snap.enemies.length > 0) {
        for (let i = 0; i < snap.enemies.length; i++) {
          const hp = Number(snap.enemies[i]?.hp) || 0;
          if (hp > 0) return i;
        }
        return 0;
      }

      return 0;
    } catch {
      return 0;
    }
  }
}

/* ============================================================
   INITIAL LOAD
   ============================================================ */

function loadInitialBattle() {
  const snap = loadSnapshot();
  if (!snap) return makeFreshBattle(DEFAULT_ENEMY_ID);
  return restoreSnapshot(snap);
}

function makeFreshBattle(id) {
  const b = startBattle(id);
  b.enemyId = id;
  return b;
}

/* ============================================================
   SNAPSHOT SAVE FORMAT
   ============================================================ */
function buildSnapshotObject(b) {
  // include runtime statuses & cooldowns for player + enemies (optional but helpful to resume)
  const enemiesArr = Array.isArray(b.enemies) && b.enemies.length > 0
    ? b.enemies.map(en => ({
        id: en.id || null,
        hp: en.hp,
        statuses: Array.isArray(en.statuses) ? en.statuses.map(s => ({ ...s })) : [],
        _cooldowns: en._cooldowns ? { ...(en._cooldowns) } : {},
      }))
    : b.enemy ? [{
        id: b.enemy.id || null,
        hp: b.enemy.hp,
        statuses: Array.isArray(b.enemy.statuses) ? b.enemy.statuses.map(s => ({ ...s })) : [],
        _cooldowns: b.enemy._cooldowns ? { ...(b.enemy._cooldowns) } : {},
      }] : [];

  return {
    enemyId: b.enemyId || DEFAULT_ENEMY_ID,

    player: {
      level: b.player.level,
      exp: b.player.exp,
      unspentPoints: b.player.unspentPoints,
      stats: { ...b.player.stats },
      hp: b.player.hp,
      mp: b.player.mp,
      items: { ...b.player.items },
      spells: [...b.player.spells],
      gold: b.player.gold,
      equipped: { ...b.player.equipped },
      // runtime fields
      statuses: Array.isArray(b.player.statuses) ? b.player.statuses.map(s => ({ ...s })) : [],
      _cooldowns: b.player._cooldowns ? { ...(b.player._cooldowns) } : {},
    },

    enemies: enemiesArr,
    turn: b.turn,
    over: b.over,
    result: b.result,
    log: [...b.log],
  };
}


/* ============================================================
   SNAPSHOT RESTORE — Backwards compatible
   ============================================================ */
function restoreSnapshot(snap) {
  try {
    if (!snap) throw new Error("invalid snapshot");

    const hasEnemies = Array.isArray(snap.enemies) && snap.enemies.length > 0;
    const enemySource = hasEnemies
      ? snap.enemies.map(e => e.id)
      : [snap.enemyId || DEFAULT_ENEMY_ID];

    // Rebuild baseline battle from engine
    const fresh = startBattle(enemySource.length === 1 ? enemySource[0] : enemySource);
    fresh.enemyId = enemySource[0] || DEFAULT_ENEMY_ID;

    // Restore player
    fresh.player.level = snap.player.level;
    fresh.player.exp = snap.player.exp;
    fresh.player.unspentPoints = snap.player.unspentPoints;
    fresh.player.stats = snap.player.stats;
    fresh.player.items = snap.player.items;
    fresh.player.spells = snap.player.spells;
    fresh.player.gold = snap.player.gold;
    fresh.player.equipped = snap.player.equipped;

    // Derived combat values
    const derived = deriveFromStats(fresh.player.stats, fresh.player.level);
    fresh.player.atk = derived.atk;
    fresh.player.def = derived.def;
    fresh.player.mAtk = derived.mAtk;
    fresh.player.mDef = derived.mDef;
    fresh.player.maxHP = derived.maxHP;
    fresh.player.maxMP = derived.maxMP;

    fresh.player.hp = clamp(snap.player.hp, 0, fresh.player.maxHP, fresh.player.hp);
    fresh.player.mp = clamp(snap.player.mp, 0, fresh.player.maxMP, fresh.player.mp);

    // Restore optional runtime fields for player (statuses, cooldowns)
    if (snap.player && snap.player.statuses) {
      fresh.player.statuses = Array.isArray(snap.player.statuses) ? snap.player.statuses.map(s => ({ ...s })) : [];
    } else {
      fresh.player.statuses = fresh.player.statuses || [];
    }
    if (snap.player && snap.player._cooldowns) {
      fresh.player._cooldowns = { ...(snap.player._cooldowns || {}) };
    } else {
      fresh.player._cooldowns = fresh.player._cooldowns || {};
    }

    // Restore enemies
    if (hasEnemies) {
      const baseline = Array.isArray(fresh.enemies) && fresh.enemies.length > 0
        ? fresh.enemies
        : fresh.enemy ? [fresh.enemy] : [];

      fresh.enemies = baseline.map((base, idx) => {
        const snapEntry = snap.enemies[idx] || {};
        return {
          ...base,
          hp: clamp(snapEntry.hp, 0, base.maxHP, base.hp),
          statuses: Array.isArray(snapEntry.statuses) ? snapEntry.statuses.map(s => ({ ...s })) : (base.statuses ? base.statuses.slice() : []),
          _cooldowns: snapEntry._cooldowns ? { ...(snapEntry._cooldowns) } : (base._cooldowns ? { ...(base._cooldowns) } : {}),
        };
      });

      delete fresh.enemy;
    } else {
      // single enemy path: try to patch runtime fields if present in snap.enemies[0]
      const sEntry = Array.isArray(snap.enemies) && snap.enemies[0] ? snap.enemies[0] : null;
      if (sEntry && fresh.enemy) {
        fresh.enemy.statuses = Array.isArray(sEntry.statuses) ? sEntry.statuses.map(s => ({ ...s })) : (fresh.enemy.statuses || []);
        fresh.enemy._cooldowns = sEntry._cooldowns ? { ...(sEntry._cooldowns) } : (fresh.enemy._cooldowns || {});
      }
    }

    // Restore meta fields
    fresh.turn = snap.turn;
    fresh.over = snap.over;
    fresh.result = snap.result;
    fresh.log = Array.isArray(snap.log) ? snap.log.slice(-50) : [];

    return fresh;
  } catch {
    return makeFreshBattle(DEFAULT_ENEMY_ID);
  }
}


/* ============================================================
   MISC SMALL UTILITIES
   ============================================================ */

function clamp(n, min, max, fallback) {
  const x = Number(n);
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

function expNeededFor(level) {
  return Math.ceil(100 * Math.pow(1.2, Math.max(0, level - 1)));
}
