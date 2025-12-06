// src/state/shop.js
// Simple shop/trade helpers. Works with playerProgress's saved shape.
// Adds persistent shop-stock overrides (localStorage) so per-shop qty is decremented
// when buying and incremented when selling back.

import SHOPS from "../db/shops.json";
import { loadProgress, saveProgress } from "./playerProgress.js";
import itemsCatalog from "../db/items.json";

const SHOP_STORAGE_KEY = "rpg.shops.stock.v1";

/* -----------------------
   Minimal localStorage helpers (robust)
   ----------------------- */
function storageAvailable() {
  try {
    const k = "__rpg_test__";
    window.localStorage.setItem(k, "1");
    window.localStorage.removeItem(k);
    return true;
  } catch (_) {
    return false;
  }
}

function loadShopOverrides() {
  if (!storageAvailable()) return {};
  try {
    const raw = window.localStorage.getItem(SHOP_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return {};
    // Return a shallow copy to avoid accidental mutation of stored object
    return { ...parsed };
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[shop] loadShopOverrides parse failed", err);
    return {};
  }
}

function saveShopOverrides(obj) {
  if (!storageAvailable()) {
    // eslint-disable-next-line no-console
    console.warn("[shop] localStorage unavailable; cannot persist shop overrides");
    return false;
  }
  try {
    // Ensure we write a plain object (avoid storing prototype weirdness)
    const cleanObj = {};
    if (obj && typeof obj === "object") {
      // Copy only own enumerable properties and ensure nested objects are plain
      for (const k of Object.keys(obj)) {
        const v = obj[k];
        if (v && typeof v === "object") {
          cleanObj[k] = { ...v };
        } else if (typeof v !== "undefined") {
          cleanObj[k] = v;
        }
      }
    }
    window.localStorage.setItem(SHOP_STORAGE_KEY, JSON.stringify(cleanObj));
    return true;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[shop] saveShopOverrides failed", err);
    return false;
  }
}

/* ===========================================================
   Helpers
   =========================================================== */

/**
 * Get shop descriptor by id, or null.
 */
export function getShop(shopId = "default") {
  return SHOPS[shopId] || null;
}

/**
 * Internal: return default qty (may be undefined -> infinite) for an item in a shop
 */
function defaultShopQty(shop, itemId) {
  const spec = shop && shop.stock && shop.stock[itemId];
  if (!spec) return undefined;
  const q = spec.qty;
  return Number.isFinite(Number(q)) ? Number(q) : undefined;
}

/**
 * Get merged stock qty taking into account persisted overrides.
 * Returns Infinity when unlimited.
 */
function getMergedItemStock(shopId, itemId) {
  const shop = getShop(shopId);
  if (!shop) return Infinity;
  const overrides = loadShopOverrides();
  const shopOverrides = overrides && overrides[shopId] ? overrides[shopId] : {};
  const defaultQty = defaultShopQty(shop, itemId);

  if (Object.prototype.hasOwnProperty.call(shopOverrides, itemId)) {
    const overridden = shopOverrides[itemId];
    if (Number.isFinite(Number(overridden))) return Number(overridden);
  }

  return Number.isFinite(defaultQty) ? defaultQty : Infinity;
}

/* ===========================================================
   Public API
   =========================================================== */

/**
 * View what the player can buy from a shop.
 * Returns array: { id, name, price, inStock, defaultQty }
 */
export function getShopStock(shopId = "default") {
  const shop = getShop(shopId);
  if (!shop) return [];
  const out = [];
  for (const [id, spec] of Object.entries(shop.stock || {})) {
    const meta = itemsCatalog[id] || { id, name: id };
    const defaultQ = Number(spec.qty);
    const merged = getMergedItemStock(shopId, id);
    out.push({
      id,
      name: meta.name || id,
      price: Number(spec.price) || 0,
      // expose Infinity for unlimited stock
      inStock: Number.isFinite(merged) ? merged : Infinity,
      // helpful metadata (does not affect behavior)
      defaultQty: Number.isFinite(defaultQ) ? defaultQ : Infinity,
    });
  }
  return out;
}

/* ===========================================================
   Internal utility to persist progress and ensure canonical reload
   Returns the canonical persisted object or null on failure
   =========================================================== */
function persistProgressAndReload(partial) {
  try {
    const saved = saveProgress(partial);
    if (!saved) {
      // eslint-disable-next-line no-console
      console.error("[shop] saveProgress returned falsy", { partial });
      return null;
    }
    // reload canonical persisted object
    const latest = loadProgress();
    // If loadProgress returns null (shouldn't) fall back to saved
    return latest || saved || null;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[shop] persistProgressAndReload failed", err, { partial });
    return null;
  }
}

/**
 * Buy itemId qty times from shopId.
 * - Checks player gold
 * - Decrements gold, increments inventory, persists progress
 * - Decrements shop stock (persisted) if finite
 * Returns { success: boolean, reason?: string, progress?: {...} }
 */
export function buyFromShop(shopId = "default", itemId, qty = 1) {
  // Normalize quantity
  qty = Math.max(1, Math.floor(Number(qty) || 1));

  const shop = getShop(shopId);
  if (!shop) return { success: false, reason: "bad-shop" };

  const stockSpec = shop.stock?.[itemId];
  if (!stockSpec) return { success: false, reason: "not-for-sale" };

  // Validate item exists in catalog
  const itemMeta = itemsCatalog[itemId];
  if (!itemMeta) return { success: false, reason: "unknown-item" };

  const price = Number(stockSpec.price);
  if (!Number.isFinite(price) || price < 0) return { success: false, reason: "bad-price" };

  const total = price * qty;

  const progress = loadProgress() || {};
  const gold = Number(progress.gold) || 0;
  if (gold < total) return { success: false, reason: "insufficient-gold" };

  // stock qty check (infinite if missing)
  const shopQty = getMergedItemStock(shopId, itemId);
  if (Number.isFinite(shopQty) && shopQty < qty) return { success: false, reason: "shop-no-stock" };

  // Compute new inventory count using a full inventory object (keeps saved shape clean)
  const existingInv = { ...(progress.inventory || {}) };
  const have = Number(existingInv[itemId]) || 0;
  const newCount = have + qty;
  const newInv = { ...existingInv };
  newInv[itemId] = newCount;

  // If newCount is zero (shouldn't happen for buy), remove key defensively
  if (newInv[itemId] <= 0) delete newInv[itemId];

  const newGold = gold - total;

  // Debug before save
  // eslint-disable-next-line no-console
  console.debug("[shop.buy] attempt", { shopId, itemId, qty, price, total, goldBefore: gold, haveBefore: have, newCount, newGold });

  // Persist full inventory object to both 'inventory' and legacy 'items' for compatibility
  const persisted = persistProgressAndReload({
    gold: newGold,
    inventory: newInv,
    items: newInv,
  });

  if (!persisted) {
    return { success: false, reason: "save-failed" };
  }

  // Decrement shop stock (persisted) if finite
  const defaultQty = defaultShopQty(shop, itemId);
  if (Number.isFinite(defaultQty)) {
    const overrides = loadShopOverrides();
    // clone to avoid mutating loaded object
    const overridesCopy = { ...(overrides || {}) };
    const shopOverrides = { ...(overridesCopy[shopId] || {}) };

    const current = Number.isFinite(Number(shopOverrides[itemId])) ? Number(shopOverrides[itemId]) : defaultQty;
    const updated = Math.max(0, current - qty);

    // Debug overrides change
    // eslint-disable-next-line no-console
    console.debug("[shop.buy] shopOverrides before", { shopId, current, defaultQty, updated });

    if (updated === defaultQty) {
      // remove override if it equals default
      if (Object.prototype.hasOwnProperty.call(shopOverrides, itemId)) {
        delete shopOverrides[itemId];
      }
    } else {
      shopOverrides[itemId] = updated;
    }

    // set or remove shop entry
    if (Object.keys(shopOverrides).length > 0) {
      overridesCopy[shopId] = shopOverrides;
    } else {
      delete overridesCopy[shopId];
    }

    const savedOk = saveShopOverrides(overridesCopy);
    if (!savedOk) {
      // eslint-disable-next-line no-console
      console.error("[shop.buy] failed to persist shop overrides", { overridesCopy });
    } else {
      // eslint-disable-next-line no-console
      console.debug("[shop.buy] shopOverrides saved", { overridesCopy });
    }
  }

  return { success: true, progress: persisted };
}

/**
 * Sell itemId qty to shopId (shop buys at sellMultiplier * price).
 * - If the shop explicitly lists the item in its stock, use that price/behavior.
 * - Otherwise: if the shop has `buyAll: true` or the item catalog provides a price,
 *   accept the sale using the catalog price as fallback.
 * - Disallow selling untradable items (itemMeta.untradable === true or itemMeta.tradable === false)
 * Returns { success, reason, progress, goldGained }
 */
export function sellToShop(shopId = "default", itemId, qty = 1) {
  qty = Math.max(1, Math.floor(Number(qty) || 1));

  const shop = getShop(shopId);
  if (!shop) return { success: false, reason: "bad-shop" };

  // Look up stock entry if present
  let stockSpec = shop.stock?.[itemId];

  // Validate item exists in catalog
  const itemMeta = itemsCatalog[itemId];
  if (!itemMeta) return { success: false, reason: "unknown-item" };

  // If shop doesn't list the item, decide whether to accept it:
  if (!stockSpec) {
    const fallbackPrice = Number.isFinite(Number(itemMeta.price)) ? Number(itemMeta.price) : undefined;
    if (shop.buyAll === true && typeof fallbackPrice !== "undefined") {
      stockSpec = { price: fallbackPrice };
    } else {
      return { success: false, reason: "does-not-buy" };
    }
  }

  // Respect untradable flag
  if (itemMeta.untradable === true || (Object.prototype.hasOwnProperty.call(itemMeta, "tradable") && !itemMeta.tradable)) {
    return { success: false, reason: "untradable" };
  }

  const progress = loadProgress() || {};
  const have = Number((progress.inventory || {})[itemId]) || 0;
  if (have < qty) return { success: false, reason: "not-enough-items" };

  const buyPrice = Number(stockSpec.price);
  if (!Number.isFinite(buyPrice) || buyPrice <= 0) return { success: false, reason: "bad-price" };

  const sellMultiplier = Number.isFinite(Number(shop.sellMultiplier)) ? Number(shop.sellMultiplier) : 0.5;
  const gained = Math.floor(buyPrice * sellMultiplier * qty);

  const newGold = (Number(progress.gold) || 0) + gained;
  const newCount = have - qty;

  // Build a full inventory object for saveProgress so saved object stays clean
  const newInv = { ...(progress.inventory || {}) };
  if (newCount > 0) {
    newInv[itemId] = newCount;
  } else {
    if (Object.prototype.hasOwnProperty.call(newInv, itemId)) {
      delete newInv[itemId];
    }
  }

  // Debug before save
  // eslint-disable-next-line no-console
  console.debug("[shop.sell] attempt", { shopId, itemId, qty, buyPrice, gained, haveBefore: have, newCount, newGold });

  const persisted = persistProgressAndReload({
    gold: newGold,
    inventory: newInv,
    items: newInv,
  });

  if (!persisted) {
    return { success: false, reason: "save-failed" };
  }

  // If the shop had a finite defaultQty defined for this item, increase persisted shop stock.
  const defaultQty = defaultShopQty(shop, itemId);
  if (Number.isFinite(defaultQty)) {
    const overrides = loadShopOverrides();
    const overridesCopy = { ...(overrides || {}) };
    const shopOverrides = { ...(overridesCopy[shopId] || {}) };

    const current = Number.isFinite(Number(shopOverrides[itemId])) ? Number(shopOverrides[itemId]) : defaultQty;
    const updated = current + qty;

    // Debug
    // eslint-disable-next-line no-console
    console.debug("[shop.sell] shopOverrides before", { shopId, current, defaultQty, updated });

    if (updated === defaultQty) {
      if (Object.prototype.hasOwnProperty.call(shopOverrides, itemId)) {
        delete shopOverrides[itemId];
      }
    } else {
      shopOverrides[itemId] = updated;
    }

    if (Object.keys(shopOverrides).length > 0) {
      overridesCopy[shopId] = shopOverrides;
    } else {
      delete overridesCopy[shopId];
    }

    const savedOk = saveShopOverrides(overridesCopy);
    if (!savedOk) {
      // eslint-disable-next-line no-console
      console.error("[shop.sell] failed to persist shop overrides", { overridesCopy });
    } else {
      // eslint-disable-next-line no-console
      console.debug("[shop.sell] shopOverrides saved", { overridesCopy });
    }
  }

  return { success: true, progress: persisted, goldGained: gained };
}
