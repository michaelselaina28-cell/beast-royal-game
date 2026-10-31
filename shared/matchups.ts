import { ANIMALS } from "./animals.js";
import { BALANCE } from "./balance.js";
import type { AnimalId, Combatant, Role } from "./types.js";

const ROLE_BEATS: Record<Role, Role> = {
  tank: "skirmisher",
  control: "tank",
  skirmisher: "control",
  bruiser: "bruiser",
};

export function roleBonus(attacker: Combatant, defender: Combatant): number {
  const a = ANIMALS[attacker.animalId];
  const d = ANIMALS[defender.animalId];
  if (ROLE_BEATS[a.role] === d.role) return BALANCE.roleBonus;
  return 0;
}

export function predatorBonus(attacker: Combatant, defender: Combatant): number {
  const a = ANIMALS[attacker.animalId];
  const d = ANIMALS[defender.animalId];
  let b = 0;
  if (a.tags.includes("bird") && d.tags.includes("snake")) b += BALANCE.eagleVsSnake;
  if (a.tags.includes("cat") && d.tags.includes("bird")) b += BALANCE.catVsBird;
  if (a.tags.includes("canine") && d.tags.includes("mammal") && !a.tags.includes("cat")) b += BALANCE.canineVsMammal;
  if (a.tags.includes("bird") && d.tags.includes("insect")) b += BALANCE.birdVsInsect;
  return b;
}

export function matchupLabel(id: AnimalId): { beats: string; loses: string } {
  const role = ANIMALS[id].role;
  if (role === "tank") return { beats: "Skirmishers", loses: "Control" };
  if (role === "control") return { beats: "Tanks", loses: "Skirmishers" };
  if (role === "skirmisher") return { beats: "Control", loses: "Tanks" };
  return { beats: "Wounded prey", loses: "Sustained control" };
}
