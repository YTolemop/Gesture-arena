import { Shape } from "./skills.js";
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}
export const box = (x: number, y: number, crouch = false): Box => ({
  x: x - 32,
  y: y - (crouch ? 80 : 144),
  w: 64,
  h: crouch ? 80 : 144,
});
export function overlap(shape: Shape, x: number, y: number, b: Box) {
  if (shape.kind === "rect")
    return (
      x + shape.w / 2 > b.x &&
      x - shape.w / 2 < b.x + b.w &&
      y + shape.h / 2 > b.y &&
      y - shape.h / 2 < b.y + b.h
    );
  const dx = x - Math.max(b.x, Math.min(x, b.x + b.w)),
    dy = y - Math.max(b.y, Math.min(y, b.y + b.h));
  return dx * dx + dy * dy < shape.r * shape.r;
}
export function shapesOverlap(
  a: Shape,
  x: number,
  y: number,
  b: Shape,
  bx: number,
  by: number,
) {
  if (a.kind === "circle" && b.kind === "circle")
    return (x - bx) ** 2 + (y - by) ** 2 < (a.r + b.r) ** 2;
  if (b.kind === "rect")
    return overlap(a, x, y, {
      x: bx - b.w / 2,
      y: by - b.h / 2,
      w: b.w,
      h: b.h,
    });
  return overlap(b, bx, by, {
    x: x - (a as { w: number }).w / 2,
    y: y - (a as { h: number }).h / 2,
    w: (a as { w: number }).w,
    h: (a as { h: number }).h,
  });
}
// Relative linear swept circle/rectangle against a translating box. Circle uses
// rounded rectangle (faces + corner quadratics), never its bounding rectangle.
export function sweep(
  shape: Shape,
  x: number,
  y: number,
  dx: number,
  dy: number,
  b: Box,
  bDx = 0,
  bDy = 0,
): number | null {
  dx -= bDx;
  dy -= bDy;
  if (overlap(shape, x, y, b)) return 0;
  const candidates: number[] = [];
  const slab = (loX: number, hiX: number, loY: number, hiY: number) => {
    let lo = 0,
      hi = 1;
    for (const [p, d, mn, mx] of [
      [x, dx, loX, hiX],
      [y, dy, loY, hiY],
    ]) {
      if (d === 0) {
        if (p <= mn || p >= mx) return;
      } else {
        const a = (mn - p) / d,
          z = (mx - p) / d;
        lo = Math.max(lo, Math.min(a, z));
        hi = Math.min(hi, Math.max(a, z));
      }
    }
    if (lo < hi && lo < 1 && hi > 0) candidates.push(Math.max(0, lo));
  };
  if (shape.kind === "rect")
    slab(
      b.x - shape.w / 2,
      b.x + b.w + shape.w / 2,
      b.y - shape.h / 2,
      b.y + b.h + shape.h / 2,
    );
  else {
    const r = shape.r;
    slab(b.x - r, b.x + b.w + r, b.y, b.y + b.h);
    slab(b.x, b.x + b.w, b.y - r, b.y + b.h + r);
    for (const cx of [b.x, b.x + b.w])
      for (const cy of [b.y, b.y + b.h]) {
        const ox = x - cx,
          oy = y - cy,
          a = dx * dx + dy * dy,
          q = 2 * (ox * dx + oy * dy),
          z = ox * ox + oy * oy - r * r,
          disc = q * q - 4 * a * z;
        if (a > 0 && disc > 0) {
          const t = (-q - Math.sqrt(disc)) / (2 * a);
          if (t >= 0 && t < 1) candidates.push(t);
        }
      }
  }
  return candidates.length ? Math.min(...candidates) : null;
}
