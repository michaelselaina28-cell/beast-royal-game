import { ANIMALS } from "./animals.js";
import { BALANCE, zoneInfo } from "./balance.js";
import {
  addEnergy,
  applyShield,
  attackStat,
  defenseStat,
  directDamage,
  effectiveDefenseValue,
  hasStatus,
  heal,
  hurt,
  markedMultiplier,
  spendEnergy,
  tickStatuses,
  upsertStatus,
} from "./combat.js";
import { predatorBonus, roleBonus } from "./matchups.js";
import { mulberry32 } from "./rng.js";
import { allied, living, sameTeam } from "./validate.js";
import type {
  ActionType,
  AnimalId,
  Combatant,
  LogLine,
  LootId,
  MatchState,
  PublicActionView,
  SubmittedAction,
  Terrain,
} from "./types.js";

interface Ctx {
  match: MatchState;
  actions: Map<string, SubmittedAction>;
  rand: () => number;
  log: LogLine[];
  defending: Set<string>;
  recovering: Set<string>;
  startHp: Map<string, number>;
  echo?: PublicActionView;
  crateWinner?: string;
  crateItem?: LootId;
  damageThisRound: Map<string, number>;
  idc: number;
}

function line(ctx: Ctx, kind: LogLine["kind"], text: string, privateTo?: string[]): LogLine {
  const l: LogLine = { id: `l${ctx.match.round}-${ctx.idc++}`, round: ctx.match.round, kind, text, privateTo };
  ctx.log.push(l);
  return l;
}

function byId(ctx: Ctx, id: string): Combatant | undefined {
  return ctx.match.combatants.find((c) => c.playerId === id);
}

function enemies(ctx: Ctx, me: Combatant): Combatant[] {
  return living(ctx.match).filter((c) => c.playerId !== me.playerId && !sameTeam(ctx.match, me, c));
}

function terrainMods(c: Combatant) {
  let def = 0;
  let spd = 0;
  if (c.zone === "forest") def += BALANCE.forestDefense;
  if (c.zone === "swamp") spd -= BALANCE.swampSpeedPenalty;
  if (c.zone === "cliff" && c.animalId !== "eagle") def -= BALANCE.cliffDefensePenalty;
  return { def, spd };
}

function weatherDamageMod(ctx: Ctx): number {
  return ctx.match.weather === "storm" ? 1.2 : 1;
}

function zoneDamageBonus(attacker: Combatant, base: number): number {
  const tags = ANIMALS[attacker.animalId].tags;
  let m = 1;
  if (attacker.zone === "swamp" && (attacker.animalId === "python" || attacker.animalId === "crocodile")) {
    m += BALANCE.swampBonus;
  }
  if (attacker.zone === "river" && (tags.includes("aquatic") || attacker.animalId === "octopus" || attacker.animalId === "shark")) {
    m += BALANCE.riverBonus;
  }
  return base * m;
}

function ignoreDefend(special: boolean, animal: AnimalId) {
  return special && animal === "cobra";
}

function computeDefense(ctx: Ctx, target: Combatant, opts: { ignoreDefend?: boolean }) {
  const rec = ctx.recovering.has(target.playerId);
  const def = opts.ignoreDefend ? false : ctx.defending.has(target.playerId);
  const extra = terrainMods(target).def;
  return effectiveDefenseValue(defenseStat(target), def, rec, extra);
}

function tryEvade(ctx: Ctx, target: Combatant): boolean {
  let chance = 0;
  if (hasStatus(target, "sky_dive")) {
    chance += target.evolved ? 0.55 : BALANCE.eagleEvade;
    if (target.zone === "cliff") chance += BALANCE.eagleCliffEvade;
  }
  if (hasStatus(target, "trickster")) chance += target.evolved ? 0.45 : BALANCE.foxEvade;
  if (hasStatus(target, "sprint")) chance += BALANCE.sprintEvade;
  if (hasStatus(target, "ink_cloud") && target.evolved) chance += 0.2;
  if (chance <= 0) return false;
  return ctx.rand() < chance;
}

function decoyTarget(ctx: Ctx, intended: Combatant, attacker: Combatant): Combatant {
  if (!hasStatus(intended, "trickster")) return intended;
  const chance = intended.evolved ? 0.55 : BALANCE.foxDecoyChance;
  if (ctx.rand() >= chance) return intended;
  const pool = living(ctx.match).filter((c) => c.playerId !== intended.playerId && c.playerId !== attacker.playerId);
  if (!pool.length) return intended;
  const pick = pool[Math.floor(ctx.rand() * pool.length)];
  line(ctx, "action", `${intended.nickname}'s decoy redirects the hit toward ${pick.nickname}!`);
  return pick;
}

