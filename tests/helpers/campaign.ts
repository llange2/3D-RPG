import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Rng, seedFromString } from "../../src/core/rng";
import { LegacyEngine, newProgress, type CampaignHost, type CampaignPort, type CampaignUi, type CampaignProgress } from "../../src/campaign/engine";
import { setCampaignFetcher, loadCampaignMap } from "../../src/campaign/loader";
import type { CampaignMapModel } from "../../src/campaign/model";
import type { ServiceKind } from "../../src/actions/registry";
import { createDefaultParty } from "../../src/sim/party";
import type { Party } from "../../src/sim/types";

const ASSETS = join(import.meta.dirname, "..", "..", "public", "assets");

export function useDiskCampaign(): void {
  setCampaignFetcher(async (path) => JSON.parse(readFileSync(join(ASSETS, path), "utf-8")) as unknown);
}

/** Scripted answers for the prompts of a test. */
export interface Script {
  confirm: boolean[];
  character: (number | null)[];
  text: (string | null)[];
  portal: (string | null)[];
}

export interface Recording {
  messages: string[];
  questions: string[];
  sounds: number[];
  logs: string[];
  services: { service: ServiceKind; tier: number }[];
  teleports: { x: number; y: number; rot: number }[];
  transfers: { slug: string; x: number; y: number; rot: number }[];
  monsters: { x: number; y: number; id: number }[];
  changed: number;
  hurt: number[];
  defeat: number;
  traps: { kind: string; x: number; y: number; rot: number }[];
  gates: { item: number; x: number; y: number; rot: number; direction: string }[];
}

export interface TestHost extends CampaignHost {
  engine: LegacyEngine;
  rec: Recording;
  script: Script;
  progress: CampaignProgress;
  party: Party;
  steps: number;
}

export async function testHost(slug: string, seed = "campaign-test", script: Partial<Script> = {}): Promise<TestHost> {
  const map: CampaignMapModel = await loadCampaignMap(slug);
  const rng = new Rng(seedFromString(seed));
  const rec: Recording = { messages: [], questions: [], sounds: [], logs: [], services: [], teleports: [], transfers: [], monsters: [], changed: 0, hurt: [], defeat: 0, traps: [], gates: [] };
  const full: Script = { confirm: [], character: [], text: [], portal: [], ...script };
  const ui: CampaignUi = {
    message: async (t) => void rec.messages.push(t),
    confirm: async (t) => {
      rec.questions.push(t);
      return full.confirm.length > 0 ? full.confirm.shift()! : true;
    },
    pickCharacter: async (q) => {
      rec.questions.push(q);
      return full.character.length > 0 ? full.character.shift()! : 0;
    },
    askText: async (q) => {
      rec.questions.push(q);
      return full.text.length > 0 ? full.text.shift()! : null;
    },
    pickPortal: async () => (full.portal.length > 0 ? full.portal.shift()! : null),
    sound: (id) => void rec.sounds.push(id),
    log: (t) => void rec.logs.push(t),
  };
  const host = { map, rng, ui, party: createDefaultParty(), progress: newProgress(new Rng(seedFromString(seed + "pw"))), rec, script: full, steps: 0 } as unknown as TestHost;
  const port: CampaignPort = {
    teleport: (x, y, rot) => void rec.teleports.push({ x, y, rot }),
    transfer: async (s, x, y, rot) => void rec.transfers.push({ slug: s, x, y, rot }),
    changed: () => void rec.changed++,
    addMonster: (x, y, id) => void rec.monsters.push({ x, y, id }),
    openService: async (service, tier) => void rec.services.push({ service, tier }),
    hurt: (c) => void rec.hurt.push(c),
    checkDefeat: () => void (rec.defeat += host.party.characters.every((c) => c.conditions.includes("Dead") || c.conditions.includes("Unconscious")) ? 1 : 0),
    gate: (item, x, y, rot, direction) => void rec.gates.push({ item, x, y, rot, direction }),
    trap: (kind, x, y, rot) => void rec.traps.push({ kind, x, y, rot }),
    steps: () => host.steps,
    refresh: () => undefined,
  };
  Object.assign(host, { port });
  host.engine = new LegacyEngine(host);
  return host;
}

/** All cells of a map that carry an action id, in editor coordinates. */
export function actionCells(map: CampaignMapModel, id: number): { x: number; y: number }[] {
  return map.entries().filter(([, , c]) => c.a === id).map(([x, y]) => ({ x, y }));
}
