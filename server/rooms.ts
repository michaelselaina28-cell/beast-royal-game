import { BALANCE } from "../shared/balance.js";
import { ANIMALS } from "../shared/animals.js";
import { createCombatant, draftAnimals, modeDefaults, newMatch, pickCrateZone } from "../shared/factory.js";
import { MODE_INFO } from "../shared/protocol.js";
import { beginSelectPhase, resolveRound, timeBattleWinner, xpForMatch } from "../shared/resolve.js";
import { mulberry32 } from "../shared/rng.js";
import { hasStatus } from "../shared/combat.js";
import { allied, validateAction } from "../shared/validate.js";
import type {
  AnimalId,
  ChatMessage,
  ClientMatchView,
  MatchState,
  PublicActionView,
  RoomSettings,
  RoomState,
  SubmittedAction,
} from "../shared/types.js";
import { applyMatchStats, saveMatch } from "./store.js";
import { newId, roomCode } from "./token.js";

interface LiveRoom {
  room: RoomState;
  match?: MatchState;
  secrets: Map<string, SubmittedAction>;
  resolvedRounds: Set<string>;
  awarded: boolean;
  timers: {
    decision?: ReturnType<typeof setTimeout>;
    recap?: ReturnType<typeof setTimeout>;
    matchEnd?: ReturnType<typeof setTimeout>;
  };
  onUpdate?: (live: LiveRoom) => void;
}

const rooms = new Map<string, LiveRoom>();
const byCode = new Map<string, string>();
const byPlayer = new Map<string, string>();

const defaultSettings = (): RoomSettings => ({
  mode: "classic",
  maxPlayers: 8,
  minPlayers: 2,
  spectatorsAllowed: true,
  isPrivate: true,
  uniqueAnimals: true,
  teamSize: 0,
  decisionSeconds: BALANCE.decisionTimerClassic,
  timeLimitSeconds: 300,
  bossKind: "mammoth",
});

export function getRoomByPlayer(playerId: string) {
  const id = byPlayer.get(playerId);
  return id ? rooms.get(id) : undefined;
}

export function getRoomByCode(code: string) {
  const id = byCode.get(code.toUpperCase().trim());
  return id ? rooms.get(id) : undefined;
}

export function createRoom(hostId: string, nickname: string, partial: Partial<RoomSettings>): LiveRoom {
  const settings = { ...defaultSettings(), ...modeDefaults(partial.mode ?? "classic"), ...partial };
  if (settings.mode === "speed") settings.decisionSeconds = BALANCE.decisionTimerSpeed;
  if (settings.mode === "classic") settings.decisionSeconds = settings.decisionSeconds || BALANCE.decisionTimerClassic;
  const info = MODE_INFO[settings.mode];
  settings.minPlayers = Math.max(info.min, settings.minPlayers);
  settings.maxPlayers = Math.min(info.max, settings.maxPlayers);
  let code = roomCode();
  while (byCode.has(code)) code = roomCode();
  const room: RoomState = {
    id: newId("rm_"),
    code,
    hostId,
    status: "lobby",
    settings,
    members: [
      {
        playerId: hostId,
        nickname,
        isHost: true,
        isSpectator: false,
        ready: false,
        connected: true,
        lastSeen: Date.now(),
      },
    ],
    createdAt: Date.now(),
    lastActivity: Date.now(),
    chat: [],
  };
  const live: LiveRoom = { room, secrets: new Map(), resolvedRounds: new Set(), awarded: false, timers: {} };
  rooms.set(room.id, live);
  byCode.set(code, room.id);
  byPlayer.set(hostId, room.id);
  return live;
}

