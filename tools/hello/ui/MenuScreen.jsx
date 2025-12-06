// src/ui/MenuScreen.jsx
import React, { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import CharacterSheet from "./CharacterSheet.jsx";
import usePlayerProgress from "../state/usePlayerProgress.js";
import { loadProgress, saveProgress, clearProgress } from "../state/playerProgress.js";

/**
 * MenuScreen (Clean Version)
 * - No navigation buttons at all (City/Map/Shop/etc removed).
 * - Pure profile & save-management screen.
 * - Character Sheet modal still works.
 */

export default function MenuScreen() {
  const { progress } = usePlayerProgress();
  const navigate = useNavigate();

  const [openCharacter, setOpenCharacter] = useState(false);
  const [importError, setImportError] = useState(null);

  const player = progress || loadProgress() || {};

  const level = player.level ?? 1;
  const gold = player.gold ?? 0;
  const exp = player.exp ?? 0;
  const unspent = player.unspentPoints ?? 0;
  const need = expNeededFor(level);
  const expPct = need > 0 ? Math.max(0, Math.min(1, exp / need)) : 0;

  /* Allocate Stat Handler */
  const onAllocate = useCallback((statKey) => {
    try {
      const p = loadProgress() || {
        level: 1, exp: 0, unspentPoints: 0,
        stats: { STR: 3, DEX: 3, MAG: 3, CON: 3 }
      };

      if ((p.unspentPoints | 0) <= 0) return;

      p.unspentPoints -= 1;
      p.stats = { ...p.stats };
      p.stats[statKey] = (p.stats[statKey] | 0) + 1;

      saveProgress(p);
    } catch (e) {
      console.error("Allocate failed", e);
    }
  }, []);

  function handleExport() {
    const p = loadProgress() || {};
    const blob = new Blob([JSON.stringify(p, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `progress-${p.name || "player"}-lv${p.level || 1}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleImport(file) {
    setImportError(null);
    if (!file) return;

    const r = new FileReader();
    r.onload = (ev) => {
      try {
        const parsed = JSON.parse(String(ev.target.result));
        if (typeof parsed !== "object" || parsed === null) throw new Error("Invalid JSON");
        saveProgress(parsed);
      } catch (err) {
        setImportError(String(err.message || err));
      }
    };
    r.onerror = () => setImportError("Failed to read file");
    r.readAsText(file);
  }

  function handleClearProgress() {
    if (!confirm("Clear saved progress? This cannot be undone.")) return;
    clearProgress();
    navigate("/", { replace: true });
  }

  return (
    <div style={styles.root}>
      <div style={styles.header}>
        <div style={styles.title}>Menu</div>
        <div style={styles.sub}>Character, save data, and utilities</div>
      </div>

      {/* Single Card — clean & simple */}
      <section style={styles.card}>
        {/* Player summary */}
        <div style={styles.playerRow}>
          <div style={styles.playerName}>{player.name || "Unnamed Hero"}</div>
          <div style={styles.badge}>Lv {level}</div>
        </div>

        <div style={styles.statRow}>
          <div style={styles.statBlock}>
            <div style={styles.statLabel}>EXP</div>
            <div style={styles.statValue}>{exp}/{need}</div>
            <div style={styles.progressWrap}>
              <div style={{ ...styles.progressBar, width: `${expPct * 100}%` }} />
            </div>
          </div>

          <div style={styles.statBlock}>
            <div style={styles.statLabel}>Gold</div>
            <div style={styles.statValue}>{gold}</div>
          </div>

          <div style={styles.statBlock}>
            <div style={styles.statLabel}>Unspent</div>
            <div style={styles.statValue}>{unspent}</div>
          </div>
        </div>

        {/* Actions */}
        <div style={styles.actionsRow}>
          <button style={styles.btnPrimary} onClick={() => setOpenCharacter(true)}>Character Sheet</button>
          

          <button style={styles.btnDanger} onClick={handleClearProgress}>Clear Save</button>
        </div>

        

        {/* Utilities */}
        
      </section>

      {openCharacter && (
        <CharacterSheet
          onClose={() => setOpenCharacter(false)}
          onAllocate={onAllocate}
        />
      )}
    </div>
  );
}

/* -------- helper -------- */
function expNeededFor(level) {
  return Math.ceil(100 * Math.pow(1.2, Math.max(0, (level | 0) - 1)));
}

/* -------- styles -------- */
const styles = {
  root: { padding: 12, fontFamily: "system-ui, -apple-system, Segoe UI, Roboto" },
  header: { marginBottom: 12 },
  title: { fontSize: 22, fontWeight: 800 },
  sub: { fontSize: 13, color: "#666" },

  card: {
    background: "#fff",
    borderRadius: 10,
    padding: 14,
    border: "1px solid #eee",
    boxShadow: "0 6px 20px rgba(0,0,0,0.04)",
  },

  playerRow: { display: "flex", justifyContent: "space-between", marginBottom: 10 },
  playerName: { fontWeight: 700, fontSize: 18 },
  badge: { background: "#eef6ff", padding: "4px 10px", borderRadius: 8, border: "1px solid #c5e0ff" },

  statRow: { display: "flex", gap: 12, marginBottom: 12 },
  statBlock: { flex: 1 },
  statLabel: { color: "#666", fontSize: 12 },
  statValue: { fontSize: 16, fontWeight: 700, marginBottom: 6 },

  progressWrap: { height: 8, borderRadius: 999, background: "#f0f0f0", overflow: "hidden" },
  progressBar: { height: "100%", background: "#69b1ff" },

  actionsRow: { display: "flex", gap: 8, flexWrap: "wrap" },

  btn: { padding: "8px 12px", borderRadius: 8, border: "1px solid #ddd", background: "#fff" },
  btnPrimary: { padding: "8px 12px", borderRadius: 8, background: "#69b1ff", color: "#fff", border: "1px solid #5aa7ff" },
  btnDanger: { padding: "8px 12px", borderRadius: 8, background: "#fff1f0", color: "#c34141", border: "1px solid #ffd6d6" },

  importLabel: { display: "inline-block", cursor: "pointer" },

  error: { marginTop: 8, color: "#b34040", fontSize: 13 },

  cardTitleSmall: { fontSize: 14, fontWeight: 700 },
};
