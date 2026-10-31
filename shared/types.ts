export const ANIMAL_IDS = [
  "elephant",
  "hippo",
  "bear",
  "rhino",
  "gorilla",
  "lion",
  "crocodile",
  "tiger",
  "wolf",
  "shark",
  "python",
  "scorpion",
  "octopus",
  "bat",
  "cheetah",
  "eagle",
  "fox",
  "cobra",
  "parrot",
  "bee",
] as const;

export type AnimalId = (typeof ANIMAL_IDS)[number];

export type Role = "tank" | "bruiser" | "control" | "skirmisher";

export type AnimalTag =
  | "mammal"
  | "reptile"
  | "bird"
  | "insect"
  | "aquatic"
  | "cat"
  | "canine"
  | "snake"
  | "pachyderm"
  | "primate";

export type Terrain = "forest" | "swamp" | "cliff" | "river" | "center";

export type Weather = "clear" | "storm" | "fog" | "drought";

export type ActionType =
  | "quick"
  | "heavy"
  | "defend"
  | "recover"
  | "special"
  | "grab_crate"
  | "move"
  | "last_stand";

export type GameMode =
  | "classic"
  | "team"
  | "koth"
  | "speed"
  | "boss"
  | "draft"
  | "time";

export type StatusId =
  | "poison"
  | "burn"
  | "bleed"
  | "stun"
  | "weaken"
  | "shield"
  | "armor_break"
  | "marked"
  | "bound"
  | "damage_boost"
  | "armor_loot"
  | "gorilla_power"
  | "enemy_wither"
  | "iron_hide"
  | "kings_aura"
  | "ink_cloud"
  | "sky_dive"
  | "trickster"
  | "territorial"
  | "sprint"
  | "no_ally";

export type LootId = "health_pack" | "energy_cell" | "damage_boost" | "armor" | "trap";

export type MatchPhase =
  | "lobby"
  | "draft"
  | "select"
  | "locked"
  | "resolving"
  | "recap"
  | "ended";

export type RoomStatus = "lobby" | "starting" | "in_match" | "ended" | "closed";

export interface AnimalDefinition {
  id: AnimalId;
  name: string;
  role: Role;
  hp: number;
  attack: number;
  defense: number;
  speed: number;
  startingEnergy: number;
  special: string;
  specialDescription: string;
  energyCost: number;
  cooldown: number;
  tags: AnimalTag[];
  strengths: string;
  weaknesses: string;
  evolution: string;
  accent: string;
}

export interface StatusInstance {
  id: StatusId;
  duration: number;
  stacks: number;
  sourceId?: string;
  value?: number;
}

export interface InventoryItem {
  id: LootId;
  charges: number;
}

export interface SubmittedAction {
  actionId: string;
  playerId: string;
  type: ActionType;
  targetId?: string;
  zone?: Terrain;
  locked: boolean;
  submittedAt: number;
}

export interface PublicActionView {
  playerId: string;
  type?: ActionType;
  targetId?: string;
  zone?: Terrain;
  hidden: boolean;
}

export interface Combatant {
  playerId: string;
  nickname: string;
  animalId: AnimalId;
  teamId?: "a" | "b" | "boss";
  isBoss?: boolean;
  hp: number;
  maxHp: number;
  energy: number;
  maxEnergy: number;
  attack: number;
  defense: number;
  speed: number;
  zone: Terrain;
  statuses: StatusInstance[];
  cooldown: number;
  kills: number;
  damageDealt: number;
  damageTaken: number;
  specialsUsed: number;
  roundsSurvived: number;
  evolved: boolean;
  items: InventoryItem[];
  trapArmed: boolean;
  lastStandUsed: boolean;
  eliminated: boolean;
  placement?: number;
  consecutiveBee: number;
  stunnedLastRound: boolean;
  ready: boolean;
}

export interface Alliance {
  a: string;
  b: string;
  active: boolean;
  offeredBy?: string;
}

