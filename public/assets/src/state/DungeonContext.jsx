// src/state/DungeonContext.jsx
import { createContext, useContext } from "react";
import useDungeon from "./useDungeon.js";

const DungeonContext = createContext(null);

export function DungeonProvider({ children }) {
  const dungeon = useDungeon(); // single global dungeon instance
  return (
    <DungeonContext.Provider value={dungeon}>
      {children}
    </DungeonContext.Provider>
  );
}

export function useDungeonContext() {
  const ctx = useContext(DungeonContext);
  if (!ctx) throw new Error("useDungeonContext must be inside <DungeonProvider>");
  return ctx;
}
