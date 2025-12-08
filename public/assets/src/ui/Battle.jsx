// src/ui/Battle.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useBattleContext } from "../state/BattleContext.jsx";

/**
 * Battle — UI polish (presentation-only)
 * - Fixes overflowing text, tightens spacing for mobile, truncates long strings.
 * - Enemies on top, player below, fixed bottom action bar.
 * - No logic changes.
 *
 * Change: selected enemy card now gets a neon-blue border + subtle glow
 */

export default function Battle() {
  const navigate = useNavigate();
  const {
    battle,
    busy,
    spells,
    items,
    actions,
    progress,
    selectedTarget,
    selectTarget,
    getAliveEnemies,
    getAllEnemies,
    doAttack,
    doCast,
    doUse,
    doAllocate,
  } = useBattleContext() || {};

  const safeBattle = battle || { player: {}, enemies: [], enemy: null, log: [], turn: "player", over: false, result: null };

  const [logOpen, setLogOpen] = useState(true);
  const [playerCollapsed, setPlayerCollapsed] = useState(true);
  const [showSpells, setShowSpells] = useState(false);
  const [showItems, setShowItems] = useState(false);

  const logRef = useRef(null);
  const enemiesListRef = useRef(null);

  useEffect(() => {
    if (!logRef.current || !logOpen) return;
    try { logRef.current.scrollTop = logRef.current.scrollHeight; } catch { }
  }, [safeBattle.log, logOpen]);

  const isPlayerTurn = safeBattle.turn === "player" && !safeBattle.over && !busy;

  const allEnemies = (typeof getAllEnemies === "function")
    ? (getAllEnemies() || [])
    : (Array.isArray(safeBattle.enemies) && safeBattle.enemies.length ? safeBattle.enemies : (safeBattle.enemy ? [safeBattle.enemy] : []));

  const enemiesArr = Array.isArray(allEnemies) ? allEnemies : [];
  const aliveEnemies = (typeof getAliveEnemies === "function" ? (getAliveEnemies() || []) : enemiesArr)
    .filter(e => Number(e?.hp || 0) > 0);

  const effectiveSelectedTarget = useMemo(() => {
    const idx = Number(selectedTarget) | 0;
    if (Array.isArray(enemiesArr) && idx >= 0 && idx < enemiesArr.length) return idx;
    for (let i = 0; i < enemiesArr.length; i++) {
      if ((Number(enemiesArr[i]?.hp) || 0) > 0) return i;
    }
    return 0;
  }, [selectedTarget, enemiesArr]);

  useEffect(() => {
    try {
      const container = enemiesListRef.current;
      if (!container) return;
      const el = container.querySelector(`[data-enemy-index="${effectiveSelectedTarget}"]`);
      if (el && typeof el.scrollIntoView === "function") {
        el.scrollIntoView({ inline: "center", behavior: "smooth", block: "nearest" });
      }
    } catch { }
  }, [effectiveSelectedTarget]);

  function isAoeSpell(sp) {
    if (!sp) return false;
    return sp.target === "aoe" || sp.target === "all" || sp.aoe === true;
  }
  function isAoeItem(it) {
    if (!it) return false;
    return it.target === "aoe" || it.target === "all" || it.aoe === true;
  }

  function StatusPips({ entity }) {
    const statuses = Array.isArray(entity?.statuses) ? entity.statuses : [];
    if (!statuses.length) return null;
    return (
      <div className="flex gap-2 mt-2 flex-wrap">
        {statuses.map((s, i) => (
          <div key={i} className="flex items-center gap-1 bg-white/3 text-xs rounded px-2 py-0.5" title={`${s.id} (${s.turnsLeft})`}>
            <StatusIcon type={s.type} />
            <span className="font-medium truncate max-w-[84px]">{s.id}</span>
            <span className="text-gray-400">({s.turnsLeft})</span>
          </div>
        ))}
      </div>
    );
  }

  // player percentages
  const playerHP = Number(safeBattle.player?.hp || 0);
  const playerMaxHP = Math.max(1, Number(safeBattle.player?.maxHP || 1));
  const hpPct = Math.max(0, Math.min(100, Math.round((playerHP / playerMaxHP) * 100)));

  const playerMP = Number(safeBattle.player?.mp || 0);
  const playerMaxMP = Math.max(1, Number(safeBattle.player?.maxMP || 1));
  const mpPct = Math.max(0, Math.min(100, Math.round((playerMP / playerMaxMP) * 100)));

  const critPctApprox = Math.round(safeBattle.player?.stats?.CRIT || 0);
  const critMultApprox = (1.5 + ((safeBattle.player?.stats?.CRITDMG || 0) * 0.01)).toFixed(2);

  function onPrimaryAttack() {
    if (!isPlayerTurn) return;
    if (typeof doAttack !== "function") return;
    doAttack(effectiveSelectedTarget);
  }
  function onOpenSpells() {
    if (!isPlayerTurn) return;
    setShowSpells(true);
  }
  function onOpenItems() {
    if (!isPlayerTurn) return;
    setShowItems(true);
  }

  // helper: safe truncation for UI text
  const trunc = (s, n = 28) => {
    if (!s && s !== 0) return "";
    const str = String(s);
    if (str.length <= n) return str;
    return str.slice(0, n - 1) + "…";
  };

  return (
    <div className="min-h-screen bg-[#060812] text-white relative">
      <style>{`
        /* utility tweaks for battle layout */
        .fantasy-border { border: 1px solid rgba(255,255,255,0.06); }
        .fantasy-glow { box-shadow: 0 6px 20px rgba(99,102,241,0.08); }
        .panel { background: linear-gradient(180deg, rgba(255,255,255,0.02), rgba(255,255,255,0.01)); border-radius: 10px; }
        .muted { background: rgba(255,255,255,0.02); color: #cbd5e1; }
        .ellipsis { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        @media (max-width:640px) {
          .enemy-name { font-size: 0.94rem; }
          .player-name { font-size: 1.02rem; }
        }
      `}</style>

      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-3 fantasy-border panel">
        <div className="min-w-0">
          <div className="text-base font-semibold tracking-wide ellipsis">Trial RPG</div>
          <div className="text-xs text-gray-300 truncate">Lv.{progress?.level ?? 1} • {Math.round((progress?.pct ?? 0) * 100)}% • Pts: {progress?.points ?? 0}</div>
        </div>

        <div className="flex items-center gap-3 ml-4">
          <div
            className={`px-2 py-1 rounded text-sm font-medium ${safeBattle.over
                ? (safeBattle.result === "win" ? "bg-green-900 text-green-200 border border-green-700" : "bg-red-900 text-red-200 border border-red-700")
                : (isPlayerTurn ? "bg-indigo-900 text-indigo-200 border border-indigo-700" : "bg-white/3 text-gray-300 border border-white/6")
              }`}
            style={{ minWidth: 92, textAlign: "center" }}
            aria-live="polite"
          >
            {safeBattle.over ? (safeBattle.result === "win" ? "Victory" : "Defeat") : (isPlayerTurn ? "Your turn" : "Enemy's turn")}
          </div>

          {safeBattle.over && (
            <button
              onClick={() => navigate(-1)}
              className="px-3 py-1 rounded-md text-sm font-medium fantasy-glow"
              aria-label="Return to dungeon"
            >
              Return
            </button>
          )}
        </div>
      </div>

      {/* Main content */}
      <div className="px-4 pb-40">
        {/* ENEMIES (top) */}
        <section className="mt-4">
          <div className="flex items-center justify-between mb-2 px-1">
            <div className="text-sm font-semibold">Enemies <span className="text-gray-400 text-xs">({aliveEnemies.length} alive)</span></div>
            <div className="text-xs text-gray-400">Tap to select</div>
          </div>

          <div
            ref={enemiesListRef}
            className="grid grid-cols-2 sm:grid-cols-3 gap-3"
            role="list"
            aria-label="Enemies list"
          >
            {enemiesArr.length === 0 && <div className="text-gray-400 text-sm col-span-full">No enemies.</div>}

            {enemiesArr.map((en, idx) => {
              const alive = (Number(en?.hp || 0)) > 0;
              const selected = idx === effectiveSelectedTarget;
              const hp = Number(en?.hp || 0);
              const maxHP = Math.max(1, Number(en?.maxHP || 1));
              const pct = Math.max(0, Math.min(100, Math.round((hp / maxHP) * 100)));

              // build base style and selected override
              const baseCardStyle = {
                display: "flex",
                flexDirection: "column",
                gap: 8,
                padding: 12,
                borderRadius: 12,
                border: "1px solid rgba(255,255,255,0.06)",
                background: "linear-gradient(180deg, rgba(255,255,255,0.02), rgba(255,255,255,0.01))",
              };

              // when selected, apply neon blue border + glow
              const selectedStyle = selected ? {
                borderColor: "#00d4ff",
                boxShadow: "0 6px 28px rgba(0,212,255,0.12), 0 0 18px rgba(0,160,255,0.14), inset 0 0 2px rgba(0,212,255,0.06)",
                outline: "2px solid rgba(0,212,255,0.06)",
              } : {};

              return (
                /* Enemy article — clicking whole card selects the enemy */
                <article
                  key={`${en?.id || "enemy"}-${idx}`}
                  data-enemy-index={idx}
                  onClick={() => alive && typeof selectTarget === "function" && selectTarget(idx)}
                  role="listitem"
                  aria-selected={selected}
                  className={`${!alive ? "opacity-40" : "cursor-pointer active:scale-[0.98]"}`}
                  style={{
                    ...baseCardStyle,
                    ...(selected ? { borderWidth: 2 } : {}),
                    ...selectedStyle
                  }}
                >
                  {/* MOBILE LAYOUT (vertical) */}
                  <div className="flex flex-col items-center text-center sm:hidden">
                    {/* icon */}
                    <div
                      style={{
                        width: 48,
                        height: 48,
                        borderRadius: 8,
                        background: "rgba(255,255,255,0.03)"
                      }}
                    />

                    {/* NAME BELOW ICON */}
                    <div className="mt-2 font-semibold text-[13px] leading-tight max-w-full truncate">
                      {trunc(en?.name || en?.id || `Enemy ${idx + 1}`, 40)}
                    </div>

                    {/* OPTIONAL FLAVOR */}
                    {en?.flavor && (
                      <div className="text-[11px] text-gray-400 truncate max-w-full">
                        {trunc(en.flavor, 40)}
                      </div>
                    )}

                    {/* HP */}
                    <div className="mt-1 font-semibold text-sm">
                      {hp}/{maxHP}
                    </div>
                  </div>

                  {/* DESKTOP/TABLET LAYOUT (horizontal) */}
                  <div className="hidden sm:flex items-start justify-between gap-2">
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        style={{
                          width: 48,
                          height: 48,
                          borderRadius: 8,
                          background: "rgba(255,255,255,0.03)",
                          flexShrink: 0
                        }}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold enemy-name ellipsis max-w-full text-[13px] leading-tight">
                          {trunc(en?.name || en?.id || `Enemy ${idx + 1}`, 40)}
                        </div>
                        <div className="text-[11px] text-gray-400 truncate">
                          {trunc(en?.flavor || "", 48)}
                        </div>
                      </div>
                    </div>

                    <div className="text-right min-w-[64px]">
                      <div className="font-semibold text-sm">{hp}/{maxHP}</div>
                      <div className="text-[11px] text-gray-400">#{idx + 1}</div>
                    </div>
                  </div>

                  {/* HP BAR */}
                  <div className="w-full bg-white/6 rounded h-2 overflow-hidden mt-1">
                    <div
                      className="h-2 bg-red-600"
                      style={{ width: `${pct}%`, transition: "width 220ms ease" }}
                    />
                  </div>

                  {/* STAT GRID — always visible, 2×2 on desktop, 1×2 on mobile */}
                  <div
                    className="mt-2 grid gap-2"
                    style={{
                      gridTemplateColumns: "repeat(2, 1fr)",
                      fontSize: 11,
                      color: "rgba(203,213,225,0.9)",
                    }}
                  >
                    {/* Row 1 */}
                    <div className="flex gap-2 items-center justify-center sm:justify-start">
                      <span className="text-gray-300">ATK</span>
                      <span className="font-medium">{en?.atk ?? 0}</span>
                    </div>

                    <div className="flex gap-2 items-center justify-center sm:justify-start">
                      <span className="text-gray-300">DEF</span>
                      <span className="font-medium">{en?.def ?? 0}</span>
                    </div>

                    {/* Row 2 — hidden on tiny screens, shown on sm+ */}
                    <div className="hidden sm:flex gap-2 items-center justify-center sm:justify-start">
                      <span className="text-gray-300">M-ATK</span>
                      <span className="font-medium">{en?.mAtk ?? 0}</span>
                    </div>

                    <div className="hidden sm:flex gap-2 items-center justify-center sm:justify-start">
                      <span className="text-gray-300">M-DEF</span>
                      <span className="font-medium">{en?.mDef ?? en?.def ?? 0}</span>
                    </div>
                  </div>

                  {/* Status effects */}
                  {Array.isArray(en?.statuses) && en.statuses.length > 0 && (
                    <div className="flex gap-1 mt-2 flex-wrap justify-center sm:justify-start">
                      {en.statuses.map((s, i) => (
                        <div
                          key={i}
                          className="px-1.5 py-0.5 rounded bg-white/4 text-[11px] font-medium flex items-center gap-1"
                          title={`${s.id} (${s.turnsLeft})`}
                        >
                          <StatusIcon type={s.type} />
                          <span className="truncate max-w-[88px]">{trunc(s.id, 16)}</span>
                          <span className="text-gray-400">({s.turnsLeft})</span>
                        </div>
                      ))}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        </section>

        {/* Player card */}
        <section className="mt-4">
          <div className="p-3 rounded-lg fantasy-border panel shadow-md">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3">
                  <div className="text-lg font-semibold player-name truncate min-w-0">{trunc(safeBattle.player?.name || "Player", 24)}</div>

                  <button
                    onClick={() => setPlayerCollapsed(v => !v)}
                    className="ml-2 text-xs px-2 py-1 border rounded bg-white/4 text-white"
                    aria-expanded={!playerCollapsed}
                    aria-controls="player-details"
                    title={playerCollapsed ? "Expand player details" : "Collapse player details"}
                  >
                    {playerCollapsed ? "Expand" : "Collapse"}
                  </button>
                </div>

                <div className="mt-3 space-y-2">
                  <div className="flex items-center gap-3">
                    <div className="w-16 text-xs text-gray-400">HP</div>
                    <div className="flex-1 min-w-0">
                      <div className="w-full bg-white/6 rounded h-3 overflow-hidden" role="progressbar" aria-valuenow={hpPct} aria-valuemin={0} aria-valuemax={100}>
                        <div className={`h-3 ${hpPct < 25 ? "bg-red-500" : "bg-emerald-500"}`} style={{ width: `${hpPct}%`, transition: "width 220ms ease" }} />
                      </div>
                      <div className="mt-1 text-xs text-gray-400 truncate">{playerHP}/{playerMaxHP} • {hpPct}%</div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="w-16 text-xs text-gray-400">MP</div>
                    <div className="flex-1 min-w-0">
                      <div className="w-full bg-white/6 rounded h-3 overflow-hidden" role="progressbar" aria-valuenow={mpPct} aria-valuemin={0} aria-valuemax={100}>
                        <div className="h-3 bg-blue-600" style={{ width: `${mpPct}%`, transition: "width 220ms ease" }} />
                      </div>
                      <div className="mt-1 text-xs text-gray-400 truncate">{playerMP}/{playerMaxMP} • {mpPct}%</div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="text-right text-sm min-w-[80px]">
                {playerCollapsed ? (
                  <div className="text-sm font-medium">ATK {safeBattle.player?.atk ?? 0}</div>
                ) : (
                  <div>
                    <div className="text-xs text-gray-400">ATK / DEF</div>
                    <div className="font-medium">{safeBattle.player?.atk ?? 0} / {safeBattle.player?.def ?? 0}</div>
                  </div>
                )}
              </div>
            </div>

            <div id="player-details" className={`mt-3 transition-[max-height,opacity] duration-300 ${playerCollapsed ? "max-h-0 opacity-0 overflow-hidden" : "max-h-[600px] opacity-100"}`}>
              {!playerCollapsed && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="text-sm"><div className="text-xs text-gray-400">M-ATK</div><div className="font-medium">{safeBattle.player?.mAtk ?? 0}</div></div>
                    <div className="text-sm"><div className="text-xs text-gray-400">M-DEF</div><div className="font-medium">{safeBattle.player?.mDef ?? 0}</div></div>
                  </div>

                  <div className="mt-2 text-xs text-gray-400">Crit: <span className="font-medium text-gray-200">{critPctApprox}%</span> • Mult: <span className="font-medium text-gray-200">{critMultApprox}×</span></div>

                  <StatusPips entity={safeBattle.player} />
                </>
              )}
            </div>
          </div>
        </section>

        {/* Battle log */}
        <section className="mt-4">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold">Battle Log</div>
            <button onClick={() => setLogOpen(v => !v)} className="text-xs text-indigo-300">{logOpen ? "Hide" : "Show"}</button>
          </div>

          {logOpen && (
            <div
              ref={logRef}
              className="mt-2 rounded p-3 h-40 overflow-y-auto font-mono text-sm panel text-gray-200"
              style={{ whiteSpace: "normal", wordBreak: "break-word", lineHeight: 1.25 }}
              aria-live="polite"
            >
              {(safeBattle.log || []).map((l, i) => (
                <div key={i} className="mb-1" style={{ whiteSpace: "normal" }}>{String(l)}</div>
              ))}
            </div>
          )}
        </section>

      </div>

      {/* Fixed bottom action bar */}
{/* Fixed bottom action bar */}
<div className="fixed inset-x-0 bottom-0 z-50 safe-bottom">
  <div className="mx-auto max-w-5xl px-4 pb-safe pt-3">
    <div className="backdrop-blur-sm bg-[#060812]/95 fantasy-border rounded-t-xl border-t border-white/6 px-4 py-3">
      
      {/* Top Row */}
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="text-xs text-gray-200 truncate" aria-live="polite">
          {busy && !safeBattle.over
            ? "Enemy thinking…"
            : safeBattle.over
              ? (safeBattle.result === "win" ? "Battle finished — congratulations" : "Battle finished — you lost")
              : (isPlayerTurn ? "Your turn" : "Enemy turn")}
        </div>

        <div className="text-xs text-gray-400 hidden sm:inline">Choose an action</div>
      </div>

      {/* Action Buttons */}
      <div className="flex flex-col sm:flex-row gap-3">

        {/* Attack */}
        <button
          onClick={onPrimaryAttack}
          disabled={!actions?.canAttack || enemiesArr.length === 0 || !isPlayerTurn}
          aria-label={`Attack target #${Math.max(0, effectiveSelectedTarget) + 1}`}
          className={`w-full sm:w-48 flex items-center justify-between gap-2 py-3 px-4 rounded-md text-sm font-semibold transition-shadow
            ${(!actions?.canAttack || !isPlayerTurn)
              ? "bg-white/6 text-gray-500 border border-white/6 cursor-not-allowed"
              : "bg-indigo-700 text-white border border-indigo-700 shadow-sm hover:shadow-md"}`}
        >
          <span className="flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 opacity-90" fill="none" stroke="currentColor">
              <path strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" d="M3 21l18-18M14 3l7 7-7-7z"/>
            </svg>
            Attack
          </span>
          <span className="text-xs text-gray-200">#{Math.max(0, effectiveSelectedTarget) + 1}</span>
        </button>

        {/* Spell + Item buttons */}
        <div className="flex gap-3 w-full">

          {/* Spells */}
          <button
            onClick={onOpenSpells}
            disabled={!isPlayerTurn || !(spells?.length)}
            className={`flex-1 py-3 px-4 rounded-md text-sm font-semibold transition
              ${(!isPlayerTurn || !(spells?.length))
                ? "bg-white/6 text-gray-500 border border-white/6 cursor-not-allowed"
                : "bg-emerald-700 text-white border border-emerald-700 shadow-sm hover:shadow-md"}`}
          >
            <span className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 opacity-90" fill="none" stroke="currentColor">
                  <path strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" d="M12 2v6M5 9l7 7 7-7"/>
                </svg>
                Spells
              </span>
              <span className="text-xs">{spells?.length ?? 0}</span>
            </span>
          </button>

          {/* Items */}
          <button
            onClick={onOpenItems}
            disabled={!isPlayerTurn || !(items?.length)}
            className={`flex-1 py-3 px-4 rounded-md text-sm font-semibold transition
              ${(!isPlayerTurn || !(items?.length))
                ? "bg-white/6 text-gray-500 border border-white/6 cursor-not-allowed"
                : "bg-yellow-700 text-white border border-yellow-700 shadow-sm hover:shadow-md"}`}
          >
            <span className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 opacity-90" fill="none" stroke="currentColor">
                  <path strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" d="M20 12H4"/>
                </svg>
                Items
              </span>
              <span className="text-xs">
                {(items || []).filter(it =>
                  ["heal", "mana", "damage"].includes(it.kind)
                ).length ?? 0}
              </span>
            </span>
          </button>

        </div>
      </div>

    </div>
  </div>
</div>

<style>{`
  .safe-bottom { padding-bottom: env(safe-area-inset-bottom, 0); }
  .pb-safe { padding-bottom: env(safe-area-inset-bottom, 12px); }
`}</style>

{/* SPELLS SHEET */}
{showSpells && (
  <div className="fixed inset-0 z-60 flex items-end">
    <div className="absolute inset-0 bg-black/60" onClick={() => setShowSpells(false)} />
    <div className="relative w-full rounded-t-xl shadow-2xl max-h-[72vh] overflow-auto p-4 fantasy-border panel">
      <div className="flex items-center justify-between mb-3">
        <div className="text-lg font-semibold">Spells</div>
        <button onClick={() => setShowSpells(false)} className="px-2 py-1 border rounded text-sm">Close</button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {(spells?.length === 0) && (
          <div className="col-span-full text-gray-400">No spells.</div>
        )}

        {spells?.map(sp => {
          const can = !!actions?.spells?.[sp.id];
          const aoe = isAoeSpell(sp);
          return (
            <button
              key={sp.id}
              disabled={!can}
              onClick={() => {
                if (!can) return;
                aoe ? doCast(sp.id) : doCast(sp.id, effectiveSelectedTarget);
                setShowSpells(false);
              }}
              className={`text-left p-3 rounded-lg border transition
                ${can ? "bg-white/5 hover:bg-white/8" : "bg-white/10 text-gray-500 cursor-not-allowed"}`}
            >
              <div className="font-medium truncate">
                {sp.name}{aoe ? " • AOE" : ""}
              </div>
              <div className="text-xs text-gray-400 mt-1 truncate">
                {sp.cost} MP {sp._cooldownRemaining ? `• CD ${sp._cooldownRemaining}` : ""}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  </div>
)}

{/* ITEMS SHEET */}
{showItems && (
  <div className="fixed inset-0 z-60 flex items-end">
    <div className="absolute inset-0 bg-black/60" onClick={() => setShowItems(false)} />
    <div className="relative w-full rounded-t-xl shadow-2xl max-h-[72vh] overflow-auto p-4 fantasy-border panel">

      <div className="flex items-center justify-between mb-3">
        <div className="text-lg font-semibold">Items</div>
        <button onClick={() => setShowItems(false)} className="px-2 py-1 border rounded text-sm">Close</button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {((items || []).filter(it => ["heal", "mana", "damage"].includes(it.kind)).length === 0) && (
          <div className="col-span-full text-gray-400">No usable items.</div>
        )}

        {(items || []).filter(it => ["heal", "mana", "damage"].includes(it.kind)).map(it => {
          const can = !!actions?.items?.[it.id];
          const aoe = isAoeItem(it);
          return (
            <button
              key={it.id}
              disabled={!can}
              onClick={() => {
                if (!can) return;
                aoe ? doUse(it.id) : doUse(it.id, effectiveSelectedTarget);
                setShowItems(false);
              }}
              className={`text-left p-3 rounded-lg border transition
                ${can ? "bg-white/5 hover:bg-white/8" : "bg-white/10 text-gray-500 cursor-not-allowed"}`}
            >
              <div className="font-medium truncate">
                {it.name} ×{it.qty} {aoe ? "• AOE" : ""}
              </div>

              <div className="text-xs text-gray-400 mt-1 truncate">
                {it.kind === "heal"
                  ? `Heals ${it.healAmount}`
                  : it.kind === "mana"
                    ? `Restores ${it.mpAmount} MP`
                    : `${it.damage} dmg`}
                {it._cooldownRemaining ? ` • CD ${it._cooldownRemaining}` : ""}
              </div>
            </button>
          );
        })}
      </div>

    </div>
  </div>
)}

    </div>
  );
}

/* Local helper component for status icons (kept at file bottom) */
function StatusIcon({ type }) {
  if (type === "dot") return <span className="w-3 h-3 rounded-full bg-red-400 inline-block" />;
  if (type === "stun") return <span className="w-3 h-3 rounded-full bg-yellow-400 inline-block" />;
  if (type === "buff") return <span className="w-3 h-3 rounded-full bg-emerald-400 inline-block" />;
  if (type === "debuff") return <span className="w-3 h-3 rounded-full bg-indigo-400 inline-block" />;
  return <span className="w-3" />;
}
