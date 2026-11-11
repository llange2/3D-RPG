import { thousands } from "../core/format";
import { QUARTERMASTER_TEXTS, STORAGE_FEE } from "../data/town-people";
import { packEntries, retrieveItem, storedItems, storeItem } from "../sim/quartermaster";
import { bonusDescription } from "../sim/items";
import type { Item, Party } from "../sim/types";
import { clear, h } from "./dom";
import { itemIcon } from "./itemIcons";
import type { UI } from "./ui";

export interface QuartermasterContext {
  party: Party;
  /** The place where the party stands, for the title. */
  place: string;
  changed(): void;
  log(text: string, kind?: "info" | "good" | "bad" | "loot"): void;
  sound?: (id: number) => void;
}

/** One item with its picture, name and values on a line (the mouse-over lists all of them). */
function itemLine(item: Item): HTMLElement {
  const stats = bonusDescription(item);
  const name = item.name.trim();
  return h(
    "span",
    { title: stats ? `${name}\n${stats}` : name, style: "display:flex;gap:10px;align-items:center;min-width:0" },
    itemIcon(item, 40),
    h("span", { style: "min-width:0" }, h("div", { text: name }), stats ? h("div", { class: "small", style: "opacity:0.75;white-space:nowrap;overflow:hidden;text-overflow:ellipsis", text: stats.replace(/\n/g, ", ") }) : null),
  );
}

/**
 * The window of the quartermaster (55th playtest, point 14): on the left everything in the backpacks with a button to leave it in his store (`STORAGE_FEE` gold each), on the right what he
 * keeps, which comes back for nothing. Resolves when the party leaves.
 */
export function openQuartermaster(ui: UI, ctx: QuartermasterContext): Promise<void> {
  return ui.panel((close, panel) => {
    const party = ctx.party;
    const gold = h("div", { class: "svc-gold" });
    const left = h("div", { class: "qm-col" });
    const right = h("div", { class: "qm-col" });
    panel.classList.add("service");
    panel.append(
      h("div", { class: "svc-head" }, h("h2", { text: `The Quartermaster of ${ctx.place}` }), h("button", { class: "btn", text: "Leave (Esc)", onclick: close })),
      h("p", { text: QUARTERMASTER_TEXTS.greeting }),
      gold,
      h("div", { class: "qm-cols", style: "display:grid;grid-template-columns:1fr 1fr;gap:16px;align-items:start" }, left, right),
    );
    const row = (content: Node, button: HTMLElement) =>
      h("div", { style: "color:var(--text);background:#00000033;border:1px solid var(--gold-dim);padding:5px 10px;border-radius:5px;margin-top:4px;display:flex;justify-content:space-between;gap:12px;align-items:center" }, content, button);
    const render = (): void => {
      clear(left);
      clear(right);
      gold.innerHTML = `Your gold: <b style="color:var(--gold)">${thousands(party.gold)}</b>`;
      const packed = packEntries(party);
      left.append(h("h3", { text: `In your backpacks (${packed.length})` }));
      if (packed.length === 0) left.append(h("div", { class: "small", text: "Nothing to leave here." }));
      for (const entry of packed) {
        left.append(
          row(
            h("span", { style: "min-width:0" }, itemLine(entry.item), h("div", { class: "small", style: "opacity:0.6", text: entry.owner })),
            h("button", {
              class: "btn",
              text: `Store (${thousands(STORAGE_FEE)})`,
              disabled: party.gold < STORAGE_FEE,
              style: "flex:none",
              onclick: () => {
                const result = storeItem(party, entry.bag, entry.slot);
                if (!result.ok) {
                  ctx.sound?.(9014);
                  ctx.log(QUARTERMASTER_TEXTS.noGold, "bad");
                  return;
                }
                ctx.sound?.(9000);
                ctx.log(QUARTERMASTER_TEXTS.stored(result.item.name.trim(), result.fee), "info");
                ctx.changed();
                render();
              },
            }),
          ),
        );
      }
      const stored = storedItems(party);
      right.append(h("h3", { text: `In the store (${stored.length})` }));
      if (stored.length === 0) right.append(h("div", { class: "small", text: "The shelves are empty." }));
      stored.forEach((item, index) => {
        right.append(
          row(
            itemLine(item),
            h("button", {
              class: "btn primary",
              text: "Take back",
              style: "flex:none",
              onclick: () => {
                const result = retrieveItem(party, index);
                if (!result.ok) {
                  ctx.sound?.(9014);
                  ctx.log(QUARTERMASTER_TEXTS.noRoom, "bad");
                  return;
                }
                ctx.sound?.(9000);
                ctx.log(QUARTERMASTER_TEXTS.returned(result.item.name.trim()), "info");
                ctx.changed();
                render();
              },
            }),
          ),
        );
      });
    };
    render();
  });
}
