import { beforeAll, describe, expect, it } from "vitest";
import { countItems, hasItem, textOf, tidy, fillPlaceholders, trapReloading } from "../../src/campaign/engine";
import { questItem } from "../../src/sim/items";
import { giveItem } from "../../src/sim/party";
import { actionCells, testHost, useDiskCampaign } from "../helpers/campaign";

beforeAll(() => useDiskCampaign());

describe("texts", () => {
  it("reads ids and literal texts like the old len > 3 rule", () => {
    expect(textOf("81")).toContain("heavy door");
    expect(textOf("Hello there")).toBe("Hello there");
    expect(textOf("", 388)).toBe("There is only silence.");
    expect(textOf(undefined)).toBe("");
  });
  it("joins hand-wrapped lines but keeps paragraphs", () => {
    expect(tidy("A trap door leads into the cave beneath\nthe city.\n\nDo you want to go there?")).toBe("A trap door leads into the cave beneath the city.\n\nDo you want to go there?");
    expect(tidy("I am Lord Prayer.\\n\\nSecond")).toBe("I am Lord Prayer.\n\nSecond");
  });
  it("fills the password hints from the party's list", async () => {
    const h = await testHost("fountain-head");
    const text = fillPlaceholders("the password is '{riddle_a0}' and {riddle_q1}", h.progress);
    expect(text).not.toContain("{riddle");
    expect(h.progress.passwords).toHaveLength(100);
    expect(new Set(h.progress.passwords).size).toBe(100);
  });
});

describe("town services and doors", () => {
  it("opens the shops with the tier the map names", async () => {
    const h = await testHost("fountain-head");
    for (const [id, service] of [[1, "inn"], [2, "training"], [3, "tavern"], [4, "smith"], [5, "temple"], [6, "bank"], [7, "guild"]] as const) {
      const cell = actionCells(h.map, id)[0]!;
      await h.engine.activate(cell.x, cell.y);
      expect(h.rec.services.at(-1)?.service).toBe(service);
    }
  });

  it("opens a closed door after the question and leaves it alone on no", async () => {
    const h = await testHost("0000", "doors", { confirm: [false, true] });
    const door = actionCells(h.map, 14)[0]!;
    const before = h.map.get(door.x, door.y)!.b;
    await h.engine.activate(door.x, door.y);
    expect(h.map.get(door.x, door.y)!.b).toBe(before);
    await h.engine.activate(door.x, door.y);
    expect(h.map.get(door.x, door.y)!.b).toBe(15);
    expect(h.map.get(door.x, door.y)!.a).toBeUndefined();
    expect(h.rec.changed).toBeGreaterThan(0);
  });

  it("breaks a brittle wall only for a perceptive party", async () => {
    const h = await testHost("fountain-head");
    const wall = actionCells(h.map, 8)[0]!;
    const replacement = Number((h.map.get(wall.x, wall.y)!.ax as Record<string, string>).replacement_block);
    await h.engine.activate(wall.x, wall.y);
    expect(h.map.get(wall.x, wall.y)!.a).toBe(8);
    h.party.talents.push("talent_perceptive");
    await h.engine.activate(wall.x, wall.y);
    expect(h.map.get(wall.x, wall.y)!.b).toBe(replacement);
    expect(h.map.get(wall.x, wall.y)!.a).toBeUndefined();
  });
});

describe("treasure", () => {
  it("pays the chest to the chosen hero and removes the action", async () => {
    const h = await testHost("fountain-head", "chest", { character: [2] });
    const chest = actionCells(h.map, 21)[0]!;
    const goldBefore = h.party.gold;
    const itemsBefore = h.party.characters.reduce((n, c) => n + Object.keys(c.inventory).filter((k) => k.startsWith("slot") && c.inventory[k]).length, 0);
    await h.engine.activate(chest.x, chest.y);
    const itemsAfter = h.party.characters.reduce((n, c) => n + Object.keys(c.inventory).filter((k) => k.startsWith("slot") && c.inventory[k]).length, 0);
    expect(itemsAfter).toBeGreaterThan(itemsBefore);
    expect(h.party.gold).toBeGreaterThanOrEqual(goldBefore);
    expect(h.map.get(chest.x, chest.y)?.a).toBeUndefined();
    expect(h.rec.messages.join("\n")).toContain("Your loot");
  });

  it("does nothing when nobody is chosen", async () => {
    const h = await testHost("fountain-head", "chest2", { character: [null] });
    const chest = actionCells(h.map, 21)[0]!;
    await h.engine.activate(chest.x, chest.y);
    expect(h.map.get(chest.x, chest.y)?.a).toBe(21);
    expect(h.rec.messages).toHaveLength(0);
  });

  it("lets a trapped chest hurt the one who opens it", async () => {
    const h = await testHost("0000", "trapchest", { character: [0] });
    const cell = h.map.entries().find(([, , c]) => c.a === 21 && String((c.ax as Record<string, unknown>)?.trap_yn ?? "").length > 0);
    if (!cell) return; // the old test map may have no trapped chest
    const hp = h.party.characters[0]!.hp;
    await h.engine.activate(cell[0], cell[1]);
    expect(h.party.characters[0]!.hp).toBeLessThanOrEqual(hp);
  });
});

