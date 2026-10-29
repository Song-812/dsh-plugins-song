// 体检清单：代理连接。只读。
// 若有外部体检工具，把 DSH_CHECK_KIT 指到其 check-kit.mjs；否则只跑内置补充项。
import { pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
import fs from "node:fs";

const pluginDir = dirname(fileURLToPath(import.meta.url));

const spec = {
  label: "代理连接",
  packageName: "dsh-proxy-connect",
  pluginDir,
  patchIds: [],
  paths: [
    { path: join(pluginDir, "whitelist.json"), kind: "file", note: "白名单（写在包内；可缺失）" },
    { path: join(pluginDir, "node_modules", "undici"), kind: "dir", note: "随包依赖" },
  ],
  artifacts: [
    { path: join(pluginDir, "lib", "index.js"), note: "lib/index.js" },
  ],
  regenerators: [],
};

async function extra() {
  const notes = [];
  const patchCandidates = [
    process.env.DSH_CORDIS_PATCH,
    join(process.env.DSH_HOME || join(homedir(), ".dsh"), "profiles", "desktop", "cordis.patch.yml"),
  ].filter(Boolean);
  let found = false;
  for (const p of patchCandidates) {
    try {
      const text = fs.readFileSync(p, "utf8");
      found = text.includes("fetchProvider");
      notes.push({
        id: "patch:fetchProvider",
        status: found ? "pass" : "fail",
        detail: found ? `cordis.patch.yml 含 fetchProvider（${p}）` : `未在 ${p} 找到 fetchProvider`,
      });
      break;
    } catch {
      /* try next */
    }
  }
  if (!notes.some((n) => n.id === "patch:fetchProvider")) {
    notes.push({
      id: "patch:fetchProvider",
      status: "fail",
      detail: "未找到 cordis.patch.yml（可设 DSH_HOME 或 DSH_CORDIS_PATCH）",
    });
  }
  return notes;
}

async function loadKit() {
  const candidates = [
    process.env.DSH_CHECK_KIT,
  ].filter(Boolean);
  for (const candidate of candidates) {
    try {
      const mod = await import(pathToFileURL(candidate).href);
      if (typeof mod.runCheck === "function") return mod.runCheck;
      if (typeof mod.textContains === "function" && typeof mod.runCheck === "function") return mod.runCheck;
    } catch { /* next */ }
  }
  return null;
}

export async function run() {
  const custom = await extra();
  const runCheck = await loadKit();
  if (!runCheck) {
    return { label: spec.label, packageName: spec.packageName, pluginDir, custom, skippedKit: true };
  }
  return runCheck({ ...spec, custom });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  process.stdout.write(`${JSON.stringify(await run(), null, 2)}\n`);
}
