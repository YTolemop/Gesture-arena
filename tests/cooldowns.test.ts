import assert from "node:assert/strict";
import { createElement } from "react";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { CooldownPanels } from "../apps/web/src/cooldowns.js";
import { GameCore } from "../packages/game-core/core.js";
import { BY_ID, DEFAULT_LOADOUT } from "../packages/game-core/skills.js";

test("cooldown clocks show authoritative remaining time and hide enemy ultimate", () => {
  const core = new GameCore("PVP", [DEFAULT_LOADOUT, DEFAULT_LOADOUT]);
  core.actors[0].cooldowns[DEFAULT_LOADOUT.attack] = 300;
  core.actors[1].cooldowns[DEFAULT_LOADOUT.ultimate] = 600;
  const markup = renderToStaticMarkup(createElement(CooldownPanels, { state: { mode: "PVP", core: core.publicState(0) } }));
  assert.equal((markup.match(/class="cooldown-slot"/g) ?? []).length, 8);
  assert.match(markup, /5\.0 秒/);
  assert.match(markup, /cooldown-ring/);
  assert.match(markup, /未公開/);
  assert.equal((markup.match(new RegExp(BY_ID[DEFAULT_LOADOUT.ultimate].name, "g")) ?? []).length, 2); // One own title and one own label.
  assert.doesNotMatch(markup, /10\.0 秒/);
});

test("PVE accumulated time unlocks ultimate and practice no-cooldown stays ready", () => {
  const core = new GameCore("PVE", [DEFAULT_LOADOUT, DEFAULT_LOADOUT]);
  core.elapsed[0] = 1500; // A new round resets tick, not accumulated time.
  let markup = renderToStaticMarkup(createElement(CooldownPanels, { state: { mode: "PVE", core: core.publicState(0) } }));
  const own = markup.split('aria-label="藍方技能冷卻"')[0];
  assert.doesNotMatch(own, /未解鎖/);
  const practice = new GameCore("PRACTICE", [DEFAULT_LOADOUT, DEFAULT_LOADOUT], { noCooldown: true, unlock: true });
  practice.actors[0].cooldowns[DEFAULT_LOADOUT.attack] = 300;
  markup = renderToStaticMarkup(createElement(CooldownPanels, { state: { mode: "PRACTICE", core: practice.publicState(0) } }));
  assert.doesNotMatch(markup.split('aria-label="藍方技能冷卻"')[0], /5\.0 秒|未解鎖/);
});
