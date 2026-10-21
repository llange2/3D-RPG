import { beforeAll, describe, expect, it } from "vitest";
import { BLOCKS } from "../../src/campaign/blocks";
import { CAMPAIGN_ACTION_IDS } from "../../src/campaign/engine";
import { arrival, loadCampaignData, loadCampaignIndex, loadCampaignMap } from "../../src/campaign/loader";
import { CampaignMapModel } from "../../src/campaign/model";
import { CAMPAIGN_START, CAMPAIGN_START_CELL, mapSlugOf, parseXY, type CampaignIndexEntry } from "../../src/campaign/types";
import { CELL } from "../../src/interiors/types";
import { lineOfSight, type GridView } from "../../src/sim/encounter";
import ITEM_MODELS_RAW from "../../src/data/item-models.json";
import { MONSTERS } from "../../src/data/tables";
import { actionCells, useDiskCampaign } from "../helpers/campaign";

let index: CampaignIndexEntry[] = [];

beforeAll(async () => {
  useDiskCampaign();
  index = await loadCampaignIndex();
});

describe("campaign export", () => {
  it("contains the 34 maps of the old game plus the old test map", () => {
    expect(index.length).toBe(35);
    expect(index.filter((m) => !m.debug).length).toBe(34);
    expect(index.map((m) => m.slug)).toContain(CAMPAIGN_START);
    expect(index.map((m) => m.slug)).toContain("outside");
  });

  it("only uses block ids that the renderer knows, and only action ids the engine handles", async () => {
    const unknownBlocks = new Set<number>();
    const unknownActions = new Set<number>();
    for (const entry of index) {
      const data = await loadCampaignData(entry.slug);
      for (const c of data.cells) {
        if (c.b !== undefined && !BLOCKS[c.b]) unknownBlocks.add(c.b);
        if (c.a !== undefined && !CAMPAIGN_ACTION_IDS.includes(c.a)) unknownActions.add(c.a);
      }
    }
    expect([...unknownBlocks]).toEqual([]);
    expect([...unknownActions]).toEqual([]);
  });

  it("uses monster ids that exist", async () => {
    for (const entry of index) {
      const data = await loadCampaignData(entry.slug);
      for (const c of data.cells) if (c.m !== undefined) expect(MONSTERS[c.m], `${entry.slug}: monster ${c.m}`).toBeDefined();
    }
  });
});

describe("campaign maps as game maps", () => {
  it("start the party on a floor cell facing into the map", async () => {
    for (const entry of index) {
      const map = await loadCampaignMap(entry.slug);
      const grid = map.toInteriorMap();
      const { x, y } = grid.spawn;
      expect(grid.cells[y * grid.width + x], `${entry.slug} start`).toBe(CELL.FLOOR);
      expect(map.hasObstacle(map.toAbsolute(x, y).x, map.toAbsolute(x, y).y), `${entry.slug} start is blocked`).toBe(false);
    }
  });

  it("round-trip coordinates between the editor and the grid", async () => {
    const map = await loadCampaignMap("outside");
    for (const [x, y] of [[4970, 5027], [4950, 5000], [map.origin[0] + 1, map.origin[1] + 1]] as const) {
      const l = map.toLocal(x, y);
      expect(map.toAbsolute(l.x, l.y)).toEqual({ x, y });
    }
    // north (growing editor y) is up on the grid, so it has a smaller grid y
    expect(map.toLocal(5000, 5001).y).toBe(map.toLocal(5000, 5000).y - 1);
  });

  it("make every cell with a block land inside the grid", async () => {
    for (const entry of index) {
      const map = await loadCampaignMap(entry.slug);
      for (const [x, y, c] of map.entries()) {
        if (c.b === undefined) continue;
        const l = map.toLocal(x, y);
        expect(l.x >= 0 && l.y >= 0 && l.x < map.width && l.y < map.height, `${entry.slug} ${x},${y}`).toBe(true);
      }
    }
  });

  it("produce one legacy action per action cell and one spawn per monster on walkable ground", async () => {
    const map = await loadCampaignMap("fountain-head");
    const content = map.toContent();
    expect(content.actions.length).toBe(map.entries().filter(([, , c]) => c.a !== undefined).length);
    for (const a of content.actions) expect(a.legacy?.id).toBeGreaterThan(0);
    expect(content.spawns.length).toBeGreaterThan(5);
  });
});

