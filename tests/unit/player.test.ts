import { describe, expect, it } from "vitest";
import { PlayerRig } from "../../src/game/player";

/** A row of tiles along x with one monster that walks towards the party, like `monsterTurn` does after each step. */
function rowWith(monsterX: number) {
  const monster = { x: monsterX };
  const blockedAt: number[] = [];
  const rig: PlayerRig = new PlayerRig({
    canEnter: (x, y) => y === 0 && x >= 0 && x !== monster.x,
    heightAt: () => 0,
    arrived: (x) => {
      if (monster.x - x >= 2) monster.x--;
    },
    blocked: (x) => {
      blockedAt.push(x);
    },
  });
  rig.place(0, 0, "E", 0, 0);
  return { rig, monster, blockedAt };
}

const run = (rig: PlayerRig, seconds: number) => {
  for (let t = 0; t < seconds; t += 0.05) rig.update(0.05);
};

describe("the party and monsters", () => {
  it("cannot walk through a monster that closes in while a step is queued", () => {
    const { rig, monster, blockedAt } = rowWith(3);
    rig.command({ type: "move", dir: "forward" });
    rig.command({ type: "move", dir: "forward" }); // held key: waits in the queue
    run(rig, 2);
    expect(monster.x).toBe(2);
    expect(rig.tx).toBe(1);
    expect(blockedAt).toEqual([2]);
  });

  it("checks a queued step against the monsters' answer to the step before", () => {
    const { rig, monster } = rowWith(5);
    for (let i = 0; i < 6; i++) rig.command({ type: "move", dir: "forward" });
    for (let t = 0; t < 4; t += 0.05) {
      rig.update(0.05);
      rig.command({ type: "move", dir: "forward" });
      expect(rig.tx).not.toBe(monster.x);
    }
    expect(rig.tx).toBe(monster.x - 1);
  });

  it("reports the tile of a step in progress and nothing otherwise", () => {
    const { rig } = rowWith(9);
    expect(rig.entering).toBeNull();
    rig.command({ type: "move", dir: "forward" });
    expect(rig.entering).toEqual({ x: 1, y: 0 });
    run(rig, 1);
    expect(rig.entering).toBeNull();
    rig.command({ type: "turn", by: 1 });
    expect(rig.entering).toBeNull();
  });

  it("drops a queued step when the party is moved during the arrival", () => {
    const moved: number[] = [];
    const rig: PlayerRig = new PlayerRig({
      canEnter: () => true,
      heightAt: () => 0,
      arrived: () => {
        rig.place(10, 0, "E", 30, 0);
      },
      blocked: () => {},
      stepStarted: (x) => {
        moved.push(x);
      },
    });
    rig.place(0, 0, "E", 0, 0);
    rig.command({ type: "move", dir: "forward" });
    rig.command({ type: "move", dir: "forward" });
    run(rig, 1);
    expect(moved).toEqual([1]);
    expect(rig.tx).toBe(10);
    expect(rig.busy).toBe(false);
  });
});
