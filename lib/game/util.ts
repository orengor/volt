import type { EdgeKind, Vec2 } from "./types";

export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function rand() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function dist(ax: number, az: number, bx: number, bz: number) {
  return Math.hypot(ax - bx, az - bz);
}

export function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

export function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

export function formatGameClock(gameMinutes: number, startHour = 18) {
  const total = Math.floor(startHour * 60 + gameMinutes);
  const h = Math.floor(total / 60) % 24;
  const m = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function formatDue(gameMinutesLeft: number) {
  if (gameMinutesLeft <= 0) return "Over an hour late";
  const m = Math.max(1, Math.ceil(gameMinutesLeft));
  if (m <= 12) return `${m} min — slipping`;
  return `${m} min left`;
}

export function hexColor(n: number) {
  return `#${n.toString(16).padStart(6, "0")}`;
}

export function speedForKind(kind: EdgeKind, base: number, boulevard: number, highway: number) {
  if (kind === "highway") return highway;
  if (kind === "boulevard") return boulevard;
  if (kind === "promenade") return base * 0.92;
  return base;
}

export function lerpAngle(a: number, b: number, t: number) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

export function simplifyPath(points: Vec2[], minDist: number): Vec2[] {
  if (points.length < 2) return points.slice();
  const out: Vec2[] = [points[0]];
  for (let i = 1; i < points.length; i++) {
    const last = out[out.length - 1];
    if (dist(last.x, last.z, points[i].x, points[i].z) >= minDist) out.push(points[i]);
  }
  const end = points[points.length - 1];
  const last = out[out.length - 1];
  if (last.x !== end.x || last.z !== end.z) out.push(end);
  return out;
}

export function resampleDots(points: Vec2[], spacing: number): Vec2[] {
  if (points.length === 0) return [];
  const dots: Vec2[] = [{ ...points[0] }];
  let carry = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const ax = points[i].x;
    const az = points[i].z;
    const bx = points[i + 1].x;
    const bz = points[i + 1].z;
    const len = dist(ax, az, bx, bz);
    if (len < 0.0001) continue;
    let d = spacing - carry;
    while (d < len) {
      const t = d / len;
      dots.push({ x: ax + (bx - ax) * t, z: az + (bz - az) * t });
      d += spacing;
    }
    carry = len - (d - spacing);
  }
  return dots;
}
