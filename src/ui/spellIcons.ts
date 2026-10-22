import { h, assetPath } from "./dom";

/** Register of `ui/spells.json` (built by `tools/assets/build-spell-icons.ts`): which cell of the sheet holds which spell. */
interface SpellSheet {
  cell: { w: number; h: number };
  columns: number;
  cells: number;
  cellOf: Record<string, number>;
  placeholder: number[];
}

let sheet: SpellSheet | null = null;
let image: HTMLImageElement | null = null;
let loading: Promise<void> | null = null;

/**
 * Fetches the sheet of spell pictures and decodes it, so that the spell window can show every picture the moment it opens (a CSS
 * background is only fetched and decoded when something first asks for it, which showed the window with empty plates for a moment).
 * Called once at start-up; calling it again returns the same promise.
 */
export function preloadSpellIcons(): Promise<void> {
  loading ??= (async () => {
    try {
      const [register] = await Promise.all([
        fetch(assetPath("ui/spells.json")).then((r) => r.json() as Promise<SpellSheet>),
        (async () => {
          const img = new Image();
          img.src = assetPath("ui/spells.webp");
          image = img; // the reference keeps the decoded picture in the cache
          await img.decode();
        })(),
      ]);
      sheet = register;
    } catch {
      // without the sheet the window shows plain plates with the names: still playable
      sheet = null;
    }
  })();
  return loading;
}

/** True when the picture of this spell is the shared placeholder, so that the window has to write the name on it. */
export function isPlaceholderIcon(spellId: number): boolean {
  return !sheet || sheet.placeholder.includes(spellId);
}

/**
 * The plate of a spell: a box of `width` CSS pixels (the plates are 128 x 60) showing its cell of the sheet. It is cut with
 * percentages of the box, so it stays sharp at any size; a plain plate when the sheet is missing.
 */
export function spellIcon(spellId: number, width: number): HTMLElement {
  const el = h("div", { class: "spell-icon", style: `width:${width}px;height:${Math.round((width * 60) / 128)}px` });
  if (!sheet) return el;
  const cell = sheet.cellOf[String(spellId)];
  if (cell === undefined) return el;
  const rows = Math.ceil(sheet.cells / sheet.columns);
  const col = cell % sheet.columns;
  const row = Math.floor(cell / sheet.columns);
  el.style.backgroundImage = `url("${assetPath("ui/spells.webp")}")`;
  el.style.backgroundSize = `${sheet.columns * 100}% ${rows * 100}%`;
  el.style.backgroundPosition = `${sheet.columns > 1 ? (col / (sheet.columns - 1)) * 100 : 0}% ${rows > 1 ? (row / (rows - 1)) * 100 : 0}%`;
  return el;
}

/** The same plate for a box whose size the style sheet decides (the spell window): the cell, without a fixed width. */
export function spellPlate(spellId: number): HTMLElement {
  const el = spellIcon(spellId, 128);
  el.style.width = "100%";
  el.style.height = "";
  el.classList.add("plate");
  return el;
}

void image;
