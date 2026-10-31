import type { Terrain } from "./types.js";

/** Centralized tunables. Rulebook numbers live here when unspecified. */
export const BALANCE = {
  energyMax: 100,
  energyRegen: 10,
  recoverHp: 15,
  recoverEnergy: 20,
  heavyCost: 20,
  heavyMultiplier: 1.4,
  quickMultiplier: 0.8,
  defensePerPoint: 0.04,
  defenseCap: 0.6,
  minDirectDamage: 1,

  poisonDamage: 8,
  poisonDuration: 3,
  burnDamage: 6,
  burnDuration: 3,
  bleedDamage: 5,
  bleedMaxStacks: 3,
  bleedDuration: 3,
  stunDuration: 1,
  weakenAttackMod: 0.2,
  weakenDuration: 2,
  shieldAbsorb: 20,
  armorBreakAmount: 3,
  armorBreakDuration: 2,
  markedBonus: 0.2,
  markedDuration: 2,
  boundDuration: 1,

  betrayalBonus: 0.25,
  bountyEnergy: 30,
  bountyHp: 10,

  crateHealthPack: 30,
  crateEnergy: 40,
  crateDamageBoost: 0.25,
  crateDamageBoostDuration: 2,
  crateArmor: 2,
  crateArmorDuration: 3,
  trapDamage: 20,

  kothPointsToWin: 12,
  kothCenterPoints: 2,
  weatherEveryNRounds: 3,
  weatherDuration: 2,

  decisionTimerClassic: 10,
  decisionTimerSpeed: 5,
  recapSeconds: 5,

  evolutionKills: 3,
  evolutionRounds: 5,

  forestDefense: 1,
  swampSpeedPenalty: 2,
  swampBonus: 0.1,
  cliffDefensePenalty: 1,
  eagleCliffEvade: 0.35,
  riverHeal: 5,
  riverBonus: 0.1,
  centerCrateWeight: 40,

  roleBonus: 0.08,
  eagleVsSnake: 0.1,
  catVsBird: 0.1,
  canineVsMammal: 0.08,
  birdVsInsect: 0.1,

  stampedeMultiplier: 0.6,
  gorillaBuff: 0.25,
  gorillaDebuff: 0.15,
  gorillaDuration: 2,
  lionDamageReduction: 0.2,
  rhinoIgnoreDefense: 0.5,
  rhinoRecoil: 0.25,
  rhinoMultiplier: 1.65,
  wolfExecuteThreshold: 0.4,
  wolfExecuteBonus: 0.35,
  sharkMaxBonus: 0.55,
  pythonDot: 6,
  pythonDotDuration: 2,
  scorpionStunChance: 0.4,
  scorpionDamageMult: 1.1,
  eagleEvade: 0.4,
  eagleCounter: 0.6,
  foxEvade: 0.35,
  foxDecoyChance: 0.4,
  tigerPounce: 1.85,
  crocodileRoll: 1.7,
  hippoCounter: 0.55,
  stingArmor: true,
  beeSwarmMult: 0.55,
  beeSelfDamage: 10,
  beeOveruseAfter: 2,
  inkDuration: 1,
  skyDiveDuration: 1,
  sprintEvade: 0.25,
  mimicDiscount: 0.1,
  evolvedDamageBonus: 0.15,
  evolvedCostDiscount: 5,

  xp: {
    participation: 40,
    win: 120,
    draw: 60,
    kill: 25,
    damagePer10: 1,
    surviveRound: 8,
    challenge: 50,
  },
  levelXpBase: 120,

  boss: {
    mammoth: { hp: 820, attack: 30, defense: 10, speed: 3, name: "Mammoth Colossus" },
    trex: { hp: 740, attack: 36, defense: 7, speed: 5, name: "Tyrant Rex" },
  },
  bossFailRound: 16,

  roomIdleMs: 45 * 60 * 1000,
  nicknameMax: 18,
  nicknameMin: 2,
  maxPlayers: 8,
  minPlayers: 2,
} as const;

export const ZONE_SCHEDULE = [
  { from: 1, to: 4, safe: ["forest", "swamp", "cliff", "river", "center"] as Terrain[], damage: 0 },
  { from: 5, to: 7, safe: ["swamp", "cliff", "river", "center"] as Terrain[], damage: 10 },
  { from: 8, to: 10, safe: ["river", "center"] as Terrain[], damage: 15 },
  { from: 11, to: 999, safe: ["center"] as Terrain[], damage: 20 },
] as const;

export function zoneInfo(round: number) {
  return ZONE_SCHEDULE.find((z) => round >= z.from && round <= z.to) ?? ZONE_SCHEDULE[ZONE_SCHEDULE.length - 1];
}

export function xpForLevel(level: number): number {
  return Math.floor(BALANCE.levelXpBase * Math.pow(1.35, Math.max(0, level - 1)));
}

export const COSMETICS = [
  { id: "frame_thorn", name: "Thorn Frame", xp: 0, kind: "frame" },
  { id: "frame_gold", name: "Gold Mane Frame", xp: 300, kind: "frame" },
  { id: "frame_obsidian", name: "Obsidian Frame", xp: 900, kind: "frame" },
  { id: "title_cub", name: "Cub", xp: 0, kind: "title" },
  { id: "title_hunter", name: "Pack Hunter", xp: 250, kind: "title" },
  { id: "title_apex", name: "Apex Contender", xp: 800, kind: "title" },
  { id: "title_sovereign", name: "Arena Sovereign", xp: 1800, kind: "title" },
] as const;

export const EMOTES = [
  { id: "roar", label: "Roar", glyph: "🦁" },
  { id: "stomp", label: "Stomp", glyph: "🐘" },
  { id: "howl", label: "Howl", glyph: "🐺" },
  { id: "salute", label: "Salute", glyph: "🦅" },
  { id: "gg", label: "GG", glyph: "✨" },
  { id: "trap", label: "Nice trap", glyph: "🦂" },
] as const;
