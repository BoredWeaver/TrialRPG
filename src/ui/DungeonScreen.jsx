// src/ui/DungeonScreen.jsx
import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import useDungeon from "../state/useDungeon.js";
import { useBattleContext } from "../state/BattleContext.jsx";

/**
 * DungeonScreen — presentation-only: responsive grid that always fits viewport
 * - NO logic changes
 * - removes in-tile text so tiles can shrink as needed
 * - grid will not produce scrollbars (fits header + footer)
 */

export default function DungeonScreen() {
  const navigate = useNavigate();
  const dungeon = useDungeon();
  const battle = useBattleContext();

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
    lockTileDuringBattle,
    unlockTileDuringBattle,
    claimDungeonRewards,
  } = dungeon;

  const [dungeonKey, setDungeonKey] = useState("goblin-den");
  const inputRef = useRef(null);
  const activeBattleRef = useRef(null);

  // layout refs and sizes
  const pageRef = useRef(null);
  const headerRef = useRef(null);
  const footerRef = useRef(null);
  const gridRef = useRef(null);

  // computed tile size (pixels)
  const [tileSize, setTileSize] = useState(48);

  useEffect(() => {
    if (run && run.dungeonKey && run.dungeonKey !== dungeonKey) {
      setDungeonKey(run.dungeonKey);
    }
  }, [run]);

  // compute tile size so the whole grid fits into available viewport without scrollbars
  useLayoutEffect(() => {
    let mounted = true;
    function recompute() {
      if (!pageRef.current || !headerRef.current || !footerRef.current) return;

      const pageRect = pageRef.current.getBoundingClientRect();
      const headerRect = headerRef.current.getBoundingClientRect();
      const footerRect = footerRef.current.getBoundingClientRect();

      // available area for grid (respect header/footer and small padding)
      const verticalPadding = 20; // top + bottom breathing room
      const horizontalPadding = 24; // left + right breathing room
      const availableWidth = Math.max(0, pageRect.width - horizontalPadding);
      const availableHeight = Math.max(
        0,
        window.innerHeight - headerRect.height - footerRect.height - verticalPadding
      );

      // columns and rows (square grid N x N)
      const cols = Math.max(1, run ? (run.size || size || 5) : (size || 5));
      const rows = cols; // dungeon is N x N

      // gap between tiles (match gap-3 = 12px)
      const gap = 12;
      const totalGapW = Math.max(0, (cols - 1) * gap);
      const totalGapH = Math.max(0, (rows - 1) * gap);

      // compute max tile by width and height, floor to integer
      const maxTileW = Math.floor((availableWidth - totalGapW) / cols);
      const maxTileH = Math.floor((availableHeight - totalGapH) / rows);

      // pick the smaller (fit both dims), clamp to reasonable min/max
      let computed = Math.max(12, Math.min(maxTileW, maxTileH)); // allow very small tiles but not 0
      // optional: cap max
      computed = Math.min(computed, 200);

      if (mounted) setTileSize(computed);
    }

    // initial compute
    recompute();

    // listeners
    const onResize = () => recompute();
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);

    // also observe header/footer changes
    const ro = new ResizeObserver(() => recompute());
    try {
      if (headerRef.current) ro.observe(headerRef.current);
      if (footerRef.current) ro.observe(footerRef.current);
      if (pageRef.current) ro.observe(pageRef.current);
    } catch (e) {}

    return () => {
      mounted = false;
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
      try { ro.disconnect(); } catch (_) {}
    };
  }, [run, size]);

  // ------------------ game start / battle logic (unchanged) ------------------
  function startBattleFromPayload(payload, tileIndex) {
    if (!payload) return;
    if (payload.locked) return;
    if (payload.alreadyVisited || (payload.tile && payload.tile.visited)) return;
    if (!battle || typeof battle.startWithEnemy !== "function") return;

    if (Number.isFinite(Number(tileIndex))) {
      try { lockTileDuringBattle(tileIndex); } catch (e) {}
    }

    activeBattleRef.current = { tileIndex };

    battle.startWithEnemy(payload.enemies, payload.playerOverrides || null, {
      meta: { tileIndex },
      onFinish: (finalState, meta) => {
        const expected = activeBattleRef.current;
        const idx = meta?.tileIndex;
        if (!expected || expected.tileIndex !== idx) {
          if (Number.isFinite(Number(idx))) try { unlockTileDuringBattle(idx); } catch (_) {}
          return;
        }
        activeBattleRef.current = null;
        if (Number.isFinite(Number(idx))) {
          try { unlockTileDuringBattle(idx); } catch (e) {}
        }
        if (finalState.result === "loss") {
          exitRun();
          navigate("/");
          return;
        }
        try { handleBattleFinish(finalState, idx); } catch (e) { console.error(e); }
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
        if (payload.locked) return;
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
      if (!payload || payload.locked) return;
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
    if (!payload || payload.locked) return;
    startBattleFromPayload(payload, idx);
  }

  function handleStartBoss() {
    if (!run) return;
    if (!run.bossTriggered) return;
    const payload = startBossFight?.();
    if (!payload) return;
    const cx = Math.floor(run.size / 2);
    const cy = Math.floor(run.size / 2);
    const centerIdx = cy * run.size + cx;
    try { lockTileDuringBattle(centerIdx); } catch (_) {}
    activeBattleRef.current = { tileIndex: centerIdx, isBoss: true };
    if (!battle || typeof battle.startWithEnemy !== "function") return;
    battle.startWithEnemy(payload.enemies, payload.playerOverrides || null, {
      meta: { boss: true, tileIndex: centerIdx },
      onFinish: (finalState, meta) => {
        const idx = meta?.tileIndex;
        activeBattleRef.current = null;
        if (Number.isFinite(Number(idx))) {
          try { unlockTileDuringBattle(idx); } catch (_) {}
        }
        if (finalState.result === "loss") {
          exitRun();
          navigate("/");
          return;
        }
        try { handleBattleFinish(finalState, idx); } catch (e) { console.error(e); }
      },
    });
    navigate("/combat");
  }

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

  const gridCols = run ? run.size : size || 5;
  const tiles = run ? (run.tiles || []) : [];

  const gapPx = 12; // matches gap-3

  return (
    <div
      ref={pageRef}
      className="max-w-5xl mx-auto p-4 pb-0 min-h-screen bg-[#060812] text-white"
      style={{ overflow: "hidden" }} // prevent page scrollbar from this container
    >
      {/* header */}
      <div ref={headerRef} className="flex items-start justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold text-white">Dungeon</h2>
          <div className="text-xs text-white/70 mt-1">{run ? `Run: ${run.id}` : "No active run"}</div>
        </div>

        <div className="flex items-center gap-2">
          {!run ? (
            <>
              <input
                ref={inputRef}
                value={dungeonKey}
                onChange={(e) => setDungeonKey(e.target.value)}
                placeholder="dungeon key"
                className="px-2 py-1 rounded-md bg-transparent border border-white/10 text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-white/10"
                style={{ color: "#ffffff" }}
              />
              <button className="px-3 py-2 rounded-md fantasy-glow border border-white/10 text-white font-semibold" onClick={handleStartNew}>Start Run</button>
              <button className="px-3 py-2 rounded-md bg-transparent text-white border border-white/10" onClick={handleResume}>Resume</button>
              <button className="px-3 py-2 rounded-md bg-transparent text-white border border-white/10" onClick={() => navigate("/")}>Back to City</button>
            </>
          ) : (
            <>
              <button className="px-3 py-2 rounded-md bg-transparent text-white border border-white/10" onClick={() => navigate("/")}>Return to City</button>
              {run?.finished ? (
                <button
                  className="px-3 py-2 rounded-md ml-2 fantasy-glow border border-white/10 text-white font-semibold"
                  onClick={() => {
                    try { claimDungeonRewards(); } catch (e) { console.error(e); }
                  }}
                  disabled={run?.rewardsClaimed}
                >
                  {run?.rewardsClaimed ? "Rewards Claimed" : "Claim Rewards"}
                </button>
              ) : null}
            </>
          )}
        </div>
      </div>

      {/* grid: explicit pixel columns/rows so tiles remain square and fit */}
      {run ? (
        <div
          ref={gridRef}
          style={{
            display: "grid",
            gridTemplateColumns: `repeat(${gridCols}, ${tileSize}px)`,
            gridAutoRows: `${tileSize}px`,
            gap: `${gapPx}px`,
            justifyContent: "center",
            alignContent: "center",
            padding: 8,
            borderRadius: 12,
            border: "1px solid rgba(255,255,255,0.06)",
            background: "linear-gradient(180deg, rgba(255,255,255,0.02), rgba(255,255,255,0.01))",
            // set a strict max-height so container never grows beyond viewport (no scroll)
            maxHeight: `calc(100vh - ${headerRef.current ? headerRef.current.getBoundingClientRect().height : 120}px - ${footerRef.current ? footerRef.current.getBoundingClientRect().height : 120}px - 20px)`,
            overflow: "hidden",
            marginBottom: 8,
          }}
        >
          {Array.from({ length: tiles.length }).map((_, i) => {
            const tile = tiles[i] ?? { x: i % gridCols, y: Math.floor(i / gridCols), visited: false, enemies: null, type: "combat" };
            const isPlayer = tile.x === (playerPos?.x ?? 0) && tile.y === (playerPos?.y ?? 0);
            const visitedTile = Boolean(tile.visited);
            const isBoss = tile.type === "boss";
            const inBattle = Boolean(tile.inBattle);

            // simple box visuals; no text inside
            const baseStyle = {
              borderStyle: "solid",
              borderWidth: isPlayer ? 2 : 1,
              borderColor: isPlayer ? "rgba(255,255,255,0.28)" : "rgba(255,255,255,0.12)",
              borderRadius: 8,
              width: tileSize,
              height: tileSize,
              minWidth: tileSize,
              minHeight: tileSize,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "#07111a",
              boxShadow: "inset 0 1px 0 rgba(255,255,255,0.01)",
              cursor: "pointer",
              transition: "transform .12s ease, box-shadow .12s ease",
            };

            if (isPlayer) {
              baseStyle.background = "linear-gradient(180deg,#08304a,#052233)";
              baseStyle.boxShadow = "inset 0 2px 6px rgba(0,0,0,0.6), 0 8px 30px rgba(255,255,255,0.02)";
            } else if (isBoss) {
              baseStyle.background = "linear-gradient(180deg,#3a0b0b,#4b1111)";
            } else if (visitedTile) {
              baseStyle.background = "linear-gradient(180deg,#072a22,#071814)";
            }

            // tiny indicator elements (no text)
            const indicatorSize = Math.max(6, Math.round(tileSize * 0.12));
            const playerDot = (
              <div
                style={{
                  width: Math.max(8, Math.round(tileSize * 0.24)),
                  height: Math.max(8, Math.round(tileSize * 0.24)),
                  borderRadius: 999,
                  background: "#ffffff",
                  boxShadow: "0 4px 12px rgba(255,255,255,0.08)",
                }}
              />
            );

            const visitedDot = (
              <div
                style={{
                  width: indicatorSize,
                  height: indicatorSize,
                  borderRadius: 999,
                  background: "#bfffe0",
                  boxShadow: "0 2px 6px rgba(191,255,224,0.06)",
                }}
              />
            );

            const bossMark = (
              <div
                style={{
                  width: Math.max(10, Math.round(tileSize * 0.18)),
                  height: Math.max(6, Math.round(tileSize * 0.12)),
                  borderRadius: 4,
                  background: "#ffb3b3",
                  boxShadow: "0 4px 12px rgba(255,179,179,0.08)",
                }}
              />
            );

            const inBattlePulse = (
              <div
                style={{
                  width: Math.max(8, Math.round(tileSize * 0.16)),
                  height: Math.max(8, Math.round(tileSize * 0.16)),
                  borderRadius: 999,
                  background: "#ffd8a8",
                  boxShadow: "0 6px 18px rgba(255,216,168,0.10)",
                  animation: "pulse 1400ms infinite",
                }}
              />
            );

            return (
              <div
                key={`cell-${i}`}
                onClick={() => handleTileClick(tile, i)}
                aria-label={isPlayer ? "Player" : tile.type}
                title={isPlayer ? "You are here" : tile.type}
                style={baseStyle}
              >
                {/* only tiny visuals — no text */}
                {isPlayer ? playerDot : inBattle ? inBattlePulse : isBoss ? bossMark : visitedTile ? visitedDot : <div style={{ width: indicatorSize, height: indicatorSize, borderRadius: 2, background: "#94a3b8" }} />}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="mt-8 text-white/70">No active run.</div>
      )}

      {/* footer (measured) */}
    {/* footer (measured) */}
<div
  ref={footerRef}
  className="fixed left-0 right-0 bottom-0 z-50"
  style={{
    background: "rgba(6,8,18,0.96)",
    borderTop: "1px solid rgba(255,255,255,0.06)",
    padding: 12
  }}
>
  <div className="flex items-center justify-between gap-4">
    
    {/* HP */}
    <div style={{ flex: 1, minWidth: 140 }}>
      <div className="text-xs" style={{ color: "#ffffff" }}>HP</div>
      <div style={{
        width: "100%",
        background: "rgba(255,255,255,0.03)",
        borderRadius: 999,
        height: 8,
        overflow: "hidden",
        marginTop: 6
      }}>
        <div
          style={{
            height: "100%",
            background: "linear-gradient(90deg,#ff7b7b,#ef4444)",
            width: `${run && run.playerMaxHP ? Math.max(0, Math.min(100, (100 * (run.playerHP || 0) / (run.playerMaxHP || 1)))) : 0}%`
          }}
        />
      </div>
      <div className="text-xs font-semibold" style={{ color: "#ffffff", marginTop: 6 }}>
        {hp} / {run?.playerMaxHP ?? "—"}
      </div>
    </div>

    {/* MP */}
    <div style={{ flex: 1, minWidth: 140 }}>
      <div className="text-xs" style={{ color: "#ffffff" }}>MP</div>
      <div style={{
        width: "100%",
        background: "rgba(255,255,255,0.03)",
        borderRadius: 999,
        height: 8,
        overflow: "hidden",
        marginTop: 6
      }}>
        <div
          style={{
            height: "100%",
            background: "linear-gradient(90deg,#60a5fa,#3b82f6)",
            width: `${run && run.playerMaxMP ? Math.max(0, Math.min(100, (100 * (run.playerMP || 0) / (run.playerMaxMP || 1)))) : 0}%`
          }}
        />
      </div>
      <div className="text-xs font-semibold" style={{ color: "#ffffff", marginTop: 6 }}>
        {mp} / {run?.playerMaxMP ?? "—"}
      </div>
    </div>

  </div>
</div>


      {/* pulse animation — keep this here so the inBattlePulse uses it */}
      <style>{`
        @keyframes pulse {
          0% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.25); opacity: 0.7; }
          100% { transform: scale(1); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
