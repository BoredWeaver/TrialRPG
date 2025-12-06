// src/state/useDungeon.js
import { useEffect, useMemo, useState, useCallback } from "react";
import {
  saveDungeonSnapshot,
  loadDungeonSnapshot,
  loadAllDungeons,
  clearDungeon,
  saveActiveDungeonSnapshot,
  loadActiveDungeon,
  clearActiveRun,
  getActiveRunId,
} from "./dungeonStorage.js";

import {
  generateRoomEnemies,
  pickBossForDungeon,
} from "./dungeonUtils.js";

import { loadProgress } from "./playerProgress.js";
import DUNGEONS_DB from "../db/dungeons.json";

const DEFAULT_SIZE = 5;

function findDungeonDef(id) {
  if (!id) return null;
  try {
    const arr = Array.isArray(DUNGEONS_DB.dungeons) ? DUNGEONS_DB.dungeons : [];
    return arr.find(d => d && String(d.id) === String(id)) || null;
  } catch (e) {
    return null;
  }
}

function flattenEnemyPool(pool = {}) {
  const out = [];
  if (!pool || typeof pool !== "object") return out;
  ["common", "uncommon", "rare"].forEach(k => {
    if (Array.isArray(pool[k])) out.push(...pool[k]);
  });
  return out;
}

