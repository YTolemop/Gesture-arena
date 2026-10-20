import assert from "node:assert/strict";
import test from "node:test";
import { Server } from "socket.io";
import { RoomManager } from "../apps/server/rooms.js";

test("all modes receive six-digit numeric room codes and occupied codes are retried", () => {
  const manager = new RoomManager(new Server(), {} as any);
  const has = manager.rooms.has.bind(manager.rooms);
  let attempts = 0;
  // Reserve the first candidate to exercise retry without relying on chance.
  manager.rooms.has = code => ++attempts === 1 || has(code);
  const codes = new Set<string>();
  for (let index = 0; index < 32; index++) {
    const mode = ["PVP", "PRACTICE", "PVE"][index % 3];
    const auth = manager.create({ data: {} } as any, { nickname: "player", mode });
    assert.match(auth.roomCode, /^[1-9]\d{5}$/);
    assert.equal(codes.has(auth.roomCode), false);
    assert.equal(manager.rooms.get(auth.roomCode)!.mode, mode);
    codes.add(auth.roomCode);
  }
  assert.equal(manager.rooms.size, 32);
  assert.ok(attempts >= 33);
});
