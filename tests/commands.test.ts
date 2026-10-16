import assert from "node:assert/strict";
import test from "node:test";
import { validInput, inputLabels } from "../packages/protocol/index.js";
import { InputRouter } from "../packages/game-core/input.js";
import { GameCore } from "../packages/game-core/core.js";
import { DEFAULT_LOADOUT } from "../packages/game-core/skills.js";

const base = { protocolVersion: 1, sessionId: "test", matchId: null, generation: 1, seq: 0 };
test("three complete channels, exclusive both, legacy compatibility", () => {
  for (const commands of [
    { left: "MOVE_LEFT", right: "BLOCK", both: "NONE" },
    { left: "NONE", right: "NONE", both: "ULTIMATE" },
    { left: "NONE", right: "NONE", both: "NONE" },
  ]) assert.ok(validInput({ ...base, commands }));
  for (const commands of [null, [], {}, { left: "BLOCK", right: "NONE" },
    { left: "BLOCK", right: "NONE", both: "JUMP" },
    { left: "NONE", right: "NONE", both: "INVALID" },
    { left: "NONE", right: "NONE", both: "NONE", extra: "NONE" }])
    assert.ok(!validInput({ ...base, commands }));
  assert.ok(validInput({ ...base, gesture: "BLOCK" }));
  assert.ok(!validInput({ ...base, gesture: "BLOCK", commands: { left: "NONE", right: "NONE", both: "NONE" } }));
  assert.deepEqual(inputLabels({ ...base, protocolVersion: 1, commands: { left: "JUMP", right: "JUMP", both: "NONE" } }), ["JUMP"]);
});
test("independent held commands, neutral gate, release/rearm, timeout", () => {
  const r = new InputRouter();
  r.receive(["MOVE_LEFT", "JUMP"], 0);
  assert.equal(r.labels.size, 0);
  r.receive([], 1); r.receive(["MOVE_LEFT", "JUMP"], 7);
  assert.deepEqual(r.consume(), ["JUMP"]);
  assert.ok(r.has("MOVE_LEFT") && r.has("JUMP"));
  r.receive(["MOVE_LEFT", "JUMP"], 8); assert.deepEqual(r.consume(), []);
  r.receive(["MOVE_LEFT"], 9); r.receive(["MOVE_LEFT", "JUMP"], 15);
  assert.deepEqual(r.consume(), ["JUMP"]);
  r.advance(46); assert.equal(r.labels.size, 0);
  r.reset(); r.receive(["BLOCK"], 47); assert.equal(r.labels.size, 0);
});
test("two one-shot commands deduplicate and pending work is bounded", () => {
  const r = new InputRouter(); r.receive([], 0);
  r.receive(["NORMAL_ATTACK", "ATTACK_SKILL"], 6);
  r.receive(["JUMP", "ULTIMATE"], 6);
  assert.deepEqual(r.consume(), ["NORMAL_ATTACK", "ATTACK_SKILL"]);
  r.receive([], 7); r.receive(["JUMP", "JUMP"], 13);
  assert.deepEqual(r.consume(), ["JUMP"]);
});
test("initial neutral gate requires six ticks before one-shot actions", () => {
  const r = new InputRouter();
  r.receive([], 0); r.receive(["JUMP"], 1);
  assert.deepEqual(r.consume(), []);
  r.receive([], 2); r.receive(["JUMP"], 8);
  assert.deepEqual(r.consume(), ["JUMP"]);
});
test("gameplay supports movement plus block and opposite directions cancel", () => {
  const core = new GameCore("PRACTICE", [DEFAULT_LOADOUT, DEFAULT_LOADOUT]);
  core.input(0, "NONE"); for (let i=0; i<7; i++) core.step();
  const a = core.actors[0], x = a.x;
  core.input(0, ["MOVE_RIGHT", "BLOCK"]); core.step();
  assert.ok(a.x > x); assert.ok(core.blocking(a));
  const held = a.x;
  core.input(0, ["MOVE_LEFT", "MOVE_RIGHT"]); core.step();
  assert.equal(a.x, held);
  core.input(0, ["MOVE_LEFT", "CROUCH"]); core.step();
  assert.ok(a.crouch && a.x < held);
});
