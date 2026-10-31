type Child = Node | string | number | null | undefined | false;

export interface Props {
  class?: string;
  text?: string;
  html?: string;
  title?: string;
  src?: string;
  alt?: string;
  type?: string;
  value?: string;
  placeholder?: string;
  /** Range inputs. */
  min?: string;
  max?: string;
  step?: string;
  disabled?: boolean;
  style?: string;
  onclick?: (e: MouseEvent) => void;
  ondblclick?: (e: MouseEvent) => void;
  oncontextmenu?: (e: MouseEvent) => void;
  oninput?: (e: Event) => void;
  onkeydown?: (e: KeyboardEvent) => void;
  data?: Record<string, string>;
}

/** Minimal element builder: h("div", {class: "x"}, child, "text"). */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, props: Props = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  const { class: cls, text, html, data, onclick, ondblclick, oncontextmenu, oninput, onkeydown, disabled, ...rest } = props;
  if (cls) el.className = cls;
  if (text !== undefined) el.textContent = text;
  if (html !== undefined) el.innerHTML = html;
  if (disabled) (el as unknown as HTMLButtonElement).disabled = true;
  for (const [k, v] of Object.entries(rest)) if (v !== undefined) el.setAttribute(k, String(v));
  if (data) for (const [k, v] of Object.entries(data)) el.dataset[k] = v;
  if (onclick) el.addEventListener("click", onclick as EventListener);
  if (ondblclick) el.addEventListener("dblclick", ondblclick as EventListener);
  if (oncontextmenu) el.addEventListener("contextmenu", oncontextmenu as EventListener);
  if (oninput) el.addEventListener("input", oninput);
  if (onkeydown) el.addEventListener("keydown", onkeydown as EventListener);
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    el.append(typeof c === "string" || typeof c === "number" ? document.createTextNode(String(c)) : c);
  }
  return el;
}

export function clear(el: Element): void {
  while (el.firstChild) el.removeChild(el.firstChild);
}

export const assetPath = (p: string): string => `${import.meta.env.BASE_URL}assets/${p}`;
/** Pictures that only a CSS rule asks for (the scroll behind every message): the browser fetches those at the first use, and the first box showed without its scroll. */
const kept: HTMLImageElement[] = [];
export function preloadImages(paths: string[]): void {
  for (const p of paths) {
    const img = new Image();
    img.src = assetPath(p);
    kept.push(img); // the reference keeps the decoded picture in the cache
    void img.decode().catch(() => undefined);
  }
}

