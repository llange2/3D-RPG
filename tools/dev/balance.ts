/**
 * Headless balance check: the default party against groups of monsters of a tier, in an open hall.
 * The party opens fire from the edge of the action radius (ranged volleys while the monsters walk up), then fights in melee.
 * Usage: tsx tools/dev/balance.ts [fights per cell] [tiers] [party level offset per tier, default 0 = always level 1]
 */
import { Rng, seedFromString } from "../../src/core/rng";
import { MONSTER_THEME_NAMES, pickMonster } from "../../src/data/monsters";
import { canAct, levelUp } from "../../src/sim/character";
import { createEncounter, createMonster, partyAttack, updateBattleMode, type GridView } from "../../src/sim/encounter";
import { createDefaultParty, isDefeated } from "../../src/sim/party";

const fights = Number(process.argv[2] ?? 200);
const tiers = (process.argv[3] ?? "1,2,3,4,5").split(",").map(Number);
const levelsPerTier = Number(process.argv[4] ?? 0);

const view: GridView = { walkable: (x, y) => x >= 0 && y >= 0 && x < 30 && y < 9, water: () => false, opaque: () => false };

function fight(seed: string, tier: number, group: number): { won: boolean; survivors: number; rounds: number } {
  const rng = new Rng(seedFromString(seed));
  const party = createDefaultParty();
  for (const c of party.characters) levelUp(c, party.talents, Math.round(levelsPerTier * (tier - 1)));
  const enc = createEncounter();
  for (let i = 0; i < group; i++) {
    const theme = MONSTER_THEME_NAMES[rng.int(MONSTER_THEME_NAMES.length)]!;
    const def = pickMonster(rng, theme, tier, false);
    enc.monsters.push(createMonster(`m${i}`, def.id, 8 + (i % 2), 4 + Math.floor(i / 2) * 2 - (group > 2 ? 2 : 0)));
  }
  let rounds = 0;
  while (!isDefeated(party) && enc.monsters.some((m) => m.hp > 0) && rounds < 400) {
    rounds++;
    updateBattleMode(enc, 3, 4);
    const target = [...enc.monsters].filter((m) => m.hp > 0).sort((a, b) => Math.abs(a.x - 3) + Math.abs(a.y - 4) - (Math.abs(b.x - 3) + Math.abs(b.y - 4)))[0]!;
    const adjacent = Math.abs(target.x - 3) + Math.abs(target.y - 4) === 1;
    const events = partyAttack(party, view, enc, 3, 4, rng, { kind: adjacent ? "melee" : "ranged", targetUid: target.uid });
    if (events[0]?.type === "denied") {
      // no ranged weapon in reach: wait for them to come (the real game lets the player step back; here we just melee when adjacent)
      const retry = partyAttack(party, view, enc, 3, 4, rng, { kind: "melee", targetUid: target.uid });
      if (retry[0]?.type === "denied") break;
    }
  }
  const survivors = party.characters.filter((c) => canAct(c)).length;
  return { won: enc.monsters.every((m) => m.hp <= 0) && !isDefeated(party), survivors, rounds };
}

console.log(`fights per cell: ${fights}`);
console.log("tier group  win%  avgSurvivors  avgRounds");
for (const tier of tiers) {
  for (const group of [1, 2, 3]) {
    let wins = 0;
    let surv = 0;
    let rounds = 0;
    for (let i = 0; i < fights; i++) {
      const r = fight(`bal:${tier}:${group}:${i}`, tier, group);
      if (r.won) wins++;
      surv += r.survivors;
      rounds += r.rounds;
    }
    console.log(`${String(tier).padStart(4)} ${String(group).padStart(5)} ${String(Math.round((wins / fights) * 100)).padStart(5)}  ${(surv / fights).toFixed(2).padStart(12)}  ${(rounds / fights).toFixed(1).padStart(9)}`);
  }
}
