// src/host/index.ts
import fs2 from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

// src/shared/wallpaper.ts
var MEDIA_BY_EXT = {
  png: "image",
  jpg: "image",
  jpeg: "image",
  webp: "image",
  gif: "image",
  bmp: "image",
  avif: "image",
  mp4: "video",
  m4v: "video",
  webm: "video",
  mov: "video"
};
var MIME_BY_EXT = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  bmp: "image/bmp",
  avif: "image/avif",
  mp4: "video/mp4",
  m4v: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime"
};
function extensionOf(name2) {
  const dot = name2.lastIndexOf(".");
  return dot < 0 ? "" : name2.slice(dot + 1).toLowerCase();
}
function mediaFromName(name2) {
  return MEDIA_BY_EXT[extensionOf(name2)] ?? null;
}
function isSafeFileName(name2) {
  if (name2.length === 0 || name2.length > 120) return false;
  if (name2 === "." || name2 === "..") return false;
  return /^[A-Za-z0-9\u4e00-\u9fa5._-]+$/.test(name2) && !name2.includes("/") && !name2.includes("\\") && !name2.includes(":");
}
function buildWallpaperName(ext, now) {
  const pad = (value, width = 2) => String(value).padStart(width, "0");
  const stamp = `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}-${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}-${pad(now.getUTCMilliseconds(), 3)}`;
  return `wallpaper-${stamp}${ext.toLowerCase()}`;
}
function detectMediaFromMagic(bytes) {
  const at = (offset, ...expected) => expected.every((value, index) => bytes[offset + index] === value);
  if (at(0, 137, 80, 78, 71)) return "image";
  if (at(0, 255, 216, 255)) return "image";
  if (at(0, 71, 73, 70, 56)) return "image";
  if (at(0, 66, 77)) return "image";
  if (at(0, 82, 73, 70, 70) && at(8, 87, 69, 66, 80)) return "image";
  if (at(0, 26, 69, 223, 163)) return "video";
  if (at(4, 102, 116, 121, 112)) {
    const b0 = bytes[8], b1 = bytes[9], b2 = bytes[10], b3 = bytes[11];
    if (b0 === 97 && b1 === 118 && b2 === 105 && (b3 === 102 || b3 === 115)) return "image";
    return "video";
  }
  return null;
}
function mimeFor(name2) {
  return MIME_BY_EXT[extensionOf(name2)] ?? "application/octet-stream";
}

// src/host/serve-file.ts
import fs from "node:fs";
import { Readable } from "node:stream";
function parseByteRange(header, size) {
  const match = /^bytes=(\d*)-(\d*)$/.exec(header);
  if (match === null) return null;
  if (match[1] === "" && match[2] === "") return null;
  if (match[1] === "") {
    const suffix = Number(match[2]);
    if (!Number.isSafeInteger(suffix) || suffix <= 0 || size === 0) return "unsatisfiable";
    return { start: Math.max(0, size - suffix), end: size - 1 };
  }
  const start = Number(match[1]);
  const end = match[2] === "" ? size - 1 : Math.min(Number(match[2]), size - 1);
  if (Number.isSafeInteger(start) && Number.isSafeInteger(end) && start <= end && start < size) return { start, end };
  return "unsatisfiable";
}
function streamFile(file, type, rangeHeader) {
  const size = fs.statSync(file).size;
  const range = rangeHeader === null ? null : parseByteRange(rangeHeader, size);
  if (range === "unsatisfiable") {
    return new Response("range not satisfiable", {
      status: 416,
      headers: { "content-range": `bytes */${size}` }
    });
  }
  const stream = range === null ? fs.createReadStream(file) : fs.createReadStream(file, { start: range.start, end: range.end });
  stream.on("error", () => {
    if (!stream.destroyed) stream.destroy();
  });
  const headers = {
    "content-type": type,
    "accept-ranges": "bytes",
    "cache-control": "no-store"
  };
  if (range === null) {
    headers["content-length"] = String(size);
  } else {
    headers["content-range"] = `bytes ${range.start}-${range.end}/${size}`;
    headers["content-length"] = String(range.end - range.start + 1);
  }
  return new Response(Readable.toWeb(stream), {
    status: range === null ? 200 : 206,
    headers
  });
}

