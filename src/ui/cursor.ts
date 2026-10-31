import { assetPath } from "./dom";

/**
 * Replaces the system mouse pointer by the old game's own (resources/textures/cursor, 6% of the screen height).
 * An element follows the mouse instead of a CSS `cursor: url()`: the picture is 128 px, the largest size browsers
 * accept for a CSS cursor, and far too big there. The system pointer is only hidden once the picture has loaded.
 */
let pointer: HTMLImageElement | null = null;
let fadeEnabled = false;
let idleSteps = 0;

/** The pointer fades out when the party has taken this many steps without the mouse moving (35th playtest), over this many seconds. */
export const CURSOR_FADE_STEPS = 5;
export const CURSOR_FADE_SECONDS = 1;

/** Shows the pointer at once (the mouse moved), cancelling a fade in progress. */
function reveal(): void {
  idleSteps = 0;
  if (!pointer) return;
  pointer.style.transition = "none";
  pointer.classList.add("on");
}

/** The option "Fade out cursor, if unused": off brings back a pointer that has faded. */
export function setCursorFade(on: boolean): void {
  fadeEnabled = on;
  idleSteps = 0;
  if (!on && pointer && pointer.classList.contains("faded")) reveal();
  pointer?.classList.remove("faded");
}

/** The party took a step. After `CURSOR_FADE_STEPS` steps without a mouse movement the pointer fades out over a second; the next movement of the mouse shows it at once. */
export function cursorStepped(): void {
  if (!fadeEnabled || !pointer) return;
  idleSteps++;
  if (idleSteps !== CURSOR_FADE_STEPS) return;
  pointer.style.transition = `opacity ${CURSOR_FADE_SECONDS}s linear`;
  pointer.classList.remove("on");
  pointer.classList.add("faded");
}

export function installCursor(): void {
  const img = new Image();
  img.id = "game-cursor";
  img.alt = "";
  img.draggable = false;
  img.src = assetPath("ui/cursor.webp");
  img.decode().then(
    () => {
      document.body.append(img);
      document.documentElement.classList.add("custom-cursor");
      pointer = img;
    },
    () => undefined,
  );

  const move = (e: PointerEvent) => {
    if (e.pointerType !== "mouse") return; // a finger has no pointer to draw
    img.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`;
    img.classList.remove("faded");
    reveal();
    img.classList.add("on");
  };
  window.addEventListener("pointermove", move, true);
  window.addEventListener("pointerdown", move, true);
  document.documentElement.addEventListener("mouseleave", () => img.classList.remove("on"));
}
