import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import { Server } from "socket.io";
import { io, Socket } from "socket.io-client";
import { RoomManager } from "../apps/server/rooms.js";
import { GameCore } from "../packages/game-core/core.js";
import { DEFAULT_LOADOUT } from "../packages/game-core/skills.js";

test("paired controller delivers atomic channels; rejects stale/mixed/unauthorized packets", async () => {
  const http = createServer(), server = new Server(http);
  const manager = new RoomManager(server, {} as any);
  server.of("/arena").on("connection", s => manager.attachArena(s));
  server.of("/controller").on("connection", s => manager.attachController(s));
  await new Promise<void>(resolve => http.listen(0, "127.0.0.1", resolve));
  const clients: Socket[] = [];
  const connect = async (ns: string) => {
    const socket = io(`http://127.0.0.1:${(http.address() as any).port}/${ns}`, { transports: ["websocket"], forceNew: true });
    clients.push(socket);
    await new Promise<void>((resolve, reject) => { socket.once("connect", resolve); socket.once("connect_error", reject); });
    return socket;
  };
  const call = (s: Socket, event: string, data: any) => new Promise<any>((resolve, reject) =>
    s.timeout(2000).emit(event, data, (err: any, result: any) => err ? reject(err) : resolve(result)));
  const request = async (s: Socket, event: string, data: any = {}) => {
    const result = await call(s, event, { requestId: crypto.randomUUID(), ...data });
    assert.ok(result.ok, result.errorCode); return result;
  };
  try {
    const browser = await connect("arena");
    const auth = await request(browser, "room:create", { nickname: "test" });
    const { pairCode } = await request(browser, "controller:code");
    const controller = await connect("controller");
    const pair = await request(controller, "controller:pair", { protocolVersion: 1, roomCode: auth.roomCode,
      pairCode, source: "recognizer", algorithms: { normalization: true, knn: true } });
    const room = manager.rooms.get(auth.roomCode)!;
    // Isolate transport/game input integration from lobby drafting and countdown.
    room.players[0]!.source = "recognizer";
    room.phase = "PLAYING";
    room.core = new GameCore("PRACTICE", [DEFAULT_LOADOUT, DEFAULT_LOADOUT]);
    const packet = { protocolVersion: 1, sessionId: pair.sessionId, matchId: room.matchId,
      generation: pair.generation, seq: 0, commands: { left: "NONE", right: "NONE", both: "NONE" } };
    assert.ok((await call(controller, "input:state", packet)).ok);
    for (let i=0; i<7; i++) room.core.step();
    const dual = { ...packet, seq: 1, commands: { left: "MOVE_RIGHT", right: "BLOCK", both: "NONE" } };
    assert.ok((await call(controller, "input:state", dual)).ok);
    const actor = room.core.actors[0], x = actor.x;
    room.core.step(); assert.ok(actor.x > x && room.core.blocking(actor));
    assert.equal((await call(controller, "input:state", dual)).errorCode, "STALE_SEQ");
    assert.equal((await call(controller, "input:state", { ...dual, seq: 2, generation: pair.generation + 1 })).errorCode, "STALE_GENERATION");
    assert.equal((await call(controller, "input:state", { ...dual, seq: 2, commands: { left: "BLOCK", right: "NONE", both: "JUMP" } })).errorCode, "INVALID_INPUT");
    assert.equal((await call(browser, "input:state", { ...dual, sessionId: auth.sessionId, seq: 2 })).errorCode, "WRONG_SOURCE");
    assert.ok((await call(controller, "input:state", { ...packet, seq: 2, commands: { left: "NONE", right: "NONE", both: "JUMP" } })).ok);
    room.core.step(); assert.equal(actor.ground, false);
    const { commands, ...legacy } = packet;
    assert.ok((await call(controller, "input:state", { ...legacy, seq: 3, gesture: "NONE" })).ok);
    assert.equal(actor.input.labels.size, 0);
    controller.disconnect();
    await new Promise(resolve => setTimeout(resolve, 50));
    assert.equal(actor.input.labels.size, 0);
    assert.ok(actor.input.needsNone);
  } finally {
    clients.forEach(s => s.disconnect());
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});