describe("door frames and gates", () => {
  // the old game puts a frame model on the door blocks 19, 41 and 47 and fits the metal gates (items 80 and 81) into it. Without the
  // frame the doorway is the whole cell (3 wide), and the gate (about 2 wide) leaves a gap on either side.
  const FRAME_BLOCKS = [19, 41, 47];
  const GATES = [80, 81];

  it("draw a frame model on every door frame block", () => {
    for (const b of FRAME_BLOCKS) {
      const model = BLOCKS[b]!.style.model;
      expect(model, `block ${b}`).toBeDefined();
      expect(model!.key.startsWith("frame_"), `block ${b} key ${model!.key}`).toBe(true);
    }
  });

  it("stand every metal gate on a block that has a frame", async () => {
    const lonely: string[] = [];
    for (const entry of index) {
      const data = await loadCampaignData(entry.slug);
      for (const c of data.cells) {
        if (c.i !== undefined && GATES.includes(c.i) && !FRAME_BLOCKS.includes(c.b ?? -1)) lonely.push(`${entry.slug} ${c.x}/${c.y} item ${c.i} on block ${c.b}`);
      }
    }
    expect(lonely).toEqual([]);
  });
});

describe("blocks the old game built from models", () => {
  const MODEL_BLOCKS: Record<number, string> = { 15: "blk_door_open", 16: "blk_door_closed", 17: "blk_brittle_wall", 18: "blk_cracked_wall", 20: "blk_gate2", 36: "obj_pit" };

  it("draw the doors, the brittle wall and what it leaves, the gate frame and the pit from the old models", () => {
    for (const [b, key] of Object.entries(MODEL_BLOCKS)) expect(BLOCKS[Number(b)]!.style.model?.key, `block ${b}`).toBe(key);
    // the old pit block has no floor of its own: the model is the floor with a hole in it
    expect(BLOCKS[36]!.style.floorless).toBe(true);
  });

  it("keep the closed door and the brittle wall shut although the renderer draws a floor cell", async () => {
    for (const b of [16, 17]) {
      expect(BLOCKS[b]!.cls, `block ${b}`).toBe("floor");
      expect(BLOCKS[b]!.walkable, `block ${b}`).toBe(false);
    }
    for (const b of [15, 18, 20, 36]) expect(BLOCKS[b]!.walkable, `block ${b}`).toBe(true);
    const map = await loadCampaignMap("temple-of-moo");
    const doors = map.entries().filter(([, , c]) => c.b === 16);
    expect(doors.length).toBe(9);
    for (const [x, y] of doors) expect(map.isWalkable(x, y), `door ${x}/${y}`).toBe(false);
  });
});

describe("places on the outside map", () => {
  const ITEMS = ITEM_MODELS_RAW as unknown as Record<string, { scale3: number[]; yaw: number }>;
  const PLACES = [41, 42, 43, 44, 47]; // dungeon entrance, cave entrance, pyramid, castle, village

  it("keep the sizes the old code really uses (earlier sizes stay in it as comments)", () => {
    expect(ITEMS["47"]!.scale3).toEqual([1.8, 2.5, 1.8]);
    expect(ITEMS["43"]!.scale3).toEqual([2, 2.4, 2]);
    expect(ITEMS["44"]!.scale3).toEqual([1.6, 2.4, 1.6]);
    // the cave's door is built on -z in our import (the old loader showed it on +x, hence its 270)
    expect(ITEMS["42"]!.yaw).toBe(180);
  });

  it("face the compass bearing stored on their cell, with the enter action on the cell in front (so nobody walks into them)", async () => {
    const map = await loadCampaignMap("outside");
    let tested = 0;
    for (const [x, y, c] of map.entries()) {
      if (c.i === undefined || !PLACES.includes(c.i)) continue;
      const bearing = ((c.ir ?? 0) * Math.PI) / 180;
      const dx = Math.round(Math.sin(bearing));
      const dy = Math.round(Math.cos(bearing)); // the editor's y grows north
      const front = map.get(x + dx, y + dy);
      expect(front?.a, `item ${c.i} at ${x}/${y} (bearing ${c.ir ?? 0})`).toBe(11);
      tested++;
    }
    expect(tested).toBeGreaterThan(20);
  });
});

