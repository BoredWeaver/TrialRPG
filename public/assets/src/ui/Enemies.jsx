// src/ui/Enemies.jsx
import React, { useMemo, useState } from "react";
import enemiesData from "../db/enemies.json"; // Vite supports JSON imports
import spellsData from "../db/spells.json";

/**
 * Enemies page
 * - reads src/db/enemies.json and displays a searchable, filterable list
 * - shows details pane with stats, element mods, drops and referenced spells (name lookups)
 * - presentation-only (no game logic changes)
 */

function trunc(s, n = 48) {
  if (s == null) return "";
  const str = String(s);
  if (str.length <= n) return str;
  return str.slice(0, n - 1) + "…";
}

export default function Enemies() {
  const allObj = enemiesData || {};
  const ids = Object.keys(allObj);
  const all = useMemo(() => ids.map(id => ({ id, ...(allObj[id] || {}) })), [allObj, ids]);

  const [query, setQuery] = useState("");
  const [elemFilter, setElemFilter] = useState("all");
  const [selected, setSelected] = useState(null);

  const elements = useMemo(() => {
    const s = new Set();
    all.forEach(e => s.add(e.element || "none"));
    return ["all", ...Array.from(s)];
  }, [all]);

  const filtered = useMemo(() => {
    const q = String(query || "").trim().toLowerCase();
    return all.filter(en => {
      if (elemFilter !== "all" && (en.element || "none") !== elemFilter) return false;
      if (!q) return true;
      const hay = `${en.id} ${en.name || ""} ${en.element || ""}`.toLowerCase();
      return hay.includes(q);
    }).sort((a,b) => (a.name || a.id).localeCompare(b.name || b.id));
  }, [all, query, elemFilter]);

  function spellName(id) {
    const sp = spellsData?.[id];
    return sp ? (sp.name || id) : id;
  }

  return (
    <div className="min-h-screen p-4 bg-[#060812] text-white">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <h1 className="text-xl font-bold">Enemies</h1>
            <div className="text-sm text-white/70 mt-1">Inspect enemy stats, drops and spells</div>
          </div>

          <div className="flex items-center gap-2">
            <div className="text-xs text-white/60 mr-2">Theme</div>
            <div className="px-2 py-1 rounded-md bg-white/3 text-xs">Dark</div>
          </div>
        </div>

        <div className="bg-[#07111a] border border-white/6 rounded-lg p-3 shadow-sm">
          {/* controls */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 mb-3">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search enemies by name or id..."
              className="flex-1 px-3 py-2 rounded-md bg-transparent border border-white/8 placeholder:text-white/40 focus:outline-none"
              style={{ color: "#eef6ff" }}
            />

            <select
              value={elemFilter}
              onChange={(e) => setElemFilter(e.target.value)}
              className="px-2 py-2 rounded-md bg-transparent border border-white/8 text-sm"
              style={{ color: "#eef6ff" }}
            >
              {elements.map(el => <option key={el} value={el}>{el}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-4 gap-3">
            {/* list */}
            <div className="lg:col-span-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {filtered.length === 0 && <div className="col-span-full text-white/60 p-4">No enemies match.</div>}

                {filtered.map(en => {
                  const hp = en.maxHP ?? "—";
                  return (
                    <div
                      key={en.id}
                      onClick={() => setSelected(en)}
                      role="button"
                      tabIndex={0}
                      className="p-3 rounded-lg border border-white/6 bg-gradient-to-br from-[#07111a] to-[#061016] hover:scale-[1.01] transition-transform cursor-pointer"
                      title={en.name || en.id}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="font-semibold truncate" style={{ color: "#eef6ff" }}>{en.name || en.id}</div>
                          <div className="text-xs text-white/60 truncate">{en.element || "—"}</div>
                        </div>

                        <div className="text-right text-xs text-white/60">
                          <div>HP {hp}</div>
                          <div className="mt-1">EXP {en.expReward ?? "—"}</div>
                        </div>
                      </div>

                      <div className="mt-3 text-xs text-white/60 flex gap-2 flex-wrap">
                        <div className="px-2 py-0.5 rounded bg-white/3">ATK {en.atk ?? 0}</div>
                        <div className="px-2 py-0.5 rounded bg-white/3">M-ATK {en.mAtk ?? 0}</div>
                        <div className="px-2 py-0.5 rounded bg-white/3">DEF {en.def ?? 0}</div>
                        <div className="px-2 py-0.5 rounded bg-white/3">M-DEF {en.mDef ?? 0}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* details pane */}
            <aside className="lg:col-span-1">
              <div className="p-3 rounded-lg border border-white/6 bg-[#061016] min-h-[220px]">
                {!selected ? (
                  <div className="text-white/60">Select an enemy to see details.</div>
                ) : (
                  <div>
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-lg font-semibold" style={{ color: "#eef6ff" }}>{selected.name}</div>
                        <div className="text-xs text-white/60">{selected.id}</div>
                      </div>
                      <div className="text-sm text-white/80">HP {selected.maxHP ?? "—"}</div>
                    </div>

                    <div className="mt-3 text-sm text-white/70">
                      <div><strong>Element:</strong> {selected.element || "—"}</div>
                      <div><strong>EXP:</strong> {selected.expReward ?? "—"}</div>
                      <div className="mt-2"><strong>Stats</strong></div>
                      <div className="grid grid-cols-2 gap-2 text-sm mt-1">
                        <div>ATK: <span className="font-medium">{selected.atk ?? 0}</span></div>
                        <div>M-ATK: <span className="font-medium">{selected.mAtk ?? 0}</span></div>
                        <div>DEF: <span className="font-medium">{selected.def ?? 0}</span></div>
                        <div>M-DEF: <span className="font-medium">{selected.mDef ?? 0}</span></div>
                      </div>

                      {selected.elementMods && (
                        <div className="mt-3">
                          <div className="text-sm font-medium text-white/80 mb-1">Element modifiers</div>
                          <div className="space-y-1 text-sm">
                            {Object.keys(selected.elementMods).map(k => (
                              <div key={k} className="flex items-center justify-between">
                                <div className="text-xs text-white/70">{k}</div>
                                <div className="text-xs font-medium">{selected.elementMods[k]}</div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {Array.isArray(selected.drops) && selected.drops.length > 0 && (
                        <div className="mt-3">
                          <div className="text-sm font-medium text-white/80 mb-1">Drops</div>
                          <div className="space-y-1 text-sm">
                            {selected.drops.map((d, i) => (
                              <div key={i} className="flex items-center justify-between">
                                <div className="text-xs text-white/70">{d.id}</div>
                                <div className="text-xs font-medium">×{d.qty ?? 1}</div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {Array.isArray(selected.spells) && selected.spells.length > 0 && (
                        <div className="mt-3">
                          <div className="text-sm font-medium text-white/80 mb-1">Spells</div>
                          <div className="space-y-1 text-sm">
                            {selected.spells.map((sId, i) => (
                              <div key={i} className="flex items-center justify-between">
                                <div className="text-xs text-white/70">{sId}</div>
                                <div className="text-xs font-medium">{spellName(sId)}</div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="mt-4 flex items-center gap-2">
                      <button
                        onClick={() => {
                          try { navigator.clipboard?.writeText(JSON.stringify(selected, null, 2)); } catch (_) {}
                        }}
                        className="px-3 py-2 rounded-md bg-indigo-900 text-indigo-100 text-sm"
                      >
                        Copy JSON
                      </button>

                      <button
                        onClick={() => {
                          const blob = new Blob([JSON.stringify(selected, null, 2)], { type: "application/json" });
                          const url = URL.createObjectURL(blob);
                          window.open(url, "_blank");
                          setTimeout(() => URL.revokeObjectURL(url), 2000);
                        }}
                        className="px-3 py-2 rounded-md bg-white/6 text-sm"
                      >
                        Open Raw
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </aside>
          </div>
        </div>
      </div>
    </div>
  );
}
