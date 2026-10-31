import { assetPath, h } from "./dom";

/** The user's blank button (`ui/button_blank.webp`, 459 x 214): a cream plate in a brown rim. Windows write their label on it (36th playtest). */
const BLANK_BUTTON = "ui/button_blank.webp";
/** The width over the height of the picture, so a button keeps its shape at any size. */
const BLANK_RATIO = 459 / 214;

let image: HTMLImageElement | null = null;
let loading: Promise<void> | null = null;

/**
 * Fetches and decodes the picture of the button once at start-up, so that a window with such a button never shows it empty for a moment (a CSS background is only
 * fetched when something first asks for it). Calling it again returns the same promise.
 */
export function preloadButtonArt(): Promise<void> {
  loading ??= (async () => {
    try {
      const img = new Image();
      img.src = assetPath(BLANK_BUTTON);
      image = img; // the reference keeps the decoded picture in the cache
      await img.decode();
    } catch {
      // without the picture the button is a plain plate with its label: still usable
    }
  })();
  return loading;
}

/** A button of the user's plate with `label` written on it, `width` CSS pixels wide. */
export function plateButton(label: string, width: number, onclick: () => void): HTMLButtonElement {
  const button = h("button", {
    class: "plate-button",
    style: `width:${width}px;height:${Math.round(width / BLANK_RATIO)}px;background-image:url("${assetPath(BLANK_BUTTON)}")`,
    onclick,
  }, h("span", { text: label })) as HTMLButtonElement;
  return button;
}

void image;