function applyDamage(
  ctx: Ctx,
  attacker: Combatant,
  target: Combatant,
  raw: number,
  opts: { ignoreDef?: number; trueDamage?: boolean; label: string; isBetrayal?: boolean },
): { dealt: number; blocked: number } {
  if (target.eliminated) return { dealt: 0, blocked: 0 };
  let amount = raw;
  amount *= weatherDamageMod(ctx);
  amount *= markedMultiplier(target);
  if (opts.isBetrayal) amount *= 1 + BALANCE.betrayalBonus;
  if (hasStatus(target, "kings_aura") && !opts.trueDamage) amount *= 1 - BALANCE.lionDamageReduction;
  let blocked = 0;
  if (!opts.trueDamage) {
    const def = computeDefense(ctx, target, { ignoreDefend: false });
    amount = directDamage(amount, def, opts.ignoreDef ?? 0);
  } else {
    amount = Math.round(amount);
  }
  const shielded = applyShield(target, Math.max(0, amount));
  amount = shielded.taken;
  blocked = shielded.blocked;
  hurt(target, amount);
  attacker.damageDealt += amount;
  target.damageTaken += amount;
  ctx.damageThisRound.set(target.playerId, (ctx.damageThisRound.get(target.playerId) ?? 0) + amount);
  if (amount > 0 || blocked > 0) {
    line(
      ctx,
      "damage",
      `${attacker.nickname} ${opts.label} ${target.nickname} for ${amount} damage${blocked ? ` (${blocked} shielded)` : ""}.`,
    );
  }
  if (target.trapArmed && amount > 0 && !opts.trueDamage) {
    target.trapArmed = false;
    const trap = BALANCE.trapDamage;
    hurt(attacker, trap);
    upsertStatus(attacker, { id: "bleed", duration: BALANCE.bleedDuration, stacks: 1 }, true);
    line(ctx, "loot", `${target.nickname}'s trap snaps — ${attacker.nickname} takes ${trap} and starts Bleeding.`);
  }
  return { dealt: amount, blocked };
}

function maybeBetray(ctx: Ctx, attacker: Combatant, target: Combatant): boolean {
  if (!allied(ctx.match, attacker.playerId, target.playerId)) return false;
  ctx.match.alliances = ctx.match.alliances.map((a) => {
    if ((a.a === attacker.playerId && a.b === target.playerId) || (a.b === attacker.playerId && a.a === target.playerId)) {
      return { ...a, active: false };
    }
    return a;
  });
  upsertStatus(attacker, { id: "no_ally", duration: 99, stacks: 1 });
  line(ctx, "alliance", `${attacker.nickname} betrays ${target.nickname}! +25% surprise damage. No further truces.`);
  return true;
}

function specialId(animal: AnimalId): AnimalId {
  return animal;
}

