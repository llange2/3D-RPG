import { CampaignMapModel, type CellOverrides } from "./model";
import { mapSlugOf, type CampaignIndexEntry, type CampaignMapData } from "./types";

/** Reads a JSON file below the asset root. The browser uses fetch; tests read the files from disk. */
export type CampaignFetcher = (path: string) => Promise<unknown>;

let fetcher: CampaignFetcher = async (path) => {
  const res = await fetch(`${import.meta.env.BASE_URL}assets/${path}`);
  if (!res.ok) throw new Error(`could not load ${path}: ${res.status}`);
  return res.json();
};

export function setCampaignFetcher(f: CampaignFetcher): void {
  fetcher = f;
  dataCache.clear();
  indexCache = null;
}

const dataCache = new Map<string, Promise<CampaignMapData>>();
let indexCache: Promise<CampaignIndexEntry[]> | null = null;

export function loadCampaignIndex(): Promise<CampaignIndexEntry[]> {
  indexCache ??= fetcher("campaign/index.json").then((d) => (d as { maps: CampaignIndexEntry[] }).maps);
  return indexCache;
}

/** The raw data of a map; one fetch per map and session. */
export function loadCampaignData(slug: string): Promise<CampaignMapData> {
  let p = dataCache.get(slug);
  if (!p) {
    p = fetcher(`campaign/${slug}.json`).then((d) => d as CampaignMapData);
    dataCache.set(slug, p);
  }
  return p;
}

/** A map with the changes the party made to it. */
export async function loadCampaignMap(slug: string, overrides: CellOverrides = {}): Promise<CampaignMapModel> {
  return new CampaignMapModel(await loadCampaignData(slug), overrides);
}

/** Where the party appears after a transfer: the cell the action names, or a repair for the editor's broken coordinates. */
export function arrival(dest: CampaignMapModel, x: number, y: number, rotation: number, fromSlug: string): { x: number; y: number; rotation: number } {
  if (Number.isFinite(x) && Number.isFinite(y)) {
    // the party may stand in front of a brittle wall's wall piece, so a save made there loads there
    if (dest.isEnterable(x, y)) return { x, y, rotation };
    // a portal's own cell holds the portal: appear next to it, facing away
    if (dest.isWalkable(x, y)) {
      const free = dest.nearestFree(x, y, 3);
      if (free) {
        const dx = free.x - x;
        const dy = free.y - y;
        return { ...free, rotation: dy > 0 ? 0 : dx > 0 ? 90 : dy < 0 ? 180 : dx < 0 ? 270 : rotation };
      }
    }
  }
  // the destination has a way back to where we come from: appear in front of it, facing away
  for (const [ex, ey, c] of dest.entries()) {
    if (c.a !== 11) continue;
    if (mapSlugOf(String((c.ax as Record<string, unknown> | undefined)?.map_to_load ?? "")) !== fromSlug) continue;
    const free = dest.nearestFree(ex, ey, 4);
    if (!free) continue;
    const dx = free.x - ex;
    const dy = free.y - ey;
    const deg = dy > 0 ? 0 : dx > 0 ? 90 : dy < 0 ? 180 : dx < 0 ? 270 : 0;
    return { ...free, rotation: deg };
  }
  const safe = dest.safeStart();
  return { x: safe.x, y: safe.y, rotation: { N: 0, E: 90, S: 180, W: 270 }[safe.facing] };
}
