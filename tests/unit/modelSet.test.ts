import { describe, expect, it } from "vitest";
import { registryFile, resolveModelSet } from "../../src/render/modelSet";

describe("model set", () => {
  it("defaults to the low-poly set", () => {
    expect(resolveModelSet("", null)).toBe("lowpoly");
    expect(resolveModelSet("?seed=alpha", "something else")).toBe("lowpoly");
  });

  it("uses the stored choice", () => {
    expect(resolveModelSet("", "original")).toBe("original");
    expect(resolveModelSet("", "lowpoly")).toBe("lowpoly");
  });

  it("lets ?models= beat the stored choice in both directions", () => {
    expect(resolveModelSet("?models=original", "lowpoly")).toBe("original");
    expect(resolveModelSet("?seed=a&models=lowpoly", "original")).toBe("lowpoly");
  });

  it("names the registries of both sets", () => {
    expect(registryFile("static", "lowpoly")).toBe("models.static.json");
    expect(registryFile("monsters", "lowpoly")).toBe("models.monsters.json");
    expect(registryFile("static", "original")).toBe("models.static.original.json");
    expect(registryFile("monsters", "original")).toBe("models.monsters.original.json");
  });
});
