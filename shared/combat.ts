import { BALANCE } from "./balance.js";
import type { Combatant, StatusInstance } from "./types.js";

export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

export function effectiveDefenseValue(baseDefense: number, defending: boolean, recover: boolean, extra = 0): number {
  let d = baseDefense + extra;
  if (defending) d *= 2;
  if (recover) d *= 0.5;
  return d;
}

export function defenseReduction(effectiveDef: number): number {
  return Math.min(BALANCE.defenseCap, Math.max(0, effectiveDef * BALANCE.defensePerPoint));
}

export function directDamage(baseDamage: number, effectiveDef: number, ignoreFraction = 0): number {
  const used = effectiveDef * (1 - ignoreFraction);
  const reduced = baseDamage * (1 - defenseReduction(used));
  const rounded = Math.round(reduced);
  if (baseDamage > 0 && rounded < BALANCE.minDirectDamage) return BALANCE.minDirectDamage;
  return Math.max(0, rounded);
}

export function hasStatus(c: Combatant, id: StatusInstance["id"]): StatusInstance | undefined {
  return c.statuses.find((s) => s.id === id);
}

export function statusValue(c: Combatant, id: StatusInstance["id"]): number {
  return c.statuses.filter((s) => s.id === id).reduce((a, s) => a + (s.value ?? 0) + (s.stacks || 0), 0);
}

export function upsertStatus(c: Combatant, status: StatusInstance, stack = false) {
  const existing = c.statuses.find((s) => s.id === status.id);
  if (!existing) {
    c.statuses.push({ ...status });
    return;
  }
  if (stack && status.id === "bleed") {
    existing.stacks = Math.min(BALANCE.bleedMaxStacks, existing.stacks + status.stacks);
    existing.duration = Math.max(existing.duration, status.duration);
    return;
  }
  existing.duration = Math.max(existing.duration, status.duration);
  if (status.value != null) existing.value = Math.max(existing.value ?? 0, status.value);
  if (status.stacks) existing.stacks = Math.max(existing.stacks, status.stacks);
}

export function tickStatuses(c: Combatant): { poison: number; burn: number; bleed: number } {
  let poison = 0;
  let burn = 0;
  let bleed = 0;
  for (const s of c.statuses) {
    if (s.id === "poison") poison += BALANCE.poisonDamage;
    if (s.id === "burn") burn += BALANCE.burnDamage;
    if (s.id === "bleed") bleed += BALANCE.bleedDamage * Math.max(1, s.stacks);
  }
  c.statuses = c.statuses
    .map((s) => ({ ...s, duration: s.duration - 1 }))
    .filter((s) => s.duration > 0 && (s.id !== "shield" || (s.value ?? 0) > 0));
  return { poison, burn, bleed };
}

export function applyShield(c: Combatant, incoming: number): { taken: number; blocked: number } {
  const shield = c.statuses.find((s) => s.id === "shield");
  if (!shield || incoming <= 0) return { taken: incoming, blocked: 0 };
  const absorb = Math.min(shield.value ?? 0, incoming);
  shield.value = (shield.value ?? 0) - absorb;
  if ((shield.value ?? 0) <= 0) {
    c.statuses = c.statuses.filter((s) => s.id !== "shield");
  }
  return { taken: incoming - absorb, blocked: absorb };
}

export function spendEnergy(c: Combatant, amount: number): boolean {
  if (c.energy < amount) return false;
  c.energy = Math.max(0, c.energy - amount);
  return true;
}

export function addEnergy(c: Combatant, amount: number) {
  c.energy = clamp(c.energy + amount, 0, c.maxEnergy);
}

export function heal(c: Combatant, amount: number) {
  c.hp = clamp(c.hp + amount, 0, c.maxHp);
}

export function hurt(c: Combatant, amount: number) {
  c.hp = Math.max(0, c.hp - Math.max(0, amount));
  if (c.hp <= 0) c.eliminated = true;
}

export function attackStat(c: Combatant): number {
  let atk = c.attack;
  if (hasStatus(c, "weaken")) atk *= 1 - BALANCE.weakenAttackMod;
  if (hasStatus(c, "gorilla_power")) atk *= 1 + BALANCE.gorillaBuff;
  if (hasStatus(c, "damage_boost")) atk *= 1 + BALANCE.crateDamageBoost;
  if (hasStatus(c, "enemy_wither")) atk *= 1 - BALANCE.gorillaDebuff;
  return atk;
}

export function defenseStat(c: Combatant): number {
  let d = c.defense;
  const iron = hasStatus(c, "iron_hide");
  if (iron) d += 4;
  const armor = hasStatus(c, "armor_loot");
  if (armor) d += BALANCE.crateArmor;
  const brk = hasStatus(c, "armor_break");
  if (brk) d -= BALANCE.armorBreakAmount;
  return d;
}

export function markedMultiplier(target: Combatant): number {
  return hasStatus(target, "marked") ? 1 + BALANCE.markedBonus : 1;
}
