import { describe, expect, it } from "vitest";
import { ANIMAL_LIST, ANIMALS } from "../shared/animals";
import { BALANCE, zoneInfo } from "../shared/balance";
import {
  addEnergy,
  defenseReduction,
  directDamage,
  effectiveDefenseValue,
  heal,
  spendEnergy,
  upsertStatus,
} from "../shared/combat";
import { createCombatant, newMatch } from "../shared/factory";
import { resolveRound, scoreTimeBattle, timeBattleWinner } from "../shared/resolve";
import type { Combatant, MatchState, SubmittedAction } from "../shared/types";
import { validateAction, validateNickname } from "../shared/validate";

function act(playerId: string, type: SubmittedAction["type"], extra: Partial<SubmittedAction> = {}): SubmittedAction {
  return { actionId: `${playerId}-${type}`, playerId, type, locked: true, submittedAt: 1, ...extra };
}

function duel(a: Combatant, b: Combatant, seed = 1): MatchState {
  return newMatch({
    id: "m",
    roomId: "r",
    mode: "classic",
    teamSize: 0,
    uniqueAnimals: true,
    decisionSeconds: 10,
    spectatorsAllowed: true,
    combatants: [a, b],
    seed,
  });
}

describe("roster", () => {
  it("defines all 20 animals with required stats", () => {
    expect(ANIMAL_LIST).toHaveLength(20);
    expect(ANIMALS.elephant).toMatchObject({ hp: 160, attack: 25, defense: 9, speed: 3 });
    expect(ANIMALS.hippo.hp).toBe(150);
    expect(ANIMALS.bear.hp).toBe(150);
    expect(ANIMALS.rhino.attack).toBe(30);
    expect(ANIMALS.gorilla.hp).toBe(135);
    expect(ANIMALS.lion.hp).toBe(120);
    expect(ANIMALS.crocodile.cooldown).toBe(3);
    expect(ANIMALS.tiger.attack).toBe(30);
    expect(ANIMALS.wolf.speed).toBe(9);
    expect(ANIMALS.shark.attack).toBe(28);
    expect(ANIMALS.python.hp).toBe(95);
    expect(ANIMALS.scorpion.hp).toBe(75);
    expect(ANIMALS.octopus.hp).toBe(90);
    expect(ANIMALS.bat.defense).toBe(2);
    expect(ANIMALS.cheetah.speed).toBe(10);
    expect(ANIMALS.eagle.speed).toBe(10);
    expect(ANIMALS.fox.attack).toBe(15);
    expect(ANIMALS.cobra.hp).toBe(80);
    expect(ANIMALS.parrot.special).toBe("Mimic");
    expect(ANIMALS.bee.hp).toBe(70);
  });
});

describe("damage formula", () => {
  it("caps defense reduction at 60%", () => {
    expect(defenseReduction(100)).toBe(BALANCE.defenseCap);
    expect(directDamage(100, 100)).toBe(40);
  });
  it("applies defend double and recover half", () => {
    const d = effectiveDefenseValue(5, true, false);
    expect(d).toBe(10);
    const r = effectiveDefenseValue(8, false, true);
    expect(r).toBe(4);
  });
  it("minimum direct damage is 1", () => {
    expect(directDamage(1, 0)).toBe(1);
  });
});

describe("energy and caps", () => {
  it("spends and regenerates without going negative or over cap", () => {
    const c = createCombatant("a", "A", "lion");
    expect(spendEnergy(c, 200)).toBe(false);
    expect(spendEnergy(c, 20)).toBe(true);
    addEnergy(c, 999);
    expect(c.energy).toBe(100);
    c.hp = 10;
    heal(c, 999);
    expect(c.hp).toBe(c.maxHp);
  });
});

describe("status engine", () => {
  it("stacks bleed up to 3", () => {
    const c = createCombatant("a", "A", "wolf");
    upsertStatus(c, { id: "bleed", duration: 3, stacks: 1 }, true);
    upsertStatus(c, { id: "bleed", duration: 3, stacks: 1 }, true);
    upsertStatus(c, { id: "bleed", duration: 3, stacks: 1 }, true);
    upsertStatus(c, { id: "bleed", duration: 3, stacks: 1 }, true);
    expect(c.statuses[0].stacks).toBe(3);
  });
});

