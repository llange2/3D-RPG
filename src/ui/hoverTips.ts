import { tooltipBesidePointer } from "./cursor";

/**
 * 59th playtest, point 4: the mouse-over texts in the game's own look. Every `title` of the interface (items of the smithy, portraits, buttons) used to show as the browser's grey box in the system font.
 * One listener on the page takes the `title` of the element under the pointer, keeps it as `data-tip` (so that the browser does not show its own box) and shows it in a box of the style of the spell tips
 * (`.hover-tip`): the head font for the first line when there are several, beside the game's pointer like the other tooltips (`tooltipBesidePointer`). A `title` that code sets again later is taken again.
 */
let tip: HTMLDivElement | null = null;
let current: HTMLElement | null = null;
let lastX = 0;
let lastY = 0;

/** The text of an element's mouse-over: its own `title` (taken over at once) or what an earlier hover took. */
function tipOf(el: HTMLElement): string {
  const own = el.getAttribute("title");
  if (own !== null) {
    el.removeAttribute("title");
    if (own.trim() === "") el.removeAttribute("data-tip");
    else el.setAttribute("data-tip", own);
  }
  return el.getAttribute("data-tip") ?? "";
}

function hide(): void {
  current = null;
  tip?.remove();
}

function place(): void {
  if (!tip || !tip.isConnected) return;
  const beside = tooltipBesidePointer();
  const margin = 6;
  const wide = tip.offsetWidth;
  const high = tip.offsetHeight;
  let x = lastX + beside.dx;
  let y = lastY + beside.dy;
  // beside the pointer where it fits, else on the other side of it, and always inside the window
  if (x + wide > window.innerWidth - margin) x = Math.max(margin, lastX - beside.dx - wide);
  if (y + high > window.innerHeight - margin) y = Math.max(margin, window.innerHeight - margin - high);
  tip.style.left = `${x}px`;
  tip.style.top = `${y}px`;
}

function show(el: HTMLElement, text: string): void {
  tip ??= Object.assign(document.createElement("div"), { className: "hover-tip" });
  tip.replaceChildren();
  // several lines: the first is the name (an item's, a hero's), the others are what it says
  const lines = text.split("\n");
  if (lines.length > 1) {
    const head = document.createElement("div");
    head.className = "hover-tip-name";
    head.textContent = lines[0]!;
    const rest = document.createElement("div");
    rest.className = "hover-tip-text";
    rest.textContent = lines.slice(1).join("\n");
    tip.append(head, rest);
  } else tip.textContent = text;
  tip.style.visibility = "hidden";
  document.body.append(tip);
  current = el;
  place();
  tip.style.visibility = "visible";
}

/** Installs the listeners (once, at start-up). */
export function installHoverTips(): void {
  if (tip) return;
  tip = Object.assign(document.createElement("div"), { className: "hover-tip" });
  document.addEventListener("mouseover", (e) => {
    lastX = e.clientX;
    lastY = e.clientY;
    const target = e.target instanceof Element ? e.target.closest<HTMLElement>("[title], [data-tip]") : null;
    if (!target) return hide();
    const text = tipOf(target);
    if (text === "") return hide();
    if (target !== current) show(target, text);
  });
  document.addEventListener("mousemove", (e) => {
    lastX = e.clientX;
    lastY = e.clientY;
    if (current) {
      // (the element may have been replaced by a redraw of the window: then the text is gone with it)
      if (!current.isConnected) return hide();
      place();
    }
  });
  document.addEventListener("mouseout", (e) => {
    if (current && !(e.relatedTarget instanceof Node && current.contains(e.relatedTarget))) hide();
  });
  for (const type of ["mousedown", "wheel", "keydown", "blur"] as const) window.addEventListener(type, hide, true);
}