function performSpecial(ctx: Ctx, actor: Combatant, action: SubmittedAction, copiedFrom?: AnimalId) {
  const id = copiedFrom ?? actor.animalId;
  const evo = actor.evolved;
  const target = action.targetId ? byId(ctx, action.targetId) : undefined;

  const hitOne = (t: Combatant, mult: number, extra: { ignoreDef?: number; trueDamage?: boolean } = {}) => {
    const betray = maybeBetray(ctx, actor, t);
    let base = zoneDamageBonus(actor, attackStat(actor) * mult);
    base *= 1 + roleBonus(actor, t) + predatorBonus(actor, t);
    if (copiedFrom && actor.animalId === "parrot" && evo) base *= 1 + BALANCE.evolvedDamageBonus;
    return applyDamage(ctx, actor, t, base, {
      ignoreDef: extra.ignoreDef,
      trueDamage: extra.trueDamage,
      label: `uses ${ANIMALS[id].special} on`,
      isBetrayal: betray,
    });
  };

  switch (id) {
    case "elephant": {
      for (const t of enemies(ctx, actor)) {
        hitOne(t, BALANCE.stampedeMultiplier);
        if (evo) upsertStatus(t, { id: "weaken", duration: 1, stacks: 1 });
      }
      break;
    }
    case "hippo": {
      ctx.defending.add(actor.playerId);
      upsertStatus(actor, { id: "territorial", duration: 1, stacks: 1 });
      line(ctx, "action", `${actor.nickname} claims the water — Territorial stance.`);
      break;
    }
    case "bear": {
      upsertStatus(actor, { id: "iron_hide", duration: 1, stacks: 1 });
      if (evo) upsertStatus(actor, { id: "shield", duration: 2, stacks: 1, value: BALANCE.shieldAbsorb });
      line(ctx, "action", `${actor.nickname} hardens Iron Hide.`);
      break;
    }
    case "rhino": {
      if (!target || target.eliminated) {
        line(ctx, "action", `${actor.nickname}'s Charge finds no target.`);
        break;
      }
      const res = hitOne(target, BALANCE.rhinoMultiplier, { ignoreDef: BALANCE.rhinoIgnoreDefense });
      if (ctx.defending.has(target.playerId)) {
        const recoil = Math.round(res.dealt * BALANCE.rhinoRecoil * (evo ? 0.5 : 1));
        hurt(actor, recoil);
        line(ctx, "damage", `${actor.nickname} suffers ${recoil} Charge recoil.`);
      }
      break;
    }
    case "gorilla": {
      upsertStatus(actor, { id: "gorilla_power", duration: BALANCE.gorillaDuration, stacks: 1 });
      for (const t of enemies(ctx, actor)) upsertStatus(t, { id: "enemy_wither", duration: 1, stacks: 1 });
      if (evo && target) upsertStatus(target, { id: "marked", duration: BALANCE.markedDuration, stacks: 1 });
      line(ctx, "action", `${actor.nickname} pounds their chest. Power surges.`);
      break;
    }
    case "lion": {
      upsertStatus(actor, { id: "kings_aura", duration: 1, stacks: 1 });
      line(ctx, "action", `${actor.nickname} unleashes King's Roar.`);
      break;
    }
    case "crocodile": {
      if (!target || target.eliminated) break;
      hitOne(target, BALANCE.crocodileRoll);
      upsertStatus(target, { id: "bleed", duration: BALANCE.bleedDuration, stacks: 1 }, true);
      if (evo) upsertStatus(target, { id: "armor_break", duration: BALANCE.armorBreakDuration, stacks: 1 });
      break;
    }
    case "tiger": {
      if (!target || target.eliminated) break;
      hitOne(target, BALANCE.tigerPounce);
      if (evo) upsertStatus(target, { id: "marked", duration: BALANCE.markedDuration, stacks: 1 });
      break;
    }
    case "wolf": {
      if (!target || target.eliminated) break;
      const hpPct = (ctx.startHp.get(target.playerId) ?? target.hp) / target.maxHp;
      const thresh = evo ? 0.5 : BALANCE.wolfExecuteThreshold;
      const mult = hpPct < thresh ? 1.25 + BALANCE.wolfExecuteBonus : 1.25;
      hitOne(target, mult);
      break;
    }
    case "shark": {
      if (!target || target.eliminated) break;
      const hpPct = (ctx.startHp.get(target.playerId) ?? target.hp) / target.maxHp;
      const mult = 1.2 + (1 - hpPct) * BALANCE.sharkMaxBonus;
      hitOne(target, mult);
      if (evo) upsertStatus(target, { id: "bleed", duration: BALANCE.bleedDuration, stacks: 1 }, true);
      break;
    }
    case "python": {
      if (!target || target.eliminated) break;
      hitOne(target, 1.0);
      upsertStatus(target, { id: "bound", duration: BALANCE.boundDuration + 1, stacks: 1 });
      upsertStatus(target, { id: "poison", duration: BALANCE.pythonDotDuration, stacks: 1, value: BALANCE.pythonDot });
      if (evo) upsertStatus(target, { id: "armor_break", duration: BALANCE.armorBreakDuration, stacks: 1 });
      line(ctx, "status", `${target.nickname} is Constricted.`);
      break;
    }
    case "scorpion": {
      if (!target || target.eliminated) break;
      hitOne(target, BALANCE.scorpionDamageMult);
      upsertStatus(target, { id: "armor_break", duration: BALANCE.armorBreakDuration, stacks: 1 });
      const chance = evo ? 0.6 : BALANCE.scorpionStunChance;
      if (!target.stunnedLastRound && ctx.rand() < chance) {
        upsertStatus(target, { id: "stun", duration: BALANCE.stunDuration + 1, stacks: 1 });
        line(ctx, "status", `${target.nickname} is Stunned.`);
      }
      break;
    }
    case "octopus": {
      upsertStatus(actor, { id: "ink_cloud", duration: BALANCE.inkDuration + 1, stacks: 1 });
      line(ctx, "action", `${actor.nickname} vanishes into an Ink Cloud.`);
      break;
    }
    case "bat": {
      if (target && !target.eliminated) {
        const a = ctx.actions.get(target.playerId);
        ctx.echo = {
          playerId: target.playerId,
          type: a?.type,
          targetId: a?.targetId,
          zone: a?.zone,
          hidden: false,
        };
        if (evo) upsertStatus(target, { id: "marked", duration: BALANCE.markedDuration, stacks: 1 });
        line(ctx, "action", `${actor.nickname} hears ${target.nickname}'s intent.`, [actor.playerId]);
      }
      break;
    }
    case "cheetah": {
      if (target && !target.eliminated) {
        hitOne(target, 1.35);
        if (evo) upsertStatus(target, { id: "weaken", duration: BALANCE.weakenDuration, stacks: 1 });
      }
      upsertStatus(actor, { id: "sprint", duration: 1, stacks: 1 });
      break;
    }
    case "eagle": {
      upsertStatus(actor, { id: "sky_dive", duration: BALANCE.skyDiveDuration + 1, stacks: 1 });
      if (target && !target.eliminated) hitOne(target, 1.25);
      line(ctx, "action", `${actor.nickname} dives from the sky.`);
      break;
    }
    case "fox": {
      upsertStatus(actor, { id: "trickster", duration: 2, stacks: 1 });
      line(ctx, "action", `${actor.nickname} weaves a Trickster decoy.`);
      break;
    }
    case "cobra": {
      if (!target || target.eliminated) break;
      const betray = maybeBetray(ctx, actor, target);
      const base = zoneDamageBonus(actor, attackStat(actor) * 0.9);
      applyDamage(ctx, actor, target, base, { trueDamage: true, label: "spits venom at", isBetrayal: betray });
      upsertStatus(target, { id: "poison", duration: BALANCE.poisonDuration, stacks: 1 });
      if (evo) upsertStatus(target, { id: "armor_break", duration: BALANCE.armorBreakDuration, stacks: 1 });
      line(ctx, "status", `${target.nickname} is Poisoned. Defend cannot stop the venom.`);
      break;
    }
    case "parrot": {
      if (!ctx.match.lastSpecial) {
        line(ctx, "action", `${actor.nickname} squawks — nothing to Mimic.`);
        break;
      }
      const src = ctx.match.lastSpecial.animalId;
      if (src === "parrot") {
        line(ctx, "action", `${actor.nickname} refuses to mimic another mimic.`);
        break;
      }
      line(ctx, "action", `${actor.nickname} Mimics ${ANIMALS[src].special}!`);
      performSpecial(ctx, actor, action, src);
      break;
    }
    case "bee": {
      actor.consecutiveBee += 1;
      for (const t of enemies(ctx, actor)) hitOne(t, BALANCE.beeSwarmMult);
      if (actor.consecutiveBee >= BALANCE.beeOveruseAfter) {
        const self = evo ? 5 : BALANCE.beeSelfDamage;
        hurt(actor, self);
        line(ctx, "damage", `${actor.nickname}'s Swarm overheats — ${self} self-damage.`);
      }
      break;
    }
    default:
      break;
  }
}

