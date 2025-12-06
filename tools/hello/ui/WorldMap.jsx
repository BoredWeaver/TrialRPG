// src/ui/WorldMap.jsx
import React from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  getRegions,
  getLocationsForRegion,
  getCityForRegion,
  getLocationsForPlayer,
  setCurrentLocation,
  setCurrentRegion,
} from "../state/locations.js";

/**
 * WorldMap (mobile-first)
 *
 * - Uses getLocationsForPlayer() to show availability (locked / level / available)
 * - Region index (no regionId) shows region cards
 * - Region page (regionId present) shows zones / dungeons with clear affordances
 * - Keeps existing API calls / navigation behavior
 */

export default function WorldMap() {
  const { regionId } = useParams();
  const navigate = useNavigate();

  const regions = getRegions() || [];
  const regionKeys = regions.map((r) => r.id);

  // player-aware location info (array of {id, available, isLocked, meetsLevel, ...})
  const playerLocs = getLocationsForPlayer() || [];

  function getPlayerAware(locationId) {
    return playerLocs.find((l) => l.id === locationId) || null;
  }

  function setRegionAndNavigate(regionKey, targetPath = null) {
    if (!regionKey) return;
    const out = setCurrentRegion(regionKey);
    if (!out || !out.success) {
      // lightweight fallback UX
      alert("Failed to set region.");
      return;
    }
    if (targetPath) navigate(targetPath);
    else navigate(`/map/${encodeURIComponent(regionKey)}`);
  }

  function enterLocation(locationId, navTo) {
    if (!locationId) return;
    const out = setCurrentLocation(locationId);
    if (!out || !out.success) {
      alert("Failed to travel.");
      return;
    }
    if (navTo) navigate(navTo);
  }

  /* ---------------- Region Page (zones list) ---------------- */
  if (regionId) {
    const regionKey = regionId;
    if (!regionKeys.includes(regionKey)) {
      return (
        <div className="p-4">
          <h3 className="text-lg font-semibold mb-3">Unknown region: {regionKey}</h3>
          <button className="px-3 py-2 rounded bg-white border" onClick={() => navigate(-1)}>Back</button>
        </div>
      );
    }

    const city = getCityForRegion(regionKey);
    const zoneList = (getLocationsForRegion(regionKey) || []).filter(
      (l) => l.type === "zone" || l.kind === "dungeon"
    );

    const title = regionKey.charAt(0).toUpperCase() + regionKey.slice(1);

    return (
      <div className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-lg font-semibold">{title} Region</h3>
            <div className="text-xs text-gray-500 mt-1">City: <span className="font-medium">{city?.name ?? "—"}</span></div>
          </div>

          <div className="flex gap-2">
            <button className="px-3 py-2 rounded bg-white border shadow-sm" onClick={() => navigate(-1)}>Back</button>
          </div>
        </div>

        <div className="space-y-3">
          {zoneList.length === 0 ? (
            <div className="text-sm text-gray-500">No zones in this region.</div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {zoneList.map((z) => {
                const p = getPlayerAware(z.id);
                const disabled = !p?.available;
                let reason = "";
                if (p?.isLocked) reason = "Locked";
                else if (!p?.meetsLevel) reason = `Requires Lv ${z.minLevel ?? "?"}`;

                return (
                  <div key={z.id} className={`bg-white rounded-lg border p-3 shadow-sm transition ${disabled ? "opacity-60" : "hover:shadow-md"}`}>
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="font-semibold text-sm">{z.name}</div>
                        <div className="text-xs text-gray-500 mt-1">
                          {z.kind === "dungeon" ? `Dungeon • min Lv ${z.minLevel ?? "?"}` : z.kind || z.type}
                        </div>
                      </div>

                      <div className="text-right text-xs">
                        {/* small pill for availability */}
                        <div className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-medium ${disabled ? "bg-gray-100 text-gray-600" : "bg-green-50 text-green-700"}`}>
                          {disabled ? "Unavailable" : "Available"}
                        </div>
                      </div>
                    </div>

                    {disabled && (
                      <div className="mt-2 text-xs text-red-600 font-medium">
                        {reason}
                      </div>
                    )}

                    <div className="mt-3 flex gap-2">
                      <button
                        className={`flex-1 px-3 py-2 rounded text-sm ${disabled ? "bg-gray-100 text-gray-500 cursor-not-allowed" : "bg-blue-600 text-white"}`}
                        disabled={disabled}
                        onClick={() => enterLocation(z.id, `/zone/${encodeURIComponent(z.id)}`)}
                      >
                        Enter Zone
                      </button>

                      <button
                        className="px-3 py-2 rounded text-sm bg-white border"
                        onClick={() => setRegionAndNavigate(regionKey, `/map/${encodeURIComponent(regionKey)}`)}
                      >
                        Inspect
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  }

  /* ---------------- Region Index Page ---------------- */
  const displayRegions = regions.filter((r) => !!getCityForRegion(r.id));

  return (
    <div className="p-4">
      <h2 className="text-lg font-semibold mb-3">World Map</h2>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {displayRegions.map((r) => {
          const hub = getCityForRegion(r.id);
          return (
            <div key={r.id} className="bg-white rounded-lg border p-3 shadow-sm flex flex-col justify-between">
              <div>
                <div className="font-semibold">{r.name}</div>
                <div className="text-xs text-gray-500 mt-1">{hub?.name ?? "—"}</div>
              </div>

              <div className="mt-3 flex gap-2">
                <button
                  onClick={() => setRegionAndNavigate(r.id)}
                  className="flex-1 px-3 py-2 rounded bg-blue-600 text-white text-sm"
                >
                  Open
                </button>

                <button
                  onClick={() => {
                    if (hub) enterLocation(hub.id, "/");
                    else setRegionAndNavigate(r.id, "/");
                  }}
                  className="px-3 py-2 rounded bg-white border text-sm"
                >
                  Enter City
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
