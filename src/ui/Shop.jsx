// src/ui/Shop.jsx
import React, { useMemo, useRef, useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import usePlayerProgress from "../state/usePlayerProgress.js";
import { getLocationsForRegion, getCityForRegion } from "../state/locations.js";
import { getShopStock, buyFromShop, sellToShop, getShop } from "../state/shop.js";
import itemsCatalog from "../db/items.json";

export default function Shop({ shopId: propShopId = null }) {
  const { shopId: paramShopId } = useParams();
  const { progress } = usePlayerProgress();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);
  const msgTimerRef = useRef(null);
  // refreshKey forces recompute of memoized derived data after buy/sell
  const [refreshKey, setRefreshKey] = useState(0);

  // Resolve shopId (priority: prop -> param -> current region's shop)
  const resolvedShopId = useMemo(() => {
    if (propShopId) return propShopId;
    if (paramShopId) return decodeURIComponent(paramShopId);
    const region = progress?.currentRegion || null;
    if (!region) return null;
    const locs = getLocationsForRegion(region) || [];
    const shop = locs.find((l) => l.type === "shop" || l.kind === "shop");
    return shop ? shop.id : null;
  }, [propShopId, paramShopId, progress?.currentRegion]);

  // Load shop descriptor and stock
  const shop = useMemo(() => {
    if (!resolvedShopId) return null;
    try {
      return getShop(resolvedShopId);
    } catch (e) {
      console.error("getShop error", e);
      return null;
    }
  }, [resolvedShopId]);

  // Recompute stock whenever resolvedShopId OR game progress changes OR refreshKey changes.
  // This prevents stale UI after buy/sell or other systems modify shop state.
  const stock = useMemo(() => {
    if (!resolvedShopId) return [];
    try {
      return getShopStock(resolvedShopId) || [];
    } catch (e) {
      console.error("getShopStock error", e);
      return [];
    }
  }, [resolvedShopId, progress, refreshKey]); // include refreshKey so handleBuy/handleSell can force update

  // Build a filtered inventory list (exclude zero qty entries)
  const playerInvList = useMemo(() => {
    const inv = (progress && (progress.inventory || progress.items)) ? { ...(progress.inventory || progress.items) } : {};
    return Object.entries(inv)
      .map(([id, qty]) => ({ id, qty: Number(qty) || 0 }))
      .filter((it) => it.qty > 0)
      .sort((a, b) => String(itemsCatalog[a.id]?.name || a.id).localeCompare(String(itemsCatalog[b.id]?.name || b.id)));
  }, [progress, refreshKey]);

  // Build quick lookup for whether shop accepts an item (and stock)
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

  // whether item is currently equipped in player's progress
  const isItemEquipped = (itemId) => {
    if (!progress) return false;
    const eq = progress.equipped || {};
    return Object.values(eq).some((v) => v === itemId);
  };

  // Message helper (clears previous timer)
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
        // log returned merged progress for debugging
        console.log("[Shop] buy result.progress:", res.progress);
        // force UI recompute to reflect latest persisted state
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
        // force UI recompute to reflect latest persisted state
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
      <div style={styles.root}>
        <h3 style={{ marginTop: 0 }}>Shop not found</h3>
        <div style={{ marginTop: 8 }}>
          <button style={styles.btn} onClick={() => navigate(-1)}>Back</button>
        </div>
      </div>
    );
  }

  const cityName = getCityForRegion(progress?.currentRegion || "")?.name || "";

  return (
    <div style={styles.root}>
      <div style={styles.header}>
        <div>
          <h2 style={{ margin: 0 }}>{resolvedShopId}</h2>
          <div style={{ color: "#666", marginTop: 6 }}>{cityName}</div>
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <button style={styles.btn} onClick={() => navigate(-1)}>Back</button>
          <button style={styles.btnAlt} onClick={() => navigate("/")}>City</button>
        </div>
      </div>

      <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "1fr 320px", gap: 16 }}>
        {/* Stock list */}
        <div>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>Stock</div>
          {(!stock || stock.length === 0) ? (
            <div style={{ color: "#666" }}>This shop has no stock.</div>
          ) : (
            <div style={{ display: "grid", gap: 8 }}>
              {stock.map((s) => {
                const meta = itemsCatalog[s.id] || { name: s.id };
                const inStock = s.inStock === Infinity ? "∞" : String(s.inStock);
                const playerGold = Number(progress?.gold) || 0;
                const canAfford = playerGold >= (s.price || 0);
                const disabled = busy || (!canAfford) || (s.inStock === 0);
                return (
                  <div key={s.id} style={styles.stockRow}>
                    <div>
                      <div style={{ fontWeight: 700 }}>{meta.name}</div>
                      <div style={{ color: "#666", fontSize: 13 }}>{s.id}</div>
                    </div>

                    <div style={{ textAlign: "right" }}>
                      <div style={{ color: "#666", fontSize: 13 }}>Price: {s.price}</div>
                      <div style={{ color: "#666", fontSize: 12 }}>In stock: {inStock}</div>
                      <div style={{ marginTop: 8, display: "flex", gap: 8, justifyContent: "flex-end" }}>
                        <button
                          style={{ ...styles.smallBtn, ...(disabled ? styles.smallBtnDisabled : {}) }}
                          onClick={() => !disabled && handleBuy(s.id, 1)}
                          disabled={disabled}
                          title={disabled ? "Cannot buy" : `Buy 1 ${meta.name}`}
                        >
                          Buy ×1
                        </button>
                        <button
                          style={{ ...styles.smallBtn, ...(disabled ? styles.smallBtnDisabled : {}) }}
                          onClick={() => !disabled && handleBuy(s.id, 5)}
                          disabled={disabled || (s.inStock !== Infinity && s.inStock < 5)}
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

        {/* Player Inventory / Sell */}
        <div>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>Your Inventory</div>
          {playerInvList.length === 0 ? (
            <div style={{ color: "#666" }}>You have no items to sell.</div>
          ) : (
            <div style={{ display: "grid", gap: 8 }}>
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
                  <div key={it.id} style={styles.invRow}>
                    <div>
                      <div style={{ fontWeight: 700 }}>{meta.name}</div>
                      <div style={{ color: "#666", fontSize: 13 }}>{it.id}</div>
                    </div>

                    <div style={{ textAlign: "right" }}>
                      <div style={{ color: "#666", fontSize: 13 }}>
                        Qty: {qtyN}
                        {equipped ? <span style={{ marginLeft: 10, color: "#b35", fontSize: 12, fontWeight: 600 }}>Equipped</span> : null}
                      </div>
                      <div style={{ marginTop: 8, display: "flex", gap: 8, justifyContent: "flex-end", alignItems: "center" }}>
                        {!canSell && !equipped && <div style={{ fontSize: 12, color: "#999", marginRight: 8 }}>Not buyable</div>}

                        <button
                          style={{ ...styles.smallBtn, ...(sellDisabled ? styles.smallBtnDisabled : {}) }}
                          onClick={() => !sellDisabled && handleSell(it.id, 1)}
                          disabled={sellDisabled}
                          title={sellTitle}
                        >
                          Sell ×1
                        </button>

                        <button
                          style={{ ...styles.smallBtn, ...(sellDisabled ? styles.smallBtnDisabled : {}) }}
                          onClick={() => !sellDisabled && handleSell(it.id, Math.min(5, qtyN))}
                          disabled={sellDisabled}
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
        </div>
      </div>

      {message ? (
        <div style={{ marginTop: 12 }}>
          <div style={{ padding: 8, background: "#fff", border: "1px solid #eee", borderRadius: 8 }}>{message}</div>
        </div>
      ) : null}
    </div>
  );
}

/* ---------------- Styles ---------------- */
const styles = {
  root: { padding: 18 },
  header: { display: "flex", justifyContent: "space-between", alignItems: "center" },
  btn: { padding: "8px 12px", borderRadius: 8, border: "1px solid #d9d9d9", background: "#fafafa", cursor: "pointer" },
  btnAlt: { padding: "8px 12px", borderRadius: 8, border: "1px solid #eee", background: "#fff", cursor: "pointer" },

  stockRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 12,
    border: "1px solid #eee",
    borderRadius: 8,
    background: "#fff"
  },

  invRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 12,
    border: "1px solid #eee",
    borderRadius: 8,
    background: "#fff"
  },

  smallBtn: {
    padding: "6px 8px",
    borderRadius: 6,
    border: "1px solid #d9d9d9",
    background: "#fafafa",
    cursor: "pointer",
    fontSize: 13
  },

  smallBtnDisabled: {
    opacity: 0.5,
    cursor: "not-allowed"
  }
};
