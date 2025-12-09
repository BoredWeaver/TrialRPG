// src/ui/DungeonScreen.jsx
import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import useDungeon from "../state/useDungeon.js";
import { useBattleContext } from "../state/BattleContext.jsx";

/**
 * DungeonScreen — responsive grid that always fits viewport
 * - NO logic changes
 * - Tiles adapt to screen size:
 *   - mobile (narrow): smaller tiles, very small gaps
 *   - tablet: medium tiles, medium gaps
 *   - desktop (wide): larger tiles, larger gaps
 * - grid renders full N x N cells
 * - grid container uses a safe max-height computed in layout effect (no DOM reads in render)
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
  // computed available max-height for the grid (px) -> prevents reading refs during render
  const [availGridMaxHeight, setAvailGridMaxHeight] = useState(null);

  useEffect(() => {
    if (run && run.dungeonKey && run.dungeonKey !== dungeonKey) {
      setDungeonKey(run.dungeonKey);
    }
  }, [run]);

  // compute tile size so whole grid fits into available viewport without scrollbars
  useLayoutEffect(() => {
    let mounted = true;

    function recompute() {
      const pageRect = pageRef.current ? pageRef.current.getBoundingClientRect() : { width: window.innerWidth };
      const headerRect = headerRef.current ? headerRef.current.getBoundingClientRect() : { height: 96 };
      const footerRect = footerRef.current ? footerRef.current.getBoundingClientRect() : { height: 120 };

      // breathing room
      const verticalPadding = 20; // top + bottom breathing room
      const horizontalPadding = 24; // left + right breathing room
      const availableWidth = Math.max(0, pageRect.width - horizontalPadding);
      const availableHeight = Math.max(0, window.innerHeight - headerRect.height - footerRect.height - verticalPadding);

      // columns and rows (square grid N x N)
      const cols = Math.max(1, run ? (run.size || size || 5) : (size || 5));
      const rows = cols;

      // determine breakpoint category by viewport width
      const vw = window.innerWidth;
      const isMobile = vw < 640;
      const isTablet = vw >= 640 && vw < 1024;
      const isDesktop = vw >= 1024;

      // choose caps for tile size according to breakpoint
      const maxTileCap = isMobile ? 72 : isTablet ? 100 : 140; // allow bigger tiles on desktop
      const minTileCap = 12;

      // default gap then adapt smaller when tiles get small or on mobile
      let gap = isMobile ? 6 : isTablet ? 8 : 12;

      // compute total gap space then derive candidate sizes
      const totalGapW = Math.max(0, (cols - 1) * gap);
      const totalGapH = Math.max(0, (rows - 1) * gap);

      // compute maximum tile sizes for width and height
      const maxTileW = Math.floor((availableWidth - totalGapW) / cols);
      const maxTileH = Math.floor((availableHeight - totalGapH) / rows);

      // initial candidate clamped
      let candidate = Math.max(minTileCap, Math.min(maxTileW, maxTileH, maxTileCap));

      // if candidate is very small, reduce gap and recompute to squeeze tiles
      if (candidate < 36) gap = Math.max(4, Math.floor(gap / 1.5));
      if (candidate < 24) gap = Math.max(3, Math.floor(gap / 2));

      const totalGapW2 = Math.max(0, (cols - 1) * gap);
      const totalGapH2 = Math.max(0, (rows - 1) * gap);

      const maxTileW2 = Math.floor((availableWidth - totalGapW2) / cols);
      const maxTileH2 = Math.floor((availableHeight - totalGapH2) / rows);

      let computed = Math.max(minTileCap, Math.min(maxTileW2, maxTileH2, maxTileCap));
      computed = Math.floor(computed);

      // safety: if computed is larger than viewport height/width allow, clamp again
      const possibleGridW = computed * cols + totalGapW2;
      const possibleGridH = computed * rows + totalGapH2;
      if (possibleGridW > availableWidth) {
        const ratio = availableWidth / possibleGridW;
        computed = Math.max(minTileCap, Math.floor(computed * ratio));
      }
      if (possibleGridH > availableHeight) {
        const ratio = availableHeight / possibleGridH;
        computed = Math.max(minTileCap, Math.floor(computed * ratio));
      }

      // compute grid max height (available area for grid) to set strict maxHeight for grid container
      const computedMaxHeight = Math.max(0, availableHeight - 8); // small buffer

      if (mounted) {
        setTileSize(computed);
        setAvailGridMaxHeight(computedMaxHeight);
        // store gap on the grid element via CSS variable for consistent rendering
        try {
          if (gridRef.current) {
            gridRef.current.style.setProperty("--dungeon-gap-px", `${gap}px`);
          }
        } catch (e) { }
      }
    }

    recompute();

    const onResize = () => recompute();
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);

    const ro = new ResizeObserver(() => recompute());
    try {
      if (headerRef.current) ro.observe(headerRef.current);
      if (footerRef.current) ro.observe(footerRef.current);
      if (pageRef.current) ro.observe(pageRef.current);
    } catch (e) { /* ignore */ }

    return () => {
      mounted = false;
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
      try { ro.disconnect(); } catch (_) { }
    };
  }, [run, size]);

  // ------------------ game start / battle logic (unchanged) ------------------
  function startBattleFromPayload(payload, tileIndex) {
    if (!payload) return;
    if (payload.locked) return;
    if (payload.alreadyVisited || (payload.tile && payload.tile.visited)) return;
    if (!battle || typeof battle.startWithEnemy !== "function") return;

    if (Number.isFinite(Number(tileIndex))) {
      try { lockTileDuringBattle(tileIndex); } catch (e) { }
    }

    activeBattleRef.current = { tileIndex };
    console.log("RUN",run);
    // pass dungeonLevel from run if present so enemyBuilder can scale appropriately
    const dungeonLevel = run?.dungeonLevel ?? run?.level;
    console.log("DungeonScreen",dungeonLevel)
    battle.startWithEnemy(payload.enemies, payload.playerOverrides || null, {
      meta: { tileIndex },
      dungeonLevel,
      onFinish: (finalState, meta) => {
        const expected = activeBattleRef.current;
        const idx = meta?.tileIndex;
        if (!expected || expected.tileIndex !== idx) {
          if (Number.isFinite(Number(idx))) try { unlockTileDuringBattle(idx); } catch (_) { }
          return;
        }
        activeBattleRef.current = null;
        if (Number.isFinite(Number(idx))) {
          try { unlockTileDuringBattle(idx); } catch (e) { }
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
    try { lockTileDuringBattle(centerIdx); } catch (_) { }
    activeBattleRef.current = { tileIndex: centerIdx, isBoss: true };
    if (!battle || typeof battle.startWithEnemy !== "function") return;

    const dungeonLevel = run?.dungeonLevel ?? run?.level;

    battle.startWithEnemy(payload.enemies, payload.playerOverrides || null, {
      meta: { boss: true, tileIndex: centerIdx },
      dungeonLevel,
      onFinish: (finalState, meta) => {
        const idx = meta?.tileIndex;
        activeBattleRef.current = null;
        if (Number.isFinite(Number(idx))) {
          try { unlockTileDuringBattle(idx); } catch (_) { }
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

  // gapPx is read from CSS variable set in layout effect if available; fallback to computed formula
  const gapPx = (() => {
    try {
      const v = gridRef.current ? getComputedStyle(gridRef.current).getPropertyValue("--dungeon-gap-px") : "";
      const n = parseInt(v, 10);
      if (Number.isFinite(n) && n > 0) return n;
    } catch (e) { }
    return tileSize < 24 ? 6 : (tileSize < 36 ? 8 : 12);
  })();

  // number of cells to render (full N x N)
  const totalCells = gridCols * gridCols;

  return (
    <div
      ref={pageRef}
      className="max-w-5xl mx-auto p-4 pb-0 mb-32 bg-[#060812] text-white"
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

      {/* grid */}

      {run ? (
        <div
          ref={gridRef}
          className="m-0"
          style={{
            display: "grid",
            gridTemplateColumns: `repeat(${gridCols}, ${tileSize}px)`,
            gridAutoRows: `${tileSize}px`,
            gap: `${gapPx}px`,
            justifyContent: "center",
            alignContent: "start",
            padding: 8,
            paddingTop: 12,
            paddingBottom: 12,
            borderRadius: 12,
            border: "1px solid rgba(255,255,255,0.06)",
            background: "linear-gradient(180deg, rgba(255,255,255,0.02), rgba(255,255,255,0.01))",

            /* 🔥 allow natural height, no clipping */
            maxHeight: "none",
            overflow: "visible",
            marginBottom: 8,
          }}
        >
          {Array.from({ length: totalCells }).map((_, i) => {
            const tile = tiles[i] ?? { x: i % gridCols, y: Math.floor(i / gridCols), visited: false, type: "combat" };
            const isPlayer = tile.x === (playerPos?.x ?? 0) && tile.y === (playerPos?.y ?? 0);
            const visitedTile = Boolean(tile.visited);
            const isBoss = tile.type === "boss";
            const inBattle = Boolean(tile.inBattle);

            const baseStyle = {
              borderStyle: "solid",
              borderWidth: isPlayer ? 2 : 1,
              borderColor: isPlayer ? "rgba(255,255,255,0.28)" : "rgba(255,255,255,0.12)",
              borderRadius: Math.max(6, Math.round(tileSize * 0.08)),
              width: (3 * tileSize) / 4,
              height: (3 * tileSize) / 4,
              minWidth: tileSize / 2,
              minHeight: tileSize / 2,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "#07111a",
              boxShadow: "inset 0 1px 0 rgba(255,255,255,0.01)",
              cursor: "pointer",
            };

            if (isPlayer) baseStyle.background = "linear-gradient(180deg,#0a4f7a,#0b3752)";
            else if (isBoss) baseStyle.background = "linear-gradient(180deg,#742222,#5a1a1a)";
            else if (visitedTile) baseStyle.background = "linear-gradient(180deg,#0d4638,#0a2f25)";

            const indicatorSize = Math.max(6, Math.round(tileSize * 0.12));

            return (
              <div
                key={`cell-${i}`}
                onClick={() => handleTileClick(tile, i)}
                style={baseStyle}
              >
                {isPlayer ? (
                  <div style={{
                    width: Math.max(8, Math.round(tileSize * 0.24)),
                    height: Math.max(8, Math.round(tileSize * 0.24)),
                    borderRadius: 999,
                    background: "#fff",
                  }} />
                ) : inBattle ? (
                  <div style={{
                    width: Math.max(8, Math.round(tileSize * 0.16)),
                    height: Math.max(8, Math.round(tileSize * 0.16)),
                    borderRadius: "50%",
                    background: "#ffd8a8",
                    animation: "pulse 1400ms infinite",
                  }} />
                ) : isBoss ? (
                  <div style={{
                    width: Math.max(10, Math.round(tileSize * 0.18)),
                    height: Math.max(6, Math.round(tileSize * 0.12)),
                    borderRadius: 4,
                    background: "#ffb3b3",
                  }} />
                ) : visitedTile ? (
                  <div style={{
                    width: indicatorSize,
                    height: indicatorSize,
                    borderRadius: "50%",
                    background: "#bfffe0",
                  }} />
                ) : (
                  <div style={{
                    width: indicatorSize,
                    height: indicatorSize,
                    borderRadius: 2,
                    background: "#94a3b8",
                  }} />
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="mt-8 text-white/70">No active run.</div>
      )}

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

      {/* pulse animation used by inBattlePulse */}
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