export interface LogLine {
  id: string;
  round: number;
  kind:
    | "action"
    | "damage"
    | "heal"
    | "status"
    | "loot"
    | "zone"
    | "elim"
    | "system"
    | "weather"
    | "alliance"
    | "evolve"
    | "bounty";
  text: string;
  privateTo?: string[];
}

export interface RoundRecap {
  round: number;
  lines: LogLine[];
  actions: PublicActionView[];
  crateWinnerId?: string;
  crateItem?: LootId;
  eliminations: string[];
  weather: Weather;
}

export interface BossState {
  kind: "mammoth" | "trex";
  playerId: string;
}

export interface MatchState {
  id: string;
  roomId: string;
  mode: GameMode;
  teamSize: 2 | 4 | 0;
  round: number;
  phase: MatchPhase;
  decisionEndsAt: number;
  matchEndsAt?: number;
  timeLimitSeconds?: number;
  weather: Weather;
  weatherEndsRound: number;
  crateZone: Terrain;
  crateAvailable: boolean;
  lastSpecial?: { playerId: string; animalId: AnimalId };
  bountyPlayerId?: string;
  koth: Record<string, number>;
  kothTarget: number;
  boss?: BossState;
  seed: number;
  rngState: number;
  combatants: Combatant[];
  alliances: Alliance[];
  log: LogLine[];
  recap?: RoundRecap;
  winnerIds: string[];
  result: "none" | "winner" | "draw" | "team" | "boss_win" | "boss_fail";
  uniqueAnimals: boolean;
  decisionSeconds: number;
  spectatorsAllowed: boolean;
}

export interface RoomSettings {
  mode: GameMode;
  maxPlayers: number;
  minPlayers: number;
  spectatorsAllowed: boolean;
  isPrivate: boolean;
  uniqueAnimals: boolean;
  teamSize: 2 | 4 | 0;
  decisionSeconds: number;
  timeLimitSeconds: number;
  bossKind: "mammoth" | "trex";
}

export interface RoomMember {
  playerId: string;
  nickname: string;
  isHost: boolean;
  isSpectator: boolean;
  ready: boolean;
  animalId?: AnimalId;
  teamId?: "a" | "b";
  connected: boolean;
  lastSeen: number;
}

export interface ChatMessage {
  id: string;
  playerId: string;
  nickname: string;
  text: string;
  at: number;
  channel: "lobby" | "match" | "spectator";
  emote?: string;
}

export interface RoomState {
  id: string;
  code: string;
  hostId: string;
  status: RoomStatus;
  settings: RoomSettings;
  members: RoomMember[];
  matchId?: string;
  createdAt: number;
  lastActivity: number;
  chat: ChatMessage[];
}

export interface ProfileStats {
  matchesPlayed: number;
  wins: number;
  losses: number;
  kills: number;
  damageDealt: number;
  damageTaken: number;
  specialsUsed: number;
  roundsSurvived: number;
  bestPlacement: number;
  winStreak: number;
  bestWinStreak: number;
  xp: number;
  level: number;
  cosmetics: string[];
  equippedFrame: string;
  equippedTitle: string;
}

export interface PlayerProfile {
  id: string;
  nickname: string;
  isGuest: boolean;
  email?: string;
  stats: ProfileStats;
  challengeDate: string;
  challenges: DailyChallenge[];
  createdAt: number;
}

export interface DailyChallenge {
  id: string;
  title: string;
  metric: "wins" | "kills" | "specials" | "survive";
  target: number;
  progress: number;
  xp: number;
  completed: boolean;
}

export interface LeaderboardRow {
  playerId: string;
  nickname: string;
  wins: number;
  kills: number;
  xp: number;
  level: number;
}

export interface ClientMatchView {
  match: MatchState;
  myId: string;
  privateAction?: SubmittedAction;
  echoReveal?: PublicActionView;
  allyMoves: PublicActionView[];
  hiddenHp: string[];
  hiddenMoves: string[];
}
