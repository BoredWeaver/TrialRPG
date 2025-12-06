// src/state/equipment.js
import { loadProgress, saveProgress } from "./playerProgress.js";
import itemsCatalog from "../db/items.json";

/**
 * Equip an item from inventory into a slot.
 * - slot: "head"|"torso"|"boots"|"weapon"|"offhand"|"accessory"
 * - itemId: id string of item to equip
 *
 * Returns { success, reason?, progress? }
 */
export function equipItem(slot, itemId) {
  if (!slot || !itemId) return { success: false, reason: "bad-args" };

  const spec = itemsCatalog[itemId];
  if (!spec) return { success: false, reason: "unknown-item" };
  if (spec.kind !== "equipment") return { success: false, reason: "not-equipment" };
  // allow default slot fallback: treat missing spec.slot as "accessory"
  const requiredSlot = spec.slot || "accessory";
  if (requiredSlot !== slot) return { success: false, reason: "wrong-slot" };

  const progress = loadProgress() || {};
  const inv = { ...(progress.inventory || {}) };
  const have = Number(inv[itemId] || 0);

  // if the item is already equipped in the same slot, treat as no-op
  const currentEquipped = (progress.equipped || {})[slot] || null;
  if (currentEquipped === itemId) {
    return { success: true, progress };
  }

  if (have <= 0) return { success: false, reason: "not-in-inventory" };

  // Build next inventory: consume one of the item being equipped
  const nextInventory = { ...inv };
  nextInventory[itemId] = have - 1;
  if (nextInventory[itemId] <= 0) delete nextInventory[itemId];

  // If there was a previously equipped item, return it to inventory
  const equipped = { ...(progress.equipped || {}) };
  const prev = equipped[slot] || null;
  if (prev) {
    nextInventory[prev] = (Number(nextInventory[prev]) || 0) + 1;
  }

  // Build next equipped mapping (explicitly set value)
  const nextEquipped = { ...equipped, [slot]: itemId };

  try {
    // saveProgress is expected to accept full objects for inventory/equipped so we pass full maps
    const merged = saveProgress({ inventory: nextInventory, equipped: nextEquipped });
    if (!merged) return { success: false, reason: "save-failed" };
    return { success: true, progress: merged };
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("equipItem: saveProgress error", e);
    return { success: false, reason: "save-exception" };
  }
}

/**
 * Unequip from slot (move it back to inventory)
 * Returns { success, reason?, progress? }
 */
export function unequipItem(slot) {
  if (!slot) return { success: false, reason: "bad-args" };

  const progress = loadProgress() || {};
  const equipped = { ...(progress.equipped || {}) };
  const cur = equipped[slot] || null;
  if (!cur) return { success: false, reason: "nothing-equipped" };

  // Add item back to inventory
  const inv = { ...(progress.inventory || {}) };
  inv[cur] = (Number(inv[cur]) || 0) + 1;

  // IMPORTANT: explicitly set slot to null rather than deleting the key.
  // Some save/merge implementations ignore deleted keys; setting to null ensures
  // the persisted shape reflects "no item in this slot".
  const nextEquipped = { ...equipped, [slot]: null };

  try {
    const merged = saveProgress({ inventory: inv, equipped: nextEquipped });
    if (!merged) return { success: false, reason: "save-failed" };
    return { success: true, progress: merged };
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("unequipItem: saveProgress error", e);
    return { success: false, reason: "save-exception" };
  }
}
