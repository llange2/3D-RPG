/**
 * The portraits of a hero in all their states become ONE sheet per hero (`icons/portraits/sheets/<avatar>.webp`) with a register (`sheets.json`) (45th playtest, point 5).
 * A state is a condition shown on the portrait (blessed, drunk, poisoned ...) and used to be a file of its own that the browser fetched at the moment the condition
 * appeared, so the plain face stayed on screen for a moment. The game loads the sheets of the heroes it has chosen before the first frame (`ui/portraitSheets.ts`),
 * cuts them into pictures and shows every state at once.
 *
 * Frame order: the plain portrait, then `STATES` in this order; the dead and the rotten have one picture for everybody (`character00_Dead`, `character00_Rotten`)
 * and are in every sheet. A state a hero has no picture for (the old game has no `character17_Crazy`) is empty: the register names the frames that exist.
 */
import { existsSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import sharp, { type OverlayOptions } from "sharp";
import { OUT, ensureDir } from "./lib";

/** The suffixes of the portraits of a hero in a state, in the order of the frames after the plain one (`PORTRAIT_SUFFIX` in `src/ui/avatarFx.ts` names the same pictures). */
export const STATES = ["_Blessed", "_Crazy", "_Cursed", "_Diseased", "_Drunk", "_Paralyzed", "_Petrified", "_Poisoned", "_Sleeping"] as const;
/** The pictures all heroes share. */
export const SHARED = ["character00_Dead", "character00_Rotten"] as const;
export const FRAME = 192;

export interface PortraitSheets {
  frame: number;
  /** Frames of a sheet in order: "" is the plain portrait, then the suffixes, then the shared pictures by their file name. */
  frames: string[];
  /** Per avatar the indices of the frames that exist. */
  avatars: Record<string, number[]>;
}

export async function buildPortraitSheets(): Promise<{ files: number; bytes: number }> {
  const dir = join(OUT, "icons", "portraits");
  const frames = ["", ...STATES, ...SHARED];
  const file = (avatar: string, f: string): string => join(dir, f.startsWith("character00_") ? `${f}.webp` : `${avatar}${f}.webp`);
  const avatars: Record<string, number[]> = {};
  let bytes = 0;
  let files = 0;
  for (let n = 1; n <= 22; n++) {
    const avatar = `character${String(n).padStart(2, "0")}`;
    if (!existsSync(file(avatar, ""))) continue;
    const present: number[] = [];
    const composites: OverlayOptions[] = [];
    frames.forEach((f, i) => {
      const path = file(avatar, f);
      if (!existsSync(path)) return;
      present.push(i);
      composites.push({ input: path, left: i * FRAME, top: 0 });
    });
    const out = join(dir, "sheets", `${avatar}.webp`);
    ensureDir(out);
    const info = await sharp({ create: { width: frames.length * FRAME, height: FRAME, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
      .composite(composites)
      .webp({ quality: 85, effort: 5 })
      .toFile(out);
    avatars[avatar] = present;
    bytes += info.size;
    files++;
  }
  const register: PortraitSheets = { frame: FRAME, frames, avatars };
  const registerFile = join(dir, "sheets", "sheets.json");
  writeFileSync(registerFile, JSON.stringify(register));
  bytes += statSync(registerFile).size;
  return { files: files + 1, bytes };
}

if (import.meta.url === `file://${process.argv[1]!.replace(/\\/g, "/")}` || process.argv[1]?.endsWith("build-portrait-sheets.ts")) {
  buildPortraitSheets().then((r) => console.log(`portrait sheets: ${r.files} files, ${(r.bytes / 1024).toFixed(0)} KB`));
}
