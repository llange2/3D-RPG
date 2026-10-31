import { describe, expect, it } from "vitest";
import { registryFile } from "../../src/render/modelSet";

describe("model registries", () => {
  it("are the registries of the originals: the low-poly set and its option are gone (37th playtest)", () => {
    expect(registryFile("static")).toBe("models.static.original.json");
    expect(registryFile("monsters")).toBe("models.monsters.original.json");
  });
});
