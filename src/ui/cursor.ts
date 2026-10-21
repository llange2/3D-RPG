import { assetPath } from "./dom";

/**
 * Replaces the system mouse pointer by the old game's own (resources/textures/cursor, 6% of the screen height).
 * An element follows the mouse instead of a CSS `cursor: url()`: the picture is 128 px, the largest size browsers
 * accept for a CSS cursor, and far too big there. The system pointer is only hidden once the picture has loaded.
 */
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
    },
    () => undefined,
  );

  const move = (e: PointerEvent) => {
    if (e.pointerType !== "mouse") return; // a finger has no pointer to draw
    img.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`;
    img.classList.add("on");
  };
  window.addEventListener("pointermove", move, true);
  window.addEventListener("pointerdown", move, true);
  document.documentElement.addEventListener("mouseleave", () => img.classList.remove("on"));
}
