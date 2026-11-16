// Desktop shell of MM3 Seed RPG: one window around the built game (`vite build` output), nothing else.
// The game is served through its own scheme (`app://game/`) instead of `file://`: `fetch` of models and textures, audio and video with
// range requests (seeking) and `localStorage` (saves, settings) behave as they do on a web server.
import { app, BrowserWindow, Menu, protocol, session, shell } from "electron";
import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { fileURLToPath } from "node:url";

const SCHEME = "app";
const HOST = "game";
const here = path.dirname(fileURLToPath(import.meta.url));

// packaged: `resources/web` (electron-builder `extraResources`); GAME_WEB_DIR serves a folder built elsewhere (see docs/RELEASE.md)
const webRoot = process.env.GAME_WEB_DIR ?? (app.isPackaged ? path.join(process.resourcesPath, "web") : path.join(here, "..", "dist-electron", "web"));

// the system's own table maps `.js` to text/plain on some Windows machines, and a module script with that type does not run
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".wasm": "application/wasm",
  ".webp": "image/webp",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".mp3": "audio/mpeg",
  ".ogg": "audio/ogg",
  ".wav": "audio/wav",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".glb": "model/gltf-binary",
  ".gltf": "model/gltf+json",
  ".bin": "application/octet-stream",
};

// `standard` and `secure` give the origin working storage and the APIs that need a secure context; `stream` lets media play from a response body
protocol.registerSchemesAsPrivileged([
  { scheme: SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, codeCache: true } },
]);

// audio starts without a click (the title screen plays music) and the game never needs the browser's reload or developer keys
app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");

const logMissing = process.env.MM3_LOG_MISSING === "1";

/** The file below `webRoot` that a request URL names, or undefined when it leaves the folder. */
function fileOf(url) {
  const parts = new URL(url).pathname.split("/").map((p) => decodeURIComponent(p));
  const file = path.normalize(path.join(webRoot, ...parts));
  const inside = path.relative(webRoot, file);
  if (inside.startsWith("..") || path.isAbsolute(inside)) return undefined;
  return file;
}

async function serve(request) {
  let file = fileOf(request.url);
  if (!file) return new Response("Forbidden", { status: 403 });
  try {
    if (fs.statSync(file).isDirectory()) file = path.join(file, "index.html");
  } catch {
    // reported below as missing
  }
  if (!fs.existsSync(file)) {
    if (logMissing) console.error(`[missing] ${request.url}`);
    return new Response("Not found", { status: 404 });
  }
  // `net.fetch` on a file drops Content-Range and Accept-Ranges, and a video element that cannot tell its length cannot seek: ranges are answered here
  const size = fs.statSync(file).size;
  let start = 0;
  let end = size - 1;
  let status = 200;
  const range = /^bytes=(\d*)-(\d*)$/.exec(request.headers.get("range") ?? "");
  if (range && (range[1] || range[2])) {
    if (range[1] === "") {
      start = Math.max(0, size - Number(range[2])); // the last N bytes
    } else {
      start = Number(range[1]);
      if (range[2]) end = Math.min(end, Number(range[2]));
    }
    if (start > end) return new Response(null, { status: 416, headers: { "content-range": `bytes */${size}` } });
    status = 206;
  }
  const headers = new Headers({
    "content-type": MIME[path.extname(file).toLowerCase()] ?? "application/octet-stream",
    "content-length": String(end - start + 1),
    "accept-ranges": "bytes",
  });
  if (status === 206) headers.set("content-range", `bytes ${start}-${end}/${size}`);
  const body = request.method === "HEAD" || size === 0 ? null : Readable.toWeb(fs.createReadStream(file, { start, end }));
  return new Response(body, { status, headers });
}

let win = null;

function createWindow() {
  win = new BrowserWindow({
    width: 1600,
    height: 900,
    minWidth: 960,
    minHeight: 540,
    show: false,
    // always starts in full screen; F11 and Alt+Enter leave and enter it again
    fullscreen: true,
    backgroundColor: "#0b0b10",
    title: "MM3 Seed RPG",
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      // the game keeps animating and playing sound while the window is covered by another one for a moment
      backgroundThrottling: false,
      devTools: process.env.MM3_DEVTOOLS === "1",
    },
  });
  win.setMenu(null);
  win.once("ready-to-show", () => win.show());
  // the system pointer is hidden while the game loads: the game takes it away itself only once its own pointer's picture has arrived (`html.custom-cursor`,
  // src/ui/cursor.ts), and until then the page showed the arrow. From then on the game's rule holds, and this one no longer matches.
  win.webContents.on("dom-ready", () => {
    void win.webContents.insertCSS("html:not(.custom-cursor), html:not(.custom-cursor) * { cursor: none !important; }");
  });
  win.on("closed", () => {
    win = null;
  });

  // the game uses F5 (quick save) and F9 (quick load): without a menu nothing reloads the page; F11 and Alt+Enter toggle full screen
  win.webContents.on("before-input-event", (event, input) => {
    if (input.type !== "keyDown") return;
    const toggle = input.key === "F11" || (input.alt && input.key === "Enter");
    if (toggle) {
      win.setFullScreen(!win.isFullScreen());
      event.preventDefault();
    }
  });

  // nothing in the game leaves it: links and new windows are refused, web addresses open in the browser
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) void shell.openExternal(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (event, url) => {
    if (new URL(url).protocol !== `${SCHEME}:`) event.preventDefault();
  });

  void win.loadURL(`${SCHEME}://${HOST}/index.html`);
}

if (!app.requestSingleInstanceLock()) {
  // two copies would write the same saves
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.focus();
  });

  app.whenReady().then(() => {
    Menu.setApplicationMenu(null);
    protocol.handle(SCHEME, serve);
    // full screen and the pointer lock are the only things the game asks the system for
    session.defaultSession.setPermissionRequestHandler((_contents, permission, callback) => {
      callback(permission === "fullscreen" || permission === "pointerLock");
    });
    createWindow();
    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on("window-all-closed", () => app.quit());
}
