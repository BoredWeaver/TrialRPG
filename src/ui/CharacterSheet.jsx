// src/ui/CharacterSheet.jsx
// Dark-fantasy style, mobile-first fullscreen, collapsible panels.
// All logic preserved exactly.

import React, { useMemo, useState, useEffect } from "react";
import usePlayerProgress from "../state/usePlayerProgress.js";
import { equipItem, unequipItem } from "../state/equipment.js";
import { commitChosenSpell } from "../state/progression.js";
import itemsCatalog from "../db/items.json";

export default function CharacterSheet({ player: propPlayer, onClose, onAllocate }) {
  const { progress } = usePlayerProgress();

  /* ---------------- Build display player (unchanged logic) ---------------- */
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
      spells: Array.isArray(live.spells)
        ? [...live.spells]
        : Array.isArray(base.spells)
        ? [...base.spells]
        : [],
      gold: Number(live.gold ?? base.gold ?? 0),
      equipped: { ...(base.equipped || {}), ...(live.equipped || {}) },
      hp: base.hp ?? live.hp,
      mp: base.mp ?? live.mp,
      pendingSpellChoices: Array.isArray(live.pendingSpellChoices)
        ? live.pendingSpellChoices.slice()
        : Array.isArray(base.pendingSpellChoices)
        ? base.pendingSpellChoices.slice()
        : [],
    };
  }, [propPlayer, progress]);

  const player = displayPlayer;

  /* ---------------- Derived combat calculations (unchanged) ---------------- */
  function deriveCombatFromStats(stats = {}, level = 1) {
    const STR = Number(stats.STR) || 0;
    const DEX = Number(stats.DEX) || 0;
    const MAG = Number(stats.MAG) || 0;
    const CON = Number(stats.CON) || 0;

    return {
      atk: 2 + STR * 2 + Math.floor(level / 2),
      def: 1 + Math.floor((CON + DEX) / 2),
      maxHP: 20 + CON * 8 + level * 2,
      maxMP: 5 + MAG * 5 + Math.floor(level / 2),
      mAtk: 2 + MAG * 2 + Math.floor(level / 2),
      mDef: 1 + Math.floor((MAG + CON) / 2),
    };
  }

  function applyEquipmentToStats(base, eq) {
    const out = { ...base };
    for (const slot of Object.keys(eq || {})) {
      const spec = itemsCatalog[eq[slot]];
      if (!spec || spec.kind !== "equipment") continue;
      const add = spec?.bonus?.stats || {};
      for (const k of Object.keys(add)) out[k] = (out[k] || 0) + Number(add[k] || 0);
    }
    return out;
  }

  function applyEquipmentToDerived(base, eq) {
    const out = { ...base };
    for (const slot of Object.keys(eq || {})) {
      const b = itemsCatalog[eq[slot]]?.bonus || {};
      for (const k of ["atk", "def", "mAtk", "mDef", "maxHP", "maxMP"]) {
        if (Number.isFinite(Number(b[k]))) out[k] += Number(b[k]);
      }
    }
    return out;
  }

  const level = player.level || 1;
  const statsBase = { STR: 3, DEX: 3, MAG: 3, CON: 3, ...(player.stats || {}) };
  const stats = applyEquipmentToStats(statsBase, player.equipped);
  const derived = applyEquipmentToDerived(deriveCombatFromStats(stats, level), player.equipped);

  const curHP = Number.isFinite(player.hp) ? Number(player.hp) : derived.maxHP;
  const curMP = Number.isFinite(player.mp) ? Number(player.mp) : derived.maxMP;

  const inventoryList = Object.entries(player.inventory || {})
    .filter(([, qty]) => qty > 0)
    .map(([id, qty]) => ({ id, qty }));

  const canSpend = player.unspentPoints > 0 && typeof onAllocate === "function";

  /* ---------------- Equipment helpers ---------------- */
  const slots = ["head", "torso", "boots", "weapon", "offhand", "accessory"];

  const equipableBySlot = useMemo(() => {
    const out = {};
    for (const it of inventoryList) {
      const spec = itemsCatalog[it.id];
      if (!spec || spec.kind !== "equipment") continue;
      const slot = spec.slot || "accessory";
      (out[slot] = out[slot] || []).push({ id: it.id, name: spec.name, qty: it.qty });
    }
    return out;
  }, [inventoryList]);

  const [openSlot, setOpenSlot] = useState(null);

  async function handleEquip(slot, id) {
    const res = await equipItem(slot, id);
    if (!res?.success) return alert("Equip failed");
    setOpenSlot(null);
  }

  async function handleUnequip(slot) {
    const res = await unequipItem(slot);
    if (!res?.success) return alert("Unequip failed");
  }

  async function handleChooseSpell(lv, sp) {
    try {
      await commitChosenSpell(lv, sp);
    } catch {
      alert("Failed to learn spell");
    }
  }

  const needExp = expNeededFor(level);
  const expPct = clamp01(player.exp / needExp);

  /* ---------------- Collapsible (reset every open) ---------------- */
  const [isEquipOpen, setEquipOpen] = useState(true);
  const [isInvOpen, setInvOpen] = useState(true);

  useEffect(() => {
    setEquipOpen(true);
    setInvOpen(true);
  }, []);

  /* ---------------- UI ---------------- */
  return (
    <div className="fixed inset-0 z-50">
      {/* overlay */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* modal */}
      <div
        className="
          absolute inset-x-0 bottom-0 
          md:inset-auto md:top-1/2 md:left-1/2 md:-translate-x-1/2 md:-translate-y-1/2
          w-full md:w-[600px] max-h-[90vh]
          bg-[#0c0f17] text-gray-200 border border-[#1c232c]
          rounded-t-xl md:rounded-xl
          shadow-2xl overflow-y-auto
        "
      >
        {/* Header */}
        <div className="p-4 border-b border-[#1a1f27] flex items-center justify-between">
          <div>
            <div className="text-xl font-bold">{player.name}</div>
            <div className="text-sm text-gray-400">Level {level}</div>
          </div>

          <div className="flex items-center gap-3">
            <div className="text-sm text-gray-300">{player.gold} ✦</div>
            <button className="px-3 py-1 rounded bg-[#1a1f27] border border-[#252b36]" onClick={onClose}>
              Close
            </button>
          </div>
        </div>

        <div className="p-4 space-y-6">

          {/* EXP BAR */}
          <div>
            <div className="flex justify-between text-sm mb-1">
              <span className="font-medium">EXP</span>
              <span className="text-gray-400">{player.exp}/{needExp} ({Math.round(expPct * 100)}%)</span>
            </div>

            <div className="w-full h-2 bg-[#1b1f27] rounded-full">
              <div
                className="h-full bg-gradient-to-r from-indigo-400 to-fuchsia-500 rounded-full"
                style={{ width: `${expPct * 100}%` }}
              />
            </div>
          </div>

          {/* SPELL CHOICE */}
          {player.pendingSpellChoices?.length > 0 && (
            <div className="p-3 rounded-lg border border-blue-900 bg-blue-900/20">
              <div className="font-semibold mb-2 text-blue-200">Choose a Spell</div>
              {player.pendingSpellChoices.map((choice, idx) => (
                <div key={idx} className="mb-2">
                  <div className="text-sm mb-1">Level {choice.level} Reward</div>
                  <div className="flex gap-2 flex-wrap">
                    {choice.options.map((sp) => (
                      <button
                        key={sp}
                        onClick={() => handleChooseSpell(choice.level, sp)}
                        className="px-3 py-1 rounded bg-[#10141c] border border-[#1a2330]"
                      >
                        {labelize(sp)}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ATTRIBUTES */}
          <section>
            <div className="flex justify-between mb-1">
              <span className="font-semibold">Attributes</span>
              <span className="text-sm text-gray-400">Unspent: {player.unspentPoints}</span>
            </div>

            <div className="flex flex-wrap gap-4 text-sm">
              {["STR","DEX","MAG","CON"].map((k) => (
                <div key={k}>
                  {k}: <strong>{stats[k]}</strong>
                </div>
              ))}
            </div>

            <div className="flex gap-2 mt-2">
              {["STR","DEX","MAG","CON"].map((k) => (
                <button
                  key={k}
                  disabled={!canSpend}
                  onClick={() => onAllocate(k)}
                  className={`px-2 py-1 rounded text-sm ${
                    canSpend
                      ? "bg-green-700 hover:bg-green-600"
                      : "bg-[#1a1f27] text-gray-500 cursor-not-allowed"
                  }`}
                >
                  + {k}
                </button>
              ))}
            </div>
          </section>

          {/* COMBAT */}
          <section>
            <div className="font-semibold mb-1">Combat</div>

            <div className="flex flex-wrap gap-4 text-sm">
              <div>ATK: <strong>{derived.atk}</strong></div>
              <div>DEF: <strong>{derived.def}</strong></div>
              <div>M-ATK: <strong>{derived.mAtk}</strong></div>
              <div>M-DEF: <strong>{derived.mDef}</strong></div>
              <div>HP: <strong>{curHP}/{derived.maxHP}</strong></div>
              <div>MP: <strong>{curMP}/{derived.maxMP}</strong></div>
            </div>
          </section>

          {/* EQUIPMENT (COLLAPSIBLE) */}
          <section>
            <button
              onClick={() => setEquipOpen(!isEquipOpen)}
              className="flex justify-between w-full px-2 py-2 bg-[#10141c] border border-[#1c232c] rounded text-left"
            >
              <span className="font-semibold">Equipment</span>
              <span className="text-gray-400">{isEquipOpen ? "−" : "+"}</span>
            </button>

            {isEquipOpen && (
              <div className="mt-2 space-y-3">
                {slots.map((slot) => {
                  const eqId = player.equipped?.[slot];
                  const spec = eqId ? itemsCatalog[eqId] : null;
                  const options = equipableBySlot[slot] || [];

                  return (
                    <div key={slot} className="p-2 rounded border bg-[#0d1118] border-[#1c232c] text-sm">
                      <div className="text-xs text-gray-400">{slot.toUpperCase()}</div>
                      <div className="font-medium mt-1">{spec?.name ?? "— Empty —"}</div>

                      <div className="mt-2 flex gap-2">
                        {!spec ? (
                          <button
                            disabled={!options.length}
                            onClick={() => setOpenSlot(openSlot === slot ? null : slot)}
                            className={`px-2 py-1 rounded border ${
                              options.length
                                ? "border-[#2c3544] bg-[#10141c]"
                                : "bg-[#1a1f27] text-gray-500 cursor-not-allowed"
                            }`}
                          >
                            Equip
                          </button>
                        ) : (
                          <button
                            onClick={() => handleUnequip(slot)}
                            className="px-2 py-1 rounded border border-[#2c3544] bg-[#10141c]"
                          >
                            Unequip
                          </button>
                        )}
                      </div>

                      {openSlot === slot && options.length > 0 && (
                        <div className="mt-2 space-y-1">
                          {options.map((o) => (
                            <button
                              key={o.id}
                              onClick={() => handleEquip(slot, o.id)}
                              className="w-full px-2 py-1 rounded border border-[#2c3544] bg-[#10141c] text-left"
                            >
                              {o.name} ×{o.qty}
                            </button>
                          ))}
                          <button
                            onClick={() => setOpenSlot(null)}
                            className="w-full px-2 py-1 rounded border border-[#2c3544] bg-[#10141c]"
                          >
                            Cancel
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* INVENTORY (COLLAPSIBLE) */}
          <section>
            <button
              onClick={() => setInvOpen(!isInvOpen)}
              className="flex justify-between w-full px-2 py-2 bg-[#10141c] border border-[#1c232c] rounded text-left"
            >
              <span className="font-semibold">Inventory</span>
              <span className="text-gray-400">{isInvOpen ? "−" : "+"}</span>
            </button>

            {isInvOpen && (
              <div className="mt-2 flex flex-wrap gap-2">
                {inventoryList.length === 0 ? (
                  <div className="text-sm text-gray-500">No items.</div>
                ) : (
                  inventoryList.map((it) => (
                    <div
                      key={it.id}
                      className="px-3 py-1 rounded-full border border-[#2c3544] bg-[#0d1118] text-sm"
                    >
                      {labelize(it.id)} <span className="text-gray-400">×{it.qty}</span>
                    </div>
                  ))
                )}
              </div>
            )}
          </section>

          {/* SPELL LIST */}
          <section>
            <div className="font-semibold mb-1">Spells</div>
            {player.spells.length === 0 ? (
              <div className="text-sm text-gray-500">No spells learned.</div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {player.spells.map((s, i) => (
                  <div
                    key={i}
                    className="px-3 py-1 rounded-full border border-[#2c3544] bg-[#0d1118] text-sm"
                  >
                    {labelize(s)}
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

/* ---------------- Helpers ---------------- */
function expNeededFor(level) {
  return Math.ceil(100 * Math.pow(1.2, level - 1));
}
const clamp01 = (n) => Math.max(0, Math.min(1, n));
function labelize(id) {
  return String(id)
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
