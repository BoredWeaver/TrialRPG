// src/ui/ZoneScreen.jsx
import React from "react";
import { useNavigate, useParams } from "react-router-dom";
import { findLocation } from "../state/locations.js";
import ENEMIES from "../db/enemies.json";
import { useBattleContext } from "../state/BattleContext.jsx";
import usePlayerProgress from "../state/usePlayerProgress.js";
import useDungeon from "../state/useDungeon.js";

/**
 * Zone screen:
 *  - Shows zone details and encounters
 *  - "Fight" buttons still start immediate battles (same as before)
 *  - "Enter Dungeon" now starts a run via useDungeon.startNewRun and navigates to /dungeon
 *
 * Note: runs are single-active-run; startNewRun clears any previous active run automatically.
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
      <div>
        <h3>Unknown zone</h3>
        <div style={{ marginTop: 8 }}>
          <button style={styles.btn} onClick={() => navigate(-1)}>Back</button>
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
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h3 style={{ margin: 0 }}>{loc.name}</h3>
        <div>
          <button style={styles.btn} onClick={() => navigate(-1)}>Back</button>
        </div>
      </div>

      <div style={{ marginTop: 10, color: "#666" }}>
        Kind: {loc.kind} • Recommended: Lv {loc.minLevel ?? 1}
      </div>

      <section style={{ marginTop: 16 }}>
        <h4>Encounters</h4>
        {Array.isArray(loc.enemies) && loc.enemies.length > 0 ? (
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {loc.enemies.map((eid, idx) => {
              const meta = ENEMIES[eid] || { name: eid };
              return (
                <div key={`${eid}-${idx}`} style={styles.card}>
                  <div style={{ fontWeight: 700 }}>{meta.name}</div>
                  <div style={{ color: "#666", fontSize: 13 }}>id: {eid}</div>

                  <div style={{ marginTop: 8 }}>
                    <button style={styles.btn} onClick={() => startBattleWith(eid)}>Fight</button>
                    <button style={{ ...styles.btn, marginLeft: 8 }} onClick={() => startBattleWith([eid, eid])}>Fight x2</button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div style={{ color: "#666" }}>No encounters configured.</div>
        )}
      </section>

      <section style={{ marginTop: 20 }}>
        <h4>Dungeons</h4>
        {Array.isArray(loc.dungeons) && loc.dungeons.length > 0 ? (
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {loc.dungeons.map((did) => (
              <div key={did} style={styles.card}>
                <div style={{ fontWeight: 700 }}>{did}</div>
                <div style={{ color: "#666", fontSize: 13, marginBottom: 8 }}>
                  Dungeon id
                </div>

                <div>
                  <button style={styles.btn} onClick={() => enterDungeon(did)}>
                    Enter Dungeon
                  </button>
                  <button
                    style={{ ...styles.btn, marginLeft: 8 }}
                    onClick={() => enterDungeonAuto(did)}
                  >
                    Enter & Auto-Start
                  </button>
                </div>
                <div style={{ marginTop: 8, color: "#444", fontSize: 13 }}>
                  Tip: "Enter & Auto-Start" immediately begins the run.
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ color: "#666" }}>No dungeons in this zone.</div>
        )}
      </section>
    </div>
  );
}

const styles = {
  card: { border: "1px solid #eee", borderRadius: 8, padding: 10, minWidth: 160, background: "#fff" },
  btn: { padding: "8px 10px", borderRadius: 8, border: "1px solid #d9d9d9", background: "#fafafa", cursor: "pointer" },
};
