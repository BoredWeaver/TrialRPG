// src/ui/Shop.jsx
import React, { useMemo, useRef, useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import usePlayerProgress from "../state/usePlayerProgress.js";
import { getLocationsForRegion, getCityForRegion } from "../state/locations.js";
import { getShopStock, buyFromShop, sellToShop, getShop } from "../state/shop.js";
import itemsCatalog from "../db/items.json";

/**
 * Shop — presentation-only rewrite
 * - Dark fantasy theme to match City/CharacterSheet
 * - Mobile-first responsive layout (1 col -> 2 col)
 * - Keeps existing logic/handlers unchanged
 */

export default function Shop({ shopId: propShopId = null }) {
  const { shopId: paramShopId } = useParams();
  const { progress } = usePlayerProgress();
  const navigate = useNavigate();

  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);
  const msgTimerRef = useRef(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const resolvedShopId = useMemo(() => {
    if (propShopId) return propShopId;
    if (paramShopId) return decodeURIComponent(paramShopId);
    const region = progress?.currentRegion || null;
    if (!region) return null;
    const locs = getLocationsForRegion(region) || [];
    const shop = locs.find((l) => l.type === "shop" || l.kind === "shop");
    return shop ? shop.id : null;
  }, [propShopId, paramShopId, progress?.currentRegion]);

  const shop = useMemo(() => {
    if (!resolvedShopId) return null;
    try {
      return getShop(resolvedShopId);
    } catch (e) {
      console.error("getShop error", e);
      return null;
    }
  }, [resolvedShopId]);

  const stock = useMemo(() => {
    if (!resolvedShopId) return [];
    try {
      return getShopStock(resolvedShopId) || [];
    } catch (e) {
      console.error("getShopStock error", e);
      return [];
    }
  }, [resolvedShopId, progress, refreshKey]);

  const playerInvList = useMemo(() => {
    const inv = (progress && (progress.inventory || progress.items)) ? { ...(progress.inventory || progress.items) } : {};
    return Object.entries(inv)
      .map(([id, qty]) => ({ id, qty: Number(qty) || 0 }))
      .filter((it) => it.qty > 0)
      .sort((a, b) => String(itemsCatalog[a.id]?.name || a.id).localeCompare(String(itemsCatalog[b.id]?.name || b.id)));
  }, [progress, refreshKey]);

  const shopAcceptInfo = useMemo(() => {
    const accepts = new Set();
    const stockMap = new Map();
    for (const s of stock || []) {
      accepts.add(s.id);
      stockMap.set(s.id, s);
    }
    const buyAll = !!(shop && shop.buyAll === true);
    return { accepts, buyAll, stockMap };
  }, [stock, shop]);

  const isItemEquipped = (itemId) => {
    if (!progress) return false;
    const eq = progress.equipped || {};
    return Object.values(eq).some((v) => v === itemId);
  };

  function showMsg(text, timeout = 2500) {
    setMessage(text);
    if (msgTimerRef.current) {
      clearTimeout(msgTimerRef.current);
      msgTimerRef.current = null;
    }
    if (timeout > 0) {
      msgTimerRef.current = setTimeout(() => {
        setMessage(null);
        msgTimerRef.current = null;
      }, timeout);
    }
  }

  useEffect(() => {
    return () => {
      if (msgTimerRef.current) {
        clearTimeout(msgTimerRef.current);
        msgTimerRef.current = null;
      }
    };
  }, []);

  async function handleBuy(itemId, qty = 1) {
    if (!resolvedShopId) return;
    setBusy(true);
    try {
      console.log("[Shop] buy requested", { shopId: resolvedShopId, itemId, qty });
      const res = await buyFromShop(resolvedShopId, itemId, qty);
      if (!res || !res.success) {
        showMsg("Buy failed: " + (res?.reason || "unknown"));
      } else {
        showMsg(`Bought ${qty} × ${itemsCatalog[itemId]?.name || itemId}`);
        console.log("[Shop] buy result.progress:", res.progress);
        setRefreshKey(k => k + 1);
      }
    } catch (e) {
      showMsg("Buy failed (exception).");
      console.error(e);
    } finally {
      setBusy(false);
    }
  }

  async function handleSell(itemId, qty = 1) {
    if (!resolvedShopId) return;
    if (isItemEquipped(itemId)) {
      showMsg("Cannot sell an equipped item. Unequip it first.");
      return;
    }

    setBusy(true);
    try {
      console.log("[Shop] sell requested", { shopId: resolvedShopId, itemId, qty });
      const res = await sellToShop(resolvedShopId, itemId, qty);
      if (!res || !res.success) {
        showMsg("Sell failed: " + (res?.reason || "unknown"));
      } else {
        showMsg(`Sold ${qty} × ${itemsCatalog[itemId]?.name || itemId} (+${res.goldGained || 0} gold)`);
        console.log("[Shop] sell result.progress:", res.progress);
        setRefreshKey(k => k + 1);
      }
    } catch (e) {
      showMsg("Sell failed (exception).");
      console.error(e);
    } finally {
      setBusy(false);
    }
  }

  if (!resolvedShopId) {
    return (
      <div className="p-4">
        <h3 className="text-lg font-semibold text-gray-100 mt-0">Shop not found</h3>
        <div className="mt-2">
          <button className="px-3 py-2 rounded-md bg-[#0f141a] border border-[#1c232c] text-gray-100" onClick={() => navigate(-1)}>Back</button>
        </div>
      </div>
    );
  }

  const cityName = getCityForRegion(progress?.currentRegion || "")?.name || "";

  return (
    <div className="p-4 min-h-screen bg-transparent text-gray-100">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">{resolvedShopId}</h2>
          <div className="text-xs text-gray-400 mt-1">{cityName}</div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate(-1)}
            className="px-3 py-1 rounded-md bg-[#0f141a] border border-[#1c232c] text-sm text-gray-100"
          >
            Back
          </button>
          <button
            onClick={() => navigate("/")}
            className="px-3 py-1 rounded-md bg-transparent border border-[#1c232c] text-sm text-gray-100"
          >
            City
          </button>
        </div>
      </div>

      {/* Grid: Stock (main) + Inventory (sidebar) */}
      <div className="mt-4 grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">
        {/* Stock */}
        <div>
          <div className="mb-3 text-sm font-semibold">Stock</div>

          {(!stock || stock.length === 0) ? (
            <div className="text-sm text-gray-400">This shop has no stock.</div>
          ) : (
            <div className="space-y-3">
              {stock.map((s) => {
                const meta = itemsCatalog[s.id] || { name: s.id };
                const inStock = s.inStock === Infinity ? "∞" : String(s.inStock);
                const playerGold = Number(progress?.gold) || 0;
                const canAfford = playerGold >= (s.price || 0);
                const disabled = busy || (!canAfford) || (s.inStock === 0);

                return (
                  <div key={s.id} className="flex items-center justify-between p-3 rounded-lg bg-[#0b0f14] border border-[#1c232c]">
                    <div className="min-w-0">
                      <div className="font-medium truncate">{meta.name}</div>
                      <div className="text-xs text-gray-400 truncate">{s.id}</div>
                    </div>

                    <div className="text-right min-w-[140px]">
                      <div className="text-xs text-gray-400">Price: <span className="font-semibold text-gray-100">{s.price}</span></div>
                      <div className="text-xs text-gray-400">In stock: {inStock}</div>

                      <div className="mt-2 flex justify-end gap-2">
                        <button
                          onClick={() => !disabled && handleBuy(s.id, 1)}
                          disabled={disabled}
                          className={`px-2 py-1 rounded text-sm ${disabled ? "bg-[#0f141a] text-gray-500 cursor-not-allowed" : "bg-amber-700 text-amber-100 border border-amber-700"}`}
                          title={disabled ? "Cannot buy" : `Buy 1 ${meta.name}`}
                        >
                          Buy ×1
                        </button>

                        <button
                          onClick={() => !disabled && handleBuy(s.id, 5)}
                          disabled={disabled || (s.inStock !== Infinity && s.inStock < 5)}
                          className={`px-2 py-1 rounded text-sm ${disabled ? "bg-[#0f141a] text-gray-500 cursor-not-allowed" : "bg-[#1a1f27] text-gray-100 border border-[#2c3544]"}`}
                          title={disabled ? "Cannot buy" : `Buy 5 ${meta.name}`}
                        >
                          Buy ×5
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Inventory / Sell panel */}
        <aside>
          <div className="mb-3 text-sm font-semibold">Your Inventory</div>

          {playerInvList.length === 0 ? (
            <div className="text-sm text-gray-400">You have no items to sell.</div>
          ) : (
            <div className="space-y-3">
              {playerInvList.map((it) => {
                const meta = itemsCatalog[it.id] || { name: it.id };
                const qtyN = Number(it.qty) || 0;

                const acceptsDirect = shopAcceptInfo.accepts.has(it.id);
                const fallbackPrice = Number.isFinite(Number(itemsCatalog[it.id]?.price)) ? Number(itemsCatalog[it.id].price) : undefined;
                const acceptsViaBuyAll = !!(shopAcceptInfo.buyAll && typeof fallbackPrice !== "undefined");
                const canSell = acceptsDirect || acceptsViaBuyAll;

                const equipped = isItemEquipped(it.id);

                const sellDisabled = busy || qtyN <= 0 || !canSell || equipped;

                const sellTitle = equipped
                  ? "Item is equipped — unequip before selling"
                  : !canSell
                    ? "Shop will not buy this item."
                    : qtyN <= 0
                      ? "No items to sell"
                      : sellDisabled
                        ? "Busy"
                        : `Sell to shop`;

                return (
                  <div key={it.id} className="flex items-center justify-between p-3 rounded-lg bg-[#0b0f14] border border-[#1c232c]">
                    <div className="min-w-0">
                      <div className="font-medium truncate">{meta.name}</div>
                      <div className="text-xs text-gray-400 truncate">{it.id}</div>
                    </div>

                    <div className="text-right min-w-[140px]">
                      <div className="text-xs text-gray-400">
                        Qty: <span className="font-semibold text-gray-100">{qtyN}</span>
                        {equipped ? <span className="ml-2 text-xs font-semibold text-rose-400">Equipped</span> : null}
                      </div>

                      <div className="mt-2 flex justify-end gap-2 items-center">
                        {!canSell && !equipped && <div className="text-xs text-gray-500 mr-2">Not buyable</div>}

                        <button
                          onClick={() => !sellDisabled && handleSell(it.id, 1)}
                          disabled={sellDisabled}
                          className={`px-2 py-1 rounded text-sm ${sellDisabled ? "bg-[#0f141a] text-gray-500 cursor-not-allowed" : "bg-[#111827] text-gray-100 border border-[#2c3544]"}`}
                          title={sellTitle}
                        >
                          Sell ×1
                        </button>

                        <button
                          onClick={() => !sellDisabled && handleSell(it.id, Math.min(5, qtyN))}
                          disabled={sellDisabled}
                          className={`px-2 py-1 rounded text-sm ${sellDisabled ? "bg-[#0f141a] text-gray-500 cursor-not-allowed" : "bg-[#111827] text-gray-100 border border-[#2c3544]"}`}
                          title={sellTitle}
                        >
                          Sell ×{Math.min(5, qtyN)}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </aside>
      </div>

      {/* Message */}
      {message && (
        <div className="mt-4">
          <div className="inline-block px-3 py-2 rounded-lg bg-[#0d1118] border border-[#1c232c] text-sm text-gray-100">
            {message}
          </div>
        </div>
      )}
    </div>
  );
}