function basicHit(ctx: Ctx, actor: Combatant, target: Combatant, type: "quick" | "heavy") {
  target = decoyTarget(ctx, target, actor);
  if (tryEvade(ctx, target)) {
    line(ctx, "action", `${target.nickname} evades ${actor.nickname}'s ${type === "quick" ? "Quick Strike" : "Heavy Attack"}.`);
    if (hasStatus(target, "sky_dive")) {
      const counter = zoneDamageBonus(target, attackStat(target) * BALANCE.eagleCounter);
      applyDamage(ctx, target, actor, counter, { label: "Sky Dive counters" });
    }
    return;
  }
  const betray = maybeBetray(ctx, actor, target);
  const mult = type === "quick" ? BALANCE.quickMultiplier : BALANCE.heavyMultiplier;
  let base = zoneDamageBonus(actor, attackStat(actor) * mult);
  base *= 1 + roleBonus(actor, target) + predatorBonus(actor, target);
  applyDamage(ctx, actor, target, base, {
    label: type === "quick" ? "Quick Strikes" : "Heavy Attacks",
    isBetrayal: betray,
  });
}

function speedOf(ctx: Ctx, c: Combatant, action?: SubmittedAction): number {
  let s = c.speed + terrainMods(c).spd;
  if (action?.type === "special" && c.animalId === "cheetah") s += 100;
  if (action?.type === "special" && c.animalId === "parrot" && ctx.match.lastSpecial?.animalId === "cheetah") s += 100;
  return s;
}

function lootTable(rand: () => number): LootId {
  const items: LootId[] = ["health_pack", "energy_cell", "damage_boost", "armor", "trap"];
  return items[Math.floor(rand() * items.length)];
}

function giveLoot(ctx: Ctx, winner: Combatant, item: LootId) {
  if (item === "health_pack") {
    heal(winner, BALANCE.crateHealthPack);
    line(ctx, "loot", `${winner.nickname} opens a Health Pack (+${BALANCE.crateHealthPack} HP).`);
  } else if (item === "energy_cell") {
    addEnergy(winner, BALANCE.crateEnergy);
    line(ctx, "loot", `${winner.nickname} cracks an Energy Cell (+${BALANCE.crateEnergy}).`);
  } else if (item === "damage_boost") {
    upsertStatus(winner, { id: "damage_boost", duration: BALANCE.crateDamageBoostDuration, stacks: 1 });
    line(ctx, "loot", `${winner.nickname} gains a Damage Boost.`);
  } else if (item === "armor") {
    upsertStatus(winner, { id: "armor_loot", duration: BALANCE.crateArmorDuration, stacks: 1 });
    line(ctx, "loot", `${winner.nickname} straps on Armor (+2 Defense).`);
  } else {
    winner.trapArmed = true;
    line(ctx, "loot", `${winner.nickname} arms a Trap.`);
  }
}

function bossAction(ctx: Ctx, boss: Combatant) {
  const foes = living(ctx.match).filter((c) => !c.isBoss);
  if (!foes.length) return;
  const focus = [...foes].sort((a, b) => b.damageDealt - a.damageDealt || ctx.rand() - 0.5)[0];
  const roll = ctx.rand();
  if (roll < 0.25) {
    for (const t of foes) {
      applyDamage(ctx, boss, t, attackStat(boss) * 0.7, { label: "slams" });
    }
    line(ctx, "action", `${boss.nickname} shakes the arena!`);
  } else if (roll < 0.45) {
    applyDamage(ctx, boss, focus, attackStat(boss) * 1.5, { label: "crushes" });
    upsertStatus(focus, { id: "weaken", duration: 2, stacks: 1 });
  } else if (roll < 0.65) {
    upsertStatus(boss, { id: "iron_hide", duration: 1, stacks: 1 });
    upsertStatus(boss, { id: "shield", duration: 1, stacks: 1, value: 30 });
    line(ctx, "action", `${boss.nickname} braces behind prehistoric hide.`);
  } else {
    applyDamage(ctx, boss, focus, attackStat(boss) * 1.2, { label: "bites" });
    upsertStatus(focus, { id: "bleed", duration: 3, stacks: 1 }, true);
  }
}

