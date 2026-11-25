import { existsSync, mkdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const OLD = join(ROOT, "..", "old_code", "resources");
export const FORCE = process.argv.includes("--force");

/**
 * `--pack=<id>` (or `--pack <id>`) builds for a version of the game that is a pack (`docs/PLAN_FANTASTIC_ISLANDS.md`): the stages that know the switch (`build-models`) write into the
 * pack's own sources, `tools/assets/sources-packs/<id>/assets` (`npm run assets:pack` copies them on to `public/assets-packs/<id>`), and read the models of the user from
 * `tools/assets/sources-packs/<id>/models`. Without it everything is as it was: `public/assets` for Classic.
 */
export const PACK: string | null = (() => {
  const eq = process.argv.find((a) => a.startsWith("--pack="));
  if (eq) return eq.slice("--pack=".length);
  const at = process.argv.indexOf("--pack");
  return at >= 0 ? (process.argv[at + 1] ?? null) : null;
})();
export const PACK_SOURCES: string | null = PACK ? join(ROOT, "tools", "assets", "sources-packs", PACK) : null;
export const OUT = PACK_SOURCES ? join(PACK_SOURCES, "assets") : join(ROOT, "public", "assets");

export function ensureDir(file: string): void {
  mkdirSync(dirname(file), { recursive: true });
}

/** True when the output exists and is newer than every source (so the step can be skipped). */
export function upToDate(out: string, ...sources: string[]): boolean {
  if (FORCE || !existsSync(out)) return false;
  const t = statSync(out).mtimeMs;
  return sources.every((s) => !existsSync(s) || statSync(s).mtimeMs <= t);
}

/** Runs async jobs with a fixed concurrency. */
export async function pool<T>(items: T[], concurrency: number, fn: (item: T, index: number) => Promise<void>): Promise<void> {
  let next = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      await fn(items[i]!, i);
    }
  });
  await Promise.all(workers);
}

export const mb = (bytes: number) => Math.round((bytes / 1048576) * 100) / 100;
