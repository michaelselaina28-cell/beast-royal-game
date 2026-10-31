import { ANIMALS } from "./animals.js";
import { BALANCE } from "./balance.js";
import { hasStatus } from "./combat.js";
import type { ActionType, Combatant, MatchState, SubmittedAction, Terrain } from "./types.js";

const TERRAIN: Terrain[] = ["forest", "swamp", "cliff", "river", "center"];

export function living(match: MatchState): Combatant[] {
  return match.combatants.filter((c) => !c.eliminated);
}

export function opponentsOf(match: MatchState, me: Combatant): Combatant[] {
  return living(match).filter((c) => {
    if (c.playerId === me.playerId) return false;
    if (match.mode === "team" && me.teamId && c.teamId === me.teamId) return false;
    if (match.mode === "boss" && !me.isBoss && !c.isBoss) return false;
    const ally = match.alliances.find(
      (a) => a.active && ((a.a === me.playerId && a.b === c.playerId) || (a.b === me.playerId && a.a === c.playerId)),
    );
    if (ally) return false;
    return true;
  });
}

export function allied(match: MatchState, a: string, b: string): boolean {
  return match.alliances.some((x) => x.active && ((x.a === a && x.b === b) || (x.a === b && x.b === a)));
}

export function sameTeam(match: MatchState, a: Combatant, b: Combatant): boolean {
  if (a.playerId === b.playerId) return true;
  if (match.mode === "team" && a.teamId && a.teamId === b.teamId) return true;
  if (match.mode === "boss" && !a.isBoss && !b.isBoss) return true;
  return allied(match, a.playerId, b.playerId);
}

export function validateNickname(raw: string): { ok: true; value: string } | { ok: false; error: string } {
  const value = raw.trim().replace(/\s+/g, " ");
  if (value.length < BALANCE.nicknameMin) return { ok: false, error: "Nickname is too short." };
  if (value.length > BALANCE.nicknameMax) return { ok: false, error: "Nickname is too long." };
  if (!/^[\p{L}\p{N} _.\-]+$/u.test(value)) return { ok: false, error: "Nickname has invalid characters." };
  const banned = ["admin", "nazi", "hitler", "fuck", "shit", "asshole", "bitch", "rape"];
  const lower = value.toLowerCase();
  if (banned.some((w) => lower.includes(w))) return { ok: false, error: "That nickname is not allowed." };
  return { ok: true, value };
}

export function actionEnergy(type: ActionType, animalId: Combatant["animalId"]): number {
  if (type === "heavy") return BALANCE.heavyCost;
  if (type === "special") return ANIMALS[animalId].energyCost;
  return 0;
}

export function validateAction(
  match: MatchState,
  actor: Combatant,
  action: SubmittedAction,
): string | null {
  if (actor.eliminated && action.type !== "last_stand") return "Eliminated players cannot act.";
  if (!actor.eliminated && action.type === "last_stand") return "Last Stand is only for eliminated players.";
  if (actor.isBoss) return "Boss actions are server-controlled.";
  if (hasStatus(actor, "stun") && action.type !== "defend") return "Stunned — you skip this action.";
  if (hasStatus(actor, "bound") && (action.type === "recover" || action.type === "special")) {
    return "Constricted — Recover and Special are blocked.";
  }
  const needsTarget = action.type === "quick" || action.type === "heavy" || action.type === "special" || action.type === "last_stand";
  const aoe = action.type === "special" && (actor.animalId === "elephant" || actor.animalId === "bee");
  const selfish =
    action.type === "special" &&
    ["hippo", "bear", "gorilla", "lion", "octopus", "parrot", "eagle", "fox", "cheetah"].includes(actor.animalId);
  if (needsTarget && !aoe && !selfish && !action.targetId) return "This action needs a target.";
  if (action.targetId) {
    const t = match.combatants.find((c) => c.playerId === action.targetId);
    if (!t || t.eliminated) return "Invalid target.";
    if (action.type !== "last_stand" && sameTeam(match, actor, t) && action.type !== "move") {
      if (action.type === "quick" || action.type === "heavy" || action.type === "special") {
        // betrayal is allowed for alliances, not for formal teams/boss allies
        if (match.mode === "team" || match.mode === "boss") return "Cannot attack teammates.";
      }
    }
  }
  if (action.type === "move") {
    if (!action.zone || !TERRAIN.includes(action.zone)) return "Choose a terrain zone.";
  }
  if (action.type === "heavy" && actor.energy < BALANCE.heavyCost) return "Not enough energy for Heavy Attack.";
  if (action.type === "special") {
    const cost = ANIMALS[actor.animalId].energyCost;
    if (actor.energy < cost) return "Not enough energy for Special.";
    if (actor.cooldown > 0) return "Special is on cooldown.";
    if (actor.animalId === "parrot" && !match.lastSpecial) return "Nothing to Mimic yet.";
    if (actor.animalId === "bat" && !action.targetId) return "Echo Sight needs a target.";
  }
  if (action.type === "last_stand") {
    if (actor.lastStandUsed) return "Last Stand already used.";
    if (!action.targetId) return "Pick a living target to haunt.";
  }
  return null;
}