// src/host/index.ts
var HERE = path.dirname(fileURLToPath(import.meta.url));
var ROOT = path.resolve(HERE, "..");
var WALLPAPER_DIR = path.join(ROOT, "壁纸");
var FONT_DIR = path.join(ROOT, "assets", "fonts");
var STATE_FILE = path.join(WALLPAPER_DIR, "state.json");
var DEFAULT_WALLPAPER = "默认壁纸.jpg";
var ROUTE = "/api/glass-theme";
var MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
var FONT_FILES = ["space-grotesk-1.woff2", "space-grotesk-2.woff2", "space-grotesk-3.woff2"];
var EXTENSIONS = /* @__PURE__ */ new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp", ".avif", ".mp4", ".m4v", ".webm", ".mov"]);
function ensureDir() {
  fs2.mkdirSync(WALLPAPER_DIR, { recursive: true });
}
function readState() {
  try {
    const parsed = JSON.parse(fs2.readFileSync(STATE_FILE, "utf8"));
    if (parsed === null || typeof parsed !== "object") return void 0;
    const file = parsed.file;
    if (file === null) return { file: null };
    if (typeof file === "string" && isSafeFileName(file)) return { file };
    return void 0;
  } catch {
    return void 0;
  }
}
function writeState(state) {
  ensureDir();
  const tmp = `${STATE_FILE}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  try {
    fs2.writeFileSync(tmp, JSON.stringify(state, null, 2) + "\n", "utf8");
    fs2.renameSync(tmp, STATE_FILE);
  } catch (error) {
    try {
      fs2.unlinkSync(tmp);
    } catch {
    }
    throw error;
  }
}
var writeChains = /* @__PURE__ */ new Map();
function queueWrite(task) {
  const key = WALLPAPER_DIR;
  const previous = writeChains.get(key) ?? Promise.resolve();
  const next = previous.then(task, task);
  writeChains.set(key, next.then(() => void 0, () => void 0));
  return next;
}
function fileExists(name2) {
  try {
    return fs2.statSync(path.join(WALLPAPER_DIR, name2)).isFile();
  } catch {
    return false;
  }
}
function currentFile() {
  const state = readState();
  if (state === void 0) {
    return fileExists(DEFAULT_WALLPAPER) ? { name: DEFAULT_WALLPAPER, isDefault: true } : null;
  }
  if (state.file === null) return null;
  return fileExists(state.file) ? { name: state.file, isDefault: state.file === DEFAULT_WALLPAPER } : null;
}
function entryFor(file, isDefault) {
  const stat = fs2.statSync(path.join(WALLPAPER_DIR, file));
  return {
    file,
    media: mediaFromName(file) ?? "image",
    url: `${ROUTE}/file?v=${encodeURIComponent(file)}-${stat.mtimeMs.toFixed(0)}`,
    isDefault,
    updatedAt: stat.mtimeMs
  };
}
function json(status, body) {
  return Response.json(body, { status, headers: { "cache-control": "no-store" } });
}
function removeUserWallpaper(name2, strict = false) {
  if (name2 === null || name2 === DEFAULT_WALLPAPER || !name2.startsWith("wallpaper-")) return;
  try {
    fs2.unlinkSync(path.join(WALLPAPER_DIR, name2));
  } catch (error) {
    if (strict && error?.code !== "ENOENT") throw error;
  }
}
async function handleWallpaper(request) {
  if (request.method === "GET") {
    const current = currentFile();
    return json(200, current === null ? { file: null } : entryFor(current.name, current.isDefault));
  }
  if (request.method === "DELETE") {
    return queueWrite(async () => {
      const previous = readState();
      try {
        removeUserWallpaper(previous?.file ?? null, true);
      } catch (error) {
        return json(500, { error: `删除壁纸失败：${String(error?.message ?? error)}` });
      }
      try {
        writeState({ file: null });
      } catch (error) {
        return json(500, { error: `壁纸文件已处理，但保存状态失败：${String(error?.message ?? error)}` });
      }
      return json(200, { file: null });
    });
  }
  if (request.method !== "POST") return json(405, { error: "只支持 GET / POST / DELETE" });
  const declared = Number(request.headers.get("content-length") ?? "NaN");
  if (Number.isFinite(declared) && declared > MAX_UPLOAD_BYTES) {
    return json(413, { error: `文件太大（上限 ${MAX_UPLOAD_BYTES / 1024 / 1024} MB）` });
  }
  const rawExt = (request.headers.get("x-ext") ?? "").toLowerCase();
  if (!EXTENSIONS.has(rawExt)) return json(400, { error: "不支持的扩展名" });
  return queueWrite(async () => {
    let buffer;
    try {
      const ab = await request.arrayBuffer();
      if (ab.byteLength > MAX_UPLOAD_BYTES) return json(413, { error: "文件太大" });
      buffer = Buffer.from(ab);
    } catch {
      return json(400, { error: "读取上传内容失败" });
    }
    if (buffer.length === 0) return json(400, { error: "文件是空的" });
    const media = detectMediaFromMagic(buffer.subarray(0, 16));
    if (media === null) return json(400, { error: "文件内容不是图片或视频" });
    const expected = mediaFromName(`x${rawExt}`);
    if (expected !== media) return json(400, { error: "扩展名与文件内容不一致" });
    ensureDir();
    const baseName = buildWallpaperName(rawExt, /* @__PURE__ */ new Date());
    const name2 = `${baseName.slice(0, -rawExt.length)}-${randomUUID()}${rawExt}`;
    const dest = path.join(WALLPAPER_DIR, name2);
    try {
      const fd = fs2.openSync(dest, "wx");
      try {
        const chunk = 1024 * 1024;
        for (let offset = 0; offset < buffer.length; offset += chunk) {
          fs2.writeSync(fd, buffer, offset, Math.min(chunk, buffer.length - offset));
        }
      } finally {
        fs2.closeSync(fd);
      }
    } catch (error) {
      try {
        fs2.unlinkSync(dest);
      } catch {
      }
      return json(500, { error: `写文件失败：${String(error?.message ?? error)}` });
    }
    const previous = readState();
    try {
      writeState({ file: name2 });
    } catch (error) {
      try {
        fs2.unlinkSync(dest);
      } catch {
      }
      return json(500, { error: `写状态失败：${String(error?.message ?? error)}` });
    }
    removeUserWallpaper(previous?.file ?? null);
    return json(200, entryFor(name2, false));
  });
}
function handleFile(request) {
  const current = currentFile();
  if (current === null) return new Response("no wallpaper", { status: 404 });
  try {
    const file = path.join(WALLPAPER_DIR, current.name);
    return streamFile(file, mimeFor(current.name), request.headers.get("range"));
  } catch {
    return new Response("unreadable", { status: 500 });
  }
}
function handleFont(request) {
  const index = Number(new URL(request.url).searchParams.get("i") ?? "0");
  const name2 = FONT_FILES[index - 1];
  if (name2 === void 0) return new Response("not found", { status: 404 });
  try {
    const bytes = fs2.readFileSync(path.join(FONT_DIR, name2));
    return new Response(new Uint8Array(bytes), {
      headers: { "content-type": "font/woff2", "cache-control": "public, max-age=31536000, immutable" }
    });
  } catch {
    return new Response("missing font", { status: 404 });
  }
}
function handleReveal() {
  ensureDir();
  if (process.platform === "win32") {
    spawn("explorer.exe", [WALLPAPER_DIR], { detached: true, stdio: "ignore" }).unref();
  }
  return json(200, { ok: true });
}
function apply(ctx) {
  ctx.inject(["connection"], (host) => {
    const disposers = [];
    const cleanup = () => {
      for (const dispose of disposers.splice(0).reverse()) {
        try {
          dispose();
        } catch {
        }
      }
    };
    const register = (endpoint, methods, handler) => {
      const dispose = host.connection.fetch.register({
        path: ROUTE + endpoint,
        methods,
        requestBody: "buffered",
        fetch: handler
      });
      if (typeof dispose === "function") disposers.push(dispose);
    };
    try {
      register("/wallpaper", ["GET", "POST", "DELETE"], handleWallpaper);
      register("/file", ["GET"], handleFile);
      register("/font", ["GET"], handleFont);
      register("/reveal", ["POST"], handleReveal);
      return cleanup;
    } catch (error) {
      cleanup();
      throw error;
    }
  });
}
var name = "glass-theme";
var paths = { ROOT, WALLPAPER_DIR, STATE_FILE, DEFAULT_WALLPAPER };
var __test__ = { queueWrite, writeState, MAX_UPLOAD_BYTES };
export {
  __test__,
  apply,
  name,
  paths
};
