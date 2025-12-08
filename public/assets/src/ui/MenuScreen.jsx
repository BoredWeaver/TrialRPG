// src/ui/MenuScreen.jsx
import React, { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import CharacterSheet from "./CharacterSheet.jsx";
import usePlayerProgress from "../state/usePlayerProgress.js";
import { loadProgress, saveProgress, clearProgress } from "../state/playerProgress.js";

/**
 * MenuScreen (dark theme + placeholders wired)
 * - Preserves your original logic and handlers.
 * - Adds dark theme (default) and a small theme toggle for preview.
 * - Placeholder buttons: SpellBook, Enemies, Dungeons — now navigate to their routes.
 * - No links or game-behavior changes beyond navigation.
 */

export default function MenuScreen() {
  const { progress } = usePlayerProgress();
  const navigate = useNavigate();

  const [openCharacter, setOpenCharacter] = useState(false);
  const [importError, setImportError] = useState(null);

  // presentation-only theme toggle (no persistence)
  const [theme, setTheme] = useState("dark");

  const player = progress || loadProgress() || {};

  const level = player.level ?? 1;
  const gold = player.gold ?? 0;
  const exp = player.exp ?? 0;
  const unspent = player.unspentPoints ?? 0;
  const need = expNeededFor(level);
  const expPct = need > 0 ? Math.max(0, Math.min(1, exp / need)) : 0;

  /* Allocate Stat Handler (left unchanged) */
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

  // styles switcher: dark / light
  const isDark = theme === "dark";
  const S = isDark ? darkStyles : lightStyles;

  return (
    <div style={{ ...S.root }}>
      <div style={S.header}>
        <div>
          <div style={S.title}>Menu</div>
          <div style={S.sub}>Character, save data, and utilities</div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={S.smallBadge}>Lv {level}</div>
          <button
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            style={S.themeBtn}
            aria-label="Toggle theme"
            title="Toggle theme"
          >
            {isDark ? "Light" : "Dark"}
          </button>
        </div>
      </div>

      {/* Single Card — clean & simple */}
      <section style={S.card}>
        {/* Player summary */}
        <div style={S.playerRow}>
          <div style={S.playerName} title={player.name || "Unnamed Hero"}>{player.name || "Unnamed Hero"}</div>
          <div style={S.badge}>Lv {level}</div>
        </div>

        <div style={S.statRow}>
          <div style={S.statBlock}>
            <div style={S.statLabel}>EXP</div>
            <div style={S.statValue}>{exp}/{need}</div>
            <div style={S.progressWrap}>
              <div style={{ ...S.progressBar, width: `${expPct * 100}%` }} />
            </div>
          </div>

          <div style={S.statBlock}>
            <div style={S.statLabel}>Gold</div>
            <div style={S.statValue}>{gold}</div>
          </div>

          <div style={S.statBlock}>
            <div style={S.statLabel}>Unspent</div>
            <div style={S.statValue}>{unspent}</div>
          </div>
        </div>

        {/* Actions (added placeholders SpellBook, Enemies, Dungeons) */}
        <div style={S.actionsRow}>
          <button
            style={S.btnPrimary}
            onClick={() => setOpenCharacter(true)}
            aria-label="Open character sheet"
            title="Open character sheet"
          >
            Character Sheet
          </button>

          <button
            style={S.btnGhost}
            onClick={() => navigate("/spellbook")}
            aria-label="Open spellbook"
            title="SpellBook"
          >
            SpellBook
          </button>

          <button
            style={S.btnGhost}
            onClick={() => navigate("/enemies")}
            aria-label="Open enemies inspector"
            title="Enemies"
          >
            Enemies
          </button>

          <button
            style={S.btnGhost}
            onClick={() => navigate("/dungeons")}
            aria-label="Open dungeons inspector"
            title="Dungeons"
          >
            Dungeons
          </button>

          <button style={S.btnGhost} onClick={handleExport} aria-label="Export progress" title="Export progress (.json)">Export</button>

          <label style={S.importLabel} title="Import progress (.json)">
            <input
              type="file"
              accept="application/json"
              style={{ display: "none" }}
              onChange={(e) => {
                setImportError(null);
                const f = e.target.files && e.target.files[0];
                handleImport(f);
                try { e.target.value = ""; } catch (_) {}
              }}
            />
            <span style={S.btnGhost} role="button" aria-label="Import progress">Import</span>
          </label>

          <button style={S.btnDanger} onClick={handleClearProgress} aria-label="Clear save" title="Clear Save">Clear Save</button>
        </div>

        {importError && <div style={S.error}>{importError}</div>}
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

/* -------- theme / styles -------- */
const base = {
  fontFamily: "system-ui, -apple-system, Segoe UI, Roboto",
  borderRadius: 10,
  gap: 12,
};

const darkStyles = {
  root: { padding: 12, minHeight: "100vh", background: "#060812", color: "#eef6ff", ...base },
  header: { marginBottom: 12, display: "flex", justifyContent: "space-between", alignItems: "center" },
  title: { fontSize: 22, fontWeight: 800, color: "#fff" },
  sub: { fontSize: 13, color: "rgba(255,255,255,0.65)" },

  card: {
    background: "linear-gradient(180deg, rgba(255,255,255,0.02), rgba(255,255,255,0.01))",
    borderRadius: 12,
    padding: 14,
    border: "1px solid rgba(255,255,255,0.06)",
    boxShadow: "0 8px 26px rgba(0,0,0,0.45)",
  },

  playerRow: { display: "flex", justifyContent: "space-between", marginBottom: 10, alignItems: "center" },
  playerName: { fontWeight: 700, fontSize: 18, maxWidth: 420, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  badge: { background: "rgba(255,255,255,0.04)", padding: "6px 10px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.06)", color: "#fff", fontWeight: 700 },

  statRow: { display: "flex", gap: 12, marginBottom: 12, flexWrap: "wrap" },
  statBlock: { flex: 1, minWidth: 120 },
  statLabel: { color: "rgba(255,255,255,0.65)", fontSize: 12 },
  statValue: { fontSize: 16, fontWeight: 700 },

  progressWrap: { height: 8, borderRadius: 999, background: "rgba(255,255,255,0.03)", overflow: "hidden", marginTop: 6 },
  progressBar: { height: "100%", background: "linear-gradient(90deg,#ff7b7b,#ef4444)" },

  actionsRow: { display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginTop: 6 },
  btnPrimary: { padding: "8px 12px", borderRadius: 8, background: "#4f46e5", color: "#fff", border: "1px solid rgba(255,255,255,0.06)", cursor: "pointer" },
  btnGhost: { padding: "8px 12px", borderRadius: 8, background: "transparent", color: "#e6eef6", border: "1px solid rgba(255,255,255,0.06)", cursor: "pointer" },
  btnDanger: { padding: "8px 12px", borderRadius: 8, background: "rgba(255,50,60,0.06)", color: "#ffb3b3", border: "1px solid rgba(255,50,60,0.08)", cursor: "pointer" },

  importLabel: { display: "inline-block", cursor: "pointer" },
  error: { marginTop: 8, color: "#ff9b9b", fontSize: 13 },

  smallBadge: { background: "rgba(255,255,255,0.03)", padding: "6px 10px", borderRadius: 8, color: "#fff", fontWeight: 700 },
  themeBtn: { padding: "6px 8px", borderRadius: 8, background: "transparent", border: "1px solid rgba(255,255,255,0.06)", color: "#e6eef6", cursor: "pointer" },
};

const lightStyles = {
  root: { padding: 12, minHeight: "100vh", background: "#f7fafc", color: "#0b1220", ...base },
  header: { marginBottom: 12, display: "flex", justifyContent: "space-between", alignItems: "center" },
  title: { fontSize: 22, fontWeight: 800, color: "#0b1220" },
  sub: { fontSize: 13, color: "#555" },

  card: {
    background: "#fff",
    borderRadius: 12,
    padding: 14,
    border: "1px solid #eee",
    boxShadow: "0 6px 20px rgba(0,0,0,0.04)",
  },

  playerRow: { display: "flex", justifyContent: "space-between", marginBottom: 10, alignItems: "center" },
  playerName: { fontWeight: 700, fontSize: 18, maxWidth: 420, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  badge: { background: "#eef6ff", padding: "6px 10px", borderRadius: 8, border: "1px solid #c5e0ff", color: "#0b1220", fontWeight: 700 },

  statRow: { display: "flex", gap: 12, marginBottom: 12, flexWrap: "wrap" },
  statBlock: { flex: 1, minWidth: 120 },
  statLabel: { color: "#666", fontSize: 12 },
  statValue: { fontSize: 16, fontWeight: 700 },

  progressWrap: { height: 8, borderRadius: 999, background: "#f0f0f0", overflow: "hidden", marginTop: 6 },
  progressBar: { height: "100%", background: "#69b1ff" },

  actionsRow: { display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginTop: 6 },
  btnPrimary: { padding: "8px 12px", borderRadius: 8, background: "#3182ce", color: "#fff", border: "1px solid #2b6cb0", cursor: "pointer" },
  btnGhost: { padding: "8px 12px", borderRadius: 8, background: "transparent", color: "#0b1220", border: "1px solid #e6e6e6", cursor: "pointer" },
  btnDanger: { padding: "8px 12px", borderRadius: 8, background: "#fff1f0", color: "#c34141", border: "1px solid #ffd6d6", cursor: "pointer" },

  importLabel: { display: "inline-block", cursor: "pointer" },
  error: { marginTop: 8, color: "#b34040", fontSize: 13 },

  smallBadge: { background: "#eef6ff", padding: "6px 10px", borderRadius: 8, color: "#0b1220", fontWeight: 700 },
  themeBtn: { padding: "6px 8px", borderRadius: 8, background: "transparent", border: "1px solid #e6e6e6", color: "#0b1220", cursor: "pointer" },
};
