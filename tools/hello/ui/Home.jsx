// src/ui/Home.jsx
import React from "react";
import usePlayerProgress from "../state/usePlayerProgress.js";
import { getLocationsForPlayer } from "../state/locations.js";

/**
 * Props:
 *  - onEnter(locationId)
 *  - onOpenCharacter()
 */
export default function Home({ onEnter = () => {}, onOpenCharacter = () => {} }) {
  const { progress } = usePlayerProgress();
  const player = progress || {};

  const locs = getLocationsForPlayer(player);

  return (
    <div style={styles.root}>
      <div style={styles.header}>
        <h2 style={{ margin: 0 }}>Home</h2>

        <div>
          <button style={styles.btn} onClick={onOpenCharacter}>Character</button>
        </div>
      </div>

      <div style={{ marginBottom: 8, color: "#666" }}>
        Gold: {player.gold ?? 0} • Level: {player.level ?? 1}
      </div>

      <p style={{ color: "#666" }}>Choose a location:</p>

      <div style={styles.grid}>
        {locs.map((L) => {
          const lockReason = !L.available
            ? (L.isLocked ? "Locked" : `Requires Lv ${L.minLevel}`)
            : null;

          return (
            <div key={L.id} style={styles.card}>
              <div style={styles.cardTitle}>{L.name}</div>

              <div style={{ color: "#666", marginBottom: 8 }}>
                {L.kind === "dungeon"
                  ? `Dungeon • min Lv ${L.minLevel || 1}`
                  : L.kind}
              </div>

              <div style={{ display: "flex", gap: 8 }}>
                <button
                  style={styles.enterBtn}
                  disabled={!L.available}
                  onClick={() => onEnter(L.id)}
                  title={lockReason || `Enter ${L.name}`}
                >
                  {L.available ? "Enter" : lockReason}
                </button>

                <button
                  style={styles.btnAlt}
                  onClick={() => alert(JSON.stringify(L, null, 2))}
                >
                  Info
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ---------------- styles ---------------- */

const styles = {
  root: { padding: 18 },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: 12,
  },
  card: {
    border: "1px solid #eee",
    borderRadius: 10,
    padding: 12,
    background: "#fff",
  },
  cardTitle: { fontWeight: 700, marginBottom: 6 },
  enterBtn: {
    padding: "8px 10px",
    borderRadius: 8,
    border: "1px solid #2d7",
    background: "#f7fff7",
    cursor: "pointer",
  },
  btn: {
    padding: "6px 10px",
    borderRadius: 8,
    border: "1px solid #d9d9d9",
    background: "#fafafa",
    cursor: "pointer",
  },
  btnAlt: {
    padding: "6px 10px",
    borderRadius: 8,
    border: "1px solid #eee",
    background: "#fff",
    cursor: "pointer",
  },
};