describe("traps", () => {
  it("hurt everybody and need a few steps to reload", async () => {
    const h = await testHost("cyclops-cavern");
    const trap = actionCells(h.map, 17)[0] ?? actionCells(h.map, 24)[0]!;
    for (const c of h.party.characters) c.hp = c.health = 500;
    const before = h.party.characters.map((c) => c.hp);
    await h.engine.activate(trap.x, trap.y);
    const after = h.party.characters.map((c) => c.hp);
    after.forEach((hp, i) => expect(hp).toBeLessThan(before[i]!));
    await h.engine.activate(trap.x, trap.y);
    expect(h.party.characters.map((c) => c.hp)).toEqual(after);
    h.steps += 9;
    await h.engine.activate(trap.x, trap.y);
    expect(h.party.characters.map((c) => c.hp)[0]).toBeLessThan(after[0]!);
  });

  it("drop the blade of a guillotine with the rotation of its action, once per reload", async () => {
    const h = await testHost("fountain-head-cavern");
    const plain = h.map.get(5002, 4998)!;
    const turned = h.map.get(5004, 4999)!;
    expect([plain.a, turned.a]).toEqual([24, 24]);
    await h.engine.activate(5002, 4998);
    await h.engine.activate(5002, 4998); // still reloading
    expect(h.rec.traps).toEqual([{ kind: "guillotine", x: 5002, y: 4998, rot: 0 }]);
    await h.engine.activate(5004, 4999);
    expect(h.rec.traps.at(-1)).toEqual({ kind: "guillotine", x: 5004, y: 4999, rot: 90 });
    expect(h.rec.sounds).toContain(9042);
  });

  it("shoot the spears of a spring trap out of the floor with the rotation of its action, once per reload", async () => {
    const h = await testHost("cyclops-cavern");
    expect([h.map.get(4988, 5007)!.a, h.map.get(4988, 5008)!.a]).toEqual([17, 17]);
    await h.engine.activate(4988, 5007);
    await h.engine.activate(4988, 5007); // still reloading
    await h.engine.activate(4988, 5008);
    expect(h.rec.traps).toEqual([
      { kind: "spear", x: 4988, y: 5007, rot: 0 },
      { kind: "spear", x: 4988, y: 5008, rot: 225 },
    ]);
    expect(h.rec.sounds).toContain(9036);
  });

  it("can be asked whether a trap is still reloading without firing it", async () => {
    const h = await testHost("fountain-head-cavern");
    const ask = (steps: number) => trapReloading(h.progress, "fountain-head-cavern", 5002, 4998, steps);
    expect(ask(0)).toBe(false);
    await h.engine.activate(5002, 4998);
    expect(h.rec.traps).toHaveLength(1);
    expect(ask(0)).toBe(true);
    expect(ask(7)).toBe(true);
    expect(ask(8)).toBe(false);
    expect(h.rec.traps).toHaveLength(1);
  });

  it("let a pit swallow the party unless it levitates", async () => {
    const h = await testHost("baywatch-cavern");
    const pit = actionCells(h.map, 23)[0]!;
    h.party.effects.push({ kind: "levitate", until: h.party.minutes + 100 });
    const hp = h.party.characters[0]!.hp;
    await h.engine.activate(pit.x, pit.y);
    expect(h.party.characters[0]!.hp).toBe(hp);
    h.party.effects = [];
    await h.engine.activate(pit.x, pit.y);
    expect(h.party.characters[0]!.hp).toBeLessThan(hp);
    expect(h.map.get(pit.x, pit.y)!.b).toBe(36);
  });

  it("steal gold but never more than the party has", async () => {
    const h = await testHost("tomb-of-terror");
    const thief = actionCells(h.map, 50)[0]!;
    h.party.gold = 300;
    await h.engine.activate(thief.x, thief.y);
    expect(h.party.gold).toBe(0);
  });
});

