import { Label, ONCE } from "../protocol/index.js";
export class InputRouter {
  labels = new Set<Label>();
  get label(): Label { return this.labels.values().next().value ?? "NONE"; }
  has(label: Label) { return this.labels.has(label); }
  lastTick = -Infinity;
  needsNone = true;
  armed = new Set<Label>();
  left = new Map<Label, number>();
  pending: Label[] = [];
  reset() {
    this.labels.clear(); this.lastTick = -Infinity; this.needsNone = true;
    this.armed.clear(); this.left.clear(); this.pending = [];
  }
  receive(value: Label | Label[], tick: number) {
    this.advance(tick);
    this.lastTick = tick;
    const next = new Set<Label>((Array.isArray(value) ? value : [value]).filter(x => x !== "NONE").slice(0, 2));
    if (this.needsNone) {
      if (next.size) return;
      this.needsNone = false;
      for (const a of ONCE) this.left.set(a, tick);
    }
    for (const old of this.labels)
      if (!next.has(old) && ONCE.includes(old)) this.left.set(old, tick);
    for (const label of next) {
      if (!this.labels.has(label) && ONCE.includes(label)) {
        if (this.armed.has(label)) {
          if (this.pending.length < 2 && !this.pending.includes(label)) this.pending.push(label);
          this.armed.delete(label);
        }
        this.left.delete(label);
      }
    }
    this.labels = next;
  }
  advance(tick: number) {
    for (const [a, t] of this.left)
      if (tick - t >= 6) { this.armed.add(a); this.left.delete(a); }
    if (tick - this.lastTick > 30) {
      for (const label of this.labels) if (ONCE.includes(label)) this.left.set(label, tick);
      this.labels.clear(); this.pending = [];
    }
  }
  consume() { const p = this.pending; this.pending = []; return p; }
}
