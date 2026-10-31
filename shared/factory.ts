import { ANIMALS } from "./animals.js";
import { BALANCE } from "./balance.js";
import { mulberry32, shuffle } from "./rng.js";
import type {
  AnimalId,
  Combatant,
  GameMode,
  MatchState,
  RoomSettings,
  Terrain,
} from "./types.js";

export function createCombatant(
  playerId: string,
  nickname: string,
  animalId: AnimalId,
  extras: Partial<Combatant> = {},
): Combatant {
  const a = ANIMALS[animalId];
  return {
    playerId,
    nickname,
    animalId,
    hp: a.hp,
    maxHp: a.hp,
    energy: a.startingEnergy,
    maxEnergy: BALANCE.energyMax,
    attack: a.attack,
    defense: a.defense,
    speed: a.speed,
    zone: "center",
    statuses: [],
    cooldown: 0,
    kills: 0,
    damageDealt: 0,
    damageTaken: 0,
    specialsUsed: 0,
    roundsSurvived: 0,
    evolved: false,
    items: [],
    trapArmed: false,
    lastStandUsed: false,
    eliminated: false,
    consecutiveBee: 0,
    stunnedLastRound: false,
    ready: false,
    ...extras,
  };
}

export function createBoss(kind: "mammoth" | "trex"): Combatant {
  const b = BALANCE.boss[kind];
  return createCombatant("boss", b.name, kind === "mammoth" ? "elephant" : "tiger", {
    isBoss: true,
    teamId: "boss",
    hp: b.hp,
    maxHp: b.hp,
    attack: b.attack,
    defense: b.defense,
    speed: b.speed,
    zone: "center",
  });
}

export function modeDefaults(mode: GameMode): Partial<RoomSettings> {
  if (mode === "speed") return { decisionSeconds: BALANCE.decisionTimerSpeed, uniqueAnimals: true, minPlayers: 2 };
  if (mode === "team") return { teamSize: 2, minPlayers: 4, maxPlayers: 8, uniqueAnimals: true };
  if (mode === "boss") return { minPlayers: 2, uniqueAnimals: false };
  if (mode === "draft") return { uniqueAnimals: true, minPlayers: 2 };
  if (mode === "koth") return { minPlayers: 2, uniqueAnimals: true };
  if (mode === "time") return { decisionSeconds: BALANCE.decisionTimerClassic, timeLimitSeconds: 300, uniqueAnimals: true, minPlayers: 2 };
  return { decisionSeconds: BALANCE.decisionTimerClassic, uniqueAnimals: true, minPlayers: 2 };
}

export function draftAnimals(count: number, seed: number): AnimalId[] {
  const ids = shuffle(Object.keys(ANIMALS) as AnimalId[], mulberry32(seed));
  return ids.slice(0, count);
}

const TERRAINS: Terrain[] = ["forest", "swamp", "cliff", "river", "center"];

export function pickCrateZone(rand: () => number): Terrain {
  const weights = TERRAINS.map((t) => (t === "center" ? BALANCE.centerCrateWeight : 15));
  const total = weights.reduce((a, b) => a + b, 0);
  let r = rand() * total;
  for (let i = 0; i < TERRAINS.length; i++) {
    r -= weights[i];
    if (r <= 0) return TERRAINS[i];
  }
  return "center";
}

export function newMatch(input: {
  id: string;
  roomId: string;
  mode: GameMode;
  teamSize: 2 | 4 | 0;
  uniqueAnimals: boolean;
  decisionSeconds: number;
  timeLimitSeconds?: number;
  spectatorsAllowed: boolean;
  combatants: Combatant[];
  seed: number;
  bossKind?: "mammoth" | "trex";
}): MatchState {
  const combatants = [...input.combatants];
  let boss: MatchState["boss"];
  if (input.mode === "boss") {
    const b = createBoss(input.bossKind ?? "mammoth");
    combatants.push(b);
    boss = { kind: input.bossKind ?? "mammoth", playerId: b.playerId };
  }
  return {
    id: input.id,
    roomId: input.roomId,
    mode: input.mode,
    teamSize: input.teamSize,
    round: 1,
    phase: "select",
    decisionEndsAt: Date.now() + input.decisionSeconds * 1000,
    matchEndsAt: input.timeLimitSeconds ? Date.now() + input.timeLimitSeconds * 1000 : undefined,
    timeLimitSeconds: input.timeLimitSeconds,
    weather: "clear",
    weatherEndsRound: 0,
    crateZone: "center",
    crateAvailable: true,
    bountyPlayerId: undefined,
    koth: {},
    kothTarget: BALANCE.kothPointsToWin,
    boss,
    seed: input.seed,
    rngState: input.seed,
    combatants,
    alliances: [],
    log: [],
    winnerIds: [],
    result: "none",
    uniqueAnimals: input.uniqueAnimals,
    decisionSeconds: input.decisionSeconds,
    spectatorsAllowed: input.spectatorsAllowed,
  };
}