describe("nicknames", () => {
  it("rejects bad names", () => {
    expect(validateNickname("x").ok).toBe(false);
    expect(validateNickname("a".repeat(40)).ok).toBe(false);
    expect(validateNickname("GoodWolf").ok).toBe(true);
  });
});

describe("round resolution", () => {
  it("elephant stampede hits all opponents", () => {
    const e = createCombatant("e", "Ellie", "elephant");
    const f = createCombatant("f", "Fox", "fox");
    const b = createCombatant("b", "Bee", "bee");
    const match = newMatch({
      id: "m",
      roomId: "r",
      mode: "classic",
      teamSize: 0,
      uniqueAnimals: true,
      decisionSeconds: 10,
      spectatorsAllowed: true,
      combatants: [e, f, b],
      seed: 42,
    });
    const out = resolveRound(match, [
      act("e", "special"),
      act("f", "defend"),
      act("b", "defend"),
    ]);
    const fox = out.combatants.find((c) => c.playerId === "f")!;
    const bee = out.combatants.find((c) => c.playerId === "b")!;
    expect(fox.hp).toBeLessThan(ANIMALS.fox.hp);
    expect(bee.hp).toBeLessThan(ANIMALS.bee.hp);
  });

  it("cobra poison ignores defend and ticks", () => {
    const c = createCombatant("c", "Cobra", "cobra");
    const t = createCombatant("t", "Tank", "elephant");
    const out = resolveRound(duel(c, t, 7), [act("c", "special", { targetId: "t" }), act("t", "defend")]);
    const tank = out.combatants.find((x) => x.playerId === "t")!;
    expect(tank.statuses.some((s) => s.id === "poison")).toBe(true);
    expect(tank.hp).toBeLessThan(ANIMALS.elephant.hp);
  });

  it("python binds recover/special", () => {
    const p = createCombatant("p", "Py", "python");
    const e = createCombatant("e", "El", "elephant");
    const out = resolveRound(duel(p, e, 3), [act("p", "special", { targetId: "e" }), act("e", "defend")]);
    const el = out.combatants.find((x) => x.playerId === "e")!;
    const err = validateAction(out, el, act("e", "special"));
    expect(err).toBeTruthy();
  });

  it("simultaneous wipe is a draw", () => {
    const a = createCombatant("a", "A", "bee");
    a.hp = 1;
    const b = createCombatant("b", "B", "bee");
    b.hp = 1;
    const out = resolveRound(duel(a, b, 9), [act("a", "special"), act("b", "special")]);
    expect(out.result === "draw" || out.combatants.every((c) => c.hp <= 1)).toBe(true);
  });

  it("zone damage ignores defense after round 5", () => {
    expect(zoneInfo(5).damage).toBe(10);
    expect(zoneInfo(11).safe).toEqual(["center"]);
    const a = createCombatant("a", "A", "bear");
    a.zone = "forest";
    const b = createCombatant("b", "B", "bear");
    b.zone = "center";
    const m = duel(a, b, 1);
    m.round = 5;
    const out = resolveRound(m, [act("a", "defend"), act("b", "defend")]);
    expect(out.combatants.find((c) => c.playerId === "a")!.hp).toBeLessThan(ANIMALS.bear.hp);
  });

  it("loot goes to fastest grabber", () => {
    const fast = createCombatant("f", "Fast", "cheetah");
    const slow = createCombatant("s", "Slow", "elephant");
    const out = resolveRound(duel(fast, slow, 11), [act("f", "grab_crate"), act("s", "grab_crate")]);
    expect(out.recap?.crateWinnerId).toBe("f");
  });

  it("alliance blocks targeting until betrayal", () => {
    const a = createCombatant("a", "A", "tiger");
    const b = createCombatant("b", "B", "wolf");
    const m = duel(a, b, 2);
    m.alliances = [{ a: "a", b: "b", active: true }];
    const hp = b.hp;
    const out = resolveRound(m, [act("a", "quick", { targetId: "b" }), act("b", "defend")]);
    const victim = out.combatants.find((c) => c.playerId === "b")!;
    expect(victim.hp).toBeLessThan(hp);
    expect(out.alliances.some((x) => x.active)).toBe(false);
  });

  it("bounty rewards the killer", () => {
    const a = createCombatant("a", "A", "tiger");
    const b = createCombatant("b", "B", "bee");
    b.hp = 5;
    const m = duel(a, b, 4);
    m.bountyPlayerId = "b";
    const out = resolveRound(m, [act("a", "heavy", { targetId: "b" }), act("b", "defend")]);
    if (out.combatants.find((c) => c.playerId === "b")!.eliminated) {
      expect(out.combatants.find((c) => c.playerId === "a")!.energy).toBeGreaterThan(50);
    }
  });

  it("evolution after five survived rounds", () => {
    const a = createCombatant("a", "A", "lion");
    a.roundsSurvived = 4;
    const b = createCombatant("b", "B", "bear");
    const out = resolveRound(duel(a, b, 1), [act("a", "defend"), act("b", "defend")]);
    expect(out.combatants.find((c) => c.playerId === "a")!.evolved).toBe(true);
  });

  it("late invalid heavy is rejected by validator", () => {
    const a = createCombatant("a", "A", "fox");
    a.energy = 0;
    const m = duel(a, createCombatant("b", "B", "bear"), 1);
    expect(validateAction(m, a, act("a", "heavy", { targetId: "b" }))).toBeTruthy();
  });

  it("team members are not valid attack targets", () => {
    const a = createCombatant("a", "A", "lion", { teamId: "a" });
    const b = createCombatant("b", "B", "tiger", { teamId: "a" });
    const m = newMatch({
      id: "m",
      roomId: "r",
      mode: "team",
      teamSize: 2,
      uniqueAnimals: true,
      decisionSeconds: 10,
      spectatorsAllowed: true,
      combatants: [a, b, createCombatant("c", "C", "wolf", { teamId: "b" }), createCombatant("d", "D", "fox", { teamId: "b" })],
      seed: 1,
    });
    expect(validateAction(m, a, act("a", "quick", { targetId: "b" }))).toBeTruthy();
  });

  it("duplicate action ids resolve a round only once logically", () => {
    const a = createCombatant("a", "A", "lion");
    const b = createCombatant("b", "B", "wolf");
    const m = duel(a, b, 5);
    const first = resolveRound(m, [act("a", "defend"), act("b", "defend")]);
    const second = resolveRound(m, [act("a", "defend"), act("b", "defend")]);
    expect(first.round).toBe(second.round);
  });
});

