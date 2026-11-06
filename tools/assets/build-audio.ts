/** Audio stage: transcodes the old mp3 files to Opus in WebM (music 64 kbps stereo, effects 40 kbps mono) with the ffmpeg binary from ffmpeg-static. */
import { execFile } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import { promisify } from "node:util";
import ffmpegPath from "ffmpeg-static";
import { OLD, OUT, ROOT, ensureDir, mb, pool, upToDate } from "./lib";

const run = promisify(execFile);

/**
 * Sounds of the user's own folder whose silence at the end is cut off: the game moves things as long as the sound plays (`AudioManager.durationOf`), and the door sound
 * of the spaceship is quiet for its last 0.63 s of 1.54 (the doors seemed to wait after they had moved, 6. 11. 2026). Cut at -45 dB.
 */
const TRIM_TAIL = new Set(["space_ship_door"]);
const TRIM_FILTER = "areverse,silenceremove=start_periods=1:start_threshold=-45dB,areverse";

async function transcode(src: string, out: string, bitrate: string, channels: number, filter?: string): Promise<number> {
  if (upToDate(out, src)) return statSync(out).size;
  ensureDir(out);
  await run(ffmpegPath!, ["-y", "-loglevel", "error", "-i", src, "-vn", ...(filter ? ["-af", filter] : []), "-c:a", "libopus", "-b:a", bitrate, "-ac", String(channels), "-application", "audio", out]);
  return statSync(out).size;
}

export async function buildAudio(): Promise<Record<string, { files: number; bytes: number }>> {
  const stats: Record<string, { files: number; bytes: number }> = {};
  for (const [group, dir, bitrate, channels] of [
    ["music", "music", "64k", 2],
    ["sfx", "sounds", "40k", 1],
  ] as const) {
    const files = readdirSync(join(OLD, dir)).filter((f) => f.endsWith(".mp3"));
    const s = (stats[group] = { files: 0, bytes: 0 });
    await pool(files, 4, async (f) => {
      s.bytes += await transcode(join(OLD, dir, f), join(OUT, "audio", group, `${basename(f, ".mp3")}.webm`), bitrate, channels);
      s.files++;
    });
  }
  // the user's own sounds (`tools/assets/sources/audio`: the spaceship's light and engine hum) join the effects
  const own = join(ROOT, "tools", "assets", "sources", "audio");
  if (existsSync(own)) {
    const s = stats["sfx"]!;
    for (const f of readdirSync(own).filter((n) => n.endsWith(".mp3"))) {
      s.bytes += await transcode(join(own, f), join(OUT, "audio", "sfx", `${basename(f, ".mp3")}.webm`), "40k", 1, TRIM_TAIL.has(basename(f, ".mp3")) ? TRIM_FILTER : undefined);
      s.files++;
    }
  }
  return stats;
}

if (process.argv[1]?.endsWith("build-audio.ts")) {
  const stats = await buildAudio();
  for (const [group, s] of Object.entries(stats)) console.log(`${group.padEnd(8)} ${String(s.files).padStart(3)} files ${String(mb(s.bytes)).padStart(7)} MB`);
}
