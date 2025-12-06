// src/ui/Main.jsx
import { useState } from "react";
import Home from "./Home.jsx";
import ShopPlaceholder from "./ShopPlaceholder.jsx";
import Battle from "./Battle.jsx";

export default function Main() {
  // simple route: "home" | "shop" | "forest"
  const [route, setRoute] = useState("home");
  // choose which enemy to fight in the forest (you can expand with more locations)
  const [forestEnemyId, setForestEnemyId] = useState("goblin");

  return (
    <div style={styles.app}>
      <header style={styles.header}>
        <h1 style={{ margin: 0, fontSize: 18 }}>RPG Demo</h1>
        <nav style={styles.nav}>
          <button style={styles.navBtn} onClick={() => setRoute("home")}>Home</button>
          <button style={styles.navBtn} onClick={() => setRoute("shop")}>Shop</button>
          <div style={{ display:"inline-flex", gap:8, alignItems:"center" }}>
            <button style={styles.navBtn} onClick={() => { setForestEnemyId("goblin"); setRoute("forest"); }}>Forest — Goblin</button>
            <button style={styles.navBtn} onClick={() => { setForestEnemyId("slime"); setRoute("forest"); }}>Forest — Slime</button>
          </div>
        </nav>
      </header>

      <main style={styles.main}>
        {route === "home" && <Home onGoToShop={() => setRoute("shop")} />}
        {route === "shop" && <ShopPlaceholder onBack={() => setRoute("home")} />}
        {route === "forest" && (
          <div style={{ width: "100%" }}>
            {/* Battle will auto-start with the chosen enemyId prop */}
            <Battle enemyId={forestEnemyId} />
          </div>
        )}
      </main>
    </div>
  );
}

/* basic styles */
const styles = {
  app: { fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif", maxWidth: 980, margin: "0 auto", padding: 16 },
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  nav: { display: "flex", gap: 8, alignItems: "center" },
  navBtn: { padding: "6px 10px", borderRadius: 8, border: "1px solid #d9d9d9", background:"#fafafa", cursor:"pointer" },
  main: { minHeight: 520 }
};
