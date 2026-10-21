import { existsSync, mkdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const OLD = join(ROOT, "..", "old_code", "resources");
export const OUT = join(ROOT, "public", "assets");
export const FORCE = process.argv.includes("--force");

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
