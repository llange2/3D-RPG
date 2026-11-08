import { plateButton, preloadButtonArt } from "./buttonArt";
import { h } from "./dom";
import { preloadSpellIcons, spellPlate } from "./spellIcons";

let kept: HTMLElement | null = null;

/**
 * Keeps the pictures of the spell windows decoded (50th playtest, point 3): an `Image` that only sits in a variable can lose its decoded bitmap, and the first window
 * that shows a spell plate or the "Select" button then fetched, decoded and uploaded it again. A plate and a button that really sit in the page (painted, but
 * practically transparent and under everything) hold the sheet, the blank button and their texture on the graphics card for good.
 * Called once at start-up; calling it again does nothing.
 */
export async function keepSpellArtWarm(): Promise<void> {
  if (kept) return;
  await Promise.all([preloadSpellIcons(), preloadButtonArt()]);
  const plate = spellPlate(6);
  plate.style.width = "128px";
  const holder = h("div", { class: "art-warm" }, plate, plateButton("", 110, () => undefined));
  holder.setAttribute("aria-hidden", "true");
  holder.style.cssText = "position:fixed;left:0;top:0;width:260px;height:120px;opacity:0.01;pointer-events:none;z-index:-1;overflow:hidden";
  document.body.appendChild(holder);
  kept = holder;
}
