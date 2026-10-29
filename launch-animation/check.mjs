// 体检清单：启动动画。只读。
// 可选：若环境提供外部体检套件，可把 DSH_CHECK_KIT 指到 check-kit.mjs；否则只跑内置补充项。
import { pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
import fs from "node:fs";

const pluginDir = dirname(fileURLToPath(import.meta.url));
const dshHome = process.env.DSH_HOME || join(homedir(), ".dsh");

const spec = {
  label: "启动动画",
  packageName: "dsh-launch-animation",
  pluginDir,
  // 挂载行在本包自己的 cordis.patch.yml（package.json 的 dsh.bundle.patch 指向它），
  // 不在 profile 的 cordis.patch.yml 里，所以这里不用 patchIds，改在 extra() 里查包内文件。
  patchIds: [],
  paths: [
    { path: join(dshHome, "launch-animation"), kind: "dir", note: "启动动画数据（$DSH_HOME/launch-animation）" },
  ],
  artifacts: [
    { path: join(pluginDir, "lib", "payload.json"), note: "payload.json（生成物）" },
    { path: join(pluginDir, "lib", "client.js"), note: "client.js" },
  ],
  regenerators: [],
};

async function extra() {
  const bundlePatch = join(pluginDir, "cordis.patch.yml");
  let mounted = false;
  try {
    mounted = /^\s*(?:-\s*)?id:\s*['"]?dsh-launch-animation['"]?\s*$/mu.test(fs.readFileSync(bundlePatch, "utf8"));
  } catch { /* 读不到按缺失处理 */ }
  return [{
    id: "patch:dsh-launch-animation",
    status: mounted ? "pass" : "fail",
    detail: mounted ? "包内 cordis.patch.yml 含挂载行（bundle 补丁）" : `包内 cordis.patch.yml 缺挂载行：${bundlePatch}`,
  }, {
    id: "note",
    status: "pass",
    detail: "payload 由开发侧构建生成；运行时只依赖本包 lib/ 与 assets/。",
  }];
}

async function loadKit() {
  const candidates = [
    process.env.DSH_CHECK_KIT,
    join(pluginDir, "..", "..", "开发", "DSH更新自检", "插件体检", "check-kit.mjs"),
  ].filter(Boolean);
  for (const candidate of candidates) {
    try {
      const mod = await import(pathToFileURL(candidate).href);
      if (typeof mod.runCheck === "function") return mod.runCheck;
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
