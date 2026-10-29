import { z } from "zod";
import type { RuleSet } from "../../actions/types";
import type { InteriorKind } from "../../interiors/types";
import cave from "./cave.json";
import dungeon from "./dungeon.json";
import fortress from "./fortress.json";
import town from "./town.json";
import trapDamage from "./traps.json";

const paramValue = z.union([z.number(), z.string(), z.boolean()]);

const ruleSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(["treasure", "door", "trap", "lore", "transfer", "service", "ambush", "shrine", "fountain", "breakable_wall", "decor", "riddle", "gong", "lever", "head", "teleporter", "talent", "portal", "work", "spawn"]),
  anchor: z.enum(["exit", "mouth", "deadEnd", "roomCenter", "roomEdge", "corridor", "bossRoom", "bossRoomEdge", "lot", "plaza", "plazaCorner", "wallBetween", "street", "talentSite", "portalSite", "workSite", "chestSite", "looseSite", "cageSite", "guardSite", "decorSite", "fountainSite", "vaultGate", "vaultDoor", "vaultWall", "vaultChest", "vaultGuard", "beforeTreasure"]),
  when: z
    .object({
      minDepth: z.number().optional(),
      maxDepth: z.number().optional(),
      minTier: z.number().optional(),
      maxTier: z.number().optional(),
      minRoomSize: z.number().optional(),
      maxRoomSize: z.number().optional(),
      excludeEntranceRoom: z.boolean().optional(),
      klass: z.enum(["A", "B", "C"]).optional(),
      theme: z.boolean().optional(),
      alignment: z.array(z.enum(["good", "neutral", "evil"])).optional(),
    })
    .strict()
    .optional(),
  count: z.union([z.object({ perMap: z.tuple([z.number().int().min(0), z.number().int().min(0)]) }).strict(), z.object({ chance: z.number().int().min(0).max(1000) }).strict()]),
  params: z.record(z.string(), paramValue).optional(),
  variants: z.array(z.object({ weight: z.number().positive(), params: z.record(z.string(), paramValue) }).strict()).optional(),
  assign: z.array(z.string()).optional(),
});

const ruleSetSchema = z.object({ tierBonus: z.number().int(), rules: z.array(ruleSchema).min(1) }).strict();

function load(name: string, raw: unknown): RuleSet {
  const parsed = ruleSetSchema.safeParse(raw);
  if (!parsed.success) throw new Error(`rules/${name}.json is invalid: ${parsed.error.message}`);
  const ids = new Set<string>();
  for (const rule of parsed.data.rules) {
    if (ids.has(rule.id)) throw new Error(`rules/${name}.json: duplicate rule id ${rule.id}`);
    ids.add(rule.id);
  }
  return parsed.data as RuleSet;
}

export const RULE_SETS: Record<InteriorKind, RuleSet> = {
  dungeon: load("dungeon", dungeon),
  cave: load("cave", cave),
  fortress: load("fortress", fortress),
  town: load("town", town),
};

/** Damage of each kind of trap as an expression (see actions/expr.ts). A themed place has one kind of trap, the rule only says where it stands. */
export const TRAP_DAMAGE = z.record(z.string(), paramValue).parse(trapDamage);