function checkVictory(ctx: Ctx) {
  if (ctx.match.mode === "time" && ctx.match.matchEndsAt && Date.now() >= ctx.match.matchEndsAt) {
    const winners = timeBattleWinner(ctx.match);
    ctx.match.result = winners.length > 1 ? "draw" : "winner";
    ctx.match.winnerIds = winners;
    ctx.match.phase = "ended";
    line(
      ctx,
      "system",
      winners.length > 1
        ? "Time is up. The fight ends in a score tie."
        : `${byId(ctx, winners[0])?.nickname ?? "A beast"} holds the lead when the timer ends.`,
    );
    return;
  }

  const alive = living(ctx.match).filter((c) => !c.isBoss);
  const boss = ctx.match.combatants.find((c) => c.isBoss);

  if (ctx.match.mode === "boss") {
    if (boss && boss.eliminated) {
      ctx.match.result = "boss_win";
      ctx.match.winnerIds = alive.map((c) => c.playerId);
      ctx.match.phase = "ended";
      line(ctx, "system", "The raid boss falls! Survivors claim victory.");
      return;
    }
    if (!alive.length || ctx.match.round >= BALANCE.bossFailRound) {
      ctx.match.result = "boss_fail";
      ctx.match.winnerIds = [];
      ctx.match.phase = "ended";
      line(ctx, "system", "The raid collapses. The titan still stands.");
      return;
    }
    return;
  }

  if (ctx.match.mode === "team") {
    const teams = new Set(alive.map((c) => c.teamId));
    if (teams.size === 1) {
      const team = [...teams][0];
      ctx.match.result = "team";
      ctx.match.winnerIds = ctx.match.combatants.filter((c) => c.teamId === team).map((c) => c.playerId);
      ctx.match.phase = "ended";
      line(ctx, "system", `Team ${String(team).toUpperCase()} wins the clash.`);
      return;
    }
    if (alive.length === 0) {
      ctx.match.result = "draw";
      ctx.match.phase = "ended";
      line(ctx, "system", "Both teams fell together. Draw.");
    }
    return;
  }

  if (ctx.match.mode === "koth") {
    const scores = ctx.match.koth;
    const top = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
    if (top && top[1] >= ctx.match.kothTarget) {
      ctx.match.result = "winner";
      ctx.match.winnerIds = [top[0]];
      ctx.match.phase = "ended";
      const w = byId(ctx, top[0]);
      line(ctx, "system", `${w?.nickname ?? "A beast"} seizes the hill.`);
      return;
    }
  }

  if (alive.length === 1) {
    ctx.match.result = "winner";
    ctx.match.winnerIds = [alive[0].playerId];
    ctx.match.phase = "ended";
    line(ctx, "system", `${alive[0].nickname} is the last beast standing.`);
  } else if (alive.length === 0) {
    ctx.match.result = "draw";
    ctx.match.phase = "ended";
    line(ctx, "system", "Every remaining fighter fell in the same heartbeat. Draw.");
  }
}

function placeEliminations(ctx: Ctx, before: Set<string>) {
  const nowDead = ctx.match.combatants.filter((c) => c.eliminated && !c.isBoss && !before.has(c.playerId));
  const remaining = living(ctx.match).filter((c) => !c.isBoss).length;
  for (const d of nowDead) {
    d.placement = remaining + 1;
    line(ctx, "elim", `${d.nickname} is eliminated.`);
    const contributors = [...ctx.damageThisRound.entries()].filter(([id, amt]) => id === d.playerId && amt > 0);
    void contributors;
    // kill attribution: living combatant who dealt most damage this round to the victim
  }
  for (const attacker of ctx.match.combatants) {
    if (attacker.eliminated) continue;
    for (const d of nowDead) {
      if (d.playerId === attacker.playerId) continue;
      // attribute kill if this attacker dealt damage this round - tracked via damageThisRound on victim only
    }
  }
}

