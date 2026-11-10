import { plateButton, preloadButtonArt } from "./buttonArt";
import { assetPath, h } from "./dom";
import { preloadItemIcons, warmItemIcon } from "./itemIcons";
import { preloadSpellIcons, spellPlate } from "./spellIcons";

let kept: HTMLElement | null = null;

/** The four faces the style sheet imports (`@fontsource`): the heads in Cinzel, the text in Almendra, regular and bold. */
const FONTS: readonly (readonly [weight: number, family: string])[] = [
  [500, "Cinzel"],
  [700, "Cinzel"],
  [400, "Almendra"],
  [700, "Almendra"],
];
/** Letters, digits, umlauts and the punctuation of the texts: the browser loads a font in pieces by character range and asks for a piece when the first character of it is shown. */
const FONT_SAMPLE = "AaBbQqXxZz 0123456789 ÄÖÜäöüß éèêàçñ …–—‘’“”«»";

/**
 * Loads every face of both fonts, with the characters of the texts (53rd playtest, point 29). A face that no text has used yet is fetched when the first one needs it, and until it has
 * come the text stands in the stand-in font and then jumps: the quest log, whose bold lines nothing before had shown, did it at every start. The start waits for it, but never longer than four seconds.
 */
export async function loadFonts(): Promise<void> {
  if (!document.fonts) return;
  const all = Promise.all(FONTS.map(([weight, family]) => document.fonts.load(`${weight} 18px "${family}"`, FONT_SAMPLE).catch(() => [])));
  await Promise.race([all, new Promise((resolve) => setTimeout(resolve, 4000))]);
}

/**
 * Keeps the pictures and fonts of the windows decoded (50th playtest, point 3; 53rd playtest, point 29): an `Image` that only sits in a variable can lose its decoded bitmap, and the first
 * window that shows a spell plate, an item slot or a scroll then fetched, decoded and uploaded it again (the slots of the inventory filled in one after the other in a long game). Things
 * that really sit in the page (painted, but practically transparent and under everything) hold the spell sheet, the item sheet, the blank button, the frames of the scroll and of the
 * computer screen, the status symbols and every face of the fonts in use for good. Called once at start-up; calling it again does nothing.
 */
export async function keepSpellArtWarm(): Promise<void> {
  if (kept) return;
  await Promise.all([preloadSpellIcons(), preloadButtonArt(), preloadItemIcons(), loadFonts()]);
  const plate = spellPlate(6);
  plate.style.width = "128px";
  const parts: (HTMLElement | null)[] = [plate, plateButton("", 110, () => undefined), warmItemIcon(48)];
  // the frames that only a style rule asks for: a box of its own class paints each of them
  for (const cls of ["parchment", "parchment computer"]) {
    const frame = h("div", { class: cls, text: "x" });
    frame.style.cssText = "display:inline-block;min-height:0;width:auto";
    parts.push(frame);
  }
  for (const name of ["levitate", "power_shield", "wizard_eye", "detect_monster", "protect_acid", "protect_fire", "protect_ice", "protect_magic"]) {
    parts.push(h("img", { src: assetPath(`ui/tex_gui_${name}.webp`), alt: "", style: "width:40px;height:40px" }));
  }
  // a line of text in each face: a face that no visible text uses can be dropped, and the text then shows in the stand-in font until it is fetched again
  for (const [weight, family] of FONTS) parts.push(h("span", { text: FONT_SAMPLE, style: `font:${weight} 16px "${family}", Georgia, serif;white-space:nowrap;display:block` }));
  const holder = h("div", { class: "art-warm" }, ...parts);
  holder.setAttribute("aria-hidden", "true");
  holder.style.cssText = "position:fixed;left:0;top:0;width:640px;height:420px;opacity:0.01;pointer-events:none;z-index:-1;overflow:hidden";
  document.body.appendChild(holder);
  kept = holder;
}
