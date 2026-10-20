import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import { Server } from "socket.io";
import { io, Socket } from "socket.io-client";
import { RoomManager } from "../apps/server/rooms.js";
import { GameCore } from "../packages/game-core/core.js";
import { DEFAULT_LOADOUT } from "../packages/game-core/skills.js";

for (const active of [false, true]) {
  test(`leave PVE ${active ? "during a challenge" : "before starting"} releases the controller and permits a new solo room`, async () => {
    const http = createServer(), server = new Server(http);
    const saved: any[] = [];
    const manager = new RoomManager(server, { save: (result: any) => saved.push(result) } as any);
    server.of("/arena").on("connection", s => manager.attachArena(s));
    server.of("/controller").on("connection", s => manager.attachController(s));
    await new Promise<void>(resolve => http.listen(0, "127.0.0.1", resolve));
    const clients: Socket[] = [];
    const connect = async (namespace: string) => {
      const s = io(`http://127.0.0.1:${(http.address() as any).port}/${namespace}`, { transports: ["websocket"], forceNew: true });
      clients.push(s);
      await new Promise<void>((resolve, reject) => { s.once("connect", resolve); s.once("connect_error", reject); });
      return s;
    };
    const request = (s: Socket, event: string, value: any = {}) => new Promise<any>((resolve, reject) =>
      s.timeout(2000).emit(event, { requestId: crypto.randomUUID(), ...value }, (err: any, ack: any) =>
        err ? reject(err) : ack.ok ? resolve(ack) : reject(new Error(ack.errorCode))));
    try {
      const browser = await connect("arena");
      const auth = await request(browser, "solo:create", { nickname: "player", mode: "PVE" });
      const { pairCode } = await request(browser, "controller:code");
      const controller = await connect("controller");
      await request(controller, "controller:pair", { protocolVersion: 1, pairCode, source: "recognizer", algorithms: { normalization: true, knn: true } });
      const room = manager.rooms.get(auth.roomCode)!;
      if (active) {
        room.run = { id: "leave-test", seed: 1, round: 2, defeated: 1, ticks: 120, sourceHistory: ["recognizer"] };
        room.core = new GameCore("PVE", [DEFAULT_LOADOUT, DEFAULT_LOADOUT]);
        room.phase = "PLAYING";
      }
      const disconnected = new Promise<void>(resolve => controller.once("disconnect", () => resolve()));
      const requestId = crypto.randomUUID();
      await request(browser, "room:leave", { requestId });
      await disconnected;
      assert.equal(room.players[0]!.socket, null);
      assert.equal(room.players[0]!.controller, null);
      assert.equal(controller.connected, false);
      assert.equal(saved.length, active ? 1 : 0);
      if (active) {
        assert.equal(saved[0].reason, "quit");
        assert.equal(saved[0].eligible, false);
        assert.equal(saved[0].defeated, 1);
      }
      // An ACK retry must not save another result or reattach the player.
      await request(browser, "room:leave", { requestId });
      assert.equal(saved.length, active ? 1 : 0);
      const next = await request(browser, "solo:create", { nickname: "player", mode: "PVE" });
      assert.notEqual(next.roomCode, auth.roomCode);
    } finally {
      clients.forEach(s => s.disconnect());
      await new Promise<void>(resolve => server.close(() => resolve()));
    }
  });
}