export function joinRoom(
  code: string,
  playerId: string,
  nickname: string,
  spectator = false,
): { ok: true; live: LiveRoom } | { ok: false; error: string } {
  const live = getRoomByCode(code);
  if (!live) return { ok: false, error: "No room uses that code." };
  const { room } = live;
  if (room.status === "closed") return { ok: false, error: "This room is closed." };
  const existing = room.members.find((m) => m.playerId === playerId);
  if (existing) {
    existing.connected = true;
    existing.lastSeen = Date.now();
    existing.nickname = nickname;
    byPlayer.set(playerId, room.id);
    return { ok: true, live };
  }
  if (room.status === "ended") return { ok: false, error: "This match has ended. Ask the host to start a rematch." };
  const players = room.members.filter((m) => !m.isSpectator);
  const inMatch = room.status === "in_match" || room.status === "starting";
  if (inMatch && !spectator) {
    return { ok: false, error: "The match already started. Select spectator to watch." };
  }
  if (!spectator && players.length >= room.settings.maxPlayers) {
    return { ok: false, error: "This den is full." };
  }
  if (spectator && !room.settings.spectatorsAllowed) {
    return { ok: false, error: "Spectators are not allowed in this room." };
  }
  room.members.push({
    playerId,
    nickname,
    isHost: false,
    isSpectator: spectator,
    ready: false,
    connected: true,
    lastSeen: Date.now(),
  });
  byPlayer.set(playerId, room.id);
  room.lastActivity = Date.now();
  return { ok: true, live };
}

export function leaveRoom(playerId: string): LiveRoom | undefined {
  const live = getRoomByPlayer(playerId);
  if (!live) return;
  live.room.members = live.room.members.filter((m) => m.playerId !== playerId);
  byPlayer.delete(playerId);
  if (live.room.hostId === playerId) {
    const nextHost = live.room.members.find((m) => !m.isSpectator);
    if (nextHost) {
      nextHost.isHost = true;
      live.room.hostId = nextHost.playerId;
    }
  }
  if (!live.room.members.length) {
    closeRoom(live.room.id);
    return undefined;
  }
  return live;
}

export function kick(hostId: string, targetId: string): { ok: boolean; error?: string; live?: LiveRoom } {
  const live = getRoomByPlayer(hostId);
  if (!live) return { ok: false, error: "Not in a room." };
  if (live.room.hostId !== hostId) return { ok: false, error: "Only the host can remove players." };
  if (targetId === hostId) return { ok: false, error: "Host cannot kick themselves." };
  live.room.members = live.room.members.filter((m) => m.playerId !== targetId);
  byPlayer.delete(targetId);
  return { ok: true, live };
}

export function closeRoom(id: string) {
  const live = rooms.get(id);
  if (!live) return;
  clearTimeout(live.timers.decision);
  clearTimeout(live.timers.recap);
  clearTimeout(live.timers.matchEnd);
  for (const m of live.room.members) byPlayer.delete(m.playerId);
  byCode.delete(live.room.code);
  rooms.delete(id);
}

export function chat(playerId: string, text: string, channel: ChatMessage["channel"], emote?: string) {
  const live = getRoomByPlayer(playerId);
  if (!live) return { ok: false as const, error: "Not in a room." };
  const member = live.room.members.find((m) => m.playerId === playerId);
  if (!member) return { ok: false as const, error: "Not in a room." };
  const clean = text.slice(0, 180);
  if (!clean && !emote) return { ok: false as const, error: "Empty message." };
  const message: ChatMessage = {
    id: newId("ch_"),
    playerId,
    nickname: member.nickname,
    text: clean,
    at: Date.now(),
    channel,
    emote,
  };
  live.room.chat = [...live.room.chat, message].slice(-80);
  return { ok: true as const, live, message };
}

export function selectAnimal(playerId: string, animalId: AnimalId | null) {
  const live = getRoomByPlayer(playerId);
  if (!live) return { ok: false as const, error: "Not in a room." };
  if (live.room.status !== "lobby") return { ok: false as const, error: "Animals are locked." };
  const m = live.room.members.find((x) => x.playerId === playerId);
  if (!m || m.isSpectator) return { ok: false as const, error: "Spectators cannot pick." };
  if (animalId && live.room.settings.uniqueAnimals) {
    const taken = live.room.members.some((x) => x.playerId !== playerId && x.animalId === animalId);
    if (taken) return { ok: false as const, error: "That animal is already claimed." };
  }
  if (animalId && !ANIMALS[animalId]) return { ok: false as const, error: "Unknown animal." };
  m.animalId = animalId ?? undefined;
  m.ready = false;
  return { ok: true as const, live };
}

