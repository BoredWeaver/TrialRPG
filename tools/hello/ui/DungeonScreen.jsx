// src/ui/DungeonScreen.jsx
import React, { useMemo, useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import useDungeon from "../state/useDungeon.js";
import { useBattleContext } from "../state/BattleContext.jsx";

/**
 * DungeonScreen — simplified / mobile-first
 * - Removed tile numbers and textual "visited/untouched" labels; colors indicate state.
 * - Side panel removed and moved into a compact bottom bar containing HP/MP and primary actions.
 * - Preserves all existing run logic and battle hooks; only UI cleaned.
 */

export default function DungeonScreen() {
  const navigate = useNavigate();
  const dungeon = useDungeon(); // run management hook
  const battle = useBattleContext(); // battle engine/context

  const {
    run,
    playerPos,
    size,
    startNewRun,
    resumeRun,
    enterRoom,
    move,
    canMove,
    exitRun,
    startBossFight,
    handleBattleFinish,
    listAllRuns,
  } = dungeon;

  const [dungeonKey, setDungeonKey] = useState("goblin-den");
  const inputRef = useRef(null);
  const activeBattleRef = useRef(null);

  // keep UI dungeonKey in sync with active run
  useEffect(() => {
    if (run && run.dungeonKey && run.dungeonKey !== dungeonKey) {
      setDungeonKey(run.dungeonKey);
    }
  }, [run]);

  function startBattleFromPayload(payload, tileIndex) {
    if (!payload) {
      console.warn("[DungeonScreen] startBattleFromPayload: no payload");
      return;
    }
    if (payload.alreadyVisited || (payload.tile && payload.tile.visited)) {
      console.info("[DungeonScreen] tile already visited — not starting battle", tileIndex);
      return;
    }
    if (!battle || typeof battle.startWithEnemy !== "function") {
      console.warn("[DungeonScreen] battle context not ready — cannot start");
      return;
    }

    activeBattleRef.current = { tileIndex };

    battle.startWithEnemy(payload.enemies, payload.playerOverrides || null, {
      meta: { tileIndex },
      onFinish: (finalState, meta) => {
        const expected = activeBattleRef.current;
        const idx = meta?.tileIndex;
        if (!expected || expected.tileIndex !== idx) {
          console.warn("[DungeonScreen] onFinish for non-active battle (ignored)", { idx, expected });
          return;
        }
        activeBattleRef.current = null;

        if (finalState.result === "loss") {
          exitRun();
          navigate("/");
          return;
        }

        try {
          handleBattleFinish(finalState, idx);
        } catch (e) {
          console.error("[DungeonScreen] handleBattleFinish threw", e);
        }
      },
    });

    navigate("/combat");
  }

  function handleStartNew() {
    const started = startNewRun(dungeonKey);
    if (started && started.id) {
      setDungeonKey(started.dungeonKey || dungeonKey);
    }
  }

  function handleResume() {
    if (!run) {
      const all = listAllRuns?.() || [];
      if (all.length > 0) {
        const sorted = all.slice().sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
        const candidate = sorted[0];
        if (candidate && candidate.id) {
          resumeRun(candidate.id);
          if (candidate.dungeonKey) setDungeonKey(candidate.dungeonKey);
        }
      }
    }
  }

  function handleMoveDir(dir) {
    if (!canMove(dir)) return;
    const res = move(dir);
    if (!res) return;
    const { tileIndex, tile } = res;
    setTimeout(() => {
      try {
        const payload = enterRoom(tile.x, tile.y);
        if (!payload) return;
        if (payload.tile && payload.tile.visited) return;
        startBattleFromPayload(payload, tileIndex);
      } catch (e) {
        console.error("[DungeonScreen] auto-enter failed", e);
      }
    }, 30);
  }

  function computeDir(from, to) {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    if (dx === 1 && dy === 0) return "right";
    if (dx === -1 && dy === 0) return "left";
    if (dx === 0 && dy === 1) return "down";
    if (dx === 0 && dy === -1) return "up";
    return null;
  }

  function handleTileClick(tile, index) {
    if (!run) return;
    const from = playerPos || { x: 0, y: 0 };
    if (tile.x === from.x && tile.y === from.y) {
      const idx = typeof index === "number" ? index : (tile.y * (run.size || size) + tile.x);
      const savedTile = run.tiles?.[idx];
      if (savedTile?.visited) return;
      const payload = enterRoom(tile.x, tile.y);
      startBattleFromPayload(payload, idx);
      return;
    }
    const dir = computeDir(from, tile);
    if (dir) handleMoveDir(dir);
  }

  function startBattleForCurrentTile() {
    if (!run) return;
    const { x, y } = playerPos || { x: 0, y: 0 };
    const idx = y * (run.size || size) + x;
    const tile = run.tiles?.[idx];
    if (tile?.visited) return;
    const payload = enterRoom(x, y);
    startBattleFromPayload(payload, idx);
  }

  function handleStartBoss() {
    if (!run) return;
    if (!run.bossTriggered) return;
    const payload = startBossFight?.();
    if (!payload) return;
    activeBattleRef.current = { tileIndex: null, isBoss: true };
    if (!battle || typeof battle.startWithEnemy !== "function") return;
    battle.startWithEnemy(payload.enemies, payload.playerOverrides || null, {
      meta: { boss: true },
      onFinish: (finalState) => {
        activeBattleRef.current = null;
        if (finalState.result === "loss") {
          exitRun();
          navigate("/");
          return;
        }
        try {
          handleBattleFinish(finalState, null);
        } catch (e) {
          console.error("[DungeonScreen] boss onFinish handling failed", e);
        }
      },
    });
    navigate("/combat");
  }

  // keyboard nav
  useEffect(() => {
    if (!run) return;
    function onKey(e) {
      const active = document.activeElement;
      if (active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA" || active.isContentEditable)) return;
      switch (e.key) {
        case "ArrowUp": e.preventDefault(); if (canMove("up")) handleMoveDir("up"); break;
        case "ArrowDown": e.preventDefault(); if (canMove("down")) handleMoveDir("down"); break;
        case "ArrowLeft": e.preventDefault(); if (canMove("left")) handleMoveDir("left"); break;
        case "ArrowRight": e.preventDefault(); if (canMove("right")) handleMoveDir("right"); break;
        case "Enter": e.preventDefault(); startBattleForCurrentTile(); break;
        default: break;
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [run, playerPos, canMove]);

  const hp = run?.playerHP ?? "—";
  const mp = run?.playerMP ?? "—";

  // render helpers
  const gridCols = run ? run.size : size || 5;
  const tiles = run ? (run.tiles || []) : [];

  return (
    <div style={styles.root}>
      <div style={styles.header}>
        <div>
          <h2 style={{ margin: 0 }}>Dungeon</h2>
          <div style={{ fontSize: 13, color: "#666", marginTop: 6 }}>
            {run ? `Run: ${run.id}` : "No active run"}
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {!run ? (
            <>
              <input
                ref={inputRef}
                value={dungeonKey}
                onChange={(e) => setDungeonKey(e.target.value)}
                style={styles.input}
                placeholder="dungeon key"
              />
              <button style={styles.button} onClick={handleStartNew}>Start Run</button>
              <button style={styles.button} onClick={handleResume}>Resume</button>
              <button style={styles.button} onClick={() => navigate("/")}>Back to City</button>
            </>
          ) : (
            <>
              <button style={styles.button} onClick={() => navigate("/")}>Return to City</button>
              <button style={styles.button} onClick={() => exitRun()}>Exit Run</button>
              <button style={{ ...styles.button, ...(run?.bossTriggered ? {} : styles.disabledBtn) }} onClick={handleStartBoss} disabled={!run?.bossTriggered}>
                Fight Final Boss
              </button>
            </>
          )}
        </div>
      </div>

      {run ? (
        <div style={styles.mapWrap}>
          <div style={{ ...styles.mapGrid, gridTemplateColumns: `repeat(${gridCols}, 1fr)` }}>
            {Array.from({ length: tiles.length }).map((_, i) => {
              const tile = tiles[i] ?? { x: i % gridCols, y: Math.floor(i / gridCols), visited: false, enemies: null, type: "combat" };
              const isPlayer = tile.x === (playerPos?.x ?? 0) && tile.y === (playerPos?.y ?? 0);
              const visitedTile = Boolean(tile.visited);
              const isBoss = tile.type === "boss";

              // colors only — no numbers/text for visited/untouched per request
              const bg = isPlayer ? "#e6f2ff" : isBoss ? "#fff0f0" : (visitedTile ? "#f0fff4" : "#ffffff");
              const border = isPlayer ? "2px solid #2b6cb0" : "1px solid #e6e6e6";

              return (
                <div
                  key={`cell-${i}`}
                  onClick={() => handleTileClick(tile, i)}
                  aria-label={isPlayer ? "Player" : tile.type}
                  title={isPlayer ? "You are here" : tile.type}
                  style={{
                    ...styles.tile,
                    background: bg,
                    border,
                  }}
                >
                  {/* minimal visual: small marker row */}
                  <div style={styles.tileTop}>
                    {isBoss ? <div style={styles.bossMark} /> : null}
                    {visitedTile ? <div style={styles.visitedDot} /> : <div style={styles.unvisitedDot} />}
                  </div>

                  {/* center shows simple icon/marker for player */}
                  <div style={styles.tileCenter}>
                    {isPlayer ? <div style={styles.playerMarker}>You</div> : null}
                  </div>

                  <div style={styles.tileBottom}>
                    {/* keep the bottom row intentionally empty / subtle */}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div style={{ marginTop: 32, color: "#666" }}>No active run.</div>
      )}

      {/* Bottom bar — compact status + actions (mobile-first) */}
      <div style={styles.bottomBar}>
        <div style={styles.statusRow}>
          <div style={styles.hpWrap}>
            <div style={styles.statLabel}>HP</div>
            <div style={styles.hpBarWrap}>
              <div style={{ ...styles.hpBarFill, width: `${run && run.playerMaxHP ? Math.max(0, Math.min(100, (100 * (run.playerHP || 0) / (run.playerMaxHP || 1)))) : 0}%` }} />
            </div>
            <div style={styles.statValue}>{hp} / {run?.playerMaxHP ?? "—"}</div>
          </div>

          <div style={styles.mpWrap}>
            <div style={styles.statLabel}>MP</div>
            <div style={styles.mpBarWrap}>
              <div style={{ ...styles.mpBarFill, width: `${run && run.playerMaxMP ? Math.max(0, Math.min(100, (100 * (run.playerMP || 0) / (run.playerMaxMP || 1)))) : 0}%` }} />
            </div>
            <div style={styles.statValue}>{mp} / {run?.playerMaxMP ?? "—"}</div>
          </div>

          <div style={styles.actionBtns}>
            <button style={styles.smallBtn} onClick={() => handleMoveDir("up")} disabled={!run || !canMove("up")}>↑</button>
            <button style={styles.smallBtn} onClick={() => handleMoveDir("left")} disabled={!run || !canMove("left")}>←</button>
            <button style={styles.smallBtn} onClick={() => handleMoveDir("right")} disabled={!run || !canMove("right")}>→</button>
            <button style={styles.smallBtn} onClick={() => handleMoveDir("down")} disabled={!run || !canMove("down")}>↓</button>

            <button style={styles.primarySmall} onClick={startBattleForCurrentTile} disabled={!run}>Explore</button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------------- styles ---------------- */
const styles = {
  root: { padding: 16, maxWidth: 1100, margin: "0 auto", fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif", paddingBottom: 110 },
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  input: { padding: 8, borderRadius: 6, border: "1px solid #ddd" },
  button: { padding: "8px 12px", borderRadius: 6, border: "1px solid #d9d9d9", background: "#fff", cursor: "pointer" },
  disabledBtn: { opacity: 0.5, cursor: "not-allowed" },
  mapWrap: { marginTop: 8 },
  mapGrid: { display: "grid", gap: 8, borderRadius: 8, overflow: "hidden" },
  tile: {
    minHeight: 88,
    display: "flex",
    flexDirection: "column",
    padding: 8,
    borderRadius: 8,
    cursor: "pointer",
    userSelect: "none",
    alignItems: "stretch",
    justifyContent: "space-between",
  },
  tileTop: { display: "flex", justifyContent: "space-between", alignItems: "center", height: 18 },
  tileCenter: { display: "flex", alignItems: "center", justifyContent: "center", minHeight: 36 },
  tileBottom: { height: 14 },

  visitedDot: { width: 10, height: 10, borderRadius: 999, background: "#16a34a" }, // green = visited
  unvisitedDot: { width: 10, height: 10, borderRadius: 999, background: "#cbd5e1" }, // gray = untouched
  bossMark: { width: 12, height: 12, borderRadius: 3, background: "#f87171" }, // red square for boss

  playerMarker: { padding: "4px 8px", borderRadius: 6, background: "#e6f2ff", color: "#0369a1", fontWeight: 700, fontSize: 12 },

  /* bottom bar */
  bottomBar: {
    position: "fixed",
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 80,
    background: "#fff",
    borderTop: "1px solid #eee",
    padding: 10,
    boxShadow: "0 -6px 20px rgba(0,0,0,0.04)",
  },
  statusRow: { display: "flex", gap: 12, alignItems: "center", justifyContent: "space-between" },

  hpWrap: { flex: 1, minWidth: 140, marginRight: 8 },
  mpWrap: { flex: 1, minWidth: 140, marginRight: 8 },

  statLabel: { fontSize: 11, color: "#666", marginBottom: 6 },
  statValue: { fontSize: 12, fontWeight: 700, marginTop: 6 },

  hpBarWrap: { height: 8, background: "#f2f2f2", borderRadius: 999, overflow: "hidden" },
  hpBarFill: { height: "100%", background: "#ef4444", width: "0%" }, // red
  mpBarWrap: { height: 8, background: "#f2f2f2", borderRadius: 999, overflow: "hidden" },
  mpBarFill: { height: "100%", background: "#3b82f6", width: "0%" }, // blue

  actionBtns: { display: "flex", gap: 8, alignItems: "center" },
  smallBtn: { padding: "6px 8px", borderRadius: 6, border: "1px solid #e6e6e6", background: "#fff", cursor: "pointer", minWidth: 36, textAlign: "center" },
  primarySmall: { padding: "8px 10px", borderRadius: 8, border: "1px solid #2b6cb0", background: "#2b6cb0", color: "#fff", cursor: "pointer" },
};
