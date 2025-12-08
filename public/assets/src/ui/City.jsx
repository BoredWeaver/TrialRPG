// src/ui/City.jsx
import React from "react";
import { useNavigate } from "react-router-dom";
import usePlayerProgress from "../state/usePlayerProgress.js";
import { getCityForRegion, getLocationsForRegion } from "../state/locations.js";
import { saveProgress } from "../state/playerProgress.js";

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
    <div className="relative min-h-screen">
      {/* Background */}
      <div
        className="
          absolute inset-0 
          
        "
      ></div>

      {/* Dark overlay for readability */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-[1px]"></div>

      {/* Main content */}
      <div className="relative z-10 p-4 sm:p-6 text-gray-200">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 mb-4">
          <div className="min-w-0">
            <h1 className="text-lg sm:text-xl font-semibold leading-tight truncate">
              {cityName}
            </h1>
            <div className="text-xs text-gray-400 mt-1">
              Region:{" "}
              <span className="font-medium text-gray-200 truncate">{regionId}</span>
            </div>
          </div>

          <button
            onClick={() => navigate("/menu")}
            className="px-3 py-1 rounded-md border text-sm bg-muted-700 text-gray-100 border-muted-600"
          >
            Menu
          </button>
        </div>

        {/* Responsive layout */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Left side */}
          <div className="md:col-span-2 space-y-4">
            {/* Player Card */}
            <div className="bg-[#0f141a]/80 backdrop-blur-sm rounded-xl border border-[#1c232c] p-4 shadow-md fantasy-border">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div className="flex items-center gap-3 min-w-0">
                  <div aria-hidden className="w-12 h-12 rounded-md bg-white/10"></div>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-gray-100 truncate">
                      {player.name ?? "Adventurer"}
                    </div>
                    <div className="text-xs text-gray-400 mt-1 truncate">
                      Class:{" "}
                      <span className="font-medium text-gray-200">
                        {player.class ?? "Unknown"}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-4 w-full md:w-auto">
                  <div className="text-xs text-gray-400">Lv</div>
                  <div className="font-semibold text-gray-100">{level}</div>

                  <div className="hidden md:block border-l border-[#1c232c] h-6" />

                  <div className="text-xs text-gray-400">Unspent</div>
                  <div className="font-semibold text-gray-100">
                    {player.unspentPoints ?? player.points ?? 0}
                  </div>
                </div>
              </div>

              {/* EXP Bar */}
              <div className="mt-4">
                <div className="flex items-center justify-between text-xs text-gray-400 mb-1">
                  <div>EXP</div>
                  <div className="text-gray-300">
                    {exp} / {nextExp} ({Math.round(expPct * 100)}%)
                  </div>
                </div>

                <div className="w-full bg-muted-700 rounded-full h-3 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-200"
                    style={{
                      width: `${Math.round(expPct * 100)}%`,
                      background: "linear-gradient(90deg,#5eead4,#60a5fa)",
                    }}
                  />
                </div>
              </div>
            </div>

            {/* City description */}
            <div>
              <div className="text-sm font-semibold mb-2 text-gray-100">
                About this city
              </div>
              <div className="bg-[#0b0f14]/80 backdrop-blur-sm rounded-xl border p-3 text-sm text-gray-300 border-[#1c232c] shadow-sm">
                {city?.description ||
                  "This is the regional hub. You can rest, buy supplies, and explore the world."}
              </div>
            </div>

            <div className="text-xs text-gray-400 text-center md:text-left pb-6 md:pb-0">
              Tip: Use the World Map to explore new regions.
            </div>
          </div>

          {/* Sidebar actions */}
          <aside className="space-y-4">
            <div className="bg-[#0f141a]/80 backdrop-blur-sm rounded-xl border border-[#1c232c] p-4 shadow-sm">
              <div className="text-sm font-semibold text-gray-100 mb-2">Actions</div>

              <div className="flex flex-col gap-3">
                <button
                  onClick={handleVisitShop}
                  disabled={!shop}
                  className={`w-full px-4 py-3 rounded-lg text-sm font-medium shadow-sm ${
                    shop
                      ? "bg-amber-700 text-amber-100 fantasy-glow border border-amber-700"
                      : "bg-muted-700/50 text-gray-500 cursor-not-allowed border border-muted-600"
                  }`}
                >
                  {shop ? `Visit ${shop.name}` : "No Shop Available"}
                </button>

                <button
                  onClick={goToMap}
                  className="w-full px-4 py-3 rounded-lg text-sm border bg-[#0b0f14]/80 backdrop-blur-sm text-gray-200 border-[#1c232c]"
                >
                  World Map
                </button>

                
              </div>
            </div>

            <div className="bg-[#0b0f14]/80 backdrop-blur-sm rounded-xl border p-3 text-sm text-gray-300 border-[#1c232c] shadow-sm">
              <div className="flex items-center justify-between">
                <div className="text-xs text-gray-400">Gold</div>
                <div className="font-semibold text-gray-100">{player.gold ?? 0}</div>
              </div>
              <div className="flex items-center justify-between mt-2">
                <div className="text-xs text-gray-400">Level</div>
                <div className="font-semibold text-gray-100">Lv {level}</div>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
