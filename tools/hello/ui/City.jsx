// src/ui/City.jsx
import React from "react";
import { useNavigate } from "react-router-dom";
import usePlayerProgress from "../state/usePlayerProgress.js";
import { getCityForRegion, getLocationsForRegion } from "../state/locations.js";
import { saveProgress } from "../state/playerProgress.js";

/**
 * Simplified Mobile-First City Screen
 *
 * - No region selector
 * - No travel panel
 * - Only one navigation option: World Map
 * - Clean player summary + EXP bar
 * - Shop button (if exists)
 */

export default function City() {
  const { progress } = usePlayerProgress();
  const navigate = useNavigate();

  const regionId = progress?.currentRegion || "central";
  const city = getCityForRegion(regionId);
  const allLocs = getLocationsForRegion(regionId) || [];
  const shop = allLocs.find((l) => l.type === "shop" || l.kind === "shop") || null;
  const player = progress || {};

  const cityName =
    city?.name ||
    (regionId[0]?.toUpperCase() + regionId.slice(1) + " City");

  const level = player.level ?? 1;
  const expPct = Math.max(0, Math.min(1, Number(player.pct) || 0));
  const exp = player.exp ?? 0;
  const nextExp = player.nextExp ?? 100;

  function handleVisitShop() {
    if (!shop) return;
    saveProgress({ currentRegion: regionId });
    navigate(`/shop/${encodeURIComponent(shop.id)}`);
  }

  function goToMap() {
    saveProgress({ currentRegion: regionId });
    navigate("/map");
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4 sm:p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-lg font-semibold leading-tight">{cityName}</h1>
          <div className="text-xs text-slate-500">
            Region: <span className="font-medium">{regionId}</span>
          </div>
        </div>

        <button
          onClick={() => navigate("/menu")}
          className="px-3 py-1 rounded-md border text-sm bg-white shadow-sm"
        >
          Menu
        </button>
      </div>

      {/* Player Card */}
      <div className="bg-white rounded-xl border p-4 shadow-sm mb-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold">
              {player.name ?? "Adventurer"}
            </div>
            <div className="text-xs text-slate-500 mt-1">
              Lv {level} • Gold:{" "}
              <span className="font-medium">{player.gold ?? 0}</span>
            </div>
          </div>

          <div className="text-right">
            <div className="text-xs text-slate-500">Unspent</div>
            <div className="font-medium">
              {player.unspentPoints ?? player.points ?? 0}
            </div>
          </div>
        </div>

        {/* EXP Bar */}
        <div className="mt-4">
          <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
            <div>EXP</div>
            <div>
              {exp} / {nextExp} ({Math.round(expPct * 100)}%)
            </div>
          </div>

          <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-200"
              style={{
                width: `${Math.round(expPct * 100)}%`,
                background: "#60a5fa",
              }}
            />
          </div>
        </div>
      </div>

      {/* City Actions */}
      <div className="mb-4">
        <div className="flex flex-col gap-3">

          {/* Visit Shop */}
          <button
            onClick={handleVisitShop}
            disabled={!shop}
            className={`px-4 py-3 rounded-lg text-sm font-medium shadow-sm ${
              shop
                ? "bg-blue-600 text-white"
                : "bg-slate-200 text-slate-400 cursor-not-allowed"
            }`}
          >
            {shop ? `Visit ${shop.name}` : "No Shop Available"}
          </button>

          {/* World Map */}
          <button
            onClick={goToMap}
            className="px-4 py-3 rounded-lg text-sm border bg-white shadow-sm"
          >
            World Map
          </button>
        </div>
      </div>

      {/* City Description */}
      <div className="mb-6">
        <div className="text-sm font-semibold mb-2">About this city</div>
        <div className="bg-white rounded-xl border p-3 text-sm text-slate-700 shadow-sm">
          {city?.description ||
            "This is the regional hub. You can rest, buy supplies, and explore the world."}
        </div>
      </div>

      <div className="text-xs text-slate-500 text-center pb-6">
        Tip: Use the World Map to explore new regions.
      </div>
    </div>
  );
}
