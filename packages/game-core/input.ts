import { Label, ONCE } from "../protocol/index.js";
export class InputRouter {
  label: Label = "NONE";
  lastTick = -Infinity;
  needsNone = true;
  armed = new Set<Label>(ONCE);
  left = new Map<Label, number>();
  pending: Label[] = [];
  reset() {
    this.label = "NONE";
    this.lastTick = -Infinity;
    this.needsNone = true;
    this.armed.clear();
    this.left.clear();
    this.pending = [];
  }
  receive(label: Label, tick: number) {
    this.advance(tick);
    this.lastTick = tick;
    if (this.needsNone) {
      if (label !== "NONE") return;
      this.needsNone = false;
      for (const a of ONCE) this.left.set(a, tick);
    }
    if (label !== this.label) {
      if (ONCE.includes(this.label)) this.left.set(this.label, tick);
      if (ONCE.includes(label)) {
        if (this.armed.has(label)) {
          this.pending.push(label);
          this.armed.delete(label);
        }
        this.left.delete(label);
      }
      this.label = label;
    }
  }
  advance(tick: number) {
    for (const [a, t] of this.left)
      if (tick - t >= 6) {
        this.armed.add(a);
        this.left.delete(a);
      }
    if (tick - this.lastTick > 30 && this.label !== "NONE") {
      if (ONCE.includes(this.label)) this.left.set(this.label, tick);
      this.label = "NONE";
    }
  }
  consume() {
    const p = this.pending;
    this.pending = [];
    return p;
  }
}