export function canStart(live: LiveRoom): string | null {
  if (live.room.status !== "lobby") return "This room is no longer waiting to start.";
  const players = live.room.members.filter((m) => !m.isSpectator);
  const { settings } = live.room;
  if (players.length < settings.minPlayers) return `Need at least ${settings.minPlayers} players.`;
  if (players.length > settings.maxPlayers) return `This mode allows at most ${settings.maxPlayers} players.`;
  if (settings.mode === "team") {
    const need = settings.teamSize === 4 ? 8 : 4;
    if (players.length !== need) return `Team Battle ${settings.teamSize}v${settings.teamSize} needs ${need} players.`;
  }
  if (settings.mode !== "draft" && settings.mode !== "boss") {
    if (players.some((p) => !p.animalId)) return "Every fighter must select an animal.";
  }
  if (!players.every((p) => p.ready)) return "Every fighter must ready up.";
  return null;
}

export function startMatch(hostId: string): { ok: true; live: LiveRoom } | { ok: false; error: string } {
  const live = getRoomByPlayer(hostId);
  if (!live) return { ok: false, error: "Not in a room." };
  if (live.room.hostId !== hostId) return { ok: false, error: "Only the host can start." };
  if (live.room.status !== "lobby") return { ok: false, error: "This room is no longer waiting to start." };
  const err = canStart(live);
  if (err) return { ok: false, error: err };
  const players = live.room.members.filter((m) => !m.isSpectator);
  const seed = (Date.now() ^ Math.floor(Math.random() * 1e9)) >>> 0;
  let assignments: AnimalId[] = players.map((p) => p.animalId as AnimalId);
  if (live.room.settings.mode === "draft" || players.some((p) => !p.animalId)) {
    assignments = draftAnimals(players.length, seed);
    players.forEach((p, i) => {
      p.animalId = assignments[i];
    });
  }
  if (live.room.settings.mode === "team") {
    players.forEach((p, i) => {
      p.teamId = i % 2 === 0 ? "a" : "b";
    });
  }
  const combatants = players.map((p) =>
    createCombatant(p.playerId, p.nickname, p.animalId as AnimalId, {
      teamId: p.teamId,
      zone: "center",
    }),
  );
  const match = newMatch({
    id: newId("mt_"),
    roomId: live.room.id,
    mode: live.room.settings.mode === "draft" ? "classic" : live.room.settings.mode,
    teamSize: live.room.settings.teamSize,
    uniqueAnimals: live.room.settings.uniqueAnimals,
    decisionSeconds: live.room.settings.decisionSeconds,
    timeLimitSeconds: live.room.settings.timeLimitSeconds,
    spectatorsAllowed: live.room.settings.spectatorsAllowed,
    combatants,
    seed,
    bossKind: live.room.settings.bossKind,
  });
  const rand = mulberry32(seed);
  match.crateZone = pickCrateZone(rand);
  live.match = beginSelectPhase(match);
  live.secrets.clear();
  live.resolvedRounds.clear();
  live.awarded = false;
  live.room.status = "in_match";
  live.room.matchId = match.id;
  armDecisionTimer(live);
  return { ok: true, live };
}

function finishTimeBattle(live: LiveRoom) {
  if (!live.match || live.match.phase === "ended" || live.match.mode !== "time") return;
  clearTimeout(live.timers.decision);
  clearTimeout(live.timers.recap);
  clearTimeout(live.timers.matchEnd);
  const winners = timeBattleWinner(live.match);
  live.match.winnerIds = winners;
  live.match.result = winners.length > 1 ? "draw" : "winner";
  live.match.phase = "ended";
  const headline = winners.length > 1 ? `${winners.length} fighters share the time-battle win.` : `${live.match.combatants.find((c) => c.playerId === winners[0])?.nickname ?? "A beast"} wins on time.`;
  live.match.log = [
    ...live.match.log,
    {
      id: `log-time-${Date.now()}`,
      round: live.match.round,
      kind: "system",
      text: `Time is up — ${headline}`,
    },
  ];
  live.room.status = "ended";
  award(live);
  live.onUpdate?.(live);
}

