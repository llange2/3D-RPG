/**
 * Validates the JSON exported by export_g_data.py: zod schemas, key/id consistency, text-id ranges and
 * references to asset files in old_code/resources.
 * Schema or reference errors fail the run (exit 1); missing asset files are warnings because they feed the asset pipeline.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const RAW = join(ROOT, "src", "data", "raw");
const OLD_CODE = join(ROOT, "..", "old_code");

const errors: string[] = [];
const warnings: string[] = [];

function load<T>(name: string): T {
  return JSON.parse(readFileSync(join(RAW, `${name}.json`), "utf-8")) as T;
}

/** Texture references in g.py have no extension. */
function textureExists(ref: string): boolean {
  if (/\.\w+$/.test(ref)) return existsSync(join(OLD_CODE, ref));
  return [".png", ".jpg", ".jpeg", ".webp"].some((ext) => existsSync(join(OLD_CODE, ref + ext)));
}

const num = z.number();
const textId = z.number().int().nonnegative();

const MonsterSchema = z.looseObject({
  name: z.string(),
  armor: num,
  health: num,
  damage_min: num,
  damage_max: num,
  no_of_attacks: num,
  speed: num,
  xp: num,
  gold: num,
  treasure_level: z.number().int().min(1).max(5),
  attack_type: z.string(),
  terrain: z.enum(["land", "water"]),
  undead: z.boolean(),
  icon_height: num,
  res_acid: num,
  res_fire: num,
  res_ice: num,
  res_magic: num,
  res_physical: num,
  anim_path: z.string().optional(),
  anim_scale: num.optional(),
});

const BlockSchema = z.looseObject({
  block_id: z.number().int(),
  name: z.string(),
  obstacle: z.boolean(),
  view_blocking: z.boolean(),
  terrain: z.string(),
  minimap_texture: z.string().optional(),
});

const SpellSchema = z.looseObject({
  name: textId,
  description: textId,
  mana: num,
  level: num,
  category: z.string(),
  type: z.array(z.string()),
});

const TalentSchema = z.looseObject({ name: textId, description: textId, price: num });
const ActionSchema = z.looseObject({ name: z.string(), action_id: z.number().int() });
// Keys >= 9000 are editor/engine markers (action marker, monster health marker, spear trap) without an item_id.
const ItemSchema = z.looseObject({ name: z.string(), item_id: z.number().int().nullable() });

function validateTable<T>(table: string, schema: z.ZodType<T>, onEntry?: (key: string, value: T) => void): void {
  const data = load<Record<string, unknown>>(table);
  for (const [key, raw] of Object.entries(data)) {
    const parsed = schema.safeParse(raw);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) errors.push(`${table}[${key}].${issue.path.join(".")}: ${issue.message}`);
      continue;
    }
    onEntry?.(key, parsed.data);
  }
}

const texts = load<string[]>("texts");

function checkTextId(table: string, key: string, field: string, id: number): void {
  if (id >= texts.length) errors.push(`${table}[${key}].${field}: text id ${id} out of range (${texts.length} texts)`);
}

const missingFiles = new Set<string>();

validateTable("MONSTER_DATA", MonsterSchema, (key, m) => {
  if (m.anim_path && !existsSync(join(OLD_CODE, m.anim_path))) missingFiles.add(`MONSTER_DATA[${key}] ${m.anim_path}`);
});

validateTable("BLOCKS", BlockSchema, (key, b) => {
  if (String(b.block_id) !== key) errors.push(`BLOCKS[${key}]: block_id ${b.block_id} does not match key`);
  if (b.minimap_texture && !textureExists(b.minimap_texture)) missingFiles.add(`BLOCKS[${key}] ${b.minimap_texture}`);
});

validateTable("SPELLS", SpellSchema, (key, s) => {
  checkTextId("SPELLS", key, "name", s.name);
  checkTextId("SPELLS", key, "description", s.description);
});

validateTable("TALENTS", TalentSchema, (key, t) => {
  checkTextId("TALENTS", key, "name", t.name);
  checkTextId("TALENTS", key, "description", t.description);
});

validateTable("ACTIONS", ActionSchema, (key, a) => {
  if (String(a.action_id) !== key) errors.push(`ACTIONS[${key}]: action_id ${a.action_id} does not match key`);
});

validateTable("ITEMS", ItemSchema, (key, i) => {
  if (i.item_id === null) {
    if (Number(key) < 9000) errors.push(`ITEMS[${key}]: item_id is null but key is below 9000`);
  } else if (String(i.item_id) !== key) {
    errors.push(`ITEMS[${key}]: item_id ${i.item_id} does not match key`);
  }
});

for (const entry of missingFiles) warnings.push(`missing asset file: ${entry}`);

console.log(`data:validate  errors=${errors.length}  warnings=${warnings.length}`);
for (const w of warnings.slice(0, 40)) console.log(`  WARN  ${w}`);
if (warnings.length > 40) console.log(`  ... ${warnings.length - 40} more warnings`);
for (const e of errors.slice(0, 80)) console.error(`  ERROR ${e}`);
if (errors.length > 80) console.error(`  ... ${errors.length - 80} more errors`);
process.exit(errors.length > 0 ? 1 : 0);
