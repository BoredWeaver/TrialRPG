// src/ui/SpellBook.jsx
import React, { useMemo, useState } from "react";
import spellsData from "../db/spells.json"; // Vite supports JSON imports

/**
 * SpellBook
 * - presentation-only UI: lists spells from src/db/spells.json
 * - searchable, filter by kind/element, select to show details
 * - mobile-first, dark fantasy styling (uses Tailwind classes where convenient)
 * - NO game logic / side-effects changed
 */

function niceKey(k) {
  return String(k).replace(/[-_]/g, " ");
}

export default function SpellBook() {
  const allSpellsObj = spellsData || {};
  const allIds = Object.keys(allSpellsObj);
  const allSpells = useMemo(() => allIds.map(id => ({ id, ...(allSpellsObj[id] || {}) })), [allSpellsObj, allIds]);

  const [query, setQuery] = useState("");
  const [kindFilter, setKindFilter] = useState("all");
  const [elemFilter, setElemFilter] = useState("all");
  const [selected, setSelected] = useState(null);

  const kinds = useMemo(() => {
    const s = new Set();
    allSpells.forEach(sp => s.add(sp.kind || "unknown"));
    return ["all", ...Array.from(s)];
  }, [allSpells]);

  const elements = useMemo(() => {
    const s = new Set();
    allSpells.forEach(sp => {
      if (sp.element) s.add(sp.element);
      else s.add("none");
    });
    return ["all", ...Array.from(s)];
  }, [allSpells]);

  const filtered = useMemo(() => {
    const q = String(query || "").trim().toLowerCase();
    return allSpells.filter(sp => {
      if (kindFilter !== "all" && (sp.kind || "unknown") !== kindFilter) return false;
      const elem = sp.element || "none";
      if (elemFilter !== "all" && elem !== elemFilter) return false;
      if (!q) return true;
      // search across id, name, element, kind
      const hay = `${sp.id} ${sp.name || ""} ${sp.element || ""} ${sp.kind || ""}`.toLowerCase();
      return hay.includes(q);
    }).sort((a,b) => (a.name || a.id).localeCompare(b.name || b.id));
  }, [allSpells, query, kindFilter, elemFilter]);

  return (
    <div className="min-h-screen p-4 bg-[#060812] text-white">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <h1 className="text-xl font-bold">SpellBook</h1>
            <div className="text-sm text-white/70 mt-1">Inspect spells available in the game data</div>
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
              placeholder="Search spells by name, id, element..."
              className="flex-1 px-3 py-2 rounded-md bg-transparent border border-white/8 placeholder:text-white/40 focus:outline-none"
              style={{ color: "#eef6ff" }}
            />

            <div className="flex items-center gap-2">
              <select
                value={kindFilter}
                onChange={(e) => setKindFilter(e.target.value)}
                className="px-2 py-2 rounded-md bg-transparent border border-white/8 text-sm"
                style={{ color: "#eef6ff" }}
              >
                {kinds.map(k => <option key={k} value={k}>{k}</option>)}
              </select>

              <select
                value={elemFilter}
                onChange={(e) => setElemFilter(e.target.value)}
                className="px-2 py-2 rounded-md bg-transparent border border-white/8 text-sm"
                style={{ color: "#eef6ff" }}
              >
                {elements.map(e => <option key={e} value={e}>{e}</option>)}
              </select>
            </div>
          </div>

          {/* grid + details */}
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-3">
            {/* list */}
            <div className="lg:col-span-3">
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {filtered.length === 0 && (
                  <div className="col-span-full text-white/60 p-4">No spells match.</div>
                )}

                {filtered.map(sp => {
                  const isAoE = sp.target === "aoe" || sp.target === "all";
                  return (
                    <div
                      key={sp.id}
                      onClick={() => setSelected(sp)}
                      role="button"
                      tabIndex={0}
                      className="p-3 rounded-lg border border-white/6 bg-linear-to-br from-[#07111a] to-[#061016] hover:scale-[1.01] transition-transform cursor-pointer"
                      title={sp.name}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="font-semibold truncate" style={{ color: "#eef6ff" }}>{sp.name || sp.id}</div>
                          <div className="text-xs text-white/60 truncate">{sp.kind || "—"}{sp.element ? ` • ${sp.element}` : ""}</div>
                        </div>

                        <div className="text-right text-xs text-white/60">
                          <div>{sp.cost ?? "—"} MP</div>
                          <div className="mt-1">{sp.cooldown ? `CD ${sp.cooldown}` : ""}</div>
                        </div>
                      </div>

                      <div className="mt-3 flex items-center gap-2">
                        <div className="text-xs px-2 py-0.5 rounded bg-white/3">{isAoE ? "AOE" : "Single"}</div>
                        {sp.canCrit && <div className="text-xs px-2 py-0.5 rounded bg-white/3">Crit</div>}
                        {sp.damageType && <div className="text-xs px-2 py-0.5 rounded bg-white/3">{sp.damageType}</div>}
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
                  <div className="text-white/60">Select a spell to see details.</div>
                ) : (
                  <div>
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-lg font-semibold" style={{ color: "#eef6ff" }}>{selected.name}</div>
                        <div className="text-xs text-white/60">{selected.id}</div>
                      </div>
                      <div className="text-sm text-white/80">{selected.cost ?? "—"} MP</div>
                    </div>

                    <div className="mt-3 text-sm text-white/70">
                      <div><strong>Kind:</strong> {selected.kind || "—"}</div>
                      {selected.element && <div><strong>Element:</strong> {selected.element}</div>}
                      {selected.target && <div><strong>Target:</strong> {selected.target}</div>}
                      {typeof selected.powerMult !== "undefined" && <div><strong>Power ×</strong> {selected.powerMult}</div>}
                      {typeof selected.healAmount !== "undefined" && <div><strong>Heal:</strong> {selected.healAmount}</div>}
                      {typeof selected.damageType !== "undefined" && <div><strong>Type:</strong> {selected.damageType}</div>}
                      {typeof selected.cooldown !== "undefined" && <div><strong>Cooldown:</strong> {selected.cooldown}</div>}
                    </div>

                    {Array.isArray(selected.effects) && selected.effects.length > 0 && (
                      <div className="mt-3">
                        <div className="text-sm font-medium text-white/80 mb-2">Effects</div>
                        <div className="space-y-2 text-sm text-white/70">
                          {selected.effects.map((ef, i) => (
                            <div key={i} className="p-2 rounded bg-white/3">
                              <div className="text-sm font-medium">{ef.type}</div>
                              <div className="text-xs"> {JSON.stringify(ef)}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="mt-4 flex items-center gap-2">
                      <button
                        onClick={() => {
                          // UI only: copy JSON to clipboard for convenience
                          try { navigator.clipboard?.writeText(JSON.stringify(selected, null, 2)); } catch (_) {}
                        }}
                        className="px-3 py-2 rounded-md bg-indigo-900 text-indigo-100 text-sm"
                      >
                        Copy JSON
                      </button>

                      <button
                        onClick={() => {
                          // UI only: open raw JSON in new tab
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
