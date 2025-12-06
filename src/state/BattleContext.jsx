// src/state/BattleContext.js
import { createContext, useContext } from "react";
import { useBattle } from "./useBattle.js";

const BattleContext = createContext(null);

export function BattleProvider({ children }) {
  const battle = useBattle(); // create ONE global battle engine instance
  return (
    <BattleContext.Provider value={battle}>
      {children}
    </BattleContext.Provider>
  );
}

export function useBattleContext() {
  const ctx = useContext(BattleContext);
  if (!ctx) {
    throw new Error("useBattleContext must be used inside <BattleProvider>");
  }
  return ctx;
}
