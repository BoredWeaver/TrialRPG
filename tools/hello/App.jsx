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

import { BattleProvider } from "./state/BattleContext.jsx";
import { DungeonProvider } from "./state/DungeonContext.jsx";
import usePlayerProgress from "./state/usePlayerProgress.js";

// ensure side-effect modules are evaluated
import "./state/quests.js";

/**
 * App
 * - Providers are applied consistently around the main layout.
 * - TopNav kept minimal and readable.
 */
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

/* ---------------- Main layout + routes ---------------- */
function MainLayout() {
  return (
    <div style={styles.appRoot}>
      <TopNav />
      <main style={styles.main}>
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
        </Routes>
      </main>
    </div>
  );
}

/* ---------------- Top navigation ---------------- */
function TopNav() {
  const { progress } = usePlayerProgress();
  const level = progress?.level ?? 1;
  const gold = progress?.gold ?? 0;

  return (
    <header style={styles.nav}>
      <div style={styles.navLeft}>
        <NavLink to="/">City</NavLink>
        <NavLink to="/map">Map</NavLink>
        <NavLink to="/menu">Menu</NavLink>
        <NavLink to="/quests">Quests</NavLink>
      </div>

    </header>
  );
}

function NavLink({ to, children }) {
  return (
    <Link to={to} style={styles.navBtn}>
      {children}
    </Link>
  );
}

/* ---------------- styles ---------------- */
const styles = {
  appRoot: {
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif",
    minHeight: "100vh",
    background: "#f6f7fb",
  },
  nav: {
    display: "flex",
    justifyContent: "space-around",
    alignItems: "center",
    padding: 12,
    borderBottom: "1px solid #e8e8e8",
    background: "#fff",
    gap: 12,
  },
  navLeft: { display: "flex", gap: 10, alignItems: "center" },
  navRight: { display: "flex", gap: 12, alignItems: "center" },
  navBtn: {
    padding: "8px 18px",
    borderRadius: 8,
    border: "1px solid #e6e6e6",
    textDecoration: "none",
    color: "#111",
    background: "#fff",
    display: "inline-block",
  },
  status: {
    fontSize: 14,
    color: "#333",
    background: "#fff",
    padding: "6px 8px",
    borderRadius: 8,
    border: "1px solid #f0f0f0",
  },
  main: { padding: 18, maxWidth: 1100, margin: "0 auto" },
};
