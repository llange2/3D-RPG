import { RIDDLES_WORLD } from "../data/riddles";
import { ORB } from "../data/quest-table";
import type { InteriorMap } from "../interiors/types";
import { isEndBoss } from "./quests";
import type { ActionInstance, MapContent } from "./types";

/**
 * The quests of a place must be solvable with what the place shows: the field of statues has a lever for every statue and does not start
 * solved, the chalices tell what the heads must look like, the gongs and the runes are all there, the sum of the plaques is the answer of the
 * statue at the end, the letters of the hints spell the word that the last statue wants. Returns the problems found; empty means every quest
 * of the place can be solved.
 */
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
  if (of("treasure").filter(inEnd).length < 1 + expected.length) issues.push(`${key}: the end room holds no reward besides the quest items`);
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
      const chalices = of("chalice");
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
      break;
    }

    case "quest_3": {
      const gongs = of("gong");
      if (gongs.length !== 4 && gongs.length !== 5) issues.push(`${key}: ${gongs.length} gongs`);
      if (!of("rune").some((a) => a.params.need === "gongs")) issues.push(`${key}: no runes for the gongs`);
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
  }
  return issues;
}