export function submitAction(playerId: string, partial: Omit<SubmittedAction, "playerId" | "locked" | "submittedAt"> & { locked?: boolean }) {
  const live = getRoomByPlayer(playerId);
  if (!live?.match) return { ok: false as const, error: "No active match." };
  if (live.match.phase !== "select") return { ok: false as const, error: "Actions are locked for this round." };
  const actor = live.match.combatants.find((c) => c.playerId === playerId);
  if (!actor) return { ok: false as const, error: "You are not in this match." };
  const existing = live.secrets.get(playerId);
  if (existing?.locked) return { ok: false as const, error: "Move already locked." };
  const action: SubmittedAction = {
    actionId: partial.actionId,
    playerId,
    type: partial.type,
    targetId: partial.targetId,
    zone: partial.zone,
    locked: false,
    submittedAt: Date.now(),
  };
  const err = validateAction(live.match, actor, action);
  if (err) return { ok: false as const, error: err };
  live.secrets.set(playerId, action);
  return { ok: true as const, live, action };
}

export function lockAction(playerId: string) {
  const live = getRoomByPlayer(playerId);
  if (!live?.match) return { ok: false as const, error: "No active match." };
  const action = live.secrets.get(playerId);
  if (!action) return { ok: false as const, error: "Submit a move before locking." };
  action.locked = true;
  maybeResolve(live);
  return { ok: true as const, live };
}

function fighters(live: LiveRoom) {
  return (live.match?.combatants ?? []).filter((c) => !c.eliminated && !c.isBoss);
}

function maybeResolve(live: LiveRoom) {
  if (!live.match || live.match.phase !== "select") return;
  const need = fighters(live);
  if (need.every((c) => live.secrets.get(c.playerId)?.locked)) {
    runResolve(live);
  }
}

function armDecisionTimer(live: LiveRoom) {
  clearTimeout(live.timers.decision);
  clearTimeout(live.timers.matchEnd);
  if (!live.match) return;
  if (live.match.mode === "time" && live.match.matchEndsAt) {
    const waitForEnd = Math.max(250, live.match.matchEndsAt - Date.now());
    live.timers.matchEnd = setTimeout(() => {
      if (live.match && live.match.phase !== "ended" && live.match.mode === "time") {
        finishTimeBattle(live);
      }
    }, waitForEnd);
  }
  const wait = Math.max(250, live.match.decisionEndsAt - Date.now());
  live.timers.decision = setTimeout(() => {
    if (live.match?.phase === "select") runResolve(live);
  }, wait);
}

function runResolve(live: LiveRoom) {
  if (!live.match) return;
  const key = `${live.match.id}:${live.match.round}`;
  if (live.resolvedRounds.has(key)) return;
  live.resolvedRounds.add(key);
  clearTimeout(live.timers.decision);
  const submitted = [...live.secrets.values()];
  live.match = resolveRound(live.match, submitted);
  live.secrets.clear();
  if (live.match.mode === "time" && live.match.matchEndsAt && Date.now() >= live.match.matchEndsAt) {
    finishTimeBattle(live);
    return;
  }
  if (live.match.phase === "ended") {
    award(live);
    live.room.status = "ended";
    return;
  }
  clearTimeout(live.timers.recap);
  live.timers.recap = setTimeout(() => {
    if (!live.match || live.match.phase === "ended") return;
    live.match = beginSelectPhase(live.match);
    live.secrets.clear();
    armDecisionTimer(live);
    live.onUpdate?.(live);
  }, BALANCE.recapSeconds * 1000);
  live.onUpdate?.(live);
}

