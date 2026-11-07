import { assetPath } from "./dom";

/**
 * The portraits of the chosen heroes in all their states (45th playtest, point 5). `tools/assets/build-portrait-sheets.ts` puts the pictures of one hero (plain, blessed,
 * drunk, poisoned ..., dead) on ONE sheet. The game fetches the sheet of every hero in the party before the first frame and after every change of the party, cuts it
 * into pictures and hands those to `portraitImage` (`avatarFx.ts`): when a condition appears, its picture is there already instead of being fetched at that moment.
 */
interface Register {
  frame: number;
  frames: string[];
  avatars: Record<string, number[]>;
}

/** The picture of a state by its file name (`character03_Poisoned`) -> an object URL of the cut-out picture. */
const urls = new Map<string, string>();
/** The pictures stay decoded for as long as the game runs. */
const decoded: HTMLImageElement[] = [];
const loading = new Map<string, Promise<void>>();
let register: Promise<Register | null> | null = null;

function loadRegister(): Promise<Register | null> {
  register ??= fetch(assetPath("icons/portraits/sheets/sheets.json"))
    .then((r) => (r.ok ? (r.json() as Promise<Register>) : null))
    .catch(() => null);
  return register;
}

/** The file name (without extension) of frame `i` of a hero's sheet. */
export function frameFile(avatar: string, frame: string): string {
  return frame === "" ? avatar : frame.startsWith("character00_") ? frame : `${avatar}${frame}`;
}

/** The ready picture of a portrait file (`character03_Poisoned`), or undefined while its sheet has not come yet (the caller then uses the file itself). */
export function cachedPortrait(file: string): string | undefined {
  return urls.get(file);
}

async function loadSheet(avatar: string, reg: Register): Promise<void> {
  const present = reg.avatars[avatar];
  if (!present) return;
  const response = await fetch(assetPath(`icons/portraits/sheets/${avatar}.webp`));
  if (!response.ok) return;
  const bitmap = await createImageBitmap(await response.blob());
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = reg.frame;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  for (const i of present) {
    const file = frameFile(avatar, reg.frames[i]!);
    if (urls.has(file)) continue;
    ctx.clearRect(0, 0, reg.frame, reg.frame);
    ctx.drawImage(bitmap, i * reg.frame, 0, reg.frame, reg.frame, 0, 0, reg.frame, reg.frame);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) continue;
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.src = url;
    // (decoded now, so that the first time it is shown costs nothing)
    await img.decode().catch(() => undefined);
    urls.set(file, url);
    decoded.push(img);
  }
  bitmap.close();
}

/** Loads the sheets of these heroes' avatars (`character03`); one that is cut already costs nothing. Never rejects: without its sheet a portrait loads from its file as before. */
export function preloadPortraits(avatars: Iterable<string>): Promise<void> {
  return loadRegister().then(async (reg) => {
    if (!reg) return;
    await Promise.all(
      [...new Set(avatars)].map((avatar) => {
        let job = loading.get(avatar);
        if (!job) {
          job = loadSheet(avatar, reg).catch(() => undefined);
          loading.set(avatar, job);
        }
        return job;
      }),
    );
  });
}
