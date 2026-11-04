import { describe, expect, it } from "vitest";
import { COTTAGE_HEIGHT_FACTOR, COTTAGE_SCALE } from "../../src/data/item-tuning";
import { COTTAGE_LINES } from "../../src/data/prop-texts";
import { TALENT_SELLERS, sellerParams } from "../../src/data/talent-sellers";
import { cottageProp } from "../../src/render/itemProps";

describe("the cottage is 25 % higher and no caravan", () => {
  it("is drawn a quarter higher than wide", () => {
    const prop = cottageProp(0, 0, 0);
    expect(prop.scaleXYZ).toEqual([COTTAGE_SCALE, COTTAGE_SCALE * 1.25, COTTAGE_SCALE]);
    expect(COTTAGE_HEIGHT_FACTOR).toBe(1.25);
  });

  it("says cottage where the wagon's talent seller speaks, and caravan only for the wagon", () => {
    for (const [talent, seller] of Object.entries(TALENT_SELLERS)) {
      if (seller.item !== 26) continue;
      const cottage = String(sellerParams(talent, true).text);
      expect(cottage, talent).not.toMatch(/caravan/i);
      expect(cottage, talent).toMatch(/cottage/i);
      expect(String(sellerParams(talent).text), talent).toMatch(/caravan/i);
    }
    for (const line of COTTAGE_LINES) expect(line).not.toMatch(/caravan/i);
  });
});
