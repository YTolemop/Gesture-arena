import {
  BY_ID,
  DEFAULT_LOADOUT,
  Loadout,
  Shape,
  Skill,
  ticks,
  RULES_VERSION,
} from "./skills.js";
import { Label } from "../protocol/index.js";
import { InputRouter } from "./input.js";
import { box, overlap, sweep, Box, shapesOverlap } from "./geometry.js";
export interface Actor {
  x: number;
  y: number;
  vy: number;
  dir: number;
  hp: number;
  qi: number;
  shield: number;
  shieldEnd: number;
  loadout: Loadout;
  revealed: boolean;
  cooldowns: Record<string, number>;
  busy: number;
  stun: number;
  stunImmune: number;
  blockStop: number;
  imbalance: number;
  root: number;
  controlImmune: number;
  cleanse: number;
  resolve: number;
  budget: number;
  mirror: number;
  slows: { amount: number; end: number }[];
  force: null | {
    dir: number;
    speed: number;
    remaining: number;
    target?: number;
  };
  cast: null | Cast;
  regenAfter: number;
  recentDir: number;
  recentTick: number;
  jumpDir: number;
  crouch: boolean;
  ground: boolean;
  input: InputRouter;
}
export interface Cast {
  id: number;
  skill: string;
  owner: number;
  start: number;
  generate: number;
  x: number;
  target: number;
  dir: number;
  phaseDir: number;
}
export interface ObjectState {
  id: number;
  cast: Cast;
  skill: string;
  owner: number;
  segment: number;
  start: number;
  end: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  shape: Shape;
  travel: number;
  reflected: boolean;
  hits: number[];
  uses?: number;
  field?: boolean;
}
export interface Hit {
  tick: number;
  skill: string;
  castId: number;
  segment: number;
  target: number;
  raw: number;
  reduced: number;
  absorbed: number;
  health: number;
  blocked: boolean;
  control: string[];
}
export interface Aids {
  infiniteQi: boolean;
  noCooldown: boolean;
  unlock: boolean;
  immortal: boolean;
}
const noAids: Aids = {
  infiniteQi: false,
  noCooldown: false,
  unlock: false,
  immortal: false,
};
const clamp = (x: number) => Math.max(128, Math.min(1792, x));
const cents = (x: number) => Math.round(x * 100) / 100;
export class GameCore {
  tick = 0;
  elapsed = [0, 0];
  actors: Actor[];
  objects: ObjectState[] = [];
  nextId = 1;
  casts = 1;
  hits: Hit[] = [];
  hitStats = {
    count: 0,
    health: 0,
    shield: 0,
    firstTick: null as number | null,
  };
  cancelledSwing = new Map<number, number>();
  clearStats() {
    this.hits = [];
    this.hitStats = { count: 0, health: 0, shield: 0, firstTick: null };
  }
  events: any[] = [];
  mode: "PVP" | "PRACTICE" | "PVE";
  aids: Aids;
  result: null | { winner: number | null; reason: string } = null;
  deadline = 5400;
  overtime = false;
  dummy = "stand";
  constructor(
    mode: "PVP" | "PRACTICE" | "PVE" = "PVP",
    loadouts: Loadout[] = [DEFAULT_LOADOUT, DEFAULT_LOADOUT],
    aids: Partial<Aids> = {},
  ) {
    this.mode = mode;
    this.aids = mode === "PRACTICE" ? { ...noAids, ...aids } : { ...noAids };
    this.actors = [0, 1].map((i) => ({
      x: i ? 1440 : 480,
      y: 900,
      vy: 0,
      dir: i ? -1 : 1,
      hp: 1000,
      qi: 720,
      shield: 0,
      shieldEnd: 0,
      loadout: { ...loadouts[i] },
      revealed: mode !== "PVP",
      cooldowns: {},
      busy: 0,
      stun: 0,
      stunImmune: 0,
      blockStop: 0,
      imbalance: 0,
      root: 0,
      controlImmune: 0,
      cleanse: 0,
      resolve: 0,
      budget: 0,
      mirror: 0,
      slows: [],
      force: null,
      cast: null,
      regenAfter: 60,
      recentDir: 0,
      recentTick: -999,
      jumpDir: 0,
      crouch: false,
      ground: true,
      input: new InputRouter(),
    }));
  }
  blocking(a: Actor) {
    return (
      a.input.has("BLOCK") &&
      a.ground &&
      a.stun <= this.tick &&
      a.busy <= this.tick &&
      a.imbalance <= this.tick
    );
  }
  canAct(a: Actor) {
    return (
      a.hp > 0 &&
      a.ground &&
      a.stun <= this.tick &&
      a.busy <= this.tick &&
      a.blockStop <= this.tick
    );
  }
  input(i: number, label: Label | Label[]) {
    this.actors[i].input.receive(label, this.tick);
  }
  spend(a: Actor, amount: number) {
    a.qi = Math.max(0, a.qi - amount);
    if (a.qi === 0 && a.imbalance <= this.tick) a.imbalance = this.tick + 180;
  }
  attempt(i: number, label: Label) {
    const a = this.actors[i];
    if (label === "JUMP") {
      if (this.canAct(a) && a.root <= this.tick && !a.force) {
        a.vy = -1120;
        a.ground = false;
        a.crouch = false;
        a.jumpDir = this.tick - a.recentTick <= 30 ? a.recentDir : 0;
        return "OK";
      }
      return "ACTION_LOCKED";
    }
    const id =
      label === "NORMAL_ATTACK"
        ? "normal"
        : a.loadout[
            (
              {
                ATTACK_SKILL: "attack",
                DEFENSE_SKILL: "defense",
                CONTROL_SKILL: "control",
                ULTIMATE: "ultimate",
              } as const
            )[label as "ATTACK_SKILL"]
          ];
    const s = BY_ID[id];
    if (!s) return "INVALID_ACTION";
    const aid = i === 0 && this.mode === "PRACTICE";
    if (!this.canAct(a)) return "ACTION_LOCKED";
    if (s.cost && a.imbalance > this.tick) return "IMBALANCE";
    if (s.id === "phase" && (a.root > this.tick || a.force)) return "ROOTED";
    if (a.qi < s.cost * 120 && !(aid && this.aids.infiniteQi))
      return "INSUFFICIENT_QI";
    if ((a.cooldowns[id] ?? 0) > this.tick && !(aid && this.aids.noCooldown))
      return "COOLDOWN";
    if (
      s.slot === "ultimate" &&
      this.elapsed[i] < 1200 &&
      !(aid && this.aids.unlock)
    )
      return "ULTIMATE_LOCKED";
    if (
      s.kind === "projectile" &&
      this.objects.some((o) => o.cast.owner === i && o.skill === id)
    )
      return "PROJECTILE_ACTIVE";
    const c: Cast = {
      id: this.casts++,
      skill: id,
      owner: i,
      start: this.tick,
      generate: this.tick + ticks(s.prepare),
      x: a.x,
      target: this.actors[1 - i].x,
      dir: a.dir,
      phaseDir: this.tick - a.recentTick <= 30 ? a.recentDir : -a.dir,
    };
    a.cast = c;
    a.crouch = false;
    a.cooldowns[id] = this.tick + ticks(s.cooldown);
    a.busy =
      c.generate + ticks(s.recovery) + (id === "normal" ? ticks(s.window!) : 0);
    a.regenAfter = a.busy + 60;
    if (!(aid && this.aids.infiniteQi)) this.spend(a, s.cost * 120);
    if (s.slot === "ultimate") a.revealed = true;
    this.events.push({ type: "cast", ...c });
    return "OK";
  }
  add(
    c: Cast,
    segment: number,
    x: number,
    y: number,
    shape: Shape,
    start: number,
    end: number,
    extra: Partial<ObjectState> = {},
  ) {
    this.objects.push({
      id: this.nextId++,
      cast: c,
      skill: c.skill,
      owner: c.owner,
      segment,
      start,
      end,
      x,
      y,
      shape,
      vx: 0,
      vy: 0,
      travel: 0,
      reflected: false,
      hits: [],
      ...extra,
    });
  }
  clearControl(a: Actor) {
    if (a.root > this.tick || a.force) a.controlImmune = this.tick + 120;
    a.root = 0;
    a.force = null;
  }
  shield(a: Actor, value: number, end: number) {
    if (value > a.shield) {
      a.shield = value;
      a.shieldEnd = end;
    }
  }
  generate(c: Cast) {
    const s = BY_ID[c.skill],
      a = this.actors[c.owner],
      t = this.tick;
    const end = t + ticks(s.duration ?? s.window ?? 0.1);
    if (s.kind === "projectile") {
      for (const [j, angle] of (s.id === "stars"
        ? [-6, 0, 6]
        : [0]
      ).entries()) {
        const rad = (angle * Math.PI) / 180;
        this.add(
          c,
          j,
          c.x + c.dir * 64,
          s.y!,
          s.shape!,
          t,
          t + ticks(s.life!),
          {
            vx: c.dir * s.speed! * Math.cos(rad),
            vy: s.speed! * Math.sin(rad),
          },
        );
      }
      return;
    }
    if (s.kind === "shield") {
      this.shield(a, s.shield!, end);
      if (s.id === "sanctuary") {
        this.clearControl(a);
        a.slows = [];
      }
      if (s.id === "silence")
        this.objects = this.objects.filter(
          (o) =>
            !(
              o.owner !== c.owner &&
              this.reflectable(o) &&
              shapesOverlap(
                { kind: "circle", r: 360 },
                a.x,
                a.y,
                o.shape,
                o.x,
                o.y,
              )
            ),
        );
      return;
    }
    if (s.kind === "mirror") {
      a.mirror = end;
      return;
    }
    if (s.kind === "resolve") {
      this.clearControl(a);
      a.resolve = end;
      a.budget = 540;
      return;
    }
    if (s.kind === "cleanse") {
      if (a.root > t) {
        a.root = 0;
        a.controlImmune = t + 120;
      }
      a.slows = [];
      a.cleanse = end;
      return;
    }
    if (s.kind === "phase") {
      const target = clamp(a.x + c.phaseDir * 280);
      a.x = this.legalPosition(target, this.actors[1 - c.owner], c.phaseDir);
      return;
    }
    if (s.kind === "wall") {
      this.add(c, 0, c.x + c.dir * 140, 750, s.shape!, t, end, { uses: 3 });
      return;
    }
    if (s.kind === "field") {
      this.objects = this.objects.filter(
        (o) => !(o.field && o.cast.owner === c.owner && o.skill === s.id),
      );
      this.add(c, 0, c.x + c.dir * 260, 888, s.shape!, t, end, { field: true });
      return;
    }
    let x = c.x;
    if (s.kind === "target") x = c.target;
    if (s.kind === "front" && s.shape?.kind === "rect")
      x = c.x + c.dir * (32 + s.shape.w / 2);
    if (s.id === "gravity") {
      this.objects = this.objects.filter(
        (o) => !(o.field && o.cast.owner === c.owner && o.skill === s.id),
      );
      this.add(c, 99, x, 888, { kind: "rect", w: 360, h: 24 }, t, end, {
        field: true,
      });
    }
    for (const [j, delay] of (s.id === "meteor"
      ? [0, 0.6, 1.2]
      : [s.delay ?? 0]
    ).entries()) {
      const start = t + ticks(delay);
      this.add(c, j, x, s.y!, s.shape!, start, start + ticks(s.window ?? 0.1));
    }
  }
  legalPosition(x: number, other: Actor, dir: number) {
    x = clamp(x);
    if (other.ground && Math.abs(x - other.x) < 64) {
      const choices = [other.x - 64, other.x + 64]
        .filter((v) => v >= 128 && v <= 1792)
        .sort((a, b) => Math.abs(a - x) - Math.abs(b - x) || dir * (b - a));
      return choices[0] ?? x;
    }
    return x;
  }
  objectBox(o: ObjectState): Box {
    const sh = o.shape;
    return sh.kind === "rect"
      ? { x: o.x - sh.w / 2, y: o.y - sh.h / 2, w: sh.w, h: sh.h }
      : { x: o.x - sh.r, y: o.y - sh.r, w: sh.r * 2, h: sh.r * 2 };
  }
  reflectable(o: ObjectState) {
    return BY_ID[o.skill].kind === "projectile" && o.skill !== "flame";
  }
  flightEnd(o: ObjectState, dx: number, dy: number): number | null {
    const b = this.objectBox(o),
      distance = Math.hypot(dx, dy),
      candidates: number[] = [];
    if (distance > 0) {
      const limit = (BY_ID[o.skill].range! - o.travel) / distance;
      if (limit >= 0 && limit <= 1) candidates.push(limit);
    }
    if (dx < 0) {
      const edge = (96 - (b.x + b.w)) / dx;
      if (edge >= 0 && edge <= 1) candidates.push(edge);
    }
    if (dx > 0) {
      const edge = (1824 - b.x) / dx;
      if (edge >= 0 && edge <= 1) candidates.push(edge);
    }
    if (dy < 0) {
      const edge = -(b.y + b.h) / dy;
      if (edge >= 0 && edge <= 1) candidates.push(edge);
    }
    if (o.skill !== "flame") {
      if (b.y + b.h >= 900) candidates.push(0);
      else if (dy > 0) {
        const edge = (900 - b.y - b.h) / dy;
        if (edge >= 0 && edge <= 1) candidates.push(edge);
      }
    }
    return candidates.length ? Math.min(...candidates) : null;
  }
  slow(a: Actor, i: number) {
    if (a.cleanse > this.tick) return 0;
    let slow = Math.max(0, ...a.slows.map((s) => s.amount));
    if (a.ground)
      for (const o of this.objects)
        if (
          o.field &&
          o.owner !== i &&
          o.start <= this.tick &&
          o.end > this.tick &&
          o.shape.kind === "rect" &&
          a.x + 32 > Math.max(96, o.x - o.shape.w / 2) &&
          a.x - 32 < Math.min(1824, o.x + o.shape.w / 2)
        )
          slow = Math.max(slow, BY_ID[o.skill].slow!);
    return slow;
  }
  damage(o: ObjectState, i: number, contactTime = 0) {
    const s = BY_ID[o.skill],
      a = this.actors[i],
      t = this.tick,
      key = `${o.cast.id}:${i}`;
    const maximum = s.id === "stars" ? 2 : Infinity;
    if ((this.hitCounts.get(key) ?? 0) >= maximum) return;
    this.hitCounts.set(key, (this.hitCounts.get(key) ?? 0) + 1);
    const blocked = this.blocking(a);
    let d = s.damage,
      reduced = 0;
    const control: string[] = [];
    if (blocked) {
      reduced = d * 0.8;
      d *= 0.2;
      if (!this.blockedCasts.has(key)) {
        this.blockedCasts.add(key);
        this.spend(a, 60);
        if (a.blockStop <= t) a.blockStop = t + 9;
      }
      a.regenAfter = Math.max(a.regenAfter, t + 9 + 60);
    } else {
      if (a.resolve > t && a.budget > 0) {
        reduced = Math.min(d * 0.6, a.budget);
        a.budget = cents(a.budget - reduced);
        d -= reduced;
        if (a.budget <= 0) a.resolve = 0;
      }
      a.regenAfter = Math.max(a.regenAfter, t + 60);
      if (a.stun <= t && a.stunImmune <= t) {
        a.stun = t + 12;
        a.stunImmune = t + 30;
        if (a.cast && a.cast.generate > t) {
          a.cast = null;
          a.busy = t;
        }
        for (const swing of this.objects)
          if (swing.owner === i && swing.skill === "normal")
            this.cancelledSwing.set(swing.id, contactTime);
        this.objects = this.objects.filter(
          (v) => !(v.owner === i && v.skill === "normal"),
        );
        a.regenAfter = Math.max(a.regenAfter, t + 72);
      }
      if (s.slow && s.slowTime && a.cleanse <= t)
        a.slows.push({ amount: s.slow, end: t + ticks(s.slowTime) });
    }
    const root = blocked ? 0 : (s.root ?? 0);
    const push = blocked ? (s.blockPush ?? 0) : (s.push ?? s.pull ?? 0);
    if (a.controlImmune <= t && a.root <= t && !a.force && a.resolve <= t) {
      if (root && a.cleanse <= t) {
        a.root = t + ticks(root);
        control.push("root");
      } else if (push) {
        let dir =
          Math.sign(a.x - (s.pull ? this.actors[o.owner].x : o.cast.x)) ||
          o.cast.dir;
        if (s.pull) dir = -dir;
        let distance = push;
        if (s.pull)
          distance = Math.min(
            distance,
            Math.max(0, Math.abs(a.x - this.actors[o.owner].x) - 64),
          );
        if (distance > 0) {
          a.force = {
            dir,
            speed: blocked ? (s.id === "storm" ? 600 : 400) : s.pushSpeed!,
            remaining: distance,
            target: s.pull ? this.actors[o.owner].x - dir * 64 : undefined,
          };
          control.push("force");
        }
      }
    }
    const absorbed = Math.min(a.shield, d);
    a.shield = cents(a.shield - absorbed);
    const health = cents(d - absorbed);
    a.hp = Math.max(
      this.mode === "PRACTICE" && i === 1 && this.aids.immortal ? 1 : 0,
      cents(a.hp - health),
    );
    const h: Hit = {
      tick: t,
      skill: s.id,
      castId: o.cast.id,
      segment: o.segment,
      target: i,
      raw: s.damage,
      reduced: cents(reduced),
      absorbed: cents(absorbed),
      health,
      blocked,
      control,
    };
    this.hits.push(h);
    this.hitStats.count++;
    this.hitStats.health = cents(this.hitStats.health + health);
    this.hitStats.shield = cents(this.hitStats.shield + absorbed);
    if (health > 0 && this.hitStats.firstTick === null)
      this.hitStats.firstTick = t;
    if (this.hits.length > 1000) this.hits.shift();
    this.events.push({ type: "hit", ...h });
  }
  hitCounts = new Map<string, number>();
  blockedCasts = new Set<string>();
  step() {
    if (this.result) return;
    const t = this.tick;
    this.events = [];
    this.cancelledSwing.clear();
    const old = this.actors.map((a) => ({ x: a.x, y: a.y, ground: a.ground }));
    // Expire -> input -> movement -> generate -> swept intersections -> damage -> death/time.
    this.objects = this.objects.filter((o) => o.end > t);
    for (const a of this.actors) {
      if (a.shieldEnd <= t) a.shield = 0;
      if (a.root && a.root <= t) {
        a.root = 0;
        a.controlImmune = t + 120;
      }
      if (a.imbalance && a.imbalance <= t) {
        a.imbalance = 0;
        a.qi = 120;
      }
      a.slows = a.slows.filter((v) => v.end > t);
      a.input.advance(t);
    }
    for (let i = 0; i < 2; i++) {
      const a = this.actors[i],
        label = a.input.has("MOVE_LEFT") !== a.input.has("MOVE_RIGHT")
          ? (a.input.has("MOVE_LEFT") ? "MOVE_LEFT" : "MOVE_RIGHT") : "NONE";
      if (!a.cast && a.busy <= t) {
        const delta = this.actors[1 - i].x - a.x;
        if (delta) a.dir = Math.sign(delta);
      }
      if (label === "MOVE_LEFT" || label === "MOVE_RIGHT") {
        a.recentDir = label === "MOVE_LEFT" ? -1 : 1;
        a.recentTick = t;
      }
      for (const cmd of a.input.consume()) {
        const reason = this.attempt(i, cmd);
        this.events.push({ type: "input", actor: i, label: cmd, reason });
      }
      const free = a.stun <= t && a.busy <= t && a.blockStop <= t;
      let dx = 0;
      if (a.force) {
        const f = a.force,
          amount = Math.min(f.remaining, f.speed / 60);
        dx = f.dir * amount;
        f.remaining -= amount;
      } else if (free && a.root <= t) {
        if (label === "MOVE_LEFT" || label === "MOVE_RIGHT")
          dx = ((a.recentDir * 320) / 60) * (1 - this.slow(a, i));
        else if (a.input.has("JUMP") && !a.ground)
          dx = ((a.jumpDir * 320) / 60) * (1 - this.slow(a, i));
      }
      a.crouch = a.ground && free && a.input.has("CROUCH");
      a.x = clamp(a.x + dx);
      if (!a.ground) {
        a.y += a.vy / 60 + 1400 / 3600;
        a.vy += 2800 / 60;
        if (a.y >= 900 - 1e-8) {
          a.y = 900;
          a.vy = 0;
          a.ground = true;
        }
      }
      if (
        a.force &&
        (a.force.remaining <= 1e-8 || a.x === 128 || a.x === 1792)
      ) {
        a.force = null;
        a.controlImmune = t + 120;
      }
      if (this.blocking(a)) a.regenAfter = t + 60;
      else if (a.busy > t || a.stun > t || a.blockStop > t)
        a.regenAfter = Math.max(a.regenAfter, t + 60);
      if (a.imbalance <= t && t >= a.regenAfter) a.qi = Math.min(720, a.qi + 1);
      if (i === 0 && this.mode === "PRACTICE" && this.aids.infiniteQi) {
        a.qi = 720;
        a.imbalance = 0;
      }
    }
    const [a, b] = this.actors;
    if (a.ground && b.ground && Math.abs(a.x - b.x) < 64) {
      const landA = !old[0].ground,
        landB = !old[1].ground;
      if (landA !== landB) {
        const i = landA ? 0 : 1;
        this.actors[i].x = this.legalPosition(
          this.actors[i].x,
          this.actors[1 - i],
          Math.sign(old[i].x - old[1 - i].x) || (i ? -1 : 1),
        );
      } else {
        const order = Math.sign(old[1].x - old[0].x) || 1;
        const mid = Math.max(160, Math.min(1760, (a.x + b.x) / 2));
        a.x = mid - order * 32;
        b.x = mid + order * 32;
      }
      for (const p of this.actors)
        if (p.force) {
          p.force = null;
          p.controlImmune = t + 120;
        }
    }
    for (const p of this.actors)
      if (p.cast && p.cast.generate === t) {
        this.generate(p.cast);
        p.cast = null;
      }
    const intersections: {
      o: ObjectState;
      i: number;
      time: number;
      type: string;
      wall?: ObjectState;
      reflectedHit?: boolean;
    }[] = [];
    for (const o of this.objects) {
      if (o.start > t || o.field || o.skill === "wall") continue;
      const s = BY_ID[o.skill],
        moving = s.kind === "projectile";
      const dx = o.vx / 60,
        dy = o.vy / 60;
      if (moving) {
        const time = this.flightEnd(o, dx, dy);
        if (time !== null)
          intersections.push({ o, i: -1, time, type: "expire" });
      }
      for (let i = 0; i < 2; i++) {
        if (
          i === o.owner ||
          o.hits.includes(i) ||
          (s.ground && !this.actors[i].ground)
        )
          continue;
        const p = this.actors[i],
          ob = box(old[i].x, old[i].y, p.crouch),
          time = moving
            ? sweep(
                o.shape,
                o.x,
                o.y,
                dx,
                dy,
                ob,
                p.x - old[i].x,
                p.y - old[i].y,
              )
            : overlap(o.shape, o.x, o.y, box(p.x, p.y, p.crouch))
              ? 0
              : null;
        if (time !== null) intersections.push({ o, i, time, type: "hit" });
        if (moving && this.reflectable(o) && !o.reflected && p.mirror > t) {
          const mb = { x: ob.x - 20, y: ob.y - 20, w: ob.w + 40, h: ob.h + 40 },
            mt = sweep(
              o.shape,
              o.x,
              o.y,
              dx,
              dy,
              mb,
              p.x - old[i].x,
              p.y - old[i].y,
            );
          if (mt !== null)
            intersections.push({ o, i, time: mt, type: "mirror" });
        }
      }
      if (moving && this.reflectable(o))
        for (const wall of this.objects)
          if (wall.skill === "wall" && wall.owner !== o.owner && wall.end > t) {
            const time = sweep(o.shape, o.x, o.y, dx, dy, this.objectBox(wall));
            if (time !== null)
              intersections.push({
                o,
                i: wall.owner,
                time,
                type: "wall",
                wall,
              });
          }
    }
    const gone = new Set<number>(),
      reflected = new Set<number>();
    const remainder = new Map<number, number>();
    const priorities: any = { expire: -1, wall: 0, mirror: 1, hit: 2 };
    const compare = (
      a: (typeof intersections)[number],
      b: (typeof intersections)[number],
    ) =>
      a.time - b.time ||
      a.o.cast.start - b.o.cast.start ||
      a.o.cast.id - b.o.cast.id ||
      a.o.segment - b.o.segment ||
      priorities[a.type] - priorities[b.type];
    while (intersections.length) {
      intersections.sort(compare);
      const h = intersections.shift()!;
      const o = h.o;
      if (
        this.cancelledSwing.has(o.id) &&
        h.time > this.cancelledSwing.get(o.id)! + 1e-10
      )
        continue;
      if (gone.has(o.id) || (reflected.has(o.id) && !h.reflectedHit)) continue;
      if (h.type === "expire") {
        gone.add(o.id);
        continue;
      }
      if (h.type === "wall") {
        if (h.wall!.uses! <= 0) continue;
        h.wall!.uses!--;
        gone.add(o.id);
        if (h.wall!.uses === 0) gone.add(h.wall!.id);
        this.events.push({ type: "wall", object: o.id });
      } else if (h.type === "mirror") {
        if (this.actors[h.i].mirror <= t) continue;
        o.x += (o.vx / 60) * h.time;
        o.y += (o.vy / 60) * h.time;
        o.travel += (Math.hypot(o.vx, o.vy) / 60) * h.time;
        o.vx = -o.vx;
        o.owner = h.i;
        o.reflected = true;
        this.actors[h.i].mirror = 0;
        reflected.add(o.id);
        const rest = 1 - h.time;
        remainder.set(o.id, rest);
        const target = 1 - o.owner,
          p = this.actors[target],
          previous = old[target];
        const targetBox = box(
          previous.x + (p.x - previous.x) * h.time,
          previous.y + (p.y - previous.y) * h.time,
          p.crouch,
        );
        if (!o.hits.includes(target)) {
          const rt = sweep(
            o.shape,
            o.x,
            o.y,
            (o.vx / 60) * rest,
            (o.vy / 60) * rest,
            targetBox,
            (p.x - previous.x) * rest,
            (p.y - previous.y) * rest,
          );
          if (rt !== null)
            intersections.push({
              o,
              i: target,
              time: h.time + rt * rest,
              type: "hit",
              reflectedHit: true,
            });
        }
        for (const wall of this.objects)
          if (wall.skill === "wall" && wall.owner !== o.owner && wall.end > t) {
            const rt = sweep(
              o.shape,
              o.x,
              o.y,
              (o.vx / 60) * rest,
              (o.vy / 60) * rest,
              this.objectBox(wall),
            );
            if (rt !== null)
              intersections.push({
                o,
                i: wall.owner,
                time: h.time + rt * rest,
                type: "wall",
                wall,
                reflectedHit: true,
              });
          }
        const expiry = this.flightEnd(
          o,
          (o.vx / 60) * rest,
          (o.vy / 60) * rest,
        );
        if (expiry !== null)
          intersections.push({
            o,
            i: -1,
            time: h.time + expiry * rest,
            type: "expire",
            reflectedHit: true,
          });
        this.events.push({ type: "reflect", object: o.id });
      } else {
        o.hits.push(h.i);
        this.damage(o, h.i, h.time);
        if (BY_ID[o.skill].kind === "projectile") gone.add(o.id);
      }
    }
    for (const o of this.objects)
      if (BY_ID[o.skill].kind === "projectile" && !gone.has(o.id)) {
        const fraction = remainder.get(o.id) ?? 1;
        o.x += (o.vx / 60) * fraction;
        o.y += (o.vy / 60) * fraction;
        o.travel += (Math.hypot(o.vx, o.vy) / 60) * fraction;
        const b = this.objectBox(o);
        if (
          o.travel >= BY_ID[o.skill].range! - 1e-8 ||
          b.x + b.w <= 96 ||
          b.x >= 1824 ||
          b.y + b.h <= 0 ||
          (o.skill !== "flame" && b.y + b.h >= 900)
        )
          gone.add(o.id);
      }
    this.objects = this.objects.filter((o) => !gone.has(o.id));
    this.tick++;
    this.elapsed[0]++;
    this.elapsed[1]++;
    if (a.hp === 0 || b.hp === 0) {
      if (this.mode === "PVE")
        this.result = {
          winner: a.hp > 0 ? 0 : 1,
          reason: a.hp === 0 ? "death" : "defeat",
        };
      else
        this.result = {
          winner: a.hp === b.hp ? null : a.hp > 0 ? 0 : 1,
          reason: "ko",
        };
    } else if (this.mode !== "PRACTICE" && this.tick >= this.deadline) {
      if (this.mode === "PVE") this.result = { winner: 1, reason: "timeout" };
      else if (a.hp !== b.hp)
        this.result = { winner: a.hp > b.hp ? 0 : 1, reason: "timeout" };
      else if (!this.overtime) {
        this.overtime = true;
        this.deadline += 900;
      } else this.result = { winner: null, reason: "draw" };
    }
    // Bound bookkeeping by currently active casts. Keep history separately for statistics.
    if (this.tick % 600 === 0) {
      const active = new Set(this.objects.map((o) => o.cast.id));
      for (const k of this.hitCounts.keys())
        if (!active.has(Number(k.split(":")[0]))) this.hitCounts.delete(k);
      for (const k of this.blockedCasts)
        if (!active.has(Number(k.split(":")[0]))) this.blockedCasts.delete(k);
    }
  }
  publicState(viewer: number | null) {
    return {
      rulesVersion: RULES_VERSION,
      tick: this.tick,
      elapsed: this.elapsed,
      remaining:
        this.mode === "PRACTICE"
          ? null
          : Math.max(0, (this.deadline - this.tick) / 60),
      overtime: this.overtime,
      result: this.result,
      aids: this.mode === "PRACTICE" ? this.aids : undefined,
      actors: this.actors.map((a, i) => ({
        x: a.x,
        y: a.y,
        vy: a.vy,
        dir: a.dir,
        hp: a.hp,
        qi: a.qi / 120,
        shield: a.shield,
        ground: a.ground,
        crouch: a.crouch,
        blocking: this.blocking(a),
        imbalance: Math.max(0, (a.imbalance - this.tick) / 60),
        root: Math.max(0, (a.root - this.tick) / 60),
        stun: Math.max(0, (a.stun - this.tick) / 60),
        busy: Math.max(0, (a.busy - this.tick) / 60),
        blockStop: Math.max(0, (a.blockStop - this.tick) / 60),
        forced: !!a.force,
        slow: this.slow(a, i),
        mirror: a.mirror > this.tick,
        resolve: a.resolve > this.tick,
        budget: a.resolve > this.tick ? a.budget : 0,
        cast: a.cast,
        loadout: {
          ...a.loadout,
          ultimate: i === viewer || a.revealed ? a.loadout.ultimate : null,
        },
        cooldowns: Object.fromEntries(
          Object.entries(a.cooldowns)
            .filter(
              ([id]) =>
                BY_ID[id].slot !== "ultimate" || i === viewer || a.revealed,
            )
            .map(([id, end]) => [id, Math.max(0, (end - this.tick) / 60)]),
        ),
        revealed: a.revealed,
        label: a.input.label,
        labels: [...a.input.labels],
      })),
      objects: this.objects,
    };
  }
}