export function resolveRound(match: MatchState, submitted: SubmittedAction[]): MatchState {
  const next: MatchState = JSON.parse(JSON.stringify(match)) as MatchState;
  next.phase = "resolving";
  const rand = mulberry32(next.rngState ^ (next.round * 7919));
  const actions = new Map<string, SubmittedAction>();
  for (const a of submitted) actions.set(a.playerId, a);

  const ctx: Ctx = {
    match: next,
    actions,
    rand,
    log: [],
    defending: new Set(),
    recovering: new Set(),
    startHp: new Map(next.combatants.map((c) => [c.playerId, c.hp])),
    damageThisRound: new Map(),
    idc: 0,
  };

  const aliveBefore = new Set(next.combatants.filter((c) => c.eliminated).map((c) => c.playerId));

  // Default unlocked to Defend
  for (const c of living(next)) {
    if (c.isBoss) continue;
    if (!actions.get(c.playerId)) {
      actions.set(c.playerId, {
        actionId: `auto-${c.playerId}-${next.round}`,
        playerId: c.playerId,
        type: "defend",
        locked: true,
        submittedAt: Date.now(),
      });
    }
  }

  // Stun forces skip -> defend
  for (const c of living(next)) {
    const a = actions.get(c.playerId);
    if (a && hasStatus(c, "stun")) {
      a.type = "defend";
      a.targetId = undefined;
      line(ctx, "status", `${c.nickname} is stunned and can only brace.`);
    }
  }

  // 2. Echo Sight (bats act on reveal before others)
  for (const c of living(next)) {
    const a = actions.get(c.playerId);
    if (a?.type === "special" && c.animalId === "bat") {
      // reveal only; full special also marks if evolved later in order — echo happens now
      const target = a.targetId ? byId(ctx, a.targetId) : undefined;
      if (target) {
        const ta = actions.get(target.playerId);
        ctx.echo = { playerId: target.playerId, type: ta?.type, targetId: ta?.targetId, zone: ta?.zone, hidden: false };
        line(ctx, "action", `${c.nickname} uses Echo Sight on ${target.nickname}.`, [c.playerId]);
      }
    }
  }

  // 3. Defend, Shield, Ink Cloud prep — apply self buffs that must exist before hits
  for (const c of living(next)) {
    const a = actions.get(c.playerId);
    if (!a) continue;
    if (a.type === "defend") {
      ctx.defending.add(c.playerId);
      line(ctx, "action", `${c.nickname} Defends.`);
    }
    if (a.type === "recover") ctx.recovering.add(c.playerId);
    if (a.type === "special") {
      if (c.animalId === "hippo") {
        ctx.defending.add(c.playerId);
        upsertStatus(c, { id: "territorial", duration: 1, stacks: 1 });
      }
      if (c.animalId === "bear") upsertStatus(c, { id: "iron_hide", duration: 1, stacks: 1 });
      if (c.animalId === "lion") upsertStatus(c, { id: "kings_aura", duration: 1, stacks: 1 });
      if (c.animalId === "octopus") upsertStatus(c, { id: "ink_cloud", duration: BALANCE.inkDuration + 1, stacks: 1 });
      if (c.animalId === "eagle") upsertStatus(c, { id: "sky_dive", duration: BALANCE.skyDiveDuration + 1, stacks: 1 });
      if (c.animalId === "fox") upsertStatus(c, { id: "trickster", duration: 2, stacks: 1 });
    }
  }

  const ordered = living(next)
    .filter((c) => !c.isBoss)
    .map((c) => ({ c, a: actions.get(c.playerId)! }))
    .sort((x, y) => {
      const ds = speedOf(ctx, y.c, y.a) - speedOf(ctx, x.c, x.a);
      if (ds !== 0) return ds;
      return ctx.rand() < 0.5 ? -1 : 1;
    });

  for (const { c, a } of ordered) {
    if (c.eliminated) continue;
    if (a.type === "move" && a.zone) {
      c.zone = a.zone;
      line(ctx, "action", `${c.nickname} moves to the ${a.zone}.`);
      c.consecutiveBee = 0;
      continue;
    }
    if (a.type === "grab_crate") {
      line(ctx, "action", `${c.nickname} lunges for the crate.`);
      c.consecutiveBee = 0;
      continue;
    }
    if (a.type === "defend") {
      c.consecutiveBee = 0;
      continue;
    }
    if (a.type === "recover") {
      let hp: number = BALANCE.recoverHp;
      if (next.weather === "drought") hp = Math.floor(hp / 2);
      heal(c, hp);
      addEnergy(c, BALANCE.recoverEnergy);
      line(ctx, "heal", `${c.nickname} Recovers (+${hp} HP, +${BALANCE.recoverEnergy} energy).`);
      c.consecutiveBee = 0;
      continue;
    }
    if (a.type === "quick" || a.type === "heavy") {
      if (a.type === "heavy") spendEnergy(c, BALANCE.heavyCost);
      const t = a.targetId ? byId(ctx, a.targetId) : undefined;
      if (!t || t.eliminated) {
        line(ctx, "action", `${c.nickname}'s attack finds no valid target.`);
      } else {
        basicHit(ctx, c, t, a.type);
        const victim = byId(ctx, t.playerId)!;
        if (hasStatus(victim, "territorial") && !c.eliminated) {
          const counter = zoneDamageBonus(victim, attackStat(victim) * BALANCE.hippoCounter);
          applyDamage(ctx, victim, c, counter, { label: "Territorial counters" });
          if (victim.evolved) upsertStatus(c, { id: "bleed", duration: BALANCE.bleedDuration, stacks: 1 }, true);
        }
      }
      c.consecutiveBee = 0;
      continue;
    }
    if (a.type === "special") {
      const cost =
        c.animalId === "parrot" && c.evolved
          ? Math.max(0, ANIMALS.parrot.energyCost - BALANCE.evolvedCostDiscount)
          : ANIMALS[c.animalId].energyCost;
      spendEnergy(c, cost);
      c.cooldown = ANIMALS[c.animalId].cooldown;
      c.specialsUsed += 1;
      if (c.animalId !== "bee") c.consecutiveBee = 0;
      performSpecial(ctx, c, a);
      if (c.animalId !== "parrot") next.lastSpecial = { playerId: c.playerId, animalId: c.animalId };
      else if (next.lastSpecial) {
        /* keep last non-parrot */
      }
      continue;
    }
  }

  // Boss acts after players
  const boss = next.combatants.find((c) => c.isBoss && !c.eliminated);
  if (boss && next.mode === "boss") bossAction(ctx, boss);

  // Last stand (eliminated)
  for (const c of next.combatants) {
    const a = actions.get(c.playerId);
    if (a?.type === "last_stand" && c.eliminated && !c.lastStandUsed) {
      const t = a.targetId ? byId(ctx, a.targetId) : undefined;
      if (t && !t.eliminated) {
        upsertStatus(t, { id: "weaken", duration: 1, stacks: 1 });
        c.lastStandUsed = true;
        line(ctx, "status", `${c.nickname}'s Last Stand haunts ${t.nickname} with Weaken.`);
      }
    }
  }

  // 7. Status ticks (DoT ignores defense)
  for (const c of living(next)) {
    const t = tickStatuses(c);
    const dot = t.poison + t.burn + t.bleed;
    if (t.poison) {
      hurt(c, t.poison);
      c.damageTaken += t.poison;
      line(ctx, "status", `${c.nickname} takes ${t.poison} Poison.`);
    }
    if (t.burn) {
      hurt(c, t.burn);
      c.damageTaken += t.burn;
      line(ctx, "status", `${c.nickname} takes ${t.burn} Burn.`);
    }
    if (t.bleed) {
      hurt(c, t.bleed);
      c.damageTaken += t.bleed;
      line(ctx, "status", `${c.nickname} takes ${t.bleed} Bleed.`);
    }
    void dot;
  }

  // River heal
  for (const c of living(next)) {
    if (c.zone === "river") {
      heal(c, BALANCE.riverHeal);
      line(ctx, "heal", `${c.nickname} drinks from the river (+${BALANCE.riverHeal} HP).`);
    }
  }

  // 8. Zone damage
  const z = zoneInfo(next.round);
  for (const c of living(next)) {
    if (!z.safe.includes(c.zone) && z.damage > 0) {
      hurt(c, z.damage);
      c.damageTaken += z.damage;
      line(ctx, "zone", `${c.nickname} is scorched by the collapsing wilds (${z.damage}).`);
    }
  }

  // 9. Loot contest
  if (next.crateAvailable) {
    const grabbers = living(next)
      .filter((c) => actions.get(c.playerId)?.type === "grab_crate")
      .sort((a, b) => {
        const sa = a.speed + terrainMods(a).spd + (a.zone === next.crateZone ? 2 : 0);
        const sb = b.speed + terrainMods(b).spd + (b.zone === next.crateZone ? 2 : 0);
        if (sb !== sa) return sb - sa;
        return ctx.rand() < 0.5 ? -1 : 1;
      });
    if (grabbers.length) {
      const winner = grabbers[0];
      const item = lootTable(ctx.rand);
      giveLoot(ctx, winner, item);
      ctx.crateWinner = winner.playerId;
      ctx.crateItem = item;
    }
  }

  // Energy regen & cooldowns
  for (const c of next.combatants) {
    if (c.eliminated) continue;
    addEnergy(c, BALANCE.energyRegen);
    if (c.cooldown > 0) c.cooldown -= 1;
    c.roundsSurvived += 1;
    c.stunnedLastRound = !!hasStatus(c, "stun");
    if (!c.evolved && (c.kills >= BALANCE.evolutionKills || c.roundsSurvived >= BALANCE.evolutionRounds)) {
      c.evolved = true;
      line(ctx, "evolve", `${c.nickname} evolves — ${ANIMALS[c.animalId].evolution}`);
    }
  }

  // Kill attribution from new deaths
  const newlyDead = next.combatants.filter((c) => c.eliminated && !c.isBoss && !aliveBefore.has(c.playerId));
  // Use last damaging actor approximation: highest damageDealt among living who targeted them this round
  for (const d of newlyDead) {
    let killer: Combatant | undefined;
    for (const a of next.combatants) {
      if (a.eliminated || a.playerId === d.playerId) continue;
      const act = actions.get(a.playerId);
      if (act?.targetId === d.playerId || (act?.type === "special" && (a.animalId === "elephant" || a.animalId === "bee"))) {
        if (!killer || a.damageDealt >= killer.damageDealt) killer = a;
      }
    }
    if (killer) {
      killer.kills += 1;
      line(ctx, "elim", `${killer.nickname} scores the elimination on ${d.nickname}.`);
      if (next.bountyPlayerId && next.bountyPlayerId === d.playerId) {
        addEnergy(killer, BALANCE.bountyEnergy);
        heal(killer, BALANCE.bountyHp);
        line(ctx, "bounty", `${killer.nickname} claims the bounty (+${BALANCE.bountyEnergy} energy, +${BALANCE.bountyHp} HP).`);
      }
    }
    d.placement = living(next).filter((c) => !c.isBoss).length + 1;
  }

  // Bounty: most kills among living
  const contenders = living(next).filter((c) => !c.isBoss);
  if (contenders.length) {
    const topKills = Math.max(...contenders.map((c) => c.kills));
    if (topKills > 0) {
      const tied = contenders.filter((c) => c.kills === topKills).sort((a, b) => a.playerId.localeCompare(b.playerId));
      const nextBounty = tied[0].playerId;
      if (next.bountyPlayerId !== nextBounty) {
        next.bountyPlayerId = nextBounty;
        line(ctx, "bounty", `${tied[0].nickname} now carries the bounty mark.`);
      }
    }
  }

  // KOTH scoring
  if (next.mode === "koth") {
    for (const c of living(next)) {
      if (c.zone === "center") {
        next.koth[c.playerId] = (next.koth[c.playerId] ?? 0) + BALANCE.kothCenterPoints;
        line(ctx, "system", `${c.nickname} holds the hill (${next.koth[c.playerId]} pts).`);
      }
    }
  }

  // Weather rotation
  if (next.round % BALANCE.weatherEveryNRounds === 0) {
    const opts: MatchState["weather"][] = ["storm", "fog", "drought"];
    next.weather = opts[Math.floor(ctx.rand() * opts.length)];
    next.weatherEndsRound = next.round + BALANCE.weatherDuration;
    line(ctx, "weather", `Weather shifts: ${next.weather}.`);
  } else if (next.round >= next.weatherEndsRound) {
    if (next.weather !== "clear") line(ctx, "weather", "Skies clear.");
    next.weather = "clear";
  }

  next.crateZone = ["forest", "swamp", "cliff", "river", "center"][Math.floor(ctx.rand() * 5)] as Terrain;
  next.crateAvailable = true;

  checkVictory(ctx);

  const publicActions: PublicActionView[] = [...actions.values()].map((a) => {
    const actor = byId(ctx, a.playerId);
    const hidden = !!(actor && hasStatus(actor, "ink_cloud"));
    return {
      playerId: a.playerId,
      type: hidden ? undefined : a.type,
      targetId: hidden ? undefined : a.targetId,
      zone: hidden ? undefined : a.zone,
      hidden,
    };
  });

  next.recap = {
    round: next.round,
    lines: ctx.log,
    actions: publicActions,
    crateWinnerId: ctx.crateWinner,
    crateItem: ctx.crateItem,
    eliminations: newlyDead.map((c) => c.playerId),
    weather: next.weather,
  };
  next.log = [...next.log, ...ctx.log].slice(-400);
  next.rngState = (next.rngState + Math.floor(ctx.rand() * 1e9)) >>> 0;

  if (next.result === "none") {
    next.phase = "recap";
    next.round += 1;
  }
  return next;
}

