import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { Rng, seedFromString } from "../../src/core/rng";
import { SOUNDS } from "../../src/audio/sound-table";
import { MONSTERS, monsterGroup } from "../../src/data/tables";
import { describeOverworldTile, placeTag } from "../../src/game/minimap";
import { hasQuartermaster } from "../../src/interiors";
import { BALANCE, RULES, setBalanceMode } from "../../src/sim/balance";
import { applyHit, elementalDamage } from "../../src/sim/combat";
import { createCharacter, resistance, resistanceShare } from "../../src/sim/character";
import { PHASE_ROBOT_TEXT, PHASE_TURNS, isPhaseProof, monsterTurn, phaseMonsters, phaseReach, type Encounter, type GridView } from "../../src/sim/encounter";
import { createDefaultParty } from "../../src/sim/party";
import { World } from "../../src/world/world";
import { Explored } from "../../src/game/state";

const rng = (s: string) => new Rng(seedFromString(s));
const byName = (name: string) => Object.values(MONSTERS).find((m) => m.name === name)!;

/** A hero with no gear and the luck given, so that the odds of a special attack are exact. */
const hero = (lck = 10) => createCharacter({ name: "T", classType: "Knight", raceType: "Human", avatar: "character05", attrs: { str: 10, int: 10, per: 10, end: 10, spd: 10, acc: 10, lck } });

describe("bug_fix_56, point 1: the map names the kind of a place and its level", () => {
  it("writes the kind with a capital and the tier of the island in front of it", () => {
    expect(placeTag({ kind: "dungeon", tier: 5 })).toBe("L5 Dungeon");
    expect(placeTag({ kind: "town", tier: 3 })).toBe("L3 Town");
    expect(placeTag({ kind: "castle", tier: 2 })).toBe("L2 Castle");
    expect(placeTag({ kind: "cave", tier: 1 })).toBe("L1 Cave");
  });

  it("is what the mouse-over of an explored place says", () => {
    const world = new World("bug-fix-56", "default");
    const poi = world.allPois().find((p) => p.kind === "dungeon")!;
    const explored = new Explored({ w: world.width, h: world.height });
    explored.markOverworld(poi.x, poi.y);
    expect(describeOverworldTile(world, explored, poi.x, poi.y, [])).toBe(`${poi.name} (L${poi.tier} Dungeon)`);
  });
});

describe("bug_fix_56, point 2: the town portal list names the level and the quartermaster", () => {
  it("exactly one town of level 3 has the quartermaster, no other place does", () => {
    for (const seed of ["a", "b", "c"]) {
      const world = new World(`qm-${seed}`, "default");
      const all = world.allPois();
      const holders = all.filter((p) => hasQuartermaster(world, p));
      expect(holders.length).toBe(all.some((p) => p.kind === "town" && p.tier === 3) ? 1 : 0);
      for (const p of holders) expect(p.kind === "town" && p.tier === 3).toBe(true);
    }
  });
});

describe("bug_fix_56, point 3: the sounds of a key and a key card", () => {
  it("a chest sound for the key (9008) and the user's own file for the pyramid", () => {
    expect(SOUNDS[9008]).toBe("open_chest");
    expect(SOUNDS[9064]).toBe("pyramid_unlock");
    expect(existsSync("public/assets/audio/sfx/pyramid_unlock.webm")).toBe(true);
    expect(existsSync("public/assets/audio/sfx/open_chest.webm")).toBe(true);
    expect(existsSync("tools/assets/sources/audio/pyramid_unlock.mp3")).toBe(true);
  });
});

describe("bug_fix_56, point 4: Dimensional Phasing does not shift robots", () => {
  const robot = Object.entries(MONSTERS).find(([id]) => monsterGroup(Number(id)) === "robot")!;
  const beast = Object.entries(MONSTERS).find(([id]) => monsterGroup(Number(id)) !== "robot" && MONSTERS[Number(id)]!.terrain === "land")!;
  const encounter = (): Encounter => ({
    monsters: [
      { uid: "r", defId: Number(robot[0]), x: 1, y: 0, hp: robot[1].health },
      { uid: "b", defId: Number(beast[0]), x: 0, y: 1, hp: beast[1].health },
    ] as never,
    battleMode: false,
    sequence: [],
    attacker: null,
  });

  it("phases the others and leaves the robot", () => {
    const e = encounter();
    const reach = phaseReach(e, 0, 0);
    expect(reach.map((m) => m.uid).sort()).toEqual(["b", "r"]);
    expect(reach.filter(isPhaseProof).map((m) => m.uid)).toEqual(["r"]);
    const caught = phaseMonsters(e, 0, 0);
    expect(caught.map((m) => m.uid)).toEqual(["b"]);
    expect(e.monsters.find((m) => m.uid === "b")!.phased).toBe(PHASE_TURNS);
    expect(e.monsters.find((m) => m.uid === "r")!.phased).toBeUndefined();
  });

  it("has the words the player is told", () => {
    expect(PHASE_ROBOT_TEXT).toBe("It seems impossible to shift these metal creatures into another dimension.");
  });
});

