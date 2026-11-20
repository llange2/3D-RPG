// Builds the Windows release: the game (`vite build`) plus the Electron shell, packed into an NSIS installer.
//
//   npm run build        in installer/   -> <release>/dist/MM3-Seed-RPG-Setup-<version>.exe
//   npm run build:dir    in installer/   -> <release>/dist/win-unpacked/ only (no installer, quick to test)
//
// <release> is RELEASE_DIR or the folder `release` next to the project folder. It must lie outside the project (the `game/dist` rule of CLAUDE.md).
// `--skip-checks` leaves out the type check.
import { build as viteBuild } from "vite";
import { Arch, build as packBuild, Platform } from "electron-builder";
import sharp from "sharp";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const gameRoot = path.resolve(here, "..");
const releaseDir = path.resolve(process.env.RELEASE_DIR ?? path.join(gameRoot, "..", "release"));
const args = new Set(process.argv.slice(2));
const dirOnly = args.has("--dir");

if (path.relative(gameRoot, releaseDir) === "" || !path.relative(gameRoot, releaseDir).startsWith("..")) {
  throw new Error(`The release folder ${releaseDir} lies inside the project; set RELEASE_DIR to a folder outside of it.`);
}

const webDir = path.join(releaseDir, "web");
const buildDir = path.join(releaseDir, "build");
const outDir = path.join(releaseDir, "dist");

/** Parts of public/assets the game does not load, left out of the installer (checked by `tests/unit/assets.test.ts` and the missing-file log of main.mjs). */
const NOT_SHIPPED = [
  "manifest.json",
  "textures.stats.json",
];

function step(text) {
  console.log(`\n== ${text}`);
}

if (!args.has("--skip-checks")) {
  step("Type check");
  const tsc = spawnSync(process.execPath, [path.join(gameRoot, "node_modules", "typescript", "bin", "tsc"), "--noEmit"], { cwd: gameRoot, stdio: "inherit" });
  if (tsc.status !== 0) throw new Error("The type check failed.");
}

step(`Game -> ${webDir}`);
fs.rmSync(webDir, { recursive: true, force: true });
// the assets (600 MB) are not copied here: electron-builder takes them from public/assets below
await viteBuild({ root: gameRoot, build: { outDir: webDir, emptyOutDir: true, copyPublicDir: false } });

step("Icon");
fs.mkdirSync(buildDir, { recursive: true });
// v1.1: the party on its rock (icon.png, wider than tall): scaled into a transparent square, the Windows icon needs one
await sharp(path.join(here, "icon.png")).resize(512, 512, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toFile(path.join(buildDir, "icon.png"));

const pkg = JSON.parse(fs.readFileSync(path.join(here, "package.json"), "utf8"));

step(dirOnly ? "Electron shell (unpacked)" : "Installer");
const result = await packBuild({
  projectDir: here,
  targets: Platform.WINDOWS.createTarget(dirOnly ? "dir" : "nsis", Arch.x64),
  publish: "never",
  config: {
    appId: "com.mm3seedrpg.game",
    productName: pkg.productName,
    copyright: "MM3 Seed RPG",
    electronVersion: pkg.devDependencies.electron,
    directories: { output: outDir },
    files: ["main.mjs", "package.json"],
    // the built game and its assets sit next to the program, outside the archive: media and models are read straight from disk
    extraResources: [
      { from: webDir, to: "web", filter: ["**/*"] },
      { from: path.join(gameRoot, "public", "assets"), to: "web/assets", filter: ["**/*", ...NOT_SHIPPED.map((p) => `!${p}`)] },
    ],
    asar: true,
    // 600 MB of assets that are compressed already: the default level costs minutes for little
    compression: "normal",
    win: {
      target: [{ target: dirOnly ? "dir" : "nsis", arch: ["x64"] }],
      icon: path.join(buildDir, "icon.png"),
    },
    nsis: {
      oneClick: false,
      perMachine: false,
      allowToChangeInstallationDirectory: true,
      // the installer's own page decides (nsis/installer.nsh)
      createStartMenuShortcut: false,
      createDesktopShortcut: false,
      include: path.join(here, "nsis", "installer.nsh"),
      artifactName: "MM3-Seed-RPG-Setup-${version}.${ext}",
      runAfterFinish: true,
      // saves live in the user's data folder; an uninstall keeps them
      deleteAppDataOnUninstall: false,
      differentialPackage: false,
    },
  },
});

step("Done");
for (const file of result ?? []) console.log(file);