describe("shots at a closed gate", () => {
  // a monster behind a gate must not shoot through it (the old game blocked shots at every item that blocks a cell)
  it("stop at every metal gate that has open floor on both sides", async () => {
    let tested = 0;
    for (const entry of index) {
      const model = await loadCampaignMap(entry.slug);
      const map = model.toInteriorMap();
      const blocked = new Set<number>();
      for (const [x, y, c] of model.entries()) {
        if (c.i === undefined || !model.hasObstacle(x, y)) continue;
        const l = model.toLocal(x, y);
        blocked.add(l.y * map.width + l.x);
      }
      const view: GridView = {
        walkable: () => true,
        water: () => false,
        opaque: (x, y) => map.cells[y * map.width + x] !== CELL.FLOOR,
        obstacle: (x, y) => blocked.has(y * map.width + x),
      };
      const free = (x: number, y: number) => map.cells[y * map.width + x] === CELL.FLOOR && !blocked.has(y * map.width + x);
      for (const [ax, ay, c] of model.entries()) {
        if (c.i !== 80 && c.i !== 81) continue;
        const g = model.toLocal(ax, ay);
        for (const [dx, dy] of [[1, 0], [0, 1]] as const) {
          if (!free(g.x - dx, g.y - dy) || !free(g.x + dx, g.y + dy)) continue;
          tested++;
          expect(lineOfSight(view, null, g.x - dx, g.y - dy, g.x + dx, g.y + dy), `${entry.slug} gate ${ax}/${ay}`).toBe(false);
          // and open again once the gate is gone
          blocked.delete(g.y * map.width + g.x);
          expect(lineOfSight(view, null, g.x - dx, g.y - dy, g.x + dx, g.y + dy), `${entry.slug} open gate ${ax}/${ay}`).toBe(true);
          blocked.add(g.y * map.width + g.x);
        }
      }
    }
    expect(tested).toBeGreaterThan(10);
  });
});