function award(live: LiveRoom) {
  if (!live.match || live.awarded) return;
  live.awarded = true;
  const m = live.match;
  const draw = m.result === "draw";
  const winners = new Set(m.winnerIds);
  saveMatch({
    id: m.id,
    mode: m.mode,
    endedAt: Date.now(),
    winnerIds: m.winnerIds,
    result: m.result,
    players: m.combatants
      .filter((c) => !c.isBoss)
      .map((c) => ({
        playerId: c.playerId,
        nickname: c.nickname,
        animalId: c.animalId,
        kills: c.kills,
        damageDealt: c.damageDealt,
        placement: c.placement ?? (winners.has(c.playerId) ? 1 : 8),
        xp: xpForMatch(c, winners.has(c.playerId), draw),
      })),
  });
  for (const c of m.combatants) {
    if (c.isBoss) continue;
    const won = winners.has(c.playerId);
    applyMatchStats(c.playerId, {
      won,
      draw,
      kills: c.kills,
      damageDealt: c.damageDealt,
      damageTaken: c.damageTaken,
      specialsUsed: c.specialsUsed,
      roundsSurvived: c.roundsSurvived,
      placement: c.placement ?? (won ? 1 : 8),
      xp: xpForMatch(c, won, draw),
      matchId: m.id,
    });
  }
}

export function viewFor(live: LiveRoom, playerId: string): ClientMatchView | null {
  if (!live.match) return null;
  const member = live.room.members.find((m) => m.playerId === playerId);
  const isSpec = member?.isSpectator || false;
  const clone: MatchState = JSON.parse(JSON.stringify(live.match));
  const mine = (l: { privateTo?: string[] }) => !l.privateTo || l.privateTo.includes(playerId);
  clone.log = clone.log.filter(mine);
  if (clone.recap) clone.recap.lines = clone.recap.lines.filter(mine);
  const hiddenHp: string[] = [];
  const hiddenMoves: string[] = [];
  const mySecret = live.secrets.get(playerId);
  const allyMoves: PublicActionView[] = [];
  const echoReveal: PublicActionView | undefined = undefined;

  if (clone.phase === "select" || clone.phase === "locked") {
    // strip recap actions of unrevealed? recap is previous
  }

  for (const c of clone.combatants) {
    if (c.playerId === playerId) continue;
    const ink = hasStatus(c, "ink_cloud");
    const forest = c.zone === "forest";
    const fog = clone.weather === "fog";
    if (ink || forest || fog) hiddenHp.push(c.playerId);
    if (ink || fog) {
      if (ink || fog) {
        /* hp hidden on client via hiddenHp */
      }
    }
  }

  if (clone.phase === "select") {
    for (const [pid, act] of live.secrets) {
      if (pid === playerId) continue;
      if (allied(clone, playerId, pid)) {
        allyMoves.push({
          playerId: pid,
          type: act.type,
          targetId: act.targetId,
          zone: act.zone,
          hidden: false,
        });
      } else {
        hiddenMoves.push(pid);
      }
    }
  }

  return {
    match: clone,
    myId: playerId,
    privateAction: isSpec ? undefined : mySecret,
    echoReveal,
    allyMoves,
    hiddenHp,
    hiddenMoves,
  };
}

export function offerAlly(playerId: string, targetId: string) {
  const live = getRoomByPlayer(playerId);
  if (!live?.match) return { ok: false as const, error: "No match." };
  const me = live.match.combatants.find((c) => c.playerId === playerId);
  const them = live.match.combatants.find((c) => c.playerId === targetId);
  if (!me || !them || me.eliminated || them.eliminated) return { ok: false as const, error: "Invalid target." };
  if (hasStatus(me, "no_ally")) return { ok: false as const, error: "Betrayal bars further truces." };
  if (live.match.mode === "team" || live.match.mode === "boss") return { ok: false as const, error: "Teams already bind you." };
  if (allied(live.match, playerId, targetId)) return { ok: false as const, error: "Already allied." };
  if (live.match.alliances.some((a) => a.offeredBy === playerId && ((a.a === targetId) || a.b === targetId) && !a.active)) {
    return { ok: false as const, error: "Offer already pending." };
  }
  live.match.alliances.push({ a: playerId, b: targetId, active: false, offeredBy: playerId });
  return { ok: true as const, live };
}

