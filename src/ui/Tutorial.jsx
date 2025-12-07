// src/ui/Tutorial.jsx
import React from "react";
import { useNavigate } from "react-router-dom";

export default function Tutorial() {
  const nav = useNavigate();

  return (
    <div className="min-h-screen bg-[#060812] text-gray-200 p-4 sm:p-6">
      <div className="max-w-4xl mx-auto">
        <header className="flex items-start justify-between mb-6">
          <div className="min-w-0">
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white leading-tight">Game Tutorial</h1>
            <p className="mt-1 text-sm text-gray-400">A concise guide to get you playing — mobile first.</p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => nav(-1)}
              className="px-3 py-1 rounded-md bg-muted-700 text-gray-100 border border-muted-600 text-sm"
            >
              Back
            </button>
            <button
              onClick={() => nav("/menu")}
              className="px-3 py-1 rounded-md bg-indigo-900 text-indigo-100 border border-indigo-700 text-sm"
            >
              Open Menu
            </button>
          </div>
        </header>

        <article className="space-y-6">
          <section className="panel fantasy-border p-4 rounded-lg">
            <h2 className="text-lg font-semibold text-white mb-2">1. Getting Started</h2>
            <p className="text-sm text-gray-300">
              This game is mobile-first but works on desktop. Your save progress is stored locally. Visit <strong>Menu → Export/Import</strong> to backup or restore
              your save file as JSON. Open worldmap, enter region, enter zone, fight some normal enemies first , then enter dungeon. Boss unlocks on clearing all other tiles after fighting tiles. after boss dies, claim rewards button.
            </p>
          </section>

          <section className="panel fantasy-border p-4 rounded-lg">
            <h2 className="text-lg font-semibold text-white mb-2">2. Controls</h2>
            <ul className="text-sm text-gray-300 list-disc pl-5 space-y-1">
              <li><strong>Mobile:</strong> tap buttons and tiles; use the bottom action bar in combat.</li>
              <li><strong>Desktop:</strong> you can use arrow keys to move in dungeons and Enter to interact.</li>
              <li><strong>Navigation:</strong> top nav and in-game buttons navigate between City, Map, Menu, Quests and more.</li>
            </ul>
          </section>

          <section className="panel fantasy-border p-4 rounded-lg">
            <h2 className="text-lg font-semibold text-white mb-2">3. Progress & Saving</h2>
            <p className="text-sm text-gray-300">
              Progress is persisted to localStorage. Use the Menu to export your save (JSON) for safekeeping. Import replaces current save — handle carefully.
            </p>
          </section>

          <section className="panel fantasy-border p-4 rounded-lg">
            <h2 className="text-lg font-semibold text-white mb-2">4. Combat Basics</h2>
            <ol className="text-sm text-gray-300 list-decimal pl-5 space-y-1">
              <li>Enemies appear on the battle screen. Tap a card to select it.</li>
              <li>Use <em>Attack</em>, <em>Spells</em>, or <em>Items</em> from the bottom action bar.</li>
              <li>Spells and items may be AOE (affect all enemies) or single-target.</li>
              <li>Status effects (burn, stun, buffs) are shown as small pips — hover/tap to inspect.</li>
            </ol>
          </section>

          <section className="panel fantasy-border p-4 rounded-lg">
            <h2 className="text-lg font-semibold text-white mb-2">5. Inventory & Skills</h2>
            <p className="text-sm text-gray-300">
              Open <strong>Character Sheet</strong> from Menu to view inventory, equip items, and spend attribute points. You cannot sell equipped items — unequip first.
            </p>
          </section>

          <section className="panel fantasy-border p-4 rounded-lg">
            <h2 className="text-lg font-semibold text-white mb-2">6. Dungeons & Runs</h2>
            <p className="text-sm text-gray-300">
              Dungeons are played as runs on a grid. Tiles shrink to fit your viewport; use arrow keys (desktop) or the UI to move. Starting a run creates a persisted run state.
            </p>
          </section>

          <section className="panel fantasy-border p-4 rounded-lg">
            <h2 className="text-lg font-semibold text-white mb-2">7. Tips & Troubleshooting</h2>
            <ul className="text-sm text-gray-300 list-disc pl-5 space-y-1">
                
              <li>On small screens tiles may be small — zooming the page helps but is not required.</li>
            </ul>
          </section>

          <section className="p-4 text-sm text-gray-400">
            <div className="mb-2">That's it — go play. If you want this page to be richer (images, animated steps, or inline video), tell me what to include and I'll expand it.</div>
            <div className="flex gap-2">
              <button onClick={() => nav("/map")} className="px-3 py-2 rounded bg-indigo-900 text-indigo-100">Open World Map</button>
              <button onClick={() => nav("/menu")} className="px-3 py-2 rounded bg-muted-700 text-gray-100 border border-muted-600">Open Menu</button>
            </div>
          </section>
        </article>
      </div>
    </div>
  );
}
