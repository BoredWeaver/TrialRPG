// src/engine/status/cooldowns.js
export function ensureCooldowns(entity) {
  if (!entity) return;
  if (!entity._cooldowns || typeof entity._cooldowns !== "object") {
    entity._cooldowns = {};
  }
}

export function tickCooldowns(entity) {
  ensureCooldowns(entity);
  if (!entity._cooldowns) return;
  for (const k of Object.keys(entity._cooldowns)) {
    const v = Number(entity._cooldowns[k]) || 0;
    if (v <= 1) {
      delete entity._cooldowns[k];
    } else {
      entity._cooldowns[k] = Math.max(0, Math.floor(v - 1));
    }
  }
}

export function setCooldown(entity, key, cd) {
  ensureCooldowns(entity);
  if (!entity._cooldowns) return;
  const n = Number(cd) | 0;
  if (n > 0) entity._cooldowns[String(key)] = n;
  else delete entity._cooldowns[String(key)];
}

export function getCooldown(entity, key) {
  if (!entity || !entity._cooldowns) return 0;
  return Number(entity._cooldowns[String(key)] || 0);
}

export function isOnCooldown(entity, key) {
  return getCooldown(entity, key) > 0;
}
