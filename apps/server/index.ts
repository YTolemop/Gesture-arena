import "dotenv/config";
import express from "express";
import { createServer } from "node:http";
import { networkInterfaces, homedir } from "node:os";
import { resolve, join } from "node:path";
import { existsSync, statSync } from "node:fs";
import { Server } from "socket.io";
import { performance } from "node:perf_hooks";
import { RoomManager } from "./rooms.js";
import { LeaderboardRepository } from "./leaderboard.js";
import {
  SKILLS,
  RULES_VERSION,
  AI_VERSION,
} from "../../packages/game-core/skills.js";
import { createHash } from "node:crypto";
const app = express(),
  http = createServer(app);
const io = new Server(http, { maxHttpBufferSize: 65536, pingInterval: 1000, pingTimeout: 5000 });
const dataDir = process.env.ARENA_DATA_DIR ?? join(homedir(), ".gesture-arena");
const repo = new LeaderboardRepository(join(dataDir, "leaderboard.sqlite"));
const storageLimitBytes = Math.max(1, Number(process.env.DATA_WARNING_MB) || 512) * 1024 * 1024;
function storageStatus() {
  let bytes = 0;
  for (const suffix of ["", "-wal", "-shm"]) {
    const path = join(dataDir, "leaderboard.sqlite" + suffix);
    if (existsSync(path)) bytes += statSync(path).size;
  }
  return { bytes, warningBytes: storageLimitBytes, warning: bytes >= storageLimitBytes };
}
const storageTimer = setInterval(() => {
  const status = storageStatus();
  if (status.warning) console.warn(`排行榜容量告警：${status.bytes} bytes；請備份並由維護者處理，系統不自動刪分。`);
}, 60000);
storageTimer.unref();
const rooms = new RoomManager(
  io,
  repo,
  process.env.ENABLE_INTERNAL_TEST_MODE === "true",
  Number(process.env.MAX_ROOMS ?? 32),
);
io.of("/arena").on("connection", (s) => rooms.attachArena(s));
io.of("/controller").on("connection", (s) => rooms.attachController(s));
const samples: number[] = [];
let behind = 0,
  bytes = 0;
io.engine.on("connection", (s) =>
  s.on("packetCreate", (p: any) => {
    if (p.data) bytes += Buffer.byteLength(String(p.data));
  }),
);
const health = () => ({
  ok: true,
  protocolVersion: 1,
  rulesVersion: RULES_VERSION,
  aiVersion: AI_VERSION,
  arenaName: process.env.ARENA_NAME ?? "手勢競技場",
  internal: rooms.internal,
  rooms: rooms.rooms.size,
  capacity: rooms.maxRooms,
  storage: storageStatus(),
  metrics: {
    p95StepMs:
      [...samples].sort((a, b) => a - b)[Math.floor(samples.length * 0.95)] ??
      0,
    behindSteps: behind,
    rss: process.memoryUsage().rss,
    cpuMicros: process.cpuUsage(),
    totalSteps: rooms.wallTick,
    snapshotBytes: bytes,
    uptime: process.uptime(),
  },
});
app.get("/health", (_, res) => res.json(health()));
app.get("/api/skills", (_, res) =>
  res.json({
    rulesVersion: RULES_VERSION,
    hash: createHash("sha256").update(JSON.stringify(SKILLS)).digest("hex"),
    skills: SKILLS,
  }),
);
app.get("/api/leaderboard", (req, res) =>
  res.json(
    repo.list(
      String(req.query.rulesVersion ?? RULES_VERSION),
      String(req.query.aiVersion ?? AI_VERSION),
      Math.max(0, Number(req.query.offset) || 0),
      Math.min(100, Number(req.query.limit) || 100),
      req.query.eligible !== "false",
    ),
  ),
);
const web = resolve("dist/web");
if (!existsSync(join(web, "index.html")))
  throw new Error("網站尚未建置，請先執行 npm run build");
app.use(express.static(web));
app.get("*", (_, res) => res.sendFile(join(web, "index.html")));
let last = performance.now(),
  acc = 0;
const timer = setInterval(() => {
  const now = performance.now();
  acc += now - last;
  last = now;
  let steps = 0;
  while (acc >= 1000 / 60 && steps < 10) {
    const begin = performance.now();
    rooms.tick();
    samples.push(performance.now() - begin);
    if (samples.length > 10000) samples.shift();
    acc -= 1000 / 60;
    steps++;
  }
  if (acc >= 1000 / 60) {
    behind += Math.floor(
      acc / (1000 / 60),
    ); /* preserve accumulated time, never lower simulation frequency */
  }
}, 4);
const port = Number(process.env.PORT ?? 3000),
  host = process.env.HOST ?? "0.0.0.0";
http.on("error", (e) => {
  console.error("啟動失敗（檢查連接埠）", e.message);
  process.exitCode = 1;
  clearInterval(timer);
  repo.close();
});
http.listen(port, host, () => {
  console.log(
    `手勢競技場 http://localhost:${port} / data=${dataDir} / internal=${rooms.internal}`,
  );
  for (const list of Object.values(networkInterfaces()))
    for (const a of list ?? [])
      if (a.family === "IPv4" && !a.internal)
        console.log(`區網候選（請確認實體網卡）：http://${a.address}:${port}`);
});
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, () => {
    clearInterval(timer);
    io.close();
    http.close();
    repo.close();
    process.exit(0);
  });
