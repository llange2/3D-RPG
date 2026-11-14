import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { AVATAR_EFFECTS, cureEffects, effectFile, hitEffect, protectionEffect } from "../../src/ui/avatarFx";

const root = join(__dirname, "..", "..");

describe("bug_fix_60: effect pictures are all loaded ahead", () => {
  it("lists every effect picture the game can show, and each has its file", () => {
    for (const effect of AVATAR_EFFECTS) expect(existsSync(join(root, "public", "assets", effectFile(effect))), effect).toBe(true);
    const used = new Set<string>([
      ...["fire", "ice", "acid", "poison", "magic", "physical", "unknown"].map(hitEffect),
      ...cureEffects(["Sleeping", "Weak", "Drunk", "Poisoned", "Crazy", "Diseased", "Paralyzed", "Petrified", "Cursed"]),
      ...(["acid", "fire", "ice", "magic"] as const).map(protectionEffect),
      "cure_hp",
      "gui_levitate",
      "gui_power_shield",
      "gui_wizard_eye",
      "gui_detect_monster",
    ]);
    for (const name of used) expect(AVATAR_EFFECTS as readonly string[]).toContain(name);
  });
});

describe("bug_fix_60: source files are valid UTF-8", () => {
  // bug_fix_59 saved a "x" sign as one Windows-1252 byte: rolldown refused the file, Vite skipped the dependency pre-bundling and served Babylon module by module
  const walk = (dir: string, out: string[]): string[] => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path, out);
      else if (/\.(ts|css|html)$/.test(name)) out.push(path);
    }
    return out;
  };
  it("src, tests and tools decode without errors", () => {
    const decoder = new TextDecoder("utf-8", { fatal: true });
    const bad: string[] = [];
    for (const dir of ["src", "tests", "tools"]) {
      for (const file of walk(join(root, dir), [])) {
        try {
          decoder.decode(readFileSync(file));
        } catch {
          bad.push(file);
        }
      }
    }
    expect(bad).toEqual([]);
  });
});
