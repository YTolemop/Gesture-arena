import { GameCore } from "./core.js";
import { BY_ID, SKILLS, Loadout } from "./skills.js";
import { Label } from "../protocol/index.js";
export function aiLoadout(n: number): Loadout {
  const list = (slot: string) => SKILLS.filter((s) => s.slot === slot);
  return {
    attack: list("attack")[(n - 1) % 5].id,
    defense: list("defense")[(n + 1) % 5].id,
    control: list("control")[(n + 2) % 5].id,
    ultimate: list("ultimate")[(n - 1) % 9].id,
  };
}
export function difficulty(n: number) {
  return n <= 3
    ? { delay: 60, chance: 0.15, attackGap: 240, retreatDistance: 120, ultimateUnlock: 2400 }
    : n <= 6
      ? { delay: 48, chance: 0.25, attackGap: 180, retreatDistance: 180, ultimateUnlock: 1800 }
      : n <= 9
        ? { delay: 36, chance: 0.4, attackGap: 132, retreatDistance: 240, ultimateUnlock: 1500 }
        : { delay: 24, chance: 0.55, attackGap: 96, retreatDistance: 300, ultimateUnlock: 1200 };
}
export class AIController {
  seed: number;
  history: { tick: number; state: any }[] = [];
  sampled = new Map<number, boolean>();
  label: Label = "NONE";
  blockedUntil = 0;
  restUntil = 0;
  nextAttack = 0;
  constructor(
    seed: number,
    public round: number,
  ) {
    this.seed = seed >>> 0 || 1;
  }
  random() {
    let x = this.seed;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.seed = x >>> 0;
    return this.seed / 4294967296;
  }
  step(core: GameCore) {
    if (core.tick % 6) return;
    this.history.push({
      tick: core.tick,
      state: structuredClone(core.publicState(1)),
    });
    const diff = difficulty(this.round),
      past = this.history
        .filter((h) => h.tick <= core.tick - diff.delay)
        .at(-1);
    this.history = this.history.filter(
      (h) => h.tick >= core.tick - diff.delay - 12,
    );
    if (!past) {
      core.input(1, "NONE");
      return;
    }
    const state = past.state,
      a = state.actors[1],
      p = state.actors[0],
      dist = Math.abs(p.x - a.x);
    let label: Label = "NONE";
    const threats = [
      ...state.objects
        .filter((o: any) => o.owner === 0 && !o.field && o.skill !== "wall")
        .map((o: any) => o.cast),
      ...(p.cast ? [p.cast] : []),
    ];
    for (const c of threats) {
      if (!this.sampled.has(c.id))
        this.sampled.set(c.id, this.random() < diff.chance);
      if (!this.sampled.get(c.id)) continue;
      const s = BY_ID[c.skill];
      if (s.id === "spear") label = "CROUCH";
      else if (s.ground) label = "JUMP";
      else if (core.tick >= this.restUntil) label = "BLOCK";
      if (label !== "NONE") break;
    }
    if (label === "BLOCK") {
      if (!this.blockedUntil) this.blockedUntil = core.tick + 60;
      if (core.tick >= this.blockedUntil) {
        label = "NONE";
        this.blockedUntil = 0;
        this.restUntil = core.tick + 18;
      }
    } else this.blockedUntil = 0;
    const legal = (id: string) => {
      const s = BY_ID[id];
      return (
        a.ground &&
        a.stun === 0 &&
        a.busy === 0 &&
        a.blockStop === 0 &&
        !a.cast &&
        a.qi >= s.cost &&
        (!s.cost || a.imbalance === 0) &&
        (a.cooldowns[id] ?? 0) <= 0 &&
        (s.slot !== "ultimate" || state.elapsed[1] >= diff.ultimateUnlock)
      );
    };
    const reaches = (id: string) => {
      const s = BY_ID[id];
      if (s.ground && !p.ground) return false;
      if (["shield", "resolve"].includes(s.kind)) return a.hp < 600;
      if (s.kind === "projectile")
        return (
          dist < 64 + (s.range ?? 0) + 32 && (s.id !== "spear" || !p.crouch)
        );
      if (s.kind === "front")
        return s.shape?.kind === "rect" && dist < s.shape.w + 64;
      if (s.kind === "selfArea")
        return s.shape?.kind === "circle" && dist < s.shape.r + 32;
      return ["target", "field"].includes(s.kind);
    };
    if (label === "NONE") {
      if (a.hp < 400 && legal(a.loadout.defense) && this.random() < diff.chance)
        label = "DEFENSE_SKILL";
      else if (core.tick >= this.nextAttack && legal(a.loadout.ultimate) && reaches(a.loadout.ultimate))
        label = "ULTIMATE";
      else if (core.tick >= this.nextAttack && legal(a.loadout.attack) && reaches(a.loadout.attack))
        label = "ATTACK_SKILL";
      else if (core.tick >= this.nextAttack && legal(a.loadout.control) && reaches(a.loadout.control))
        label = "CONTROL_SKILL";
      else if (core.tick >= this.nextAttack && dist < 164 && legal("normal")) label = "NORMAL_ATTACK";
      else if (dist > 700) label = p.x < a.x ? "MOVE_LEFT" : "MOVE_RIGHT";
      else if (dist < diff.retreatDistance) label = p.x < a.x ? "MOVE_RIGHT" : "MOVE_LEFT";
    }
    if (
      [
        "JUMP",
        "NORMAL_ATTACK",
        "ATTACK_SKILL",
        "DEFENSE_SKILL",
        "CONTROL_SKILL",
        "ULTIMATE",
      ].includes(this.label) &&
      label === this.label
    )
      label = "NONE";
    this.label = label;
    if (["NORMAL_ATTACK", "ATTACK_SKILL", "CONTROL_SKILL", "ULTIMATE"].includes(label))
      this.nextAttack = core.tick + diff.attackGap;
    core.input(1, label);
    if (this.sampled.size > 256) {
      const keep = new Set(threats.map((c: any) => c.id));
      for (const key of this.sampled.keys())
        if (!keep.has(key)) this.sampled.delete(key);
    }
  }
}
