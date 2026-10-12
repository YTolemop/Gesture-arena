import assert from "node:assert/strict";
import test from "node:test";
import { AIController, aiLoadout, difficulty } from "../packages/game-core/ai.js";
import { GameCore } from "../packages/game-core/core.js";
import { DEFAULT_LOADOUT } from "../packages/game-core/skills.js";

function simulate(round: number, seed = 12345) {
  const core = new GameCore("PVE", [DEFAULT_LOADOUT, aiLoadout(round)]);
  core.actors[0].x = 640; core.actors[1].x = 1140;
  const ai = new AIController(seed, round);
  const attacks: number[] = [], ultimates: number[] = [];
  for (let t = 0; t < 1800 && !core.result; t++) {
    core.input(0, "NONE"); ai.step(core); core.step();
    for (const event of core.events) {
      if (event.type === "cast" && event.owner === 1) {
        if (event.skill === "normal" || event.skill === core.actors[1].loadout.attack || event.skill === core.actors[1].loadout.control || event.skill === core.actors[1].loadout.ultimate) attacks.push(event.start);
        if (event.skill === core.actors[1].loadout.ultimate) ultimates.push(event.start);
      }
    }
  }
  return { core, attacks, ultimates };
}

test("opening rounds leave breathing room instead of chaining attacks", () => {
  const { core, attacks, ultimates } = simulate(1);
  assert.ok(attacks.length > 0 && attacks.length <= 8);
  assert.ok(core.actors[0].hp > 0, "idle benchmark should survive the first 30 seconds");
  assert.equal(ultimates.length, 0);
  assert.ok(attacks[0] >= 60);
  for (let i = 1; i < attacks.length; i++) assert.ok(attacks[i] - attacks[i - 1] >= 240);
});

test("all difficulty tiers enforce a pause between offensive casts", () => {
  for (const round of [1, 4, 7, 10]) {
    const { attacks, ultimates } = simulate(round);
    assert.ok(attacks.length > 0);
    for (let i = 1; i < attacks.length; i++) assert.ok(attacks[i] - attacks[i - 1] >= difficulty(round).attackGap);
    for (const tick of ultimates) assert.ok(tick >= difficulty(round).ultimateUnlock);
  }
});

test("difficulty progresses gradually and remains bounded in later rounds", () => {
  const tiers = [1, 4, 7, 10].map(difficulty);
  for (let i = 1; i < tiers.length; i++) {
    assert.ok(tiers[i].delay < tiers[i - 1].delay);
    assert.ok(tiers[i].attackGap < tiers[i - 1].attackGap);
    assert.ok(tiers[i].chance > tiers[i - 1].chance);
  }
  assert.deepEqual(difficulty(100), difficulty(10));
});

test("early AI gives players room to approach instead of retreating at mid range", () => {
  const core = new GameCore("PVE", [DEFAULT_LOADOUT, aiLoadout(1)]);
  core.actors[0].x = 640; core.actors[1].x = 940;
  const ai = new AIController(12345, 1); ai.nextAttack = 1000;
  for (let t = 0; t < 180; t++) { core.input(0, "NONE"); ai.step(core); core.step(); }
  assert.equal(core.actors[1].x, 940);
});

test("same seed and actions remain reproducible", () => {
  const first = simulate(1, 42), second = simulate(1, 42);
  assert.deepEqual(first.attacks, second.attacks);
  assert.deepEqual(first.core.publicState(1), second.core.publicState(1));
});