export function respondAlly(playerId: string, fromId: string, accept: boolean) {
  const live = getRoomByPlayer(playerId);
  if (!live?.match) return { ok: false as const, error: "No match." };
  const al = live.match.alliances.find(
    (a) => !a.active && a.offeredBy === fromId && (a.a === playerId || a.b === playerId),
  );
  if (!al) return { ok: false as const, error: "No offer found." };
  if (!accept) {
    live.match.alliances = live.match.alliances.filter((x) => x !== al);
    return { ok: true as const, live };
  }
  al.active = true;
  return { ok: true as const, live };
}

export function rematch(hostId: string) {
  const live = getRoomByPlayer(hostId);
  if (!live) return { ok: false as const, error: "No room." };
  if (live.room.hostId !== hostId) return { ok: false as const, error: "Host only." };
  live.room.status = "lobby";
  live.match = undefined;
  live.secrets.clear();
  live.awarded = false;
  for (const m of live.room.members) {
    m.ready = false;
    if (live.room.settings.mode === "draft") m.animalId = undefined;
  }
  return { ok: true as const, live };
}

export function returnLobby(playerId: string) {
  const live = getRoomByPlayer(playerId);
  if (!live) return { ok: false as const, error: "No room." };
  if (live.room.status === "ended" || live.room.hostId === playerId) {
    live.room.status = "lobby";
    live.match = undefined;
  }
  return { ok: true as const, live };
}

export function setReady(playerId: string, ready: boolean) {
  const live = getRoomByPlayer(playerId);
  if (!live) return { ok: false as const, error: "No room." };
  if (live.room.status !== "lobby") return { ok: false as const, error: "Readiness is locked after the match starts." };
  const m = live.room.members.find((x) => x.playerId === playerId);
  if (!m || m.isSpectator) return { ok: false as const, error: "Spectators cannot ready up." };
  m.ready = ready;
  return { ok: true as const, live };
}

export function setSettings(hostId: string, settings: Partial<RoomSettings>) {
  const live = getRoomByPlayer(hostId);
  if (!live) return { ok: false as const, error: "No room." };
  if (live.room.hostId !== hostId) return { ok: false as const, error: "Host only." };
  if (live.room.status !== "lobby") return { ok: false as const, error: "Settings locked." };
  live.room.settings = { ...live.room.settings, ...settings };
  if (settings.mode) {
    live.room.settings = { ...live.room.settings, ...modeDefaults(settings.mode), ...settings };
  }
  return { ok: true as const, live };
}

export function setTeam(hostId: string, playerId: string, teamId: "a" | "b") {
  const live = getRoomByPlayer(hostId);
  if (!live) return { ok: false as const, error: "No room." };
  if (live.room.hostId !== hostId) return { ok: false as const, error: "Host only." };
  const m = live.room.members.find((x) => x.playerId === playerId);
  if (m) m.teamId = teamId;
  return { ok: true as const, live };
}

export function cleanupIdle() {
  const now = Date.now();
  for (const live of rooms.values()) {
    if (now - live.room.lastActivity > BALANCE.roomIdleMs) closeRoom(live.room.id);
  }
}

export function markDisconnected(playerId: string) {
  const live = getRoomByPlayer(playerId);
  if (!live) return;
  const m = live.room.members.find((x) => x.playerId === playerId);
  if (m) m.connected = false;
}

export function markConnected(playerId: string, nickname: string) {
  const live = getRoomByPlayer(playerId);
  if (!live) return live;
  const m = live.room.members.find((x) => x.playerId === playerId);
  if (m) {
    m.connected = true;
    m.nickname = nickname;
    m.lastSeen = Date.now();
  }
  return live;
}

export type { LiveRoom };
