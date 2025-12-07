// src/App.jsx
import React from "react";
import { BrowserRouter, Routes, Route, Link } from "react-router-dom";

import Shop from "./ui/Shop.jsx";
import City from "./ui/City.jsx";
import WorldMap from "./ui/WorldMap.jsx";
import ZoneScreen from "./ui/ZoneScreen.jsx";
import Combat from "./ui/Battle.jsx";
import MenuScreen from "./ui/MenuScreen.jsx";
import QuestBoard from "./ui/QuestBoard.jsx";
import DungeonScreen from "./ui/DungeonScreen.jsx";
import Tutorial from "./ui/Tutorial.jsx";
// new inspectors
import SpellBook from "./ui/SpellBook.jsx";
import Enemies from "./ui/Enemies.jsx";
import Dungeons from "./ui/Dungeons.jsx";

import { BattleProvider } from "./state/BattleContext.jsx";
import { DungeonProvider } from "./state/DungeonContext.jsx";
import usePlayerProgress from "./state/usePlayerProgress.js";

import "./state/quests.js";

export default function App() {
  return (
    <BrowserRouter>
      <DungeonProvider>
        <BattleProvider>
          <MainLayout />
        </BattleProvider>
      </DungeonProvider>
    </BrowserRouter>
  );
}

function MainLayout() {
  return (
    <div className="min-h-screen bg-[url('../src/assets/bg1.jpg')] 
          bg-cover bg-center bg-no-repeat text-gray-200">
      <TopNav />
      <main className="px-4 py-6 max-w-5xl mx-auto w-full">
        {/* container panel */}
        <div className="w-full rounded-lg bg-[#0c062377] p-4 shadow-inner">
          <Routes>
            <Route path="/" element={<City />} />
            <Route path="/map" element={<WorldMap />} />
            <Route path="/map/:regionId" element={<WorldMap />} />
            <Route path="/zone/:zoneId" element={<ZoneScreen />} />
            <Route path="/shop/:shopId" element={<Shop />} />
            <Route path="/combat" element={<Combat />} />
            <Route path="/dungeon" element={<DungeonScreen />} />
            <Route path="/menu" element={<MenuScreen />} />
            <Route path="/quests" element={<QuestBoard />} />

            {/* Inspector pages */}
            <Route path="/tutorial" element={<Tutorial />} />
          </Routes>
        </div>
      </main>
    </div>
  );
}

function TopNav() {
  const { progress } = usePlayerProgress();
  const level = progress?.level ?? 1;
  const gold = progress?.gold ?? 0;

  return (
    <header className="sticky top-0 z-40 bg-[#0f141a]/90 backdrop-blur-md border-b border-[#1c232c]">
      <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
        <nav className="flex gap-2 flex-wrap">
          <NavLink to="/">City</NavLink>
          <NavLink to="/map">Map</NavLink>
          <NavLink to="/menu">Menu</NavLink>
          <NavLink to="/quests">Quests</NavLink>

          {/* inspector links (non-intrusive) */}
          <NavLink to="/tutorial">Tutorial</NavLink>
        </nav>

        <div className="text-right text-xs text-gray-400">
          <div className="font-semibold text-gray-200">Lv {level}</div>
          <div className="text-gray-500">Gold: {gold}</div>
        </div>
      </div>
    </header>
  );
}

function NavLink({ to, children }) {
  return (
    <Link
      to={to}
      className="
        px-3 py-1 text-sm rounded-md 
        bg-[#1a212b] hover:bg-[#232c38]
        text-gray-200 border border-[#2a3542]
      "
    >
      {children}
    </Link>
  );
}
