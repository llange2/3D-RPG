import { RIDDLES_WORLD } from "../data/riddles";
import { CRYSTAL_HOLDER, ORB } from "../data/quest-table";
import { CELL, FACING_DELTA, type Facing, type InteriorMap } from "../interiors/types";
import { simulateCrystals, staticBlockers, type WallNode } from "./crystals";
import { CRYSTAL_RUNE_RANGE, isEndBoss } from "./quests";
import type { ActionInstance, MapContent } from "./types";

/**
 * The quests of a place must be solvable with what the place shows: the field of statues has a lever for every statue and does not start
 * solved, the chalices tell what the heads must look like, the gongs and the runes are all there, the sum of the plaques is the answer of the
 * statue at the end, the letters of the hints spell the word that the last statue wants. Returns the problems found; empty means every quest
 * of the place can be solved.
 */
const OPPOSITE_FACING: Record<Facing, Facing> = { N: "S", S: "N", E: "W", W: "E" };

export function questIssues(map: InteriorMap, content: MapContent): string[] {
  const issues: string[] = [];
  const ref = map.dungeon;
  if (!ref || ref.quest === "spaceship") return issues;
  const of = (kind: string) => content.actions.filter((a) => a.kind === kind);
  const key = map.key;
  const end = ref.endRoom;

  // every place has an end room, and it holds what the plan says (a pocket also the portal back)
  if (!end) {
    issues.push(`${key}: no end room`);
    return issues;
  }
  const inEnd = (a: ActionInstance) => a.x >= end.x && a.y >= end.y && a.x < end.x + end.w && a.y < end.y + end.h;
  const found = content.actions.filter((a) => a.kind === "treasure" && inEnd(a) && typeof a.params.quest === "string");
  const items = found.flatMap((a) => Array.from({ length: Number(a.params.count ?? 1) }, () => String(a.params.quest)));
  const expected = [...ref.gives, ...Array.from({ length: ref.orbs }, () => ORB)];
  if (items.slice().sort().join() !== expected.slice().sort().join()) issues.push(`${key}: the end room holds [${items.join(", ")}], the plan says [${expected.join(", ")}]`);
  if (end.isolated && !of("qportal").some(inEnd)) issues.push(`${key}: the end room is a pocket and has no portal back`);
  if (!end.isolated && !end.seal) issues.push(`${key}: the end room has neither a seal nor is it a pocket`);
  // (a reward is a chest, a chalice or a crystal: since document 1.8 the pick of a level 5 room may be a chalice and a crystal only)
  if ([...of("treasure"), ...of("chalice"), ...of("shrine")].filter(inEnd).length < 1 + expected.length) issues.push(`${key}: the end room holds no reward besides the quest items`);
  for (const a of content.actions) if (!inEnd(a) && a.kind === "treasure" && typeof a.params.quest === "string") issues.push(`${a.uid}: a quest item outside the end room`);

  switch (ref.quest) {
    case "quest_1": {
      const field = of("head").filter((a) => a.params.mode === "moan");
      const levers = of("lever");
      if (field.length !== 8) issues.push(`${key}: ${field.length} statues in the field`);
      if (levers.length !== 12) issues.push(`${key}: ${levers.length} levers, expected 12`);
      for (const h of field) {
        const lever = levers.find((l) => l.uid === h.params.lever && l.params.target === h.uid);
        if (!lever) issues.push(`${h.uid}: no lever sets it`);
      }
      if (levers.filter((l) => l.params.target === "").length !== 4) issues.push(`${key}: not four look-alike levers`);
      if (field.filter((h) => h.params.start !== h.params.want).length < 2) issues.push(`${key}: the field starts too close to the solution`);
      const middle = of("rune").find((a) => a.params.need === "moan");
      if (!middle) issues.push(`${key}: no rune in the middle of the field`);
      else if (field.some((h) => Math.abs(h.x - middle.x) > 1 || Math.abs(h.y - middle.y) > 1)) issues.push(`${key}: the statues are not round the middle`);
      const wanted = field.filter((h) => h.params.want === 1).length;
      if (wanted !== 4 && wanted !== 3) issues.push(`${key}: the solution has ${wanted} statues`);
      if (!of("lore").some((a) => typeof a.params.text === "string" && /moan/.test(String(a.params.text)))) issues.push(`${key}: no statue tells what to do`);
      break;
    }

    case "quest_2": {
      const row = of("head").filter((a) => a.params.mode === "rotate").sort((a, b) => Number(a.params.order) - Number(b.params.order));
      const chalices = of("chalice").filter((c) => c.params.bonus === undefined);
      if (row.length !== 5 || chalices.length !== 5) {
        issues.push(`${key}: ${row.length} heads and ${chalices.length} chalices`);
        break;
      }
      row.forEach((h, i) => {
        const cup = chalices.find((c) => c.params.number === i + 1);
        if (!cup) issues.push(`${key}: no chalice for number ${i + 1}`);
        else if ("NESW"[Number(h.params.want)] !== cup.params.dir) issues.push(`${h.uid}: the chalice says ${String(cup.params.dir)}, the head wants ${"NESW"[Number(h.params.want)]}`);
      });
      if (row.filter((h) => h.params.start !== h.params.want).length < 3) issues.push(`${key}: the heads start too close to the answer`);
      const sameWall = row.every((h) => h.y === row[0]!.y) || row.every((h) => h.x === row[0]!.x);
      if (!sameWall) issues.push(`${key}: the heads do not stand in a row`);
      // the end room is next to the hall (sealed) or the right row calls up runes in the hall that take the party there (42nd playtest, point 6)
      const runes = of("rune").filter((a) => a.params.need === "heads");
      const hall = ref.hall;
      if (end.isolated && (runes.length !== 1 || (hall && !(runes[0]!.x >= hall.x && runes[0]!.y >= hall.y && runes[0]!.x < hall.x + hall.w && runes[0]!.y < hall.y + hall.h)))) issues.push(`${key}: the end room is a pocket and the hall has no runes (${runes.length})`);
      if (!end.isolated && runes.length > 0) issues.push(`${key}: runes in the hall although the end room is sealed`);
      break;
    }

    case "quest_3": {
      const gongs = of("gong");
      if (gongs.length !== 4 && gongs.length !== 5) issues.push(`${key}: ${gongs.length} gongs`);
      // whichever gong sounds last, runes lie round it (40th playtest, point 6)
      for (const g of gongs) if (!of("rune").some((a) => a.params.need === "gongs" && a.params.after === g.uid)) issues.push(`${g.uid}: no runes for the case that it sounds last`);
      for (const g of gongs) {
        const n = Number(g.params.group);
        if (!(n >= 2)) issues.push(`${g.uid}: calls ${n} monsters`);
      }
      break;
    }

    case "quest_4": {
      const plaques = of("lore").filter((a) => typeof a.params.fallen === "number");
      const last = of("riddle").find((a) => a.params.opens === "end");
      if (plaques.length < 4 || plaques.length > 8) issues.push(`${key}: ${plaques.length} plaques`);
      if (!last) issues.push(`${key}: no statue that wants the sum`);
      else {
        const sum = plaques.reduce((s, a) => s + Number(a.params.fallen), 0);
        if (String(sum) !== last.params.answer) issues.push(`${last.uid}: the plaques add up to ${sum}, the answer is ${String(last.params.answer)}`);
        if (sum < 0 || sum > 999) issues.push(`${last.uid}: the sum ${sum} is no number of at most three digits`);
      }
      break;
    }

    case "quest_5": {
      const bosses = content.spawns.filter((s) => s.boss);
      if (bosses.length !== 1) issues.push(`${key}: ${bosses.length} end bosses`);
      else if (!isEndBoss(bosses[0]!.uid) || bosses[0]!.monsterIds.length !== 1 || bosses[0]!.monsterIds[0] !== ref.look.boss) issues.push(`${key}: the boss is not the end boss of the population`);
      break;
    }

    case "quest_6": {
      const hints = of("lore").filter((a) => typeof a.params.letter === "string").sort((a, b) => Number(a.params.order) - Number(b.params.order));
      const last = of("riddle").find((a) => a.params.opens === "end");
      if (!last) {
        issues.push(`${key}: no statue that wants the word`);
        break;
      }
      const spelled = hints.map((h) => String(h.params.letter)).join("").toLowerCase();
      if (spelled !== last.params.answer) issues.push(`${last.uid}: the hints spell ${spelled}, the answer is ${String(last.params.answer)}`);
      if (hints.length < 3 || hints.length > 8) issues.push(`${key}: ${hints.length} hint statues`);
      const riddle = RIDDLES_WORLD[String(last.params.riddle)];
      if (!riddle || riddle.answer !== last.params.answer) issues.push(`${last.uid}: the word is no answer of riddle ${String(last.params.riddle)}`);
      break;
    }

    case "quest_8": {
      const walls = of("crystal");
      const nodes: WallNode[] = walls.map((a) => ({ uid: a.uid, x: a.x, y: a.y, dir: a.params.facing as Facing, role: a.params.role as "source" | "target", color: Number(a.params.color) }));
      const targets = nodes.filter((n) => n.role === "target");
      if (targets.length === 0 || nodes.length - targets.length === 0) {
        issues.push(`${key}: the crystal paths have ${nodes.length - targets.length} sources and ${targets.length} targets`);
        break;
      }
      for (const n of nodes) {
        const back = FACING_DELTA[OPPOSITE_FACING[n.dir]];
        if (map.cells[(n.y + back.dy) * map.width + n.x + back.dx] !== CELL.SOLID) issues.push(`${key}: the wall crystal at ${n.x}/${n.y} has no wall behind it`);
      }
      const first = walls.find((a) => typeof a.params.solution === "string");
      const cells = String(first?.params.solution ?? "").split(";").filter((c) => c !== "").map((c, i) => {
        const [x, y] = c.split(",").map(Number) as [number, number];
        return { x, y, seq: i + 1 };
      });
      if (!first || cells.length !== Number(first.params.crystals)) {
        issues.push(`${key}: the crystal paths know no solution`);
        break;
      }
      if (!simulateCrystals(nodes, cells, staticBlockers(map, content.actions)).solved) issues.push(`${key}: the crystals of the solution do not light the targets`);
      const held = content.actions.filter((a) => a.kind === "treasure" && typeof a.params.extra === "string").flatMap((a) => String(a.params.extra).split(",")).filter((t) => t === CRYSTAL_HOLDER).length;
      if (held !== cells.length) issues.push(`${key}: ${held} crystals in the chests, the solution needs ${cells.length}`);
      // an end room farther than `CRYSTAL_RUNE_RANGE` from a target has runes next to that target, one that is near has none (59th playtest, point 1)
      if (end) {
        const gap = (c: { x: number; y: number }): number => Math.max(end.x - c.x, c.x - (end.x + end.w - 1), end.y - c.y, c.y - (end.y + end.h - 1), 0);
        const runes = of("rune").filter((a) => a.params.need === "crystals");
        for (const t of targets) {
          const near = runes.some((r) => Math.max(Math.abs(r.x - t.x), Math.abs(r.y - t.y)) <= 3);
          if (gap(t) > CRYSTAL_RUNE_RANGE && !near) issues.push(`${key}: the target at ${t.x}/${t.y} is ${gap(t)} cells from the end room and has no runes next to it`);
        }
        if (runes.length > 0 && !targets.some((t) => gap(t) > CRYSTAL_RUNE_RANGE)) issues.push(`${key}: runes next to the targets although the end room is at hand`);
      }
      // the light of the solution must not be stopped by anything the rules put on its way
      for (const c of cells) if (content.actions.some((a) => a.x === c.x && a.y === c.y)) issues.push(`${key}: an object stands where the crystal at ${c.x}/${c.y} goes`);
      break;
    }
  }
  return issues;
}