describe("references between actions", () => {
  it("transfers lead to maps that exist and arrive on free ground", async () => {
    const names = new Set(index.map((m) => m.slug));
    const bad: string[] = [];
    let repaired = 0;
    for (const entry of index) {
      const map = await loadCampaignMap(entry.slug);
      for (const [x, y, c] of map.entries()) {
        if (c.a !== 11) continue;
        const ax = (c.ax ?? {}) as Record<string, string>;
        const target = mapSlugOf(ax.map_to_load ?? "");
        if (!names.has(target)) {
          bad.push(`${entry.slug} ${x},${y}: unknown map "${ax.map_to_load}"`);
          continue;
        }
        const dest = await loadCampaignMap(target);
        const tx = Number(ax.start_x);
        const ty = Number(ax.start_y);
        if (!dest.isFree(tx, ty)) repaired++;
        const at = arrival(dest, tx, ty, Number(ax.start_direction) || 0, entry.slug);
        if (!dest.isFree(at.x, at.y)) bad.push(`${entry.slug} ${x},${y} -> ${target}: no free arrival cell`);
      }
    }
    expect(bad).toEqual([]);
    // a few transfers of the original have broken coordinates and are repaired on arrival
    expect(repaired).toBeLessThanOrEqual(6);
  });

  it("start the campaign in the street of Fountain Head", async () => {
    const map = await loadCampaignMap(CAMPAIGN_START);
    expect(map.isFree(CAMPAIGN_START_CELL.x, CAMPAIGN_START_CELL.y)).toBe(true);
  });

  it("portals (action 28) point at maps that exist", async () => {
    const names = new Set(index.map((m) => m.slug));
    for (const entry of index) {
      const map = await loadCampaignMap(entry.slug);
      for (const [, , c] of map.entries()) {
        if (c.a !== 28) continue;
        const ax = (c.ax ?? {}) as Record<string, string>;
        expect(names.has(mapSlugOf(ax.map_to_load ?? "")), `${entry.slug}: ${ax.map_to_load}`).toBe(true);
        const dest = await loadCampaignMap(mapSlugOf(ax.map_to_load!));
        const at = arrival(dest, Number(ax.portal_x), Number(ax.portal_y), Number(ax.portal_rotation) || 0, entry.slug);
        expect(dest.isFree(at.x, at.y), `${entry.slug}: portal target`).toBe(true);
      }
    }
  });

  it("teleports (27) land on walkable cells", async () => {
    const bad: string[] = [];
    for (const entry of index) {
      const map = await loadCampaignMap(entry.slug);
      for (const [x, y, c] of map.entries()) {
        if (c.a !== 27) continue;
        const ax = (c.ax ?? {}) as Record<string, string>;
        if (!map.isFree(Number(ax.tele_x), Number(ax.tele_y))) bad.push(`${entry.slug} ${x},${y} -> ${ax.tele_x},${ax.tele_y}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it("chained actions name cells that exist, except a few empty targets of the editor", async () => {
    // keys whose value is a cell that must carry an action
    const actionKeys = /^(xy_action\d*|xy_door\d|xy_trap\d|target_action|xy_action_success|xy_action_fail|xy_action1|state\dxy_action|state\d_xy_action)$/;
    const missing: string[] = [];
    let total = 0;
    for (const entry of index) {
      const map = await loadCampaignMap(entry.slug);
      for (const [x, y, c] of map.entries()) {
        for (const [k, v] of Object.entries(c.ax ?? {})) {
          if (!actionKeys.test(k) && !/^state\d_xy_action$/.test(k)) continue;
          const at = parseXY(v);
          if (!at) continue;
          total++;
          if (!map.has(at.x, at.y)) missing.push(`${entry.slug} ${x},${y} ${k} -> ${at.x},${at.y}`);
        }
      }
    }
    expect(total).toBeGreaterThan(200);
    // the original editor left a handful of dangling targets; they must not grow
    expect(missing.length, missing.join("\n")).toBeLessThanOrEqual(12);
  });
});

describe("campaign model", () => {
  it("keeps changes as overrides that a fresh model reproduces", async () => {
    const data = await loadCampaignData("fountain-head");
    const a = new CampaignMapModel(data);
    const wall = a.entries().find(([, , c]) => c.a === 8)!;
    const [x, y] = wall;
    a.setBlock(x, y, 6, 90);
    a.removeAction(x, y);
    a.setItem(x + 1, y, 5, 180);
    const overrides = a.exportOverrides();
    const b = new CampaignMapModel(data, JSON.parse(JSON.stringify(overrides)));
    expect(b.get(x, y)?.b).toBe(6);
    expect(b.get(x, y)?.a).toBeUndefined();
    expect(b.get(x + 1, y)?.i).toBe(5);
    expect(b.toInteriorMap().cells).toEqual(a.toInteriorMap().cells);
  });

  it("marks water as closed ground and walls as solid", async () => {
    const map = await loadCampaignMap("outside");
    const grid = map.toInteriorMap();
    const kinds = new Set(grid.cells);
    expect(kinds.has(CELL.FLOOR)).toBe(true);
    expect(kinds.has(CELL.LOW)).toBe(true);
    expect(grid.styles!.list.some((s) => s.water)).toBe(true);
    expect(grid.styles!.list.some((s) => s.model)).toBe(true);
  });

  it("finds the services of the start town", async () => {
    const map = await loadCampaignMap(CAMPAIGN_START);
    for (const id of [1, 2, 3, 4, 5, 6, 7]) expect(actionCells(map, id).length, `service ${id}`).toBeGreaterThan(0);
  });
});
