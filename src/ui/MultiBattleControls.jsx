// src/ui/MultiBattleControls.jsx
import React, { useState } from "react";
import { useBattleContext } from "../state/BattleContext.jsx";

/**
 * Tiny helper UI to start single or multi-enemy battles.
 * Usage: render <MultiBattleControls /> somewhere in your App header.
 */
export default function MultiBattleControls() {
  const bs = useBattleContext();
  const [text, setText] = useState("goblin,goblin"); // default temp multi
  const [preset, setPreset] = useState("");

  // parse CSV into trimmed ids
  function parseIds(input) {
    if (!input || typeof input !== "string") return [];
    return input.split(",").map(s => String(s).trim()).filter(Boolean);
  }

  function startSingle() {
    const ids = parseIds(text);
    // prefer first id, fallback to default in engine
    bs.startWithEnemy(ids[0] || "goblin");
  }

  function startMulti() {
    const ids = parseIds(text);
    if (ids.length === 0) {
      // fallback: start two goblins
      console.log("trying");
      bs.startWithEnemy(["goblin", "goblin"]);
    } else {
      bs.startWithEnemy(ids);
    }
  }

  // some helpful presets (adjust to your enemies.json keys)
  const presets = {
    "Two Goblins": "goblin,goblin",
    "Goblin + Orc": "goblin,orc",
    "Three Goblins": "goblin,goblin,goblin",
  };

  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12 }}>
      <input
        value={text}
        onChange={e => setText(e.target.value)}
        placeholder="comma-separated enemy ids e.g. goblin,orc"
        style={{ padding: "6px 8px", borderRadius: 6, border: "1px solid #ddd", minWidth: 260 }}
      />

      <select
        value={preset}
        onChange={(e) => {
          const v = e.target.value;
          setPreset(v);
          if (v) {
            setText(presets[v]);
            setPreset("");
          }
        }}
      >
        <option value="">Presets</option>
        {Object.keys(presets).map(k => <option key={k} value={k}>{k}</option>)}
      </select>

      <button onClick={startSingle} style={{ padding: "6px 10px", borderRadius: 6 }}>Start Single</button>
      <button onClick={startMulti} style={{ padding: "6px 10px", borderRadius: 6 }}>Start Multi</button>
    </div>
  );
}