export default function useDungeon(initialRunId = null) {
  // Try to load initial run:
  const [run, setRun] = useState(() => {
    try {
      // priority: explicit initialRunId -> active run -> null
      if (initialRunId) {
        const s = loadDungeonSnapshot(initialRunId);
        if (s) return s;
      }
      const active = loadActiveDungeon();
      if (active) return active;
    } catch (e) {
      console.warn("[useDungeon] initial load failed", e);
    }
    return null;
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const size = run?.size || DEFAULT_SIZE;
  const tiles = useMemo(() => {
    if (!run) return [];
    return Array.isArray(run.tiles) ? run.tiles.slice() : [];
  }, [run]);

  const playerPos = useMemo(() => {
    if (!run || !run.playerPos) return { x: 0, y: 0 };
    return { x: Number(run.playerPos.x) || 0, y: Number(run.playerPos.y) || 0 };
  }, [run]);

  const visitedCount = run?.visitedCount || 0;
  const isFinished = !!run?.finished;

  // Persist run on change — for single-run policy we use saveActiveDungeonSnapshot when creating/updating
  useEffect(() => {
    if (!run) return;
    try {
      saveActiveDungeonSnapshot(run);
    } catch (e) {
      console.error("[useDungeon] save failed", e);
      setError(e);
    }
  }, [run]);

  /* storage helpers */
  function listAllRuns() {
    try {
      return loadAllDungeons();
    } catch (e) {
      console.error("[useDungeon] listAllRuns failed", e);
      return [];
    }
  }

  function loadRun(id) {
    if (!id) return;
    setLoading(true);
    try {
      const s = loadDungeonSnapshot(id);
      setRun(s || null);
      setError(null);
    } catch (e) {
      console.error("[useDungeon] loadRun failed", e);
      setError(e);
    } finally {
      setLoading(false);
    }
  }

  function removeRun(id) {
    try {
      return clearDungeon(id);
    } catch (e) {
      console.error("[useDungeon] removeRun failed", e);
      return false;
    }
  }

  function makeEmptyTilesGrid(n) {
    const out = [];
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        out.push({
          x,
          y,
          visited: false,
          type: "combat",
          enemies: null,
        });
      }
    }
    return out;
  }

  /**
   * startNewRun:
   * - Clears previous active run (single-run policy)
   * - Uses dungeon definition to set size, enemyList, min/max, boss
   * - Places boss in center tile (no appended tile)
   */
  function startNewRun(dungeonKey = "default", n = undefined, opts = {}) {
    // For single-run behavior, clear active run first
    try {
      clearActiveRun();
    } catch (e) {
      console.warn("[useDungeon] clearing active run failed", e);
    }

    // find def
    const def = findDungeonDef(dungeonKey);
    const sizeN = Math.max(1, Math.floor(Number(n || def?.size) || DEFAULT_SIZE));
    const id = opts.id || `run-${Date.now()}`;
    const seed = Number.isFinite(Number(opts.seed)) ? Number(opts.seed) : (Math.floor(Math.random() * 0xffffffff) >>> 0);

    let progress = null;
    try { progress = loadProgress() || null; } catch (e) { progress = null; }

    const tilesArr = makeEmptyTilesGrid(sizeN);
    // if def has boss, set center tile to boss type so it's detected as boss room
    if (def && def.boss && sizeN > 0) {
      const cx = Math.floor(sizeN / 2);
      const cy = Math.floor(sizeN / 2);
      const idx = cy * sizeN + cx;
      const t = tilesArr[idx];
      if (t) {
        tilesArr[idx] = { ...t, type: "boss", enemies: null };
      }
    }

    const now = Date.now();
    const meta = { ...(opts.meta || {}) };

    if (def) {
      if (!meta.enemyList || !Array.isArray(meta.enemyList) || meta.enemyList.length === 0) {
        meta.enemyList = flattenEnemyPool(def.enemyPool || {});
      }
      if (typeof meta.minEnemiesPerRoom === "undefined") meta.minEnemiesPerRoom = def.minEnemiesPerRoom ?? 1;
      if (typeof meta.maxEnemiesPerRoom === "undefined") meta.maxEnemiesPerRoom = def.maxEnemiesPerRoom ?? 3;
      if (!meta.boss && def.boss) meta.boss = def.boss;
    } else {
      if (!meta.enemyList) meta.enemyList = ["goblin"];
      if (typeof meta.minEnemiesPerRoom === "undefined") meta.minEnemiesPerRoom = 1;
      if (typeof meta.maxEnemiesPerRoom === "undefined") meta.maxEnemiesPerRoom = 3;
    }

    if (Array.isArray(opts.enemyList) && opts.enemyList.length > 0) meta.enemyList = opts.enemyList.slice();

    const snapshot = {
      id,
      dungeonKey: String(dungeonKey || "default"),
      seed,
      size: sizeN,
      tiles: tilesArr,
      playerPos: { x: 0, y: 0 },
      playerHP: typeof opts.playerHP !== "undefined" ? opts.playerHP : null,
      playerMP: typeof opts.playerMP !== "undefined" ? opts.playerMP : null,
      visitedCount: 0,
      finished: false,
      // **Do not mark bossTriggered true at creation** — it becomes true later when non-boss tiles cleared
      bossTriggered: false,
      createdAt: now,
      updatedAt: now,
      meta,
    };

    // Persist as active single-run snapshot
    try {
      saveActiveDungeonSnapshot(snapshot);
      console.log("[useDungeon] startNewRun created", snapshot.id, "key:", snapshot.dungeonKey, "seed:", snapshot.seed);
    } catch (e) {
      console.error("[useDungeon] startNewRun save failed", e);
    }

    setRun(snapshot);
    return snapshot;
  }

  function resumeRun(id) {
    // prefer loadActiveDungeon if no id provided
    if (!id) {
      const active = loadActiveDungeon();
      if (active) {
        setRun(active);
        return active;
      }
      return null;
    }
    loadRun(id);
  }

  function exitRun({ persistGlobalHP = false } = {}) {
    // Persist global HP is a caller decision; here just clear active run
    try {
      clearActiveRun();
    } catch (e) {
      console.warn("[useDungeon] exitRun clearActiveRun failed", e);
    }
    setRun(null);
  }

  function inBounds(x, y) {
    return x >= 0 && y >= 0 && x < size && y < size;
  }

  function canMove(dir) {
    if (!run) return false;
    const { x, y } = playerPos;
    switch (dir) {
      case "up": return inBounds(x, y - 1);
      case "down": return inBounds(x, y + 1);
      case "left": return inBounds(x - 1, y);
      case "right": return inBounds(x + 1, y);
      default: return false;
    }
  }

  function move(dir) {
    if (!run) return null;
    const { x, y } = playerPos;
    let nx = x, ny = y;
    switch (dir) {
      case "up": ny = y - 1; break;
      case "down": ny = y + 1; break;
      case "left": nx = x - 1; break;
      case "right": nx = x + 1; break;
      default: return null;
    }
    if (!inBounds(nx, ny)) return null;

    const idx = ny * size + nx;
    const nextRun = { ...run, playerPos: { x: nx, y: ny }, updatedAt: Date.now() };
    setRun(nextRun);
    return { run: nextRun, tileIndex: idx, tile: nextRun.tiles[idx] };
  }

  function getTileAt(x, y) {
    if (!run) return null;
    if (!inBounds(x, y)) return null;
    const idx = y * size + x;
    return run.tiles[idx] || null;
  }

  /**
   * enterRoom:
   * - if tile.visited -> return alreadyVisited true
   * - if tile.type === 'boss' -> generate boss based on def/meta
   * - otherwise generate room enemies and persist into run
   */
  function enterRoom(x, y) {
    if (!run) return null;
    if (!inBounds(x, y)) return null;

    const idx = y * size + x;
    const tile = run.tiles[idx] || null;
    if (!tile) return null;

    // If already visited -> return quickly
    if (tile.visited) {
      return {
        tileIndex: idx,
        tile: { ...tile },
        enemies: Array.isArray(tile.enemies) ? tile.enemies.slice() : [],
        playerOverrides: (run.playerHP != null || run.playerMP != null) ? { hp: run.playerHP, mp: run.playerMP } : null,
        alreadyVisited: true,
      };
    }

    let enemies = Array.isArray(tile.enemies) ? tile.enemies.slice() : null;
    let next = run;

    if (!enemies || enemies.length === 0) {
      const runEnemyList = Array.isArray(run?.meta?.enemyList) && run.meta.enemyList.length > 0 ? run.meta.enemyList.slice() : null;
      const chosenEnemyList = runEnemyList || optsEnemyListForDungeon(run.dungeonKey) || ["goblin"];
      const minCount = Number.isFinite(Number(run?.meta?.minEnemiesPerRoom)) ? Number(run.meta.minEnemiesPerRoom) : 1;
      const maxCount = Number.isFinite(Number(run?.meta?.maxEnemiesPerRoom)) ? Number(run.meta.maxEnemiesPerRoom) : Math.max(1, minCount);

      const genOpts = {
        dungeonKey: run.dungeonKey,
        seed: run.seed,
        idx,
        min: minCount,
        max: maxCount,
        enemyList: chosenEnemyList,
        allowRepeats: true,
      };

      console.log("[useDungeon] generating enemies", { dungeonKey: run.dungeonKey, idx, genOpts });

      if (tile.type === "boss") {
        const def = findDungeonDef(run.dungeonKey);
        const bossId = (run.meta && run.meta.boss && run.meta.boss.id) ? run.meta.boss.id : pickBossForDungeon({ dungeonKey: run.dungeonKey, seed: run.seed, def: def });
        enemies = [bossId];
      } else {
        enemies = generateRoomEnemies(genOpts);
      }

      const newTiles = run.tiles.slice();
      newTiles[idx] = { ...tile, enemies: enemies.slice() };
      next = { ...run, tiles: newTiles, updatedAt: Date.now() };
      setRun(next);
      try { saveActiveDungeonSnapshot(next); } catch (e) { console.error("[useDungeon] enterRoom save failed", e); }
      console.log("[useDungeon] enterRoom persisted generated enemies for idx", idx);
    }

    const playerOverrides = {};
    if (next.playerHP != null) playerOverrides.hp = next.playerHP;
    if (next.playerMP != null) playerOverrides.mp = next.playerMP;
    const overrides = Object.keys(playerOverrides).length > 0 ? playerOverrides : null;

    const savedTile = (next && Array.isArray(next.tiles) && next.tiles[idx]) ? next.tiles[idx] : { x, y, enemies: enemies.slice() };
    const savedEnemies = Array.isArray(savedTile.enemies) ? savedTile.enemies.slice() : (Array.isArray(enemies) ? enemies.slice() : []);

    return {
      tileIndex: idx,
      tile: { ...savedTile, enemies: savedEnemies },
      enemies: savedEnemies,
      playerOverrides: overrides,
      alreadyVisited: false,
    };
  }

  const handleBattleFinish = useCallback((battleState = {}, tileIndex = null) => {
    if (!run) return;
    if (!battleState || typeof battleState !== "object") return;

    const next = { ...run };

    try {
      if (typeof battleState.player?.hp === "number") next.playerHP = Number(battleState.player.hp);
      if (typeof battleState.player?.mp === "number") next.playerMP = Number(battleState.player.mp);
    } catch (e) { /* ignore */ }

    // If tileIndex provided, mark it visited on win
    if (Number.isFinite(Number(tileIndex)) && tileIndex >= 0 && tileIndex < next.tiles.length) {
      const t = { ...(next.tiles[tileIndex] || {}) };
      if (battleState.result === "win") {
        if (!t.visited) {
          t.visited = true;
          next.visitedCount = (Number(next.visitedCount) || 0) + 1;
          console.log("[useDungeon] marked tile visited", tileIndex, "newVisitedCount", next.visitedCount);
        }
      }
      next.tiles = next.tiles.slice();
      next.tiles[tileIndex] = t;
    }

    // Boss triggering logic (center tile used as boss)
    const tileLen = (Array.isArray(next.tiles) ? next.tiles.length : 0);
    const def = findDungeonDef(next.dungeonKey);

    if (def && def.boss) {
      // Determine center index
      const centerX = Math.floor(next.size / 2);
      const centerY = Math.floor(next.size / 2);
      const centerIdx = centerY * next.size + centerX;

      // If all non-boss tiles visited, flag bossTriggered
      const nonBossCount = tileLen - 1; // center is boss tile
      if (!next.bossTriggered && (next.visitedCount || 0) >= nonBossCount && !next.finished) {
        next.bossTriggered = true;
        console.log("[useDungeon] bossTriggered set true");
      }

      // If the battle was the boss (tileIndex equals center) and player won -> mark boss visited and finish
      if (Number.isFinite(Number(tileIndex)) && tileIndex === centerIdx && battleState.result === "win") {
        // mark center visited if not
        const ct = { ...(next.tiles[centerIdx] || {}) };
        if (!ct.visited) {
          ct.visited = true;
          next.visitedCount = (Number(next.visitedCount) || 0) + 1;
        }
        next.tiles = next.tiles.slice();
        next.tiles[centerIdx] = ct;
        next.finished = true;
        console.log("[useDungeon] boss tile beaten — run finished");
      }

      // If bossTriggered and battleState.result === "win" with tileIndex == null (some boss flows might call with null), mark finished
      if (next.bossTriggered && battleState.result === "win" && (tileIndex === null || tileIndex === undefined)) {
        next.finished = true;
      }
    } else {
      // No explicit boss in def: optionally treat last visited as finish
      if ((next.visitedCount || 0) >= tileLen) {
        next.finished = true;
      }
    }

    next.updatedAt = Date.now();
    setRun(next);
    try {
      saveActiveDungeonSnapshot(next);
      console.log("[useDungeon] handleBattleFinish saved snapshot", next.id);
    } catch (e) {
      console.error("[useDungeon] handleBattleFinish save failed", e);
    }
  }, [run]);

  function optsEnemyListForDungeon(dungeonKey) {
    const maps = {
      "goblin-den": ["goblin", "bat", "goblin_archer", "goblin_shaman"],
      "orc-cave": ["orc", "orc_berserker", "orc_shaman"],
      default: ["goblin"],
    };
    const def = findDungeonDef(dungeonKey);
    if (def && def.enemyPool) return flattenEnemyPool(def.enemyPool);
    return maps[dungeonKey] || maps.default;
  }

  function regenerateRoom(x, y, opts = {}) {
    if (!run) return null;
    if (!inBounds(x, y)) return null;
    const idx = y * size + x;
    const tile = run.tiles[idx];
    if (!tile) return null;

    const genOpts = {
      dungeonKey: run.dungeonKey,
      seed: run.seed,
      idx,
      min: opts.min ?? run?.meta?.minEnemiesPerRoom ?? 2,
      max: opts.max ?? run?.meta?.maxEnemiesPerRoom ?? 3,
      enemyList: opts.enemyList || run?.meta?.enemyList || optsEnemyListForDungeon(run.dungeonKey),
      allowRepeats: opts.allowRepeats ?? true,
    };
    let enemies;
    if (tile.type === "boss") {
      enemies = [ (run.meta && run.meta.boss && run.meta.boss.id) ? run.meta.boss.id : pickBossForDungeon({ dungeonKey: run.dungeonKey, seed: run.seed, def: findDungeonDef(run.dungeonKey) }) ];
    } else {
      enemies = generateRoomEnemies(genOpts);
    }

    const newTiles = run.tiles.slice();
    newTiles[idx] = { ...tile, enemies };
    const next = { ...run, tiles: newTiles, updatedAt: Date.now() };
    setRun(next);
    try { saveActiveDungeonSnapshot(next); } catch (e) { console.error("[useDungeon] regenerateRoom save failed", e); }
    return next.tiles[idx];
  }

  /**
   * startBossFight:
   * - Instead of appending a boss tile, directly set the center tile's enemies ready (if center exists)
   * - Also set bossTriggered true
   */
  function startBossFight(opts = {}) {
    if (!run) return null;
    if (run.bossTriggered) return run;
    const def = findDungeonDef(run.dungeonKey);
    const bossId = (run.meta && run.meta.boss && run.meta.boss.id) ? run.meta.boss.id : pickBossForDungeon({ dungeonKey: run.dungeonKey, seed: run.seed, def });
    // find center
    const cx = Math.floor(run.size / 2);
    const cy = Math.floor(run.size / 2);
    const centerIdx = cy * run.size + cx;
    const t = { ...(run.tiles[centerIdx] || {}) };
    t.type = "boss";
    t.enemies = [bossId];
    const newTiles = run.tiles.slice();
    newTiles[centerIdx] = t;
    const next = { ...run, tiles: newTiles, bossTriggered: true, updatedAt: Date.now() };
    setRun(next);
    try { saveActiveDungeonSnapshot(next); } catch (e) { console.error("[useDungeon] startBossFight save failed", e); }
    return next;
  }

  return {
    run,
    tiles,
    playerPos,
    size,
    loading,
    error,
    visitedCount,
    isFinished,
    listAllRuns,
    startNewRun,
    resumeRun,
    exitRun,
    removeRun,
    canMove,
    move,
    enterRoom,
    regenerateRoom,
    getTileAt,
    handleBattleFinish,
    startBossFight,
  };
}
