// src/state/shop.js
// Simple shop/trade helpers. Works with playerProgress's saved shape.
// Adds persistent shop-stock overrides (localStorage) so per-shop qty is decremented
// when buying and incremented when selling back.

import SHOPS from "../db/shops.json";
import { loadProgress, saveProgress } from "./playerProgress.js";
import itemsCatalog from "../db/items.json";
import { gameEvents } from "./gameEvents.js";

const SHOP_STORAGE_KEY = "rpg.shops.stock.v1";

/* -----------------------
   Minimal localStorage helpers
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
    return { ...parsed };
  } catch (err) {
    console.error("[shop] loadShopOverrides parse failed", err);
    return {};
  }
}

function saveShopOverrides(obj) {
  if (!storageAvailable()) {
    console.warn("[shop] localStorage unavailable; cannot persist shop overrides");
    return false;
  }
  try {
    const clean = {};
    for (const k of Object.keys(obj || {})) {
      const v = obj[k];
      clean[k] = typeof v === "object" ? { ...v } : v;
    }
    window.localStorage.setItem(SHOP_STORAGE_KEY, JSON.stringify(clean));
    return true;
  } catch (err) {
    console.error("[shop] saveShopOverrides failed", err);
    return false;
  }
}

/* ===========================================================
   Helpers
   =========================================================== */

export function getShop(shopId = "default") {
  return SHOPS[shopId] || null;
}

function defaultShopQty(shop, itemId) {
  const spec = shop?.stock?.[itemId];
  if (!spec) return undefined;
  const q = Number(spec.qty);
  return Number.isFinite(q) ? q : undefined;
}

function getMergedItemStock(shopId, itemId) {
  const shop = getShop(shopId);
  if (!shop) return Infinity;

  const overrides = loadShopOverrides();
  const shopOverrides = overrides?.[shopId] || {};

  const defaultQty = defaultShopQty(shop, itemId);

  if (Object.prototype.hasOwnProperty.call(shopOverrides, itemId)) {
    const o = Number(shopOverrides[itemId]);
    if (Number.isFinite(o)) return o;
  }

  return Number.isFinite(defaultQty) ? defaultQty : Infinity;
}

/* ===========================================================
   Public API
   =========================================================== */

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
      inStock: Number.isFinite(merged) ? merged : Infinity,
      defaultQty: Number.isFinite(defaultQ) ? defaultQ : Infinity,
    });
  }
  return out;
}

function persistProgressAndReload(partial) {
  try {
    const saved = saveProgress(partial);
    if (!saved) return null;
    const latest = loadProgress();
    return latest || saved || null;
  } catch (e) {
    console.error("[shop] persistProgressAndReload failed", e);
    return null;
  }
}

/* ===========================================================
   BUY ITEM
   =========================================================== */

export function buyFromShop(shopId = "default", itemId, qty = 1) {
  qty = Math.max(1, Math.floor(Number(qty) || 1));

  const shop = getShop(shopId);
  if (!shop) {
    gameEvents.emit("toast", { message: "Invalid shop.", type: "error" });
    return { success: false, reason: "bad-shop" };
  }

  const stockSpec = shop.stock?.[itemId];
  if (!stockSpec) {
    gameEvents.emit("toast", { message: "Item cannot be bought here.", type: "error" });
    return { success: false, reason: "not-for-sale" };
  }

  const itemMeta = itemsCatalog[itemId];
  if (!itemMeta) {
    gameEvents.emit("toast", { message: "Unknown item.", type: "error" });
    return { success: false, reason: "unknown-item" };
  }

  const price = Number(stockSpec.price);
  if (!Number.isFinite(price) || price < 0) {
    gameEvents.emit("toast", { message: "Invalid price.", type: "error" });
    return { success: false, reason: "bad-price" };
  }

  const total = price * qty;

  const progress = loadProgress() || {};
  const gold = Number(progress.gold) || 0;
  if (gold < total) {
    gameEvents.emit("toast", { message: "Not enough gold.", type: "error" });
    return { success: false, reason: "insufficient-gold" };
  }

  const shopQty = getMergedItemStock(shopId, itemId);
  if (Number.isFinite(shopQty) && shopQty < qty) {
    gameEvents.emit("toast", { message: "Item is out of stock.", type: "error" });
    return { success: false, reason: "shop-no-stock" };
  }

  const existingInv = { ...(progress.inventory || {}) };
  const have = Number(existingInv[itemId]) || 0;
  const newInv = { ...existingInv, [itemId]: have + qty };

  const newGold = gold - total;

  const persisted = persistProgressAndReload({
    gold: newGold,
    inventory: newInv,
    items: newInv,
  });

  if (!persisted) {
    gameEvents.emit("toast", { message: "Failed to update inventory.", type: "error" });
    return { success: false, reason: "save-failed" };
  }

  const defaultQty = defaultShopQty(shop, itemId);
  if (Number.isFinite(defaultQty)) {
    const overrides = loadShopOverrides();
    const next = { ...(overrides || {}) };
    const shopOverrides = { ...(next[shopId] || {}) };

    const current = Number.isFinite(Number(shopOverrides[itemId])) ? shopOverrides[itemId] : defaultQty;
    const updated = Math.max(0, current - qty);

    if (updated === defaultQty) {
      delete shopOverrides[itemId];
    } else {
      shopOverrides[itemId] = updated;
    }

    if (Object.keys(shopOverrides).length > 0) next[shopId] = shopOverrides;
    else delete next[shopId];

    saveShopOverrides(next);
  }

  gameEvents.emit("toast", {
    message: `Bought ${qty}× ${itemMeta?.name || itemId}`,
    type: "success",
  });

  return { success: true, progress: persisted };
}

