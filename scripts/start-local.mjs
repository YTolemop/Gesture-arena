import { spawn, spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { delimiter, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "node:net";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(root);
const runtimeDir = dirname(process.execPath);
process.env.PATH = runtimeDir + delimiter + (process.env.PATH ?? "");
const npm = join(runtimeDir, "node_modules/npm/bin/npm-cli.js");
mkdirSync(join(root, "logs"), { recursive: true });

function npmRun(args, quiet = false) {
  const result = spawnSync(process.execPath, [npm, ...args], {
    cwd: root,
    env: process.env,
    stdio: quiet ? "pipe" : "inherit",
    encoding: "utf8",
    windowsHide: true,
  });
  if (quiet) writeFileSync(join(root, "logs/start-check.log"), (result.stdout ?? "") + (result.stderr ?? ""));
  return result.status === 0 && !result.error;
}

async function freePort(port, host) {
  await new Promise((resolvePort, reject) => {
    const probe = createServer();
    probe.once("error", error => reject(new Error(error.code === "EADDRINUSE"
      ? `連接埠 ${port} 已被使用。請先關閉原本的競技場視窗，再點兩下 start_local.bat。`
      : `無法使用 ${host}:${port}：${error.message}`)));
    probe.listen(port, host, () => probe.close(resolvePort));
  });
}

async function main() {
  const [major, minor] = process.versions.node.split(".").map(Number);
  if (major !== 22 || minor < 19) throw new Error("請使用專案附帶的 Node.js 22.19.0，或安裝 Node.js 22.19 以上的 22.x 版本。");
  if (!existsSync(npm)) throw new Error("找不到 npm，請使用完整的 Node.js 22 安裝版本。");

  console.log("[1/3] 檢查執行環境與套件…");
  if (!npmRun(["ls", "--depth=0"], true)) {
    console.log("套件尚未齊全，正在自動安裝（首次執行需要網路）…");
    if (!npmRun(["ci", "--include=dev", "--no-audit", "--no-fund"])) throw new Error("套件安裝失敗，請確認網路後重新執行。");
  }
  if (!existsSync(join(root, ".env"))) copyFileSync(join(root, ".env.example"), join(root, ".env"));
  const { config } = await import("dotenv");
  config({ path: join(root, ".env") });
  // Preserve leaderboards created by the previous local launcher.
  if (!process.env.ARENA_DATA_DIR && existsSync(join(root, ".local-data", "leaderboard.sqlite"))) {
    process.env.ARENA_DATA_DIR = join(root, ".local-data");
    console.log("沿用既有 .local-data 排行榜；手動啟動／維護時請在 .env 設定相同 ARENA_DATA_DIR。");
  }
  const port = Number(process.env.PORT ?? 3000);
  const host = process.env.HOST ?? "0.0.0.0";
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("PORT 必須是 1–65535 的整數。");
  await freePort(port, host);

  console.log("[2/3] 依目前原始碼建置最新競技場…");
  if (!npmRun(["run", "build"])) throw new Error("建置失敗，伺服器尚未啟動。請保留上方錯誤訊息。");

  console.log("[3/3] 啟動本機競技場…");
  const server = spawn(process.execPath, ["--import", "tsx", "apps/server/index.ts"], {
    cwd: root, env: process.env, stdio: "inherit", windowsHide: true,
  });
  let exited = false;
  const finished = new Promise((resolveExit, reject) => {
    server.once("error", error => { exited = true; reject(error); });
    server.once("exit", code => {
      exited = true;
      if (code === 0 || code === null) resolveExit();
      else reject(new Error(`競技場已停止（代碼 ${code}）。`));
    });
  });
  // Install a rejection handler while waiting for the health endpoint.
  finished.catch(() => {});
  const localHost = ["0.0.0.0", "::"].includes(host) ? "127.0.0.1" : host;
  const address = localHost.includes(":") ? `[${localHost}]` : localHost;
  const url = `http://${address}:${port}`;
  let ready = false;
  for (let attempt = 0; attempt < 40 && !exited; attempt++) {
    try {
      const response = await fetch(`${url}/health`, { signal: AbortSignal.timeout(500) });
      if (response.ok && (await response.json()).ok) { ready = true; break; }
    } catch {}
    await new Promise(resolveWait => setTimeout(resolveWait, 250));
  }
  if (!ready && !exited) {
    server.kill();
    throw new Error("伺服器未能完成啟動，請查看上方錯誤訊息。");
  }
  if (ready) {
    console.log(`\n競技場已就緒：${url}\n請保持這個視窗開啟；結束時按 Ctrl+C。\n`);
    if (process.env.ARENA_OPEN_BROWSER !== "0" && process.platform === "win32") {
      // The port is validated above; URL goes through an environment variable
      // to avoid treating a configured hostname as shell command text.
      const browser = spawn(process.env.ComSpec ?? "cmd.exe", ["/d", "/c", 'start "" "%ARENA_BROWSER_URL%"'], {
        env: { ...process.env, ARENA_BROWSER_URL: url }, stdio: "ignore", windowsHide: true,
      });
      browser.on("error", () => console.log(`請自行開啟：${url}`));
      browser.unref();
    }
  }
  await finished;
}

main().catch(error => { console.error(`\n啟動失敗：${error.message}`); process.exitCode = 1; });