export function scoreTimeBattle(match: MatchState): Map<string, number> {
  const scores = new Map<string, number>();
  for (const combatant of match.combatants) {
    if (combatant.isBoss) continue;
    const survival = Math.max(0, Math.floor((combatant.roundsSurvived || 0) / 10));
    const damagePoints = Math.floor((combatant.damageDealt || 0) / 100) * 10;
    const score = (combatant.kills || 0) * 100 + (combatant.damageDealt > 0 ? damagePoints : 0) + survival;
    scores.set(combatant.playerId, score);
  }
  return scores;
}

export function timeBattleWinner(match: MatchState): string[] {
  const scores = scoreTimeBattle(match);
  const entries = [...scores.entries()].sort((a, b) => {
    if (b[1] !== a[1]) return b[1] - a[1];
    const aCombat = match.combatants.find((c) => c.playerId === a[0]);
    const bCombat = match.combatants.find((c) => c.playerId === b[0]);
    if (!aCombat || !bCombat) return 0;
    if ((bCombat.kills || 0) !== (aCombat.kills || 0)) return (bCombat.kills || 0) - (aCombat.kills || 0);
    if ((bCombat.damageDealt || 0) !== (aCombat.damageDealt || 0)) return (bCombat.damageDealt || 0) - (aCombat.damageDealt || 0);
    if ((bCombat.roundsSurvived || 0) !== (aCombat.roundsSurvived || 0)) return (bCombat.roundsSurvived || 0) - (aCombat.roundsSurvived || 0);
    return 0;
  });
  const topScore = entries[0]?.[1] ?? 0;
  const winners = entries.filter(([, score]) => score === topScore).map(([id]) => id);
  return winners;
}

