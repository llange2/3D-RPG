import { THEMES_BY_ID } from "../data/dungeon-themes";
import { RIDDLES_MASTER } from "../data/tables";
import { glyphWidth, readGlyphs } from "../interiors/glyphs";
import { CELL, FACING_DELTA, type Facing, type InteriorMap } from "../interiors/types";
import { blocksCell } from "./registry";
import type { MapContent } from "./types";

const DIRS = Object.keys(FACING_DELTA) as Facing[];

/**
 * The puzzles of a theme must be solvable with what the place shows (chapter 2 of docs/DUNGEON_THEMES.md): the answer of every statue
 * is the one the table, the count or the picture gives, every cell of the ring has a lever, a field of runes has a way through.
 * Returns the problems found; empty means every puzzle of the place can be solved.
 */
export function questIssues(map: InteriorMap, content: MapContent): string[] {
  const issues: string[] = [];
  const theme = map.dungeon ? THEMES_BY_ID[map.dungeon.id] : undefined;
  if (!theme || !map.dungeon) return issues;
  const of = (kind: string) => content.actions.filter((a) => a.kind === kind);
  const at = (x: number, y: number) => content.actions.find((a) => a.x === x && a.y === y);
  const hall = map.dungeon.hall;
  const inHall = (x: number, y: number) => !!hall && x >= hall.x && x < hall.x + hall.w && y >= hall.y && y < hall.y + hall.h;

  switch (theme.quest) {
    case "riddle_statues": {
      const statues = of("riddle");
      if (statues.length === 0) issues.push(`${map.key}: no riddle statue`);
      for (const r of statues) if (RIDDLES_MASTER[Number(r.params.riddle)]?.answer.toLowerCase() !== r.params.answer) issues.push(`${r.uid}: answer does not match riddle ${String(r.params.riddle)}`);
      break;
    }

    case "coordinates": {
      const hints = of("lore").filter((a) => typeof a.params.treasure === "string");
      if (hints.length === 0) issues.push(`${map.key}: no statue that names the treasure`);
      for (const h of hints) {
        const [tx, ty] = String(h.params.treasure).split(",").map(Number) as [number, number];
        if (at(tx, ty)?.kind !== "treasure") issues.push(`${h.uid}: there is no treasure at ${tx}/${ty}`);
        const words = `${Math.abs(tx - h.x)} ${tx < h.x ? "west" : "east"} and ${Math.abs(ty - h.y)} ${ty < h.y ? "north" : "south"}`;
        if (!String(h.params.text).includes(words)) issues.push(`${h.uid}: the words "${String(h.params.text)}" do not say ${words}`);
      }
      break;
    }

    case "gongs": {
      const gongs = of("gong");
      const lords = of("riddle").filter((a) => a.params.requires === "gongs");
      const hints = of("lore").filter((a) => typeof a.params.sum === "number");
      if (gongs.length === 0 || lords.length !== 1 || hints.length !== 3) {
        issues.push(`${map.key}: ${gongs.length} gongs, ${lords.length} lords, ${hints.length} hints`);
        break;
      }
      const crystals = content.actions.filter((a) => (a.kind === "decor" || a.kind === "shrine") && a.params.item === 117).length;
      const [start, perGong, perCrystal] = hints.map((h) => Number(h.params.sum)) as [number, number, number];
      const sum = start + perGong * gongs.length - perCrystal * crystals;
      if (String(sum) !== lords[0]!.params.answer) issues.push(`${lords[0]!.uid}: the lords' sum is ${sum}, the answer ${String(lords[0]!.params.answer)}`);
      break;
    }

    case "map_picture": {
      const glyph = map.dungeon.glyph;
      if (!hall || !glyph) {
        issues.push(`${map.key}: no picture in the walls`);
        break;
      }
      const x0 = hall.x + Math.floor((hall.w - glyphWidth(glyph)) / 2);
      const y0 = hall.y + Math.floor((hall.h - 5) / 2);
      const read = readGlyphs((x, y) => map.cells[y * map.width + x] !== CELL.FLOOR, x0, y0, glyph.length);
      if (read !== glyph) issues.push(`${map.key}: the walls draw ${read}, not ${glyph}`);
      const statue = of("riddle")[0];
      if (!statue || statue.params.answer !== glyph) issues.push(`${map.key}: the statue does not ask for ${glyph}`);
      else if (inHall(statue.x, statue.y)) issues.push(`${statue.uid}: the statue stands in the hall`);
      break;
    }

    case "jump_field": {
      if (!hall) {
        issues.push(`${map.key}: no hall for the field`);
        break;
      }
      const mid = hall.y + Math.floor(hall.h / 2);
      const door = mid * map.width + hall.x;
      const hazard = new Set(content.actions.filter((a) => a.kind === "teleporter" || a.kind === "trap").map((a) => a.y * map.width + a.x));
      const chests = of("treasure").filter((a) => inHall(a.x, a.y));
      if (hazard.has(door)) issues.push(`${map.key}: the way back into the field's door is a hazard itself`);
      for (const tp of of("teleporter")) if (tp.params.tx !== hall.x || tp.params.ty !== mid) issues.push(`${tp.uid}: throws the party to ${String(tp.params.tx)}/${String(tp.params.ty)}`);
      // a way from the door of the field to every chest over cells without a rune or a trap
      // everything that blocks its cell is a wall for the party, the chests included
      const chestCells = new Set(content.actions.filter((a) => blocksCell(a)).map((a) => a.y * map.width + a.x));
      const seen = new Set<number>([door]);
      const queue = [door];
      for (let head = 0; head < queue.length; head++) {
        const i = queue[head]!;
        const x = i % map.width;
        const y = (i - x) / map.width;
        for (const d of DIRS) {
          const nx = x + FACING_DELTA[d].dx;
          const ny = y + FACING_DELTA[d].dy;
          const ni = ny * map.width + nx;
          if (!inHall(nx, ny) || seen.has(ni) || hazard.has(ni) || chestCells.has(ni) || map.cells[ni] !== CELL.FLOOR) continue;
          seen.add(ni);
          queue.push(ni);
        }
      }
      if (chests.length === 0) issues.push(`${map.key}: the field has no treasure`);
      for (const c of chests) if (!DIRS.some((d) => seen.has((c.y + FACING_DELTA[d].dy) * map.width + c.x + FACING_DELTA[d].dx))) issues.push(`${c.uid}: no safe way to the treasure`);
      break;
    }

    case "head_ring": {
      const ring = content.actions.filter((a) => a.kind === "head" && a.params.mode === "ring");
      if (ring.length !== 8) issues.push(`${map.key}: ${ring.length} heads on the ring`);
      for (const h of ring) {
        const lever = content.actions.find((a) => a.uid === h.params.lever);
        if (!lever || lever.kind !== "lever" || lever.params.target !== h.uid) issues.push(`${h.uid}: no lever sets it`);
      }
      if (ring.every((h) => h.params.start === 1)) issues.push(`${map.key}: every head of the ring stands at the start, the middle cannot be reached`);
      if (ring.filter((h) => h.params.corner === true && h.params.start === 0).length < 2) issues.push(`${map.key}: the ring starts too close to the answer`);
      const middle = content.actions.find((a) => a.kind === "treasure" && a.params.lock === "ring");
      if (!middle) issues.push(`${map.key}: no locked chest in the middle`);
      else if (ring.some((h) => Math.abs(h.x - middle.x) > 1 || Math.abs(h.y - middle.y) > 1)) issues.push(`${middle.uid}: the heads are not around it`);
      break;
    }

    case "head_rotation": {
      const row = content.actions.filter((a) => a.kind === "head" && a.params.mode === "rotate").sort((a, b) => a.x - b.x);
      const cups = content.actions.filter((a) => a.kind === "lore" && typeof a.params.letter === "string").sort((a, b) => a.x - b.x);
      if (row.length !== 5 || cups.length !== 5) issues.push(`${map.key}: ${row.length} heads and ${cups.length} chalices`);
      row.forEach((h, i) => {
        if ("NESW"[Number(h.params.want)] !== cups[i]?.params.letter) issues.push(`${h.uid}: the chalice below it shows another letter`);
      });
      if (row.filter((h) => h.params.start !== h.params.want).length < 3) issues.push(`${map.key}: the heads start too close to the answer`);
      if (!content.actions.some((a) => a.kind === "treasure" && a.params.lock === "rotation")) issues.push(`${map.key}: no locked chest`);
      break;
    }

    default:
      break;
  }
  return issues;
}
