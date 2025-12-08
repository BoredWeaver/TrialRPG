// src/ui/Dungeons.jsx
import React, { useMemo, useState } from "react";
import dungeonsData from "../db/dungeons.json";
import enemiesData from "../db/enemies.json";

/**
 * Dungeons page
 * - Reads src/db/dungeons.json (expects a top-level { "dungeons": [...] } shape)
 * - Mobile-first, dark/fantasy visual style matching other inspector pages
 * - Searchable by id/name, filter by min recommended level
 * - Details pane shows description, tile info, enemyPool (resolves names), boss and clear rewards
 * - Read-only UI; no game logic changed
 */

function trunc(s, n = 80) {
  if (s == null) return "";
  const str = String(s);
  return str.length <= n ? str : str.slice(0, n - 1) + "…";
}

export default function Dungeons() {
  const raw = dungeonsData || {};
  const list = Array.isArray(raw.dungeons) ? raw.dungeons : [];

  const [query, setQuery] = useState("");
  const [minLevelFilter, setMinLevelFilter] = useState("all");
  const [selected, setSelected] = useState(null);

  const levelOptions = useMemo(() => {
    const s = new Set();
    list.forEach(d => s.add(d.recommendedLevel ?? 0));
    return ["all", ...Array.from(s).sort((a,b)=>a-b)];
  }, [list]);

  const filtered = useMemo(() => {
    const q = String(query || "").trim().toLowerCase();
    return list.filter(d => {
      if (minLevelFilter !== "all") {
        const min = Number(minLevelFilter) || 0;
        if ((d.recommendedLevel || 0) < min) return false;
      }
      if (!q) return true;
      return `${d.id} ${d.name} ${d.description || ""}`.toLowerCase().includes(q);
    }).sort((a,b) => (a.recommendedLevel || 0) - (b.recommendedLevel || 0));
  }, [list, query, minLevelFilter]);

  function enemyName(id) {
    const e = enemiesData?.[id];
    return e ? (e.name || id) : id;
  }

  return (
    <div className="min-h-screen p-4 bg-[#060812] text-white">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <h1 className="text-xl font-bold">Dungeons</h1>
            <div className="text-sm text-white/70 mt-1">Browse dungeon definitions and rewards</div>
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
              placeholder="Search dungeons by name or id..."
              className="flex-1 px-3 py-2 rounded-md bg-transparent border border-white/8 placeholder:text-white/40 focus:outline-none"
              style={{ color: "#eef6ff" }}
            />

            <select
              value={minLevelFilter}
              onChange={(e) => setMinLevelFilter(e.target.value)}
              className="px-2 py-2 rounded-md bg-transparent border border-white/8 text-sm"
              style={{ color: "#eef6ff" }}
            >
              {levelOptions.map(opt => <option key={String(opt)} value={opt}>{opt === "all" ? "All levels" : `Lvl ≥ ${opt}`}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-4 gap-3">
            {/* list */}
            <div className="lg:col-span-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {filtered.length === 0 && <div className="col-span-full text-white/60 p-4">No dungeons match.</div>}

                {filtered.map(d => (
                  <div
                    key={d.id}
                    onClick={() => setSelected(d)}
                    role="button"
                    tabIndex={0}
                    className="p-3 rounded-lg border border-white/6 bg-gradient-to-br from-[#07111a] to-[#061016] hover:scale-[1.01] transition-transform cursor-pointer"
                    title={d.name}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-semibold truncate" style={{ color: "#eef6ff" }}>{d.name}</div>
                        <div className="text-xs text-white/60 truncate">{d.theme}</div>
                      </div>

                      <div className="text-right text-xs text-white/60">
                        <div>Lvl {d.recommendedLevel ?? "—"}</div>
                        <div className="mt-1">{d.size ? `${d.size}×${d.size}` : `${d.tileCount ?? "—"} tiles`}</div>
                      </div>
                    </div>

                    <div className="mt-3 text-xs text-white/60">
                      {trunc(d.description, 140)}
                    </div>

                    <div className="mt-3 text-xs text-white/60 flex gap-2 flex-wrap">
                      <div className="px-2 py-0.5 rounded bg-white/3">Tiles {d.tileCount ?? "—"}</div>
                      <div className="px-2 py-0.5 rounded bg-white/3">Min {d.minEnemiesPerRoom ?? "—"}</div>
                      <div className="px-2 py-0.5 rounded bg-white/3">Max {d.maxEnemiesPerRoom ?? "—"}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* details pane */}
            <aside className="lg:col-span-1">
              <div className="p-3 rounded-lg border border-white/6 bg-[#061016] min-h-[220px]">
                {!selected ? (
                  <div className="text-white/60">Select a dungeon to see details.</div>
                ) : (
                  <div>
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-lg font-semibold" style={{ color: "#eef6ff" }}>{selected.name}</div>
                        <div className="text-xs text-white/60">{selected.id}</div>
                      </div>
                      <div className="text-sm text-white/80">Lvl {selected.recommendedLevel ?? "—"}</div>
                    </div>

                    <div className="mt-3 text-sm text-white/70 space-y-2">
                      <div><strong>Theme:</strong> {selected.theme || "—"}</div>
                      <div><strong>Size:</strong> {selected.size ? `${selected.size}×${selected.size}` : `${selected.tileCount ?? "—"} tiles`}</div>
                      <div><strong>Tiles:</strong> {selected.tileCount ?? "—"} • <strong>Combat %:</strong> {selected.tileTypes?.combat ? `${Math.round(selected.tileTypes.combat * 100)}%` : "—"}</div>
                      <div className="mt-2"><strong>Recommended Level:</strong> {selected.recommendedLevel ?? "—"}</div>

                      {selected.boss && (
                        <div className="mt-2">
                          <div className="text-sm font-medium text-white/80">Boss</div>
                          <div className="text-sm">{selected.boss.name} <span className="text-xs text-white/60">({selected.boss.id})</span></div>
                          {selected.boss.notes && <div className="text-xs text-white/60 mt-1">{trunc(selected.boss.notes, 120)}</div>}
                        </div>
                      )}

                      {selected.enemyPool && (
                        <div className="mt-2">
                          <div className="text-sm font-medium text-white/80">Enemy Pool</div>
                          <div className="mt-1 text-sm space-y-2">
                            {Object.keys(selected.enemyPool).map(k => (
                              <div key={k}>
                                <div className="text-xs text-white/60">{k}</div>
                                <div className="flex gap-2 flex-wrap mt-1">
                                  {(selected.enemyPool[k] || []).map((eid, i) => (
                                    <div key={i} className="px-2 py-0.5 rounded bg-white/3 text-xs">
                                      <div className="font-medium">{enemyName(eid)}</div>
                                      <div className="text-white/60 text-[11px]">{eid}</div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {selected.lootHints && selected.lootHints.length > 0 && (
                        <div className="mt-2">
                          <div className="text-sm font-medium text-white/80">Loot Hints</div>
                          <div className="mt-1 text-sm">
                            {selected.lootHints.map((h, i) => <div key={i} className="text-xs text-white/60">{h}</div>)}
                          </div>
                        </div>
                      )}

                      {selected.clearRewards && (
                        <div className="mt-2">
                          <div className="text-sm font-medium text-white/80">Clear Rewards</div>
                          <div className="mt-1 text-sm text-white/70">
                            Gold: <span className="font-medium">{selected.clearRewards.gold ?? "—"}</span><br />
                            EXP: <span className="font-medium">{selected.clearRewards.exp ?? "—"}</span>
                          </div>

                          {Array.isArray(selected.clearRewards.items) && selected.clearRewards.items.length > 0 && (
                            <div className="mt-2 text-sm">
                              <div className="text-xs text-white/60">Items</div>
                              <div className="mt-1 space-y-1">
                                {selected.clearRewards.items.map((it, i) => (
                                  <div key={i} className="flex items-center justify-between text-xs">
                                    <div className="text-white/60">{it.id}</div>
                                    <div className="font-medium">×{it.qty ?? 1}</div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="mt-4 flex items-center gap-2">
                      <button
                        onClick={() => { try { navigator.clipboard?.writeText(JSON.stringify(selected, null, 2)); } catch(_){} }}
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
