// src/state/dungeonUtils.js
// tiny PRNG + enemy generation utilities
// Mulberry32: small deterministic PRNG (32-bit)
export function mulberry32(seed) {
  let t = seed >>> 0;
  return function() {
    t += 0x6D2B79F5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

// Pick `n` elements with replacement from list, optionally weighted
function sampleWithReplacement(rnd, list, n = 1, weights = null) {
  if (!Array.isArray(list) || list.length === 0) return [];
  const out = [];
  if (!weights) {
    for (let i = 0; i < n; i++) {
      const idx = Math.floor(rnd() * list.length);
      out.push(list[idx]);
    }
    return out;
  }
  // weights expected same length as list, non-negative
  const cum = [];
  let total = 0;
  for (let i = 0; i < list.length; i++) {
    total += Math.max(0, Number(weights[i]) || 0);
    cum.push(total);
  }
  if (total <= 0) {
    return sampleWithReplacement(rnd, list, n, null);
  }
  for (let k = 0; k < n; k++) {
    const r = rnd() * total;
    let j = 0;
    while (j < cum.length && r >= cum[j]) j++;
    out.push(list[Math.min(j, list.length - 1)]);
  }
  return out;
}

/**
 * generateRoomEnemies(opts)
 * deterministic enemy composition for a tile
 */
export function generateRoomEnemies({
  dungeonKey = "default",
  seed = Date.now() & 0xffffffff,
  idx = 0,
  min = 2,
  max = 3,
  enemyList = ["goblin"],
  weights = null,
  allowRepeats = true,
  biasDepth = 0,
} = {}) {
  const rnd = mulberry32(Number(seed) ^ (Number(idx) << 2) ^ (Number(biasDepth) << 8));
  const count = Math.max(1, Math.floor(min + Math.floor(rnd() * (max - min + 1))));
  const chosen = sampleWithReplacement(rnd, enemyList, count, weights);
  if (!allowRepeats) {
    const set = new Set();
    const out = [];
    for (const id of chosen) {
      if (!set.has(id)) {
        set.add(id);
        out.push(id);
        if (out.length >= count) break;
      }
    }
    let i = 0;
    while (out.length < count && i < enemyList.length) {
      if (!set.has(enemyList[i])) {
        set.add(enemyList[i]);
        out.push(enemyList[i]);
      }
      i++;
    }
    return out.slice(0, count);
  }
  return chosen.slice(0, count);
}

/**
 * pickBossForDungeon(opts)
 * - If a dungeon definition object (def) is passed and contains a boss.id, it is used.
 * - Otherwise fall back to a provided bossList or a small default.
 *
 * Accepts:
 *  { dungeonKey, seed, def, bossList }
 */
export function pickBossForDungeon({ dungeonKey = "default", seed = Date.now(), def = null, bossList = null } = {}) {
  // 1) if a specific dungeon def is passed, prefer that boss id
  try {
    if (def && def.boss && def.boss.id) {
      return def.boss.id;
    }
  } catch (e) {
    // fallthrough to other logic
  }

  // 2) if a bossList was provided, use it deterministically
  const pool = Array.isArray(bossList) && bossList.length > 0
    ? bossList
    : ["orc_chief", "troll", "specter", "ice-spirit"];

  const rnd = mulberry32(Number(seed));
  const idx = Math.floor(rnd() * pool.length);
  return pool[idx] || pool[0];
}
