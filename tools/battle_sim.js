// tools/battle_sim.js
// Usage: node tools/battle_sim.js [iterations] [enemyId]
// Example: node tools/battle_sim.js 1000 slime

import path from "path";
import url from "url";
import fs from "fs/promises";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

const ORIG_ENGINE_PATH = path.resolve(__dirname, "../src/engine/engine.js");
const TEMP_ENGINE_FILENAME = "engine_sim.mjs";
const TEMP_ENGINE_PATH = path.resolve(path.dirname(ORIG_ENGINE_PATH), TEMP_ENGINE_FILENAME);

/**
 * Read original engine.js and produce a temporary ESM module where JSON imports are
 * replaced by inlined `const <ident> = <json literal>;` declarations.
 */
async function makeTempEngineCopyInlineJson() {
  let src = await fs.readFile(ORIG_ENGINE_PATH, "utf8");

  // Regex to match default-import-from-json:
  //   import playerBase from "../db/player.json";
  // Captures identifier in group 1 and path in group 2.
  // Accepts single or double quotes and optional semicolon.
  const jsonImportRe = /import\s+([A-Za-z0-9_$]+)\s+from\s+(['"])(.+?\.json)\2\s*;?/g;

  // We'll collect replaced variables so we can inline each JSON once.
  const replacements = [];
  let m;
  const seenPaths = new Map();

  // Gather matches
  while ((m = jsonImportRe.exec(src)) !== null) {
    const ident = m[1];
    let relPath = m[3]; // as written in import, e.g. ../db/player.json
    const importSpan = m[0];
    const startIndex = m.index;
    const endIndex = jsonImportRe.lastIndex;

    // Resolve the JSON absolute path relative to engine.js file
    const engineDir = path.dirname(ORIG_ENGINE_PATH);
    const absJsonPath = path.resolve(engineDir, relPath);

    // Avoid duplicate inlining if same file imported multiple times with different idents
    if (!seenPaths.has(absJsonPath)) {
      seenPaths.set(absJsonPath, []);
    }
    seenPaths.get(absJsonPath).push({ ident, importSpan, startIndex, endIndex });
  }

  // Create an array of inlined declarations (we'll replace imports later)
  // We'll iterate over seenPaths and read JSON contents.
  for (const [absJsonPath, usages] of seenPaths.entries()) {
    // read json file
    let jsonText;
    try {
      jsonText = await fs.readFile(absJsonPath, "utf8");
    } catch (err) {
      throw new Error(`Failed to read JSON file for inlining: ${absJsonPath} — ${err.message}`);
    }

    // Parse to ensure valid JSON, then stringify compactly to embed
    let parsed;
    try {
      parsed = JSON.parse(jsonText);
    } catch (err) {
      throw new Error(`Invalid JSON in ${absJsonPath}: ${err.message}`);
    }

    const literal = JSON.stringify(parsed);

    // For each usage (could be imported with different identifiers), create const declarations.
    for (const u of usages) {
      // The identifier the original import used
      const ident = u.ident;
      replacements.push({
        // replace the first occurrence of that import statement text with a const declaration
        // We'll perform a safe textual replacement below by searching for the exact import text.
        importText: u.importSpan,
        replacementText: `const ${ident} = ${literal};`,
      });
    }
  }

  // Apply replacements: replace each import occurrence with its corresponding const literal.
  // Because importText may not be unique if whitespace differs, we replace by searching for the pattern
  // captured earlier. We'll replace occurrences one by one to avoid accidental duplicates.
  let patched = src;
  for (const r of replacements) {
    const idx = patched.indexOf(r.importText);
    if (idx === -1) {
      // fallback: try a relaxed match for the import line (identifier + .json)
      const relaxedRe = new RegExp(`import\\s+${r.replacementText.split(" ")[1]}\\s+from\\s+['"][^'"]+?\\.json['"];?`);
      patched = patched.replace(relaxedRe, r.replacementText);
    } else {
      // replace only the first occurrence (should match one-to-one)
      patched = patched.slice(0, idx) + r.replacementText + patched.slice(idx + r.importText.length);
    }
  }

  // Write out the temporary module
  await fs.writeFile(TEMP_ENGINE_PATH, patched, "utf8");

  return url.pathToFileURL(TEMP_ENGINE_PATH).href;
}

async function cleanupTempEngine() {
  try {
    await fs.unlink(TEMP_ENGINE_PATH);
  } catch (e) {
    // ignore
  }
}

function tailLog(state) {
  const log = Array.isArray(state.log) ? state.log : [];
  return log[log.length - 1] || "";
}

function simulateOneBattle(startBattleFn, playerAttackFn, enemyActFn, enemyId, maxTurns = 1000) {
  const state = startBattleFn(enemyId);
  let turns = 0;
  let playerDamageTaken = 0;
  let totalHits = 0;
  let totalCrits = 0;
  let totalDamageDealt = 0;

  while (!state.over && turns < maxTurns) {
    if (state.turn === "player") {
      playerAttackFn(state); // always basic attack
      const last = tailLog(state);
      if (/for \d+ .*damage/.test(last)) {
        const m = last.match(/for (\d+)[^\d]/);
        if (m) {
          const dmg = Number(m[1]);
          totalDamageDealt += dmg;
          totalHits += 1;
          if (last.includes("CRIT")) totalCrits += 1;
        }
      }
    } else if (state.turn === "enemy") {
      const before = state.player.hp;
      enemyActFn(state);
      const after = state.player.hp;
      const dmgTaken = Math.max(0, before - after);
      playerDamageTaken += dmgTaken;
    } else {
      break;
    }
    turns += 1;
    if (turns >= maxTurns) break;
  }

  return {
    result: state.result || (state.player.hp > 0 ? "win" : "loss"),
    turns,
    playerHpRemaining: state.player.hp,
    playerDamageTaken,
    totalHits,
    totalCrits,
    totalDamageDealt,
  };
}

async function runSim(iterations = 500, enemyId = "slime") {
  const tempModuleUrl = await makeTempEngineCopyInlineJson();

  let mod;
  try {
    mod = await import(tempModuleUrl);
  } catch (err) {
    await cleanupTempEngine();
    throw err;
  }

  const { startBattle, playerAttack, enemyAct } = mod;
  if (typeof startBattle !== "function" || typeof playerAttack !== "function" || typeof enemyAct !== "function") {
    await cleanupTempEngine();
    throw new Error("Patched engine module did not export expected functions.");
  }

  iterations = Number(iterations) || 500;
  console.log(`Simulating ${iterations} battles vs "${enemyId}" — player uses basic attack only.`);

  let wins = 0;
  let losses = 0;
  let sumTurns = 0;
  let sumPlayerDamageTaken = 0;
  let sumHits = 0;
  let sumCrits = 0;
  let sumDamageDealt = 0;

  const start = Date.now();
  for (let i = 0; i < iterations; i++) {
    const res = simulateOneBattle(startBattle, playerAttack, enemyAct, enemyId, 500);
    if (res.result === "win") wins++; else losses++;
    sumTurns += res.turns;
    sumPlayerDamageTaken += res.playerDamageTaken;
    sumHits += res.totalHits;
    sumCrits += res.totalCrits;
    sumDamageDealt += res.totalDamageDealt;

    if (iterations >= 50 && (i % Math.max(1, Math.floor(iterations / 10))) === 0) {
      process.stdout.write(`\rProgress: ${Math.round((i / iterations) * 100)}%`);
    }
  }
  const ms = Date.now() - start;
  process.stdout.write("\r"); // clear progress

  const avgTurns = sumTurns / iterations;
  const avgDamageTaken = sumPlayerDamageTaken / iterations;
  const avgHitsPerBattle = sumHits / iterations;
  const avgCritRate = sumHits === 0 ? 0 : (sumCrits / sumHits);
  const avgDamagePerHit = sumHits === 0 ? 0 : (sumDamageDealt / sumHits);
  const winRate = (wins / iterations) * 100;

  console.log("=== Simulation results ===");
  console.log(`Iterations:        ${iterations}`);
  console.log(`Enemy:             ${enemyId}`);
  console.log(`Time:              ${ms} ms`);
  console.log(`Wins:              ${wins}`);
  console.log(`Losses:            ${losses}`);
  console.log(`Win rate:          ${winRate.toFixed(2)}%`);
  console.log(`Avg turns:         ${avgTurns.toFixed(2)}`);
  console.log(`Avg hits/battle:   ${avgHitsPerBattle.toFixed(2)}`);
  console.log(`Avg crit rate:     ${(avgCritRate * 100).toFixed(2)}% (observed)`);
  console.log(`Avg dmg/hit:       ${avgDamagePerHit.toFixed(2)}`);
  console.log(`Avg dmg taken:     ${avgDamageTaken.toFixed(2)}`);
  console.log("===========================");

  await cleanupTempEngine();
}

// CLI args
const argv = process.argv.slice(2);
const iterations = argv[0] ? Number(argv[0]) : 500;
const enemyId = argv[1] ? String(argv[1]) : "slime";

runSim(iterations, enemyId).catch(err => {
  console.error("Simulation failed:", err);
  process.exit(1);
});
