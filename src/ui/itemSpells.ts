import { BAG_SLOTS, type Character } from "../sim/types";
import { clear, h } from "./dom";
import { itemIcon } from "./panels";
import type { UI } from "./ui";

export interface BackpackChoice {
  title: string;
  /** One line under the title: what to pick. */
  text: string;
  /** The slots whose items may be picked; the others are shown dimmed. */
  allowed: readonly string[];
  /** How many items to pick. */
  count: number;
  /** Whether this pick can be carried out (Combine: three alike). The button is only active then. */
  valid: (slots: string[]) => boolean;
  /** The label of the button that carries it out ("Combine", "Duplicate", "Transform"). */
  verb: string;
}

/**
 * The window of Combine, Duplication and Transform Ring: the hero's backpack, a click picks or lays back an item (up to `count`),
 * the verb button is only active when the pick is valid, "Abort" gives up (the spell points are gone, as the spell sheet says).
 * Resolves with the picked slots, or null.
 */
export async function pickFromBackpack(ui: UI, hero: Character, choice: BackpackChoice): Promise<string[] | null> {
  let result: string[] | null = null;
  await ui.panel((close, root) => {
    const picked: string[] = [];
    const grid = h("div", { class: "slots", style: "justify-content:center;margin:10px 0" });
    const action = h("button", { class: "btn primary", text: choice.verb, disabled: true });
    const hint = h("div", { class: "small", style: "text-align:center;min-height:1.4em" });
    const draw = () => {
      clear(grid);
      for (const slot of BAG_SLOTS) {
        const item = hero.inventory[slot] ?? null;
        const allowed = !!item && choice.allowed.includes(slot);
        const el = h(
          "div",
          {
            class: `slot${picked.includes(slot) ? " sel" : ""}${item && !allowed ? " off" : ""}`,
            title: item ? item.name.trim() : "",
            onclick: () => {
              if (!allowed) return;
              const at = picked.indexOf(slot);
              if (at >= 0) picked.splice(at, 1);
              else if (picked.length < choice.count) picked.push(slot);
              else return;
              draw();
            },
          },
          item ? h("img", { src: itemIcon(item), alt: item.name }) : null,
        );
        grid.append(el);
      }
      const ok = picked.length === choice.count && choice.valid(picked);
      action.disabled = !ok;
      hint.textContent = picked.length === 0 ? `Pick ${choice.count === 1 ? "an item" : `${choice.count} items`}.` : picked.length < choice.count ? `${picked.length} of ${choice.count} picked.` : ok ? "Ready." : "These do not belong together.";
    };
    action.onclick = () => {
      result = [...picked];
      close();
    };
    draw();
    root.append(
      h("h2", { text: choice.title, style: "text-align:center" }),
      h("div", { class: "small", style: "text-align:center", text: `${hero.name}: ${choice.text}` }),
      grid,
      hint,
      h("div", { class: "row-btns", style: "justify-content:center" }, action, h("button", { class: "btn", text: "Abort", onclick: () => close() })),
    );
    root.style.width = "min(420px, 96vw)";
  });
  return result;
}