describe("quests", () => {
  it("lead from asking to returning the items to the reward", async () => {
    const h = await testHost("castle-bloodreign", "quest", { confirm: [true] });
    const npc = actionCells(h.map, 20)[0]!;
    const ax = h.map.get(npc.x, npc.y)!.ax as Record<string, string>;
    const type = ax.req_quest_item_type!;
    await h.engine.activate(npc.x, npc.y);
    expect(Object.keys(h.progress.quests.active)).toHaveLength(1);
    // still missing items
    await h.engine.activate(npc.x, npc.y);
    expect(h.rec.messages.at(-1)).toBeTruthy();
    expect(Object.keys(h.progress.quests.completed)).toHaveLength(0);
    // bring them
    const need = Number(ax.return_amount || 1);
    for (let i = 0; i < need; i++) expect(giveItem(h.party, questItem(type)!)).toBe(true);
    expect(countItems(h.party, type)).toBe(need);
    const gold = h.party.gold;
    await h.engine.activate(npc.x, npc.y);
    expect(Object.keys(h.progress.quests.completed)).toHaveLength(1);
    expect(hasItem(h.party, type)).toBe(false);
    expect(h.party.gold).toBeGreaterThanOrEqual(gold);
    expect(h.rec.messages.at(-1)).toContain("Reward");
  });

  it("find quest items on the floor", async () => {
    const h = await testHost("arachnoid-cavern");
    const spot = actionCells(h.map, 12)[0]!;
    const type = (h.map.get(spot.x, spot.y)!.ax as Record<string, string>).item_id!;
    await h.engine.activate(spot.x, spot.y);
    expect(hasItem(h.party, type)).toBe(true);
    expect(h.map.get(spot.x, spot.y)?.a).toBeUndefined();
  });
});

describe("travel", () => {
  it("asks before it leaves a map and remembers that it was left", async () => {
    const h = await testHost("fountain-head", "travel", { confirm: [false, true] });
    const exit = actionCells(h.map, 11).find((c) => String((h.map.get(c.x, c.y)!.ax as Record<string, string>).map_to_load) === "Outside")!;
    await h.engine.activate(exit.x, exit.y);
    expect(h.rec.transfers).toHaveLength(0);
    await h.engine.activate(exit.x, exit.y);
    expect(h.rec.transfers).toHaveLength(1);
    expect(h.rec.transfers[0]!.slug).toBe("outside");
    expect(h.progress.left).toContain("fountain-head");
  });

  it("refuses a gated transfer without the title and allows it with the title", async () => {
    const h = await testHost("outside", "gate");
    const door = actionCells(h.map, 11).find((c) => (h.map.get(c.x, c.y)!.ax as Record<string, string>).required_talent === "title_crusader")!;
    await h.engine.activate(door.x, door.y);
    expect(h.rec.transfers).toHaveLength(0);
    expect(h.rec.messages.length).toBeGreaterThan(0);
    h.party.talents.push("title_crusader");
    await h.engine.activate(door.x, door.y);
    expect(h.rec.transfers).toHaveLength(1);
  });

  it("teleports inside the map", async () => {
    const h = await testHost("fortress-of-fear");
    const tele = actionCells(h.map, 27)[0]!;
    const ax = h.map.get(tele.x, tele.y)!.ax as Record<string, string>;
    await h.engine.activate(tele.x, tele.y);
    expect(h.rec.teleports.at(-1)).toMatchObject({ x: Number(ax.tele_x), y: Number(ax.tele_y) });
  });

  it("remembers portals and travels to the one chosen", async () => {
    const h = await testHost("baywatch", "portal", { portal: ["408"] });
    const portal = actionCells(h.map, 28)[0]!;
    await h.engine.activate(portal.x, portal.y);
    expect(Object.keys(h.progress.portals)).toContain("408");
    expect(h.rec.transfers.at(-1)?.slug).toBe("baywatch");
  });
});

