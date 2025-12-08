// src/ui/ZoneScreen.jsx
import React from "react";
import { useNavigate, useParams } from "react-router-dom";
import { findLocation } from "../state/locations.js";
import ENEMIES from "../db/enemies.json";
import { useBattleContext } from "../state/BattleContext.jsx";
import usePlayerProgress from "../state/usePlayerProgress.js";
import useDungeon from "../state/useDungeon.js";

/**
 * Zone screen (presentation-only)
 * - Dark fantasy styling, mobile-first
 * - No logic changed
 */
export default function ZoneScreen() {
  const { zoneId } = useParams();
  const locId = zoneId;
  const loc = findLocation(locId);
  const { progress } = usePlayerProgress();
  const player = progress || {};
  const battleState = useBattleContext();
  const navigate = useNavigate();

  // dungeon hook so we can start runs directly
  const dungeon = useDungeon();
  const { startNewRun } = dungeon;

  if (!loc) {
    return (
      <div className="p-4">
        <h3 className="text-lg font-semibold text-gray-100">Unknown zone</h3>
        <div className="mt-3">
          <button
            className="px-3 py-2 rounded-md bg-muted-700 text-gray-100 border border-muted-600"
            onClick={() => navigate(-1)}
          >
            Back
          </button>
        </div>
      </div>
    );
  }

  function startBattleWith(eidOrArray) {
    if (battleState && typeof battleState.startWithEnemy === "function") {
      battleState.startWithEnemy(eidOrArray);
      navigate("/combat");
    } else {
      console.warn("Battle context not ready — cannot start battle.");
      alert("Battle system not ready.");
    }
  }

  function enterDungeon(dungeonId) {
    if (!dungeonId) return;
    // create the run, then navigate to dungeon screen where useDungeon will read the active run
    const started = startNewRun(dungeonId);
    if (started && started.id) {
      console.log("[ZoneScreen] started dungeon run", started.id, "key:", dungeonId);
      navigate("/dungeon");
    } else {
      console.warn("[ZoneScreen] failed to start run for", dungeonId);
    }
  }

  function enterDungeonAuto(dungeonId) {
    if (!dungeonId) return;
    // convenience wrapper identical to enterDungeon (left for parity)
    enterDungeon(dungeonId);
  }

  return (
    <div className="p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-100">{loc.name}</h3>
        <div>
          <button
            className="px-3 py-2 rounded-md bg-muted-700 text-gray-100 border border-muted-600"
            onClick={() => navigate(-1)}
          >
            Back
          </button>
        </div>
      </div>

      <div className="mt-3 text-sm text-gray-400">
        Kind: <span className="font-medium text-gray-200">{loc.kind}</span> • Recommended: <span className="font-medium text-gray-200">Lv {loc.minLevel ?? 1}</span>
      </div>

      <section className="mt-6">
        <h4 className="text-md font-semibold text-gray-100">Encounters</h4>

        {Array.isArray(loc.enemies) && loc.enemies.length > 0 ? (
          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
            {loc.enemies.map((eid, idx) => {
              const meta = ENEMIES[eid] || { name: eid };
              return (
                <div key={`${eid}-${idx}`} className="p-3 rounded-lg fantasy-border bg-panel-800">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="font-semibold text-gray-100">{meta.name}</div>
                      <div className="text-xs text-gray-400 mt-1">id: {eid}</div>
                    </div>
                    <div className="text-sm text-gray-400">x{1}</div>
                  </div>

                  <div className="mt-3 flex gap-2">
                    <button
                      onClick={() => startBattleWith(eid)}
                      className="px-3 py-2 rounded-md bg-indigo-900 text-indigo-100 font-medium border border-indigo-700 flex-1"
                    >
                      Fight
                    </button>

                    <button
                      onClick={() => startBattleWith([eid, eid])}
                      className="px-3 py-2 rounded-md bg-muted-700 text-gray-200 border border-muted-600"
                    >
                      Fight x2
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="mt-3 text-gray-400">No encounters configured.</div>
        )}
      </section>

      <section className="mt-6">
        <h4 className="text-md font-semibold text-gray-100">Dungeons</h4>

        {Array.isArray(loc.dungeons) && loc.dungeons.length > 0 ? (
          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
            {loc.dungeons.map((did) => (
              <div key={did} className="p-3 rounded-lg fantasy-border bg-panel-800">
                <div className="font-semibold text-gray-100">{did}</div>
                <div className="text-xs text-gray-400 mt-1">Dungeon id</div>

                <div className="mt-3 flex gap-2">
                  <button
                    className="px-3 py-2 rounded-md fantasy-glow text-sm font-medium"
                    onClick={() => enterDungeon(did)}
                  >
                    Enter Dungeon
                  </button>
                </div>

               
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-3 text-gray-400">No dungeons in this zone.</div>
        )}
      </section>
    </div>
  );
}