/* ===========================================================
   SELL ITEM
   =========================================================== */

export function sellToShop(shopId = "default", itemId, qty = 1) {
  qty = Math.max(1, Math.floor(Number(qty) || 1));

  const shop = getShop(shopId);
  if (!shop) {
    gameEvents.emit("toast", { message: "Invalid shop.", type: "error" });
    return { success: false, reason: "bad-shop" };
  }

  let stockSpec = shop.stock?.[itemId];
  const itemMeta = itemsCatalog[itemId];

  if (!itemMeta) {
    gameEvents.emit("toast", { message: "Unknown item.", type: "error" });
    return { success: false, reason: "unknown-item" };
  }

  if (!stockSpec) {
    const fallbackPrice = Number(itemMeta.price);
    if (shop.buyAll === true && Number.isFinite(fallbackPrice)) {
      stockSpec = { price: fallbackPrice };
    } else {
      gameEvents.emit("toast", { message: "Shop won't buy this item.", type: "error" });
      return { success: false, reason: "does-not-buy" };
    }
  }

  if (itemMeta.untradable === true || itemMeta.tradable === false) {
    gameEvents.emit("toast", { message: "This item cannot be sold.", type: "error" });
    return { success: false, reason: "untradable" };
  }

  const progress = loadProgress() || {};
  const have = Number(progress.inventory?.[itemId]) || 0;
  if (have < qty) {
    gameEvents.emit("toast", { message: "You don't have enough items.", type: "error" });
    return { success: false, reason: "not-enough-items" };
  }

  const buyPrice = Number(stockSpec.price);
  if (!Number.isFinite(buyPrice) || buyPrice <= 0) {
    gameEvents.emit("toast", { message: "Invalid item price.", type: "error" });
    return { success: false, reason: "bad-price" };
  }

  const sellMultiplier = Number(shop.sellMultiplier) || 0.5;
  const gained = Math.floor(buyPrice * sellMultiplier * qty);

  const newGold = (progress.gold || 0) + gained;
  const newCount = have - qty;
  const newInv = { ...(progress.inventory || {}) };

  if (newCount > 0) newInv[itemId] = newCount;
  else delete newInv[itemId];

  const persisted = persistProgressAndReload({
    gold: newGold,
    inventory: newInv,
    items: newInv,
  });

  if (!persisted) {
    gameEvents.emit("toast", { message: "Failed to save sale.", type: "error" });
    return { success: false, reason: "save-failed" };
  }

  const defaultQty = defaultShopQty(shop, itemId);
  if (Number.isFinite(defaultQty)) {
    const overrides = loadShopOverrides();
    const next = { ...(overrides || {}) };
    const shopOverrides = { ...(next[shopId] || {}) };

    const current = Number.isFinite(Number(shopOverrides[itemId])) ? shopOverrides[itemId] : defaultQty;
    const updated = current + qty;

    if (updated === defaultQty) {
      delete shopOverrides[itemId];
    } else {
      shopOverrides[itemId] = updated;
    }

    if (Object.keys(shopOverrides).length > 0) next[shopId] = shopOverrides;
    else delete next[shopId];

    saveShopOverrides(next);
  }

  gameEvents.emit("toast", {
    message: `Sold ${qty}× ${itemMeta?.name || itemId} (+${gained}g)`,
    type: "success",
  });

  return { success: true, progress: persisted, goldGained: gained };
}
