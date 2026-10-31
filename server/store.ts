import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { BALANCE, COSMETICS, xpForLevel } from "../shared/balance.js";
import type { DailyChallenge, LeaderboardRow, PlayerProfile, ProfileStats } from "../shared/types.js";
import { newId } from "./token.js";

export interface MatchRecord {
  id: string;
  mode: string;
  endedAt: number;
  winnerIds: string[];
  result: string;
  players: Array<{
    playerId: string;
    nickname: string;
    animalId: string;
    kills: number;
    damageDealt: number;
    placement?: number;
    xp: number;
  }>;
}

interface DiskState {
  profiles: Record<string, PlayerProfile>;
  matches: MatchRecord[];
  accounts: Record<string, { passwordHash: string; playerId: string }>;
}

const dataDir = process.env.DATA_DIR || "./data";
const file = join(dataDir, "store.json");

let state: DiskState = { profiles: {}, matches: [], accounts: {} };

function blankStats(): ProfileStats {
  return {
    matchesPlayed: 0,
    wins: 0,
    losses: 0,
    kills: 0,
    damageDealt: 0,
    damageTaken: 0,
    specialsUsed: 0,
    roundsSurvived: 0,
    bestPlacement: 99,
    winStreak: 0,
    bestWinStreak: 0,
    xp: 0,
    level: 1,
    cosmetics: ["frame_thorn", "title_cub"],
    equippedFrame: "frame_thorn",
    equippedTitle: "title_cub",
  };
}

export function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

export function makeChallenges(date: string): DailyChallenge[] {
  const seed = date.split("-").join("");
  const n = Number(seed) % 3;
  const pool: DailyChallenge[] = [
    { id: `${date}-win`, title: "Win a clash", metric: "wins", target: 1, progress: 0, xp: 60, completed: false },
    { id: `${date}-kills`, title: "Score 5 eliminations", metric: "kills", target: 5, progress: 0, xp: 50, completed: false },
    { id: `${date}-specials`, title: "Unleash 4 specials", metric: "specials", target: 4, progress: 0, xp: 40, completed: false },
    { id: `${date}-survive`, title: "Survive 8 rounds in one match", metric: "survive", target: 8, progress: 0, xp: 50, completed: false },
  ];
  return [pool[n], pool[(n + 1) % pool.length], pool[(n + 2) % pool.length]];
}

export function loadStore() {
  try {
    mkdirSync(dirname(file), { recursive: true });
    state = JSON.parse(readFileSync(file, "utf8")) as DiskState;
  } catch {
    mkdirSync(dataDir, { recursive: true });
    persist();
  }
}

let persistTimer: ReturnType<typeof setTimeout> | null = null;
export function persist() {
  mkdirSync(dataDir, { recursive: true });
  writeFileSync(file, JSON.stringify(state, null, 0));
}

function schedulePersist() {
  if (persistTimer) return;
  persistTimer = setTimeout(() => {
    persistTimer = null;
    persist();
  }, 400);
}

export function getOrCreateProfile(id: string, nickname: string, isGuest: boolean): PlayerProfile {
  let p = state.profiles[id];
  if (!p) {
    p = {
      id,
      nickname,
      isGuest,
      stats: blankStats(),
      challengeDate: todayUtc(),
      challenges: makeChallenges(todayUtc()),
      createdAt: Date.now(),
    };
    state.profiles[id] = p;
    schedulePersist();
  } else if (p.challengeDate !== todayUtc()) {
    p.challengeDate = todayUtc();
    p.challenges = makeChallenges(todayUtc());
    schedulePersist();
  }
  return p;
}

export function updateNickname(id: string, nickname: string) {
  const p = state.profiles[id];
  if (p) {
    p.nickname = nickname;
    schedulePersist();
  }
}

export function applyMatchStats(
  playerId: string,
  input: {
    won: boolean;
    draw: boolean;
    kills: number;
    damageDealt: number;
    damageTaken: number;
    specialsUsed: number;
    roundsSurvived: number;
    placement: number;
    xp: number;
    matchId: string;
  },
) {
  const p = state.profiles[playerId];
  if (!p) return;
  const key = `awarded:${input.matchId}:${playerId}`;
  if ((p as unknown as { _awarded?: string[] })._awarded?.includes(key)) return;
  const bag = p as unknown as { _awarded?: string[] };
  bag._awarded = bag._awarded ?? [];
  bag._awarded.push(key);

  const s = p.stats;
  s.matchesPlayed += 1;
  s.kills += input.kills;
  s.damageDealt += input.damageDealt;
  s.damageTaken += input.damageTaken;
  s.specialsUsed += input.specialsUsed;
  s.roundsSurvived += input.roundsSurvived;
  s.bestPlacement = Math.min(s.bestPlacement, input.placement);
  if (input.won) {
    s.wins += 1;
    s.winStreak += 1;
    s.bestWinStreak = Math.max(s.bestWinStreak, s.winStreak);
  } else if (!input.draw) {
    s.losses += 1;
    s.winStreak = 0;
  }
  s.xp += input.xp;
  while (s.xp >= xpForLevel(s.level + 1)) {
    s.level += 1;
  }
  for (const c of COSMETICS) {
    if (s.xp >= c.xp && !s.cosmetics.includes(c.id)) s.cosmetics.push(c.id);
  }
  for (const ch of p.challenges) {
    if (ch.completed) continue;
    if (ch.metric === "wins" && input.won) ch.progress += 1;
    if (ch.metric === "kills") ch.progress += input.kills;
    if (ch.metric === "specials") ch.progress += input.specialsUsed;
    if (ch.metric === "survive") ch.progress = Math.max(ch.progress, input.roundsSurvived);
    if (ch.progress >= ch.target) {
      ch.completed = true;
      s.xp += ch.xp + BALANCE.xp.challenge;
    }
  }
  schedulePersist();
}

export function saveMatch(rec: MatchRecord) {
  state.matches.unshift(rec);
  state.matches = state.matches.slice(0, 200);
  schedulePersist();
}

export function leaderboard(sort: "wins" | "kills" | "xp"): LeaderboardRow[] {
  const rows = Object.values(state.profiles)
    .filter((p) => !p.isGuest && p.stats.matchesPlayed > 0)
    .map((p) => ({
      playerId: p.id,
      nickname: p.nickname,
      wins: p.stats.wins,
      kills: p.stats.kills,
      xp: p.stats.xp,
      level: p.stats.level,
    }));
  rows.sort((a, b) => b[sort] - a[sort] || b.xp - a.xp);
  return rows.slice(0, 50);
}

export function getProfile(id: string): PlayerProfile | undefined {
  return state.profiles[id];
}

export function registerAccount(username: string, passwordHash: string, playerId: string) {
  state.accounts[username.toLowerCase()] = { passwordHash, playerId };
  schedulePersist();
}

export function findAccount(username: string) {
  return state.accounts[username.toLowerCase()];
}

export function matchHistory(playerId: string) {
  return state.matches.filter((m) => m.players.some((p) => p.playerId === playerId)).slice(0, 20);
}

void newId;
