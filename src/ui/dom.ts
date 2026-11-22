type Child = Node | string | number | null | undefined | false;

export interface Props {
  class?: string;
  text?: string;
  html?: string;
  title?: string;
  src?: string;
  alt?: string;
  /** Images: `sync` decodes the picture with the frame that shows it, so it never appears a frame or more after its box. */
  decoding?: "sync" | "async" | "auto";
  /** Images: `lazy` loads a picture when it nears the screen (the long list of achievements). */
  loading?: "lazy" | "eager";
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

/**
 * Puts a text on the clipboard; false when nothing worked. The asynchronous API first, and where it is refused (the installed game's window asks Electron for the permission, a page without
 * a secure context has no `navigator.clipboard`) a hidden text field and the old `copy` command.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const box = Object.assign(document.createElement("textarea"), { value: text });
    box.setAttribute("readonly", "");
    box.style.cssText = "position:fixed;left:-1000px;top:0;opacity:0";
    document.body.append(box);
    box.select();
    try {
      return document.execCommand("copy");
    } catch {
      return false;
    } finally {
      box.remove();
    }
  }
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