describe("bug_fix_56, point 5 and 8: resistances and the Fairy", () => {
  it("the Fairy adds 15 percent to every resistance of every hero, up to the cap", () => {
    const c = hero();
    c.resFire = 20;
    c.resIce = 70;
    expect(resistance(c, "fire")).toBe(20);
    expect(resistance(c, "fire", "Wolf")).toBe(20);
    expect(resistance(c, "fire", "Fairy")).toBe(35);
    expect(resistance(c, "magic", "Fairy")).toBe(c.resMagic + 15);
    // 70 + 15 is 85 on the sheet, 80 in a fight
    expect(resistance(c, "ice", "Fairy")).toBe(85);
    expect(resistanceShare(c, "ice", "Fairy")).toBe(80);
  });

  it("takes nothing off the hit as points any more: a hit of 100 on a hero without resistance does 85", () => {
    const party = createDefaultParty();
    const c = party.characters[0]!;
    c.resAcid = 0;
    party.mascot = "Fairy";
    expect(elementalDamage(party, c, "acid", 100)).toBe(85);
    // legacy: the old 20 points
    setBalanceMode("legacy");
    try {
      expect(elementalDamage(party, c, "acid", 100)).toBe(80);
    } finally {
      setBalanceMode("v4");
    }
    expect(BALANCE.mode).toBe("v4");
  });
});

describe("bug_fix_56, point 6: the Terminator's Eradication is Rotten, a deadly hit is Dead", () => {
  const terminator = Object.values(MONSTERS).find((m) => m.name === "Terminator")!;

  it("causes Eradication, which is Rotten", () => {
    expect(terminator.causes).toEqual(["Rotten"]);
  });

  it("a deadly hit is dead, rotten only when the special attack takes effect (and then not dead as well)", () => {
    // luck 1: the special attack is certain
    for (let i = 0; i < 20; i++) {
      const party = createDefaultParty();
      party.characters = [hero(1), hero(1)];
      applyHit(party, 0, 5000, terminator, rng(`t${i}`));
      const c = party.characters[0]!;
      expect(c.conditions, `try ${i}`).toContain("Rotten");
      expect(c.conditions, `try ${i}`).not.toContain("Dead");
    }
    // luck 1000: the special attack almost never works (5 / (1000 x 1000 x 0.05) per hit), the deadly blow kills
    let dead = 0;
    for (let i = 0; i < 20; i++) {
      const party = createDefaultParty();
      party.characters = [hero(1000), hero(1000)];
      applyHit(party, 0, 5000, terminator, rng(`u${i}`));
      const c = party.characters[0]!;
      if (c.conditions.includes("Dead")) dead++;
      expect(c.conditions).not.toContain("Rotten");
    }
    expect(dead).toBe(20);
  });

  it("another monster still kills outright", () => {
    const party = createDefaultParty();
    party.characters = [hero(10), hero(10)];
    applyHit(party, 0, 5000, byName("Goblin"), rng("g"));
    expect(party.characters[0]!.conditions).toContain("Dead");
    expect(party.characters[0]!.conditions).not.toContain("Rotten");
  });

  it("its shots carry the special attack too (it only ever shoots)", () => {
    const view = { walkable: () => true, water: () => false, opaque: () => false } as unknown as GridView;
    let rotten = 0;
    for (let i = 0; i < 40; i++) {
      const party = createDefaultParty();
      // a hero of high level is not missed by chance, luck 1 makes the special certain (10 / (1 x 0.05) is above 1)
      const c = hero(1);
      c.level = 9;
      c.hp = c.health = 100000;
      party.characters = [c];
      const e: Encounter = { monsters: [{ uid: "t", defId: Number(Object.entries(MONSTERS).find(([, m]) => m.name === "Terminator")![0]), x: 3, y: 0, hp: terminator.health }] as never, battleMode: false, sequence: [], attacker: null };
      monsterTurn(party, view, e, 0, 0, rng(`s${i}`));
      if (c.conditions.includes("Rotten")) rotten++;
    }
    expect(rotten).toBeGreaterThan(0);
  });
});

describe("bug_fix_56, point 7: FORMULAS 1.2, a hit without damage still counts for the special attack", () => {
  const poisoner = Object.values(MONSTERS).find((m) => m.causes.includes("Poisoned") && !m.ranged)!;

  it("one hit in ten without damage poisons (luck 1 makes the second roll certain)", () => {
    let poisoned = 0;
    for (let i = 0; i < 2000; i++) {
      const party = createDefaultParty();
      party.characters = [hero(1), hero(1)];
      applyHit(party, 0, 0, poisoner, rng(`z${i}`));
      if (party.characters[0]!.conditions.includes("Poisoned")) poisoned++;
    }
    expect(poisoned).toBeGreaterThan(2000 * RULES.v4.specialWithoutDamage * 0.7);
    expect(poisoned).toBeLessThan(2000 * RULES.v4.specialWithoutDamage * 1.3);
  });

  it("a hit with damage rolls as before, and a monster without a special draws no extra number", () => {
    const party = createDefaultParty();
    party.characters = [hero(1), hero(1)];
    applyHit(party, 0, 1, poisoner, rng("d"));
    expect(party.characters[0]!.conditions).toContain("Poisoned");
    const plain = Object.values(MONSTERS).find((m) => m.causes.length === 0)!;
    const a = rng("same");
    const b = rng("same");
    const p = createDefaultParty();
    applyHit(p, 0, 0, plain, a);
    expect(a.float()).toBe(b.float());
  });

  it("is switched off in the legacy mode", () => {
    setBalanceMode("legacy");
    try {
      let poisoned = 0;
      for (let i = 0; i < 300; i++) {
        const party = createDefaultParty();
        party.characters = [hero(1), hero(1)];
        applyHit(party, 0, 0, poisoner, rng(`z${i}`));
        if (party.characters[0]!.conditions.includes("Poisoned")) poisoned++;
      }
      expect(poisoned).toBe(0);
    } finally {
      setBalanceMode("v4");
    }
  });
});
