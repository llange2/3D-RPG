import { packBrings, resolveAsset } from "../assets/pack";

/**
 * The pictures that only a CSS rule asks for (`ui/style.css`): the scroll behind every message, the computer screen and the title. The rules read them from these variables and fall back
 * to Classic's file, so a style sheet cannot name a pack's file itself; a pack that brings one of them gets its variable here, once at start-up.
 * (The moving picture of the first loading screen in `index.html` is Classic's in every version: the page asks for it before any script has run.)
 */
export const CSS_PICTURES: Readonly<Record<string, string>> = {
  "--img-scroll": "ui/scroll.webp",
  "--img-computer-screen": "ui/computer_screen.webp",
  "--img-title": "ui/title.webp",
};

export function applyPackStyles(): void {
  const root = document.documentElement;
  for (const [variable, path] of Object.entries(CSS_PICTURES)) {
    if (packBrings(path)) root.style.setProperty(variable, `url("${resolveAsset(path)}")`);
    else root.style.removeProperty(variable);
  }
}