export function beginSelectPhase(match: MatchState, now = Date.now()): MatchState {
  if (match.phase === "ended") return match;
  const next = {
    ...match,
    phase: "select",
    decisionEndsAt: now + match.decisionSeconds * 1000,
  } as MatchState;
  if (match.mode === "time") {
    next.matchEndsAt = (match.matchEndsAt ?? now + (match.timeLimitSeconds ?? 300) * 1000);
    next.timeLimitSeconds = match.timeLimitSeconds ?? 300;
  }
  return next;
}

export function filterMatchFor(match: MatchState, viewerId: string, privateAction?: SubmittedAction, isSpectator = false) {
  const clone: MatchState = JSON.parse(JSON.stringify(match));
  const viewer = clone.combatants.find((c) => c.playerId === viewerId);
  const hiddenHp: string[] = [];
  const hiddenMoves: string[] = [];

  for (const c of clone.combatants) {
    const ink = hasStatus(c, "ink_cloud");
    const forest = c.zone === "forest" && c.playerId !== viewerId;
    const fog = clone.weather === "fog" && c.playerId !== viewerId;
    if (c.playerId !== viewerId && (ink || forest || fog)) {
      hiddenHp.push(c.playerId);
      if (ink || fog) c.hp = -1;
    }
  }

  const allyMoves: PublicActionView[] = [];
  if (match.recap) {
    // public
  }

  return {
    match: clone,
    myId: viewerId,
    privateAction: isSpectator ? undefined : privateAction,
    hiddenHp,
    hiddenMoves,
    allyMoves,
    spectator: isSpectator || viewer?.eliminated,
  };
}

export function xpForMatch(c: Combatant, won: boolean, draw: boolean): number {
  let xp = BALANCE.xp.participation;
  if (won) xp += BALANCE.xp.win;
  else if (draw) xp += BALANCE.xp.draw;
  xp += c.kills * BALANCE.xp.kill;
  xp += Math.floor(c.damageDealt / 10) * BALANCE.xp.damagePer10;
  xp += c.roundsSurvived * BALANCE.xp.surviveRound;
  return xp;
}

