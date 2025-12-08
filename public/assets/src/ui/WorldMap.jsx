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
 * WorldMap (mobile-first, dark-fantasy theme)
 *
 * Presentation-only improvements:
 * - Responsive layout (Tailwind breakpoints)
 * - Truncation / overflow safety
 * - Stacked buttons on mobile, inline on desktop
 * - Small translucent bg, border and shadow on cards
 *
 * NO logic changes.
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
      // lightweight fallback UX - logic kept
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
        <div className="p-4 min-h-[40vh]">
          <h3 className="text-lg font-semibold text-gray-100 mb-3">Unknown region</h3>
          <div className="text-sm text-gray-400 mb-4">Requested: <span className="font-medium text-gray-200">{regionKey}</span></div>
          <button
            className="px-3 py-2 rounded-md bg-muted-700 text-gray-100 border border-muted-600"
            onClick={() => navigate(-1)}
            title="Go back"
            aria-label="Go back"
          >
            Back
          </button>
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
        <div className="flex items-start justify-between mb-4 gap-4">
          <div className="min-w-0">
            <h3 className="text-lg font-semibold text-gray-100 truncate">{title} Region</h3>
            <div className="text-xs text-gray-400 mt-1">
              City: <span className="font-medium text-gray-200 truncate">{city?.name ?? "—"}</span>
            </div>
          </div>

          <div className="flex gap-2 items-center">
            <button
              className="px-3 py-2 rounded-md bg-muted-700 text-gray-100 border border-muted-600 text-sm"
              onClick={() => navigate(-1)}
              title="Back"
              aria-label="Back"
            >
              Back
            </button>
          </div>
        </div>

        <div className="space-y-3">
          {zoneList.length === 0 ? (
            <div className="text-sm text-gray-400">No zones in this region.</div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {zoneList.map((z) => {
                const p = getPlayerAware(z.id);
                const disabled = !p?.available;
                let reason = "";
                if (p?.isLocked) reason = "Locked";
                else if (!p?.meetsLevel) reason = `Requires Lv ${z.minLevel ?? "?"}`;

                return (
                  <article
                    key={z.id}
                    className={`rounded-lg p-4 transition-transform duration-150 flex flex-col justify-between min-h-[140px]`}
                    title={z.name}
                    aria-labelledby={`zone-${z.id}-title`}
                    style={{
                      // subtle translucent panel + border + soft shadow
                      background: "rgba(255,255,255,0.02)",
                      border: "1px solid rgba(255,255,255,0.06)",
                      boxShadow: disabled ? "none" : "0 6px 18px rgba(2,6,23,0.55)",
                      backdropFilter: "blur(4px)",
                    }}
                  >
                    <div className="min-w-0">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h4 id={`zone-${z.id}-title`} className="font-semibold text-gray-100 text-sm truncate">{z.name}</h4>
                          <div className="text-xs text-gray-400 mt-1 truncate">
                            {z.kind === "dungeon" ? `Dungeon • min Lv ${z.minLevel ?? "?"}` : (z.kind || z.type)}
                          </div>
                        </div>

                        <div className="text-right text-xs flex-shrink-0">
                          <span
                            className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-medium ${
                              disabled ? "bg-[#2a2f36] text-gray-400" : "bg-green-800 text-green-200"
                            }`}
                            title={disabled ? "Unavailable" : "Available"}
                          >
                            {disabled ? "Unavailable" : "Available"}
                          </span>
                        </div>
                      </div>

                      {disabled && (
                        <div className="mt-2 text-xs text-red-400 font-medium truncate" aria-hidden>
                          {reason}
                        </div>
                      )}
                    </div>

                    <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <button
                        className={`w-full px-3 py-2 rounded text-sm font-medium transition-colors ${
                          disabled ? "bg-muted-700/60 text-gray-500 cursor-not-allowed" : "bg-indigo-900 text-indigo-100"
                        }`}
                        disabled={disabled}
                        onClick={() => enterLocation(z.id, `/zone/${encodeURIComponent(z.id)}`)}
                        title={disabled ? "Unavailable" : `Enter ${z.name}`}
                        aria-disabled={disabled}
                        aria-label={disabled ? `${z.name} unavailable` : `Enter ${z.name}`}
                      >
                        Enter Zone
                      </button>

                      <button
                        className="w-full px-3 py-2 rounded text-sm bg-muted-700 text-gray-100 border border-muted-600"
                        onClick={() => setRegionAndNavigate(regionKey, `/map/${encodeURIComponent(regionKey)}`)}
                        title="Inspect region"
                      >
                        Inspect
                      </button>
                    </div>
                  </article>
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
      <h2 className="text-lg font-semibold mb-4 text-gray-100">World Map</h2>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {displayRegions.map((r) => {
          const hub = getCityForRegion(r.id);
          return (
            <section
              key={r.id}
              aria-labelledby={`region-${r.id}-title`}
              title={r.name}
              className="rounded-lg p-4 flex flex-col justify-between min-h-[140px] transition-transform duration-150"
              style={{
                background: "rgba(255,255,255,0.02)",
                border: "1px solid rgba(255,255,255,0.06)",
                boxShadow: "0 8px 26px rgba(2,6,23,0.55)",
                backdropFilter: "blur(4px)",
              }}
            >
              <div className="min-w-0">
                <h3 id={`region-${r.id}-title`} className="font-semibold text-gray-100 truncate">{r.name}</h3>
                <div className="text-xs text-gray-400 mt-1 truncate">{hub?.name ?? "—"}</div>
              </div>

              <div className="mt-3 flex flex-col sm:flex-row gap-2">
                <button
                  onClick={() => setRegionAndNavigate(r.id)}
                  className="flex-1 px-3 py-2 rounded bg-indigo-900 text-indigo-100 text-sm"
                  title={`Open ${r.name}`}
                >
                  Open
                </button>

                <button
                  onClick={() => {
                    if (hub) enterLocation(hub.id, "/");
                    else setRegionAndNavigate(r.id, "/");
                  }}
                  className="px-3 py-2 rounded bg-muted-700 text-gray-100 border border-muted-600 text-sm"
                  title={hub ? `Enter ${hub.name}` : `Inspect ${r.name}`}
                >
                  Enter City
                </button>
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
