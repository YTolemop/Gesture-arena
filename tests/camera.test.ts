import assert from "node:assert/strict";
import { test } from "node:test";
import { createServer } from "node:http";
import { Server } from "socket.io";
import { io as connect, Socket } from "socket.io-client";
import { RoomManager } from "../apps/server/rooms.js";
import { validCameraFrame } from "../packages/protocol/camera.js";

const image = "data:image/jpeg;base64,/9j/2Q==";
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const request = (s: Socket, event: string, value: any = {}) => new Promise<any>((resolve, reject) =>
  s.timeout(2000).emit(event, { ...value, requestId: crypto.randomUUID() }, (err: any, ack: any) => err ? reject(err) : ack.ok ? resolve(ack) : reject(new Error(ack.errorCode))));

test("camera payload bounds and hand coordinates", () => {
  const base = { protocolVersion: 1, sessionId: "session", generation: 1 };
  assert.ok(validCameraFrame({ ...base, image }));
  assert.ok(validCameraFrame({ ...base, hands: [] }));
  const hand = Array.from({ length: 21 }, () => ({ x: .5, y: .5 }));
  assert.ok(validCameraFrame({ ...base, image, hands: [hand, hand] }));
  for (const extra of [{}, { image: "https://example.com" }, { image: "data:image/jpeg;base64," + "A".repeat(48000) }, { hands: [hand, hand, hand] }, { hands: [[{ x: 2, y: .5 }]] }, { image, seat: 1 }])
    assert.equal(validCameraFrame({ ...base, ...extra }), false);
});

test("room previews reach both players and spectator, reject spoofing, prefer paired controller", async () => {
  const http = createServer();
  const server = new Server(http, { maxHttpBufferSize: 65536 });
  const manager = new RoomManager(server, {} as any);
  server.of("/arena").on("connection", s => manager.attachArena(s));
  server.of("/controller").on("connection", s => manager.attachController(s));
  await new Promise<void>(resolve => http.listen(0, "127.0.0.1", resolve));
  const port = (http.address() as any).port;
  const clients: Socket[] = [];
  const client = async (namespace = "arena") => {
    const s = connect(`http://127.0.0.1:${port}/${namespace}`, { transports: ["websocket"], forceNew: true });
    clients.push(s);
    await new Promise<void>((resolve, reject) => { s.once("connect", resolve); s.once("connect_error", reject); });
    return s;
  };
  try {
    const red = await client(), blue = await client(), observer = await client(), outsider = await client();
    const a = await request(red, "room:create", { nickname: "紅" });
    const b = await request(blue, "room:join", { roomCode: a.roomCode, nickname: "藍" });
    await request(observer, "room:join", { roomCode: a.roomCode, nickname: "觀戰" });
    await request(outsider, "room:create", { nickname: "其他房" });
    const received = clients.map(() => [] as any[]);
    clients.forEach((s, i) => s.on("camera:frame", frame => received[i].push(frame)));
    const frame = (auth: any) => ({ protocolVersion: 1, sessionId: auth.sessionId, generation: auth.generation, image });
    red.emit("camera:frame", frame(a));
    await wait(100);
    for (let i = 0; i < 3; i++) { assert.equal(received[i].length, 1); assert.equal(received[i][0].seat, 0); assert.equal(received[i][0].playerId, a.playerId); assert.equal(received[i][0].sessionId, undefined); }
    assert.equal(received[3].length, 0);
    blue.emit("camera:frame", frame(b));
    await wait(130);
    for (let i = 0; i < 3; i++) assert.equal(received[i].at(-1).seat, 1);
    const count = received[2].length;
    observer.emit("camera:frame", frame(a));
    red.emit("camera:frame", { ...frame(a), generation: a.generation + 1 });
    await wait(130);
    red.emit("camera:frame", { ...frame(a), sessionId: "wrong" });
    await wait(130);
    assert.equal(received[2].length, count);
    const { pairCode } = await request(red, "controller:code");
    const controller = await client("controller");
    const c = await request(controller, "controller:pair", { protocolVersion: 1, pairCode, source: "recognizer", algorithms: { normalization: true, knn: true } });
    controller.emit("camera:frame", { ...frame(c), hands: [] });
    await wait(130);
    assert.equal(received[2].at(-1).source, "controller");
    assert.deepEqual(received[2].at(-1).hands, []);
    const controllerCount = received[2].length;
    red.emit("camera:frame", frame(a));
    await wait(130);
    assert.equal(received[2].length, controllerCount);
    controller.disconnect();
    await wait(130);
    red.emit("camera:frame", frame(a));
    await wait(130);
    assert.equal(received[2].at(-1).source, "browser");
    await request(red, "room:leave");
    const departedCount = received[2].length;
    await wait(130);
    red.emit("camera:frame", frame(a));
    await wait(130);
    assert.equal(received[2].length, departedCount);
  } finally {
    clients.forEach(s => s.disconnect());
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});
