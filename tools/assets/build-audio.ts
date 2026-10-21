/** Audio stage: transcodes the old mp3 files to Opus in WebM (music 64 kbps stereo, effects 40 kbps mono) with the ffmpeg binary from ffmpeg-static. */
import { execFile } from "node:child_process";
import { readdirSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import { promisify } from "node:util";
import ffmpegPath from "ffmpeg-static";
import { OLD, OUT, ensureDir, mb, pool, upToDate } from "./lib";

const run = promisify(execFile);

async function transcode(src: string, out: string, bitrate: string, channels: number): Promise<number> {
  if (upToDate(out, src)) return statSync(out).size;
  ensureDir(out);
  await run(ffmpegPath!, ["-y", "-loglevel", "error", "-i", src, "-vn", "-c:a", "libopus", "-b:a", bitrate, "-ac", String(channels), "-application", "audio", out]);
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
  return stats;
}

if (process.argv[1]?.endsWith("build-audio.ts")) {
  const stats = await buildAudio();
  for (const [group, s] of Object.entries(stats)) console.log(`${group.padEnd(8)} ${String(s.files).padStart(3)} files ${String(mb(s.bytes)).padStart(7)} MB`);
}
