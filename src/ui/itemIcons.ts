import type { Item } from "../sim/types";
import { h, assetPath } from "./dom";

/** Register of `ui/items.json` (built by `tools/assets/build-item-icons.ts`): which cell of the sheet holds which item picture. */
interface ItemSheet {
  cell: number;
  columns: number;
  cells: number;
  cellOf: Record<string, number>;
}

let sheet: ItemSheet | null = null;
let image: HTMLImageElement | null = null;
let loading: Promise<void> | null = null;

/**
 * Fetches the sheet of item pictures and decodes it, so that every slot shows its picture the moment it is drawn (a file of its own was only
 * looked up, fetched and decoded when a slot first asked for it, and the pictures came in one after the other). Called once at start-up;
 * calling it again returns the same promise.
 */
export function preloadItemIcons(): Promise<void> {
  loading ??= (async () => {
    try {
      const [register] = await Promise.all([
        fetch(assetPath("ui/items.json")).then((r) => r.json() as Promise<ItemSheet>),
        (async () => {
          const img = new Image();
          img.src = assetPath("ui/items.webp");
          image = img; // the reference keeps the decoded picture in the cache
          await img.decode();
        })(),
      ]);
      sheet = register;
    } catch {
      // without the sheet the slots stay empty plates: still playable
      sheet = null;
    }
  })();
  return loading;
}

/** Shows the cell of a picture in a box of any size: it is cut with percentages of the box, so it stays sharp at every size. */
function showCell(el: HTMLElement, texture: string): void {
  if (!sheet) return;
  const cell = sheet.cellOf[texture];
  if (cell === undefined) return;
  const rows = Math.ceil(sheet.cells / sheet.columns);
  const col = cell % sheet.columns;
  const row = Math.floor(cell / sheet.columns);
  el.style.backgroundImage = `url("${assetPath("ui/items.webp")}")`;
  el.style.backgroundSize = `${sheet.columns * 100}% ${rows * 100}%`;
  el.style.backgroundPosition = `${sheet.columns > 1 ? (col / (sheet.columns - 1)) * 100 : 0}% ${rows > 1 ? (row / (rows - 1)) * 100 : 0}%`;
}

/**
 * The picture of an item: a square box of `size` CSS pixels (or of the size the style sheet gives `.item-icon`, as in the slots) showing its cell
 * of the sheet. A box that is made before the sheet has arrived fills itself in when it does.
 */
export function itemIcon(item: Pick<Item, "texture">, size?: number): HTMLElement {
  const el = h("div", { class: "item-icon", ...(size ? { style: `width:${size}px;height:${size}px` } : {}) });
  if (sheet) showCell(el, item.texture);
  else void preloadItemIcons().then(() => showCell(el, item.texture));
  return el;
}

void image;
