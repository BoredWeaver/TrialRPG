// src/ui/Battle.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useBattleContext } from "../state/BattleContext.jsx";

/**
 * Mobile-first Battle UI (Tailwind)
 * - Removed CharacterSheet modal and stat allocation UI (done outside battle).
 * - Added HP / MP bars with numeric values + colored bars (red / blue).
 * - Primary actions: Attack | Spells | Items (spells/items open full-width bottom sheets).
 *
 * Drop-in replacement for your existing Battle.jsx.
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
    doAllocate, // still present in hook API but not used in UI
  } = useBattleContext();

  const [logOpen, setLogOpen] = useState(false);
  const [playerCollapsed, setPlayerCollapsed] = useState(true); // collapse toggle for player details
  const [showSpells, setShowSpells] = useState(false);
  const [showItems, setShowItems] = useState(false);

  const logRef = useRef(null);
  const enemiesListRef = useRef(null);

  // auto-scroll log when open
  useEffect(() => {
    if (!logRef.current || !logOpen) return;
    logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [battle.log, logOpen]);

  const isPlayerTurn = battle.turn === "player" && !battle.over && !busy;

  const allEnemies = typeof getAllEnemies === "function"
    ? getAllEnemies()
    : (battle.enemies || (battle.enemy ? [battle.enemy] : []));

  const enemiesArr = Array.isArray(allEnemies) ? allEnemies : [];
  const aliveEnemies = (typeof getAliveEnemies === "function" ? getAliveEnemies() : enemiesArr)
    .filter(e => Number(e?.hp) > 0);

  // ensure selected target valid
  const effectiveSelectedTarget = useMemo(() => {
    const idx = Number(selectedTarget) | 0;
    if (idx >= 0 && idx < enemiesArr.length) return idx;
    for (let i = 0; i < enemiesArr.length; i++) {
      if ((Number(enemiesArr[i]?.hp) || 0) > 0) return i;
    }
    return 0;
  }, [selectedTarget, enemiesArr]);

  // scroll selected enemy into view (mobile-friendly)
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

  // small status pips
  function StatusPips({ entity }) {
    const statuses = Array.isArray(entity?.statuses) ? entity.statuses : [];
    if (!statuses.length) return null;
    return (
      <div className="flex gap-2 mt-2 flex-wrap">
        {statuses.map((s, i) => (
          <div key={i} className="flex items-center gap-1 bg-gray-100 text-xs rounded px-2 py-0.5">
            <StatusIcon type={s.type} />
            <span className="font-medium">{s.id}</span>
            <span className="text-gray-500">({s.turnsLeft})</span>
          </div>
        ))}
      </div>
    );
  }
  function StatusIcon({ type }) {
    if (type === "dot") return <span className="w-3 h-3 rounded-full bg-red-400 inline-block" />;
    if (type === "stun") return <span className="w-3 h-3 rounded-full bg-yellow-400 inline-block" />;
    if (type === "buff") return <span className="w-3 h-3 rounded-full bg-green-400 inline-block" />;
    if (type === "debuff") return <span className="w-3 h-3 rounded-full bg-indigo-400 inline-block" />;
    return <span className="w-3" />;
  }

  // compute HP/MP percentages for bars (0..100)
  const playerHP = Number(battle.player?.hp || 0);
  const playerMaxHP = Number(battle.player?.maxHP || 1);
  const hpPct = Math.max(0, Math.min(100, Math.round((playerHP / Math.max(1, playerMaxHP)) * 100)));

  const playerMP = Number(battle.player?.mp || 0);
  const playerMaxMP = Number(battle.player?.maxMP || 1);
  const mpPct = Math.max(0, Math.min(100, Math.round((playerMP / Math.max(1, playerMaxMP)) * 100)));

  // approximate crit display (UI only, engine governs actual)
  const critPctApprox = Math.round(battle.player?.stats?.CRIT || 0);
  const critMultApprox = (1.5 + ((battle.player?.stats?.CRITDMG || 0) * 0.01)).toFixed(2);

  /* -----------------------------
     Primary action handlers
     ----------------------------- */
  function onPrimaryAttack() {
    if (!isPlayerTurn) return;
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

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top bar */}
      <div className="bg-white border-b px-4 py-3 flex items-center justify-between">
        <div>
          <div className="text-base font-semibold">Turn-Based Combat</div>
          <div className="text-xs text-gray-500">Lv.{progress.level} • {Math.round(progress.pct * 100)}% • Pts: {progress.points}</div>
        </div>

        <div className="flex items-center gap-2">
          <div className={`px-3 py-1 rounded text-sm ${battle.over ? (battle.result === "win" ? "bg-green-50 text-green-700 border border-green-100" : "bg-red-50 text-red-700 border border-red-100") : (isPlayerTurn ? "bg-blue-50 text-blue-700 border border-blue-100" : "bg-gray-100 text-gray-600 border border-gray-200")}`}>
            {battle.over ? (battle.result === "win" ? "Victory" : "Defeat") : (isPlayerTurn ? "Your turn" : "Enemy's turn")}
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="px-4 pb-28">
        {/* Player card (collapsible) */}
        <div className="mt-4">
          <div className="bg-white border rounded-lg p-3 shadow-sm">
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <div className="font-semibold">{battle.player.name}</div>

                  <button
                    onClick={() => setPlayerCollapsed(v => !v)}
                    className="ml-2 text-xs px-2 py-0.5 border rounded bg-gray-50"
                    aria-expanded={!playerCollapsed}
                    aria-controls="player-details"
                  >
                    {playerCollapsed ? "Expand" : "Collapse"}
                  </button>
                </div>

                {/* HP / MP numeric + small bars */}
                <div className="mt-2 space-y-2">
                  {/* HP */}
                  <div className="flex items-center gap-3">
                    <div className="w-2/12 text-xs text-gray-600">HP</div>
                    <div className="flex-1">
                      <div className="w-full bg-gray-200 rounded h-3 overflow-hidden" role="progressbar" aria-valuenow={hpPct} aria-valuemin={0} aria-valuemax={100}>
                        <div className="h-3 bg-red-500" style={{ width: `${hpPct}%`, transition: "width 220ms ease" }} />
                      </div>
                      <div className="mt-1 text-xs text-gray-600">{playerHP}/{playerMaxHP} ({hpPct}%)</div>
                    </div>
                  </div>

                  {/* MP */}
                  <div className="flex items-center gap-3">
                    <div className="w-2/12 text-xs text-gray-600">MP</div>
                    <div className="flex-1">
                      <div className="w-full bg-gray-200 rounded h-3 overflow-hidden" role="progressbar" aria-valuenow={mpPct} aria-valuemin={0} aria-valuemax={100}>
                        <div className="h-3 bg-blue-500" style={{ width: `${mpPct}%`, transition: "width 220ms ease" }} />
                      </div>
                      <div className="mt-1 text-xs text-gray-600">{playerMP}/{playerMaxMP} ({mpPct}%)</div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="text-right">
                {playerCollapsed ? (
                  <div className="text-sm font-medium">ATK {battle.player.atk}</div>
                ) : (
                  <div>
                    <div className="text-xs text-gray-500">ATK / DEF</div>
                    <div className="font-medium">{battle.player.atk} / {battle.player.def}</div>
                  </div>
                )}
              </div>
            </div>

            {/* expandable details (no allocation UI here) */}
            <div id="player-details" className={`mt-3 transition-all ${playerCollapsed ? "max-h-0 overflow-hidden" : "max-h-[600px]"}`}>
              {!playerCollapsed && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="text-sm"><div className="text-xs text-gray-500">M-ATK</div><div className="font-medium">{battle.player.mAtk ?? 0}</div></div>
                    <div className="text-sm"><div className="text-xs text-gray-500">M-DEF</div><div className="font-medium">{battle.player.mDef ?? 0}</div></div>
                  </div>

                  <div className="mt-2 text-xs text-gray-600">Crit: <span className="font-medium">{critPctApprox}%</span> • Mult: <span className="font-medium">{critMultApprox}×</span></div>

                  <StatusPips entity={battle.player} />
                </>
              )}
            </div>
          </div>
        </div>

        {/* Enemies */}
        <div className="mt-4">
          <div className="flex items-center justify-between mb-2 px-1">
            <div className="text-sm font-semibold">Enemies ({aliveEnemies.length} alive)</div>
            <div className="text-xs text-gray-500">Tap to select</div>
          </div>

          <div ref={enemiesListRef} className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {enemiesArr.length === 0 && <div className="text-gray-500 text-sm col-span-full">No enemies.</div>}

            {enemiesArr.map((en, idx) => {
              const alive = (Number(en?.hp) || 0) > 0;
              const selected = idx === effectiveSelectedTarget;
              return (
                <div
                  key={`${en?.id || "enemy"}-${idx}`}
                  data-enemy-index={idx}
                  onClick={() => alive && selectTarget(idx)}
                  className={`bg-white border rounded-lg p-2 shadow-sm text-xs ${selected ? "ring-2 ring-blue-400" : "border-gray-200"} ${!alive ? "opacity-50" : "cursor-pointer active:scale-[0.98]"}`}
                >
                  <div className="flex items-center justify-between">
                    <div className="font-semibold truncate max-w-[80px]">{en?.name || en?.id || `Enemy ${idx + 1}`}</div>
                    <div className="text-right"><div className="font-bold text-[13px]">{en?.hp}/{en?.maxHP}</div></div>
                  </div>

                  <div className="mt-1 text-[11px] text-gray-600">ATK {en?.atk} • DEF {en?.def} • M-DEF {en?.mDef ?? en?.def}</div>

                  {Array.isArray(en?.statuses) && en.statuses.length > 0 && (
                    <div className="flex gap-1 mt-2 flex-wrap">
                      {en.statuses.map((s, i) => (
                        <div key={i} className="px-1.5 py-0.5 rounded bg-gray-100 text-[10px] font-medium flex items-center gap-1">
                          <StatusIcon type={s.type} />
                          {s.id} ({s.turnsLeft})
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="mt-2">
                    <button disabled={!alive} className={`w-full py-1 rounded text-[11px] ${selected ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-800"}`}>
                      {selected ? "Selected" : "Select"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Battle log */}
        <div className="mt-4">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold">Battle Log</div>
            <button onClick={() => setLogOpen(v => !v)} className="text-xs text-blue-600">{logOpen ? "Hide" : "Show"}</button>
          </div>

          {logOpen && (
            <div ref={logRef} className="mt-2 bg-white border rounded p-2 h-40 overflow-y-auto font-mono text-sm">
              {battle.log.map((l, i) => <div key={i} className="mb-1">{l}</div>)}
            </div>
          )}
        </div>
      </div>

      {/* Fixed bottom bar with three primary actions */}
      <div className="fixed left-0 right-0 bottom-0 z-50 bg-white border-t py-3 px-4">
        <div className="flex items-center justify-between mb-2">
          <div className="text-xs text-gray-600">{busy && !battle.over ? "Enemy thinking…" : (battle.over ? (battle.result === "win" ? "Battle Finished" : "You lost") : (isPlayerTurn ? "Your turn" : "Enemy turn"))}</div>
          <div className="text-xs text-gray-500">Tap an action</div>
        </div>

        <div className="flex gap-3">
          <button
            onClick={onPrimaryAttack}
            disabled={!actions.canAttack || enemiesArr.length === 0 || !isPlayerTurn}
            className={`flex-1 py-3 rounded-md text-sm font-semibold ${(!actions.canAttack || !isPlayerTurn) ? "bg-gray-100 text-gray-400 border border-gray-200" : "bg-white border border-gray-200"}`}
          >
            Attack
            <div className="text-xs text-gray-500 mt-1">Target: {effectiveSelectedTarget + 1}</div>
          </button>

          <button
            onClick={onOpenSpells}
            disabled={!isPlayerTurn || !(spells && spells.length)}
            className={`w-36 py-3 rounded-md text-sm font-semibold ${(!isPlayerTurn || !(spells && spells.length)) ? "bg-gray-100 text-gray-400 border border-gray-200" : "bg-white border border-gray-200"}`}
          >
            Spells
            <div className="text-xs text-gray-500 mt-1">{spells.length} available</div>
          </button>

          <button
            onClick={onOpenItems}
            disabled={!isPlayerTurn || !(items && items.length)}
            className={`w-36 py-3 rounded-md text-sm font-semibold ${(!isPlayerTurn || !(items && items.length)) ? "bg-gray-100 text-gray-400 border border-gray-200" : "bg-white border border-gray-200"}`}
          >
            Items
            <div className="text-xs text-gray-500 mt-1">{items.filter(i => (i.kind === "heal" || i.kind === "mana" || i.kind === "damage")).length}</div>
          </button>
          {/* Return / Exit button */}
          <div style={{
            position: "absolute",
            top: 10,
            right: 10,
            zIndex: 50,
          }}>
            <button
              onClick={() => {navigate("/dungeon")
              }}
              style={{
                padding: "6px 12px",
                background: "#fff",
                border: "1px solid #ccc",
                borderRadius: 8,
                cursor: "pointer",
                fontSize: 14,
              }}
            >
              Return
            </button>
          </div>

        </div>
      </div>

      {/* Spells bottom sheet */}
      {showSpells && (
        <div className="fixed inset-0 z-60 flex items-end">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowSpells(false)} />
          <div className="relative w-full bg-white rounded-t-xl shadow-xl max-h-[70vh] overflow-auto p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="text-lg font-semibold">Spells</div>
              <button onClick={() => setShowSpells(false)} className="px-2 py-1 border rounded text-sm">Close</button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {spells.length === 0 && <div className="col-span-full text-gray-500">No spells.</div>}
              {spells.map(sp => {
                const can = actions.spells?.[sp.id];
                const aoe = isAoeSpell(sp);
                const cd = sp._cooldownRemaining || 0;
                return (
                  <button
                    key={sp.id}
                    onClick={() => { if (!can) return; if (aoe) doCast(sp.id); else doCast(sp.id, effectiveSelectedTarget); setShowSpells(false); }}
                    disabled={!can}
                    className={`text-left p-3 rounded border ${can ? "bg-white hover:bg-gray-50" : "bg-gray-100 text-gray-400 cursor-not-allowed"}`}
                  >
                    <div className="font-medium">{sp.name}{aoe ? " • AOE" : ""}</div>
                    <div className="text-xs text-gray-500 mt-1">{sp.kind === "damage" ? `${sp.cost ?? 0} MP` : sp.kind === "heal" ? `${sp.cost ?? 0} MP` : `${sp.cost ?? 0} MP`} {cd ? `• CD ${cd}` : ""}</div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Items bottom sheet */}
      {showItems && (
        <div className="fixed inset-0 z-60 flex items-end">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowItems(false)} />
          <div className="relative w-full bg-white rounded-t-xl shadow-xl max-h-[70vh] overflow-auto p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="text-lg font-semibold">Items</div>
              <button onClick={() => setShowItems(false)} className="px-2 py-1 border rounded text-sm">Close</button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {items.filter(it => it.kind === "heal" || it.kind === "mana" || it.kind === "damage").length === 0 && <div className="col-span-full text-gray-500">No usable items.</div>}
              {items.filter(it => it.kind === "heal" || it.kind === "mana" || it.kind === "damage").map(it => {
                const can = actions.items?.[it.id];
                const aoe = isAoeItem(it);
                const cd = it._cooldownRemaining || 0;
                return (
                  <button
                    key={it.id}
                    onClick={() => { if (!can) return; if (aoe) doUse(it.id); else doUse(it.id, effectiveSelectedTarget); setShowItems(false); }}
                    disabled={!can}
                    className={`text-left p-3 rounded border ${can ? "bg-white hover:bg-gray-50" : "bg-gray-100 text-gray-400 cursor-not-allowed"}`}
                  >
                    <div className="font-medium">{it.name} ×{it.qty}{aoe ? " • AOE" : ""}</div>
                    <div className="text-xs text-gray-500 mt-1">{it.kind === "heal" ? `Heals ${it.healAmount ?? ""} HP` : it.kind === "mana" ? `Restores ${it.mpAmount ?? ""} MP` : `${it.damage ?? ""} dmg`} {cd ? `• CD ${cd}` : ""}</div>
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
  if (type === "buff") return <span className="w-3 h-3 rounded-full bg-green-400 inline-block" />;
  if (type === "debuff") return <span className="w-3 h-3 rounded-full bg-indigo-400 inline-block" />;
  return <span className="w-3" />;
}