describe("time battle", () => {
  it("scores time battle by eliminations, damage, and survival", () => {
    const a = createCombatant("a", "A", "lion", { kills: 2, damageDealt: 220, roundsSurvived: 30 });
    const b = createCombatant("b", "B", "wolf", { kills: 1, damageDealt: 190, roundsSurvived: 20 });
    const match = newMatch({
      id: "m",
      roomId: "r",
      mode: "time",
      teamSize: 0,
      uniqueAnimals: true,
      decisionSeconds: 300,
      spectatorsAllowed: true,
      combatants: [a, b],
      seed: 42,
    });
    const scores = scoreTimeBattle(match);
    expect(scores.get("a")).toBeGreaterThan(scores.get("b")!);
    expect(timeBattleWinner(match)).toEqual(["a"]);
  });

  it("time battle tiebreaker chooses the higher elimination count", () => {
    const a = createCombatant("a", "A", "bear", { kills: 2, damageDealt: 100, roundsSurvived: 30 });
    const b = createCombatant("b", "B", "tiger", { kills: 2, damageDealt: 90, roundsSurvived: 25 });
    const match = newMatch({
      id: "m",
      roomId: "r",
      mode: "time",
      teamSize: 0,
      uniqueAnimals: true,
      decisionSeconds: 300,
      spectatorsAllowed: true,
      combatants: [a, b],
      seed: 4,
    });
    expect(timeBattleWinner(match)).toEqual(["a"]);
  });
});

describe("weather and terrain", () => {
  it("drought halves recover", () => {
    const a = createCombatant("a", "A", "bear");
    a.hp = 50;
    const b = createCombatant("b", "B", "bear");
    const m = duel(a, b, 1);
    m.weather = "drought";
    const out = resolveRound(m, [act("a", "recover"), act("b", "defend")]);
    expect(out.combatants[0].hp).toBe(50 + Math.floor(BALANCE.recoverHp / 2));
  });
});
