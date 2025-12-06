// src/ui/CharacterSheet.jsx
// Simplified layout: single-line attribute row, single-line combat row,
// shows learned spells. Logic and handlers unchanged.

import React, { useMemo, useState } from "react";
import usePlayerProgress from "../state/usePlayerProgress.js";
import { equipItem, unequipItem } from "../state/equipment.js";
import { commitChosenSpell } from "../state/progression.js";
import itemsCatalog from "../db/items.json";

export default function CharacterSheet({ player: propPlayer, onClose, onAllocate }) {
  const { progress } = usePlayerProgress();

  // Build displayPlayer: prefer live persisted progress for inventory/equipped/stats
  const displayPlayer = useMemo(() => {
    const base = propPlayer || {};
    const live = progress || {};

    return {
      name: base.name || live.name || "Adventurer",
      level: live.level ?? base.level ?? 1,
      exp: live.exp ?? base.exp ?? 0,
      unspentPoints: live.unspentPoints ?? base.unspentPoints ?? 0,
      stats: { ...(base.stats || {}), ...(live.stats || {}) },
      inventory: { ...(base.inventory || base.items || {}), ...(live.inventory || live.items || {}) },
      spells: Array.isArray(live.spells) ? [...live.spells] : (Array.isArray(base.spells) ? [...base.spells] : []),
      gold: Number.isFinite(Number(live.gold)) ? Number(live.gold) : (base.gold ?? 0),
      equipped: { ...(base.equipped || {}), ...(live.equipped || {}) },
      hp: base.hp ?? (live.hp ?? null),
      mp: base.mp ?? (live.mp ?? null),
      pendingSpellChoices: Array.isArray(live.pendingSpellChoices) ? live.pendingSpellChoices.slice() : (Array.isArray(base.pendingSpellChoices) ? base.pendingSpellChoices.slice() : []),
    };
  }, [propPlayer, progress]);

  const player = displayPlayer;

  /* ---------------- Derived helpers (unchanged logic) ---------------- */
  function deriveCombatFromStats(stats = {}, level = 1) {
    const STR = Number.isFinite(Number(stats.STR)) ? Number(stats.STR) : 0;
    const DEX = Number.isFinite(Number(stats.DEX)) ? Number(stats.DEX) : 0;
    const MAG = Number.isFinite(Number(stats.MAG)) ? Number(stats.MAG) : 0;
    const CON = Number.isFinite(Number(stats.CON)) ? Number(stats.CON) : 0;

    return {
      atk: 2 + STR * 2 + Math.floor(level / 2),
      def: 1 + Math.floor((CON + DEX) / 2),
      maxHP: 20 + CON * 8 + level * 2,
      maxMP: 5 + MAG * 5 + Math.floor(level / 2),
      mAtk: 2 + MAG * 2 + Math.floor(level / 2),
      mDef: 1 + Math.floor((MAG + CON) / 2),
    };
  }

  function applyEquipmentToStats(baseStats = {}, equipped = {}) {
    const out = { ...(baseStats || {}) };
    if (!equipped || typeof equipped !== "object") return out;
    for (const slot of Object.keys(equipped)) {
      const id = equipped[slot];
      if (!id) continue;
      const spec = itemsCatalog[id];
      if (!spec || spec.kind !== "equipment") continue;
      const bonus = spec.bonus || {};
      if (bonus.stats && typeof bonus.stats === "object") {
        for (const k of Object.keys(bonus.stats)) {
          out[k] = (out[k] || 0) + (Number(bonus.stats[k]) || 0);
        }
      }
    }
    return out;
  }

  function applyEquipmentToDerived(derived = {}, equipped = {}) {
    const out = { ...derived };
    if (!equipped || typeof equipped !== "object") return out;
    for (const slot of Object.keys(equipped)) {
      const id = equipped[slot];
      if (!id) continue;
      const spec = itemsCatalog[id];
      if (!spec || spec.kind !== "equipment") continue;
      const b = spec.bonus || {};
      if (Number.isFinite(Number(b.atk))) out.atk += Number(b.atk);
      if (Number.isFinite(Number(b.def))) out.def += Number(b.def);
      if (Number.isFinite(Number(b.mAtk))) out.mAtk += Number(b.mAtk);
      if (Number.isFinite(Number(b.mDef))) out.mDef += Number(b.mDef);
      if (Number.isFinite(Number(b.maxHP))) out.maxHP += Number(b.maxHP);
      if (Number.isFinite(Number(b.maxMP))) out.maxMP += Number(b.maxMP);
    }
    return out;
  }

  /* ---------------- Derived display values ---------------- */
  const level = Number(player.level) || 1;
  const statsBase = { ...(player.stats || { STR: 3, DEX: 3, MAG: 3, CON: 3 }) };
  const statsWithEquip = applyEquipmentToStats(statsBase, player.equipped || {});
  const derivedBase = deriveCombatFromStats(statsWithEquip, level);
  const derived = applyEquipmentToDerived(derivedBase, player.equipped || {});

  const curHP = Number.isFinite(Number(player.hp)) ? Number(player.hp) : derived.maxHP;
  const curMP = Number.isFinite(Number(player.mp)) ? Number(player.mp) : derived.maxMP;

  const inventory = player.inventory || {};
  const inventoryList = Object.entries(inventory)
    .filter(([, qty]) => (Number(qty) || 0) > 0)
    .map(([id, qty]) => ({ id, qty: Number(qty) }));

  const canSpend = (player.unspentPoints | 0) > 0 && typeof onAllocate === "function";

  /* --------------- Equipment helpers (unchanged) --------------- */
  const [openSlot, setOpenSlot] = useState(null);
  const slots = ["head", "torso", "boots", "weapon", "offhand", "accessory"];

  const equipableBySlot = useMemo(() => {
    const map = {};
    for (const it of inventoryList) {
      const spec = itemsCatalog[it.id];
      if (!spec || spec.kind !== "equipment") continue;
      const slot = spec.slot || "accessory";
      map[slot] = map[slot] || [];
      map[slot].push({ id: it.id, name: spec.name, qty: it.qty });
    }
    return map;
  }, [inventoryList]);

  const equipmentBonuses = useMemo(() => {
    const totals = { atk: 0, def: 0, mAtk: 0, mDef: 0, maxHP: 0, maxMP: 0, stats: {} };
    const eq = player.equipped || {};
    for (const s of slots) {
      const id = eq[s];
      if (!id) continue;
      const spec = itemsCatalog[id];
      if (!spec || spec.kind !== "equipment") continue;
      const b = spec.bonus || {};
      if (b.atk) totals.atk += Number(b.atk);
      if (b.def) totals.def += Number(b.def);
      if (b.mAtk) totals.mAtk += Number(b.mAtk);
      if (b.mDef) totals.mDef += Number(b.mDef);
      if (b.maxHP) totals.maxHP += Number(b.maxHP);
      if (b.maxMP) totals.maxMP += Number(b.maxMP);
      if (b.stats) for (const k of Object.keys(b.stats)) totals.stats[k] = (totals.stats[k] || 0) + Number(b.stats[k]);
    }
    return totals;
  }, [player.equipped]);

  /* ---------------- Actions (unchanged) ---------------- */
  const alloc = (k) => () => {
    if (!canSpend) return;
    onAllocate(k);
  };

  async function handleEquip(slot, itemId) {
    try {
      const res = await equipItem(slot, itemId);
      if (!res || !res.success) {
        alert("Equip failed: " + (res?.reason || "unknown"));
        return;
      }
      setOpenSlot(null);
    } catch (e) {
      console.error("handleEquip failed", e);
      alert("Equip failed");
    }
  }

  async function handleUnequip(slot) {
    try {
      const res = await unequipItem(slot);
      if (!res || !res.success) {
        alert("Unequip failed: " + (res?.reason || "unknown"));
        return;
      }
    } catch (e) {
      console.error("handleUnequip failed", e);
      alert("Unequip failed");
    }
  }

  async function handleChooseSpell(levelForChoice, spellId) {
    try {
      await commitChosenSpell(levelForChoice, spellId);
    } catch (e) {
      console.error("commitChosenSpell failed", e);
      alert("Failed to learn spell");
    }
  }

  const needExp = expNeededFor(level);
  const expPct = clamp01((Number(player.exp) || 0) / needExp);

  /* ---------------- Render (simplified layout, no grid) ---------------- */
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-white rounded-lg shadow-lg overflow-auto max-h-[90vh]">
        {/* header */}
        <div className="flex items-center justify-between p-4 border-b">
          <div>
            <div className="text-lg font-bold">{player.name}</div>
            <div className="text-sm text-gray-500">Level {level}</div>
          </div>
          <div className="flex items-center gap-2">
            <div className="text-sm text-gray-600">{player.gold ?? 0} ✦</div>
            <button className="px-2 py-1 rounded border" onClick={onClose}>Close</button>
          </div>
        </div>

        <div className="p-4 space-y-4">
          {/* EXP bar */}
          <div>
            <div className="flex justify-between text-sm mb-1">
              <div className="font-medium">EXP</div>
              <div className="text-gray-600 text-sm">{player.exp}/{needExp} ({Math.round(expPct*100)}%)</div>
            </div>
            <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
              <div className="h-full bg-blue-500" style={{ width: `${expPct * 100}%` }} />
            </div>
          </div>
{Array.isArray(player.pendingSpellChoices) && player.pendingSpellChoices.length > 0 && (
            <div className="bg-blue-50 border border-blue-100 rounded p-3">
              <div className="font-semibold mb-2">Choose a spell reward</div>
              {player.pendingSpellChoices.map((choice, ii) => (
                <div key={ii} className="mb-2">
                  <div className="text-sm text-gray-700 mb-2">Level {choice.level} reward</div>
                  <div className="flex gap-2 flex-wrap">
                    {choice.options.map(spid => (
                      <button key={spid} className="px-3 py-1 rounded bg-white border text-sm" onClick={() => handleChooseSpell(choice.level, spid)}>
                        {labelize(spid)}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Attributes single-line */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <div className="font-medium">Attributes</div>
              <div className="text-sm text-gray-500">Unspent: {player.unspentPoints || 0}</div>
            </div>
            <div className="flex gap-3 flex-wrap text-sm">
              <div>STR: <strong>{statsWithEquip.STR ?? 0}</strong></div>
              <div>DEX: <strong>{statsWithEquip.DEX ?? 0}</strong></div>
              <div>MAG: <strong>{statsWithEquip.MAG ?? 0}</strong></div>
              <div>CON: <strong>{statsWithEquip.CON ?? 0}</strong></div>
            </div>

            <div className="mt-2 flex gap-2">
              {["STR","DEX","MAG","CON"].map(k => (
                <button
                  key={k}
                  onClick={alloc(k)}
                  disabled={!canSpend}
                  className={`px-2 py-1 rounded text-sm ${canSpend ? "bg-green-600 text-white" : "bg-gray-100 text-gray-500 cursor-not-allowed"}`}
                >
                  + {k}
                </button>
              ))}
            </div>
          </div>

          {/* Combat single-line + HP/MP bars */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <div className="font-medium">Combat</div>
              <div className="text-sm text-gray-500">ATK / DEF / M-ATK</div>
            </div>

            <div className="flex gap-4 items-center text-sm">
              <div>ATK: <strong>{derived.atk}</strong></div>
              <div>DEF: <strong>{derived.def}</strong></div>
              <div>M-ATK: <strong>{derived.mAtk}</strong></div>
              <div>Max HP: <strong>{derived.maxHP}</strong></div>
              <div>Max MP: <strong>{derived.maxMP}</strong></div>
            </div>

            <div className="mt-3 space-y-2">
              <div className="flex justify-between text-sm">
                <div>HP</div>
                <div className="text-gray-600 text-sm">{curHP}/{derived.maxHP}</div>
              </div>
              <div className="w-full h-3 bg-gray-100 rounded overflow-hidden">
                <div className="h-full bg-red-500" style={{ width: `${clamp01(curHP/derived.maxHP)*100}%` }} />
              </div>

              <div className="flex justify-between text-sm mt-2">
                <div>MP</div>
                <div className="text-gray-600 text-sm">{curMP}/{derived.maxMP}</div>
              </div>
              <div className="w-full h-3 bg-gray-100 rounded overflow-hidden">
                <div className="h-full bg-blue-500" style={{ width: `${clamp01(curMP/derived.maxMP)*100}%` }} />
              </div>
            </div>
          </div>

          {/* Learned spells (simple list) */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="font-medium">Spells ({player.spells.length})</div>
            </div>
            {player.spells.length === 0 ? (
              <div className="text-sm text-gray-500">No spells learned.</div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {player.spells.map((s, i) => (
                  <div key={i} className="px-3 py-1 rounded-full border bg-white text-sm">
                    {String(s)}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Equipment compact */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="font-medium">Equipment</div>
              <div className="text-sm text-gray-500">{Object.keys(player.equipped || {}).filter(k => player.equipped[k]).length} equipped</div>
            </div>

            <div className="flex gap-3 flex-wrap">
              {slots.map(slot => {
                const eqId = player.equipped?.[slot];
                const spec = eqId ? itemsCatalog[eqId] : null;
                const options = equipableBySlot[slot] || [];
                return (
                  <div key={slot} className="p-2 border rounded bg-white text-sm min-w-[120px]">
                    <div className="text-xs text-gray-500">{slot.toUpperCase()}</div>
                    <div className="font-medium mt-1">{spec ? spec.name : "— Empty —"}</div>
                    <div className="mt-2 flex gap-2">
                      {!spec ? (
                        <button onClick={() => setOpenSlot(openSlot === slot ? null : slot)} disabled={options.length === 0} className={`px-2 py-1 rounded text-sm ${options.length ? "bg-white border" : "bg-gray-100 text-gray-500 cursor-not-allowed"}`}>Equip</button>
                      ) : (
                        <button onClick={() => handleUnequip(slot)} className="px-2 py-1 rounded text-sm bg-white border">Unequip</button>
                      )}
                    </div>

                    {openSlot === slot && options.length > 0 && (
                      <div className="mt-2 space-y-1">
                        {options.map(o => (
                          <button key={o.id} onClick={() => handleEquip(slot, o.id)} className="w-full text-left px-2 py-1 rounded text-sm bg-gray-50 border">{o.name} ×{o.qty}</button>
                        ))}
                        <button onClick={() => setOpenSlot(null)} className="w-full px-2 py-1 rounded text-sm bg-white border">Cancel</button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="mt-3 text-sm text-gray-600">
              {sumToLines(equipmentBonuses).map((ln,i) => <div key={i}>{ln}</div>)}
            </div>
          </div>

          {/* Inventory (compact) */}
          <div>
            <div className="font-medium mb-2">Inventory</div>
            {inventoryList.length === 0 ? <div className="text-sm text-gray-500">No items.</div> : (
              <div className="flex gap-2 flex-wrap">
                {inventoryList.map(it => (
                  <div key={it.id} className="px-3 py-1 rounded-full border bg-white text-sm">
                    <span className="font-medium">{labelize(it.id)}</span>
                    <span className="text-gray-500 ml-2">×{it.qty}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------------- Helpers ---------------- */
function sumToLines(totals) {
  const lines = [];
  if (!totals) return lines;
  if (totals.atk) lines.push(`+${totals.atk} ATK`);
  if (totals.def) lines.push(`+${totals.def} DEF`);
  if (totals.mAtk) lines.push(`+${totals.mAtk} M-ATK`);
  if (totals.mDef) lines.push(`+${totals.mDef} M-DEF`);
  if (totals.maxHP) lines.push(`+${totals.maxHP} Max HP`);
  if (totals.maxMP) lines.push(`+${totals.maxMP} Max MP`);
  for (const k of Object.keys(totals.stats || {})) lines.push(`+${totals.stats[k]} ${k}`);
  return lines;
}
function expNeededFor(level) {
  return Math.ceil(100 * Math.pow(1.2, Math.max(0, level - 1)));
}
function clamp01(n) {
  return Math.max(0, Math.min(1, n));
}
function labelize(id) {
  return String(id).replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