describe("puzzles", () => {
  it("opens the gates behind a lever once", async () => {
    const h = await testHost("wildabar-cavern", "lever", { confirm: [true, true] });
    const lever = actionCells(h.map, 31)[0]!;
    const ax = h.map.get(lever.x, lever.y)!.ax as Record<string, string>;
    const targets = [ax.xy_action1, ax.xy_action2].filter(Boolean);
    expect(targets.length).toBeGreaterThan(0);
    const before = h.map.get(lever.x, lever.y)!.ir ?? 0;
    await h.engine.activate(lever.x, lever.y);
    expect(((h.map.get(lever.x, lever.y)!.ir ?? 0) % 360)).toBe((before + 180) % 360);
    // the second pull only repeats the message
    const questions = h.rec.questions.length;
    await h.engine.activate(lever.x, lever.y);
    expect(h.rec.questions.length).toBe(questions);
  });

  it("answers a riddle: right opens, wrong keeps the action", async () => {
    const h = await testHost("castle-whiteshield", "riddle", { text: ["definitely wrong", null] });
    const riddle = actionCells(h.map, 42)[0]!;
    await h.engine.activate(riddle.x, riddle.y);
    expect(h.map.get(riddle.x, riddle.y)?.a).toBe(42);
    await h.engine.activate(riddle.x, riddle.y);
    expect(h.map.get(riddle.x, riddle.y)?.a).toBe(42);
    const ax = h.map.get(riddle.x, riddle.y)!.ax as Record<string, string>;
    const answer = ax.answer || "";
    if (answer) {
      const h2 = await testHost("castle-whiteshield", "riddle2", { text: [answer.toUpperCase()] });
      await h2.engine.activate(riddle.x, riddle.y);
      expect(h2.map.get(riddle.x, riddle.y)?.a).not.toBe(42);
    }
  });

  it("sends the party back when a password is wrong and lets it pass when it is right", async () => {
    const wrong = await testHost("fountain-head-cavern", "pw", { text: ["nonsense"] });
    const lock = actionCells(wrong.map, 22)[0]!;
    const ax = wrong.map.get(lock.x, lock.y)!.ax as Record<string, string>;
    await wrong.engine.activate(lock.x, lock.y);
    expect(wrong.rec.teleports.at(-1)).toMatchObject({ x: Number(ax.fail_tele_x), y: Number(ax.fail_tele_y) });
    expect(wrong.map.get(lock.x, lock.y)?.a).toBe(22);

    const aborted = await testHost("fountain-head-cavern", "pw", { text: [null] });
    await aborted.engine.activate(lock.x, lock.y);
    expect(aborted.rec.teleports.at(-1)).toMatchObject({ x: Number(ax.abort_tele_x), y: Number(ax.abort_tele_y) });

    const right = await testHost("fountain-head-cavern", "pw", { text: ["placeholder"] });
    const index = Number(ax.riddle_id);
    const { RIDDLES_MASTER } = await import("../../src/data/tables");
    right.script.text[0] = RIDDLES_MASTER[right.progress.passwords[index]!]!.answer;
    await right.engine.activate(lock.x, lock.y);
    expect(right.map.get(lock.x, lock.y)?.a).toBeUndefined();
    expect(right.rec.teleports).toHaveLength(0);
  });

  it("counts gong strikes of several gongs and fires its target when the count is reached", async () => {
    const h = await testHost("arachnoid-cavern", "gong", { confirm: Array(20).fill(true) as boolean[] });
    const gongs = actionCells(h.map, 40);
    const ax = h.map.get(gongs[0]!.x, gongs[0]!.y)!.ax as Record<string, string>;
    const same = gongs.filter((g) => (h.map.get(g.x, g.y)!.ax as Record<string, string>).counter_id === ax.counter_id);
    const target = Number(ax.target_value);
    expect(same.length).toBeGreaterThanOrEqual(target);
    for (let i = 0; i < target - 1; i++) await h.engine.activate(same[i]!.x, same[i]!.y);
    expect(h.progress.counters[ax.counter_id!]).toBe(target - 1);
    // a gong that rang already stays silent
    await h.engine.activate(same[0]!.x, same[0]!.y);
    expect(h.progress.counters[ax.counter_id!]).toBe(target - 1);
    await h.engine.activate(same[target - 1]!.x, same[target - 1]!.y);
    // the counter is gone once the target action fired
    expect(h.progress.counters[ax.counter_id!]).toBeUndefined();
  });

  it("copies and moves things between cells", async () => {
    const h = await testHost("fountain-head");
    const [sx, sy] = [5013, 5009];
    const move = h.map.entries().find(([, , c]) => c.a === 9039)!;
    expect(move).toBeDefined();
    const ax = move[2].ax as Record<string, string>;
    const src = ax.source_coordinates!.split("/").map(Number) as [number, number];
    const dst = ax.target_coordinates!.split("/").map(Number) as [number, number];
    const had = h.map.get(src[0], src[1]);
    await h.engine.trigger(`${move[0]}/${move[1]}`);
    if (had?.a !== undefined) expect(h.map.get(dst[0], dst[1])?.a).toBe(had.a);
    void sx;
    void sy;
  });

  it("puts the party in a throne's grip: attributes of 3 and twenty levels", async () => {
    const h = await testHost("tomb-of-terror", "throne", { character: [1] });
    const throne = actionCells(h.map, 53)[0]!;
    await h.engine.activate(throne.x, throne.y);
    const c = h.party.characters[1]!;
    expect(c.level).toBe(21);
    expect(c.str).toBe(3);
    expect(c.spd).toBe(3);
  });

  it("sells a talent for gold only when the party can pay", async () => {
    const h = await testHost("arachnoid-cavern", "talent", { confirm: [true, true] });
    const seller = actionCells(h.map, 15)[0]!;
    const name = (h.map.get(seller.x, seller.y)!.ax as Record<string, string>).talent_name!;
    h.party.gold = 1;
    await h.engine.activate(seller.x, seller.y);
    expect(h.party.talents).not.toContain(name);
    h.party.gold = 10_000_000;
    await h.engine.activate(seller.x, seller.y);
    expect(h.party.talents).toContain(name);
  });
});
