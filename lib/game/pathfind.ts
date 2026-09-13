import type { CityData, EdgeKind, Vec2 } from "./types";
import { dist } from "./util";

export type PathStep = { id: string; kind: EdgeKind };

export type GraphSnap = {
  x: number;
  z: number;
  a: string;
  b: string;
  t: number;
  dist: number;
};

export function nearestOnGraph(city: CityData, x: number, z: number): GraphSnap {
  let best: GraphSnap = {
    x: city.nodes[0]?.x ?? x,
    z: city.nodes[0]?.z ?? z,
    a: city.nodes[0]?.id ?? "",
    b: city.nodes[0]?.id ?? "",
    t: 0,
    dist: Infinity,
  };
  for (const e of city.edges) {
    const na = city.nodeById[e.a];
    const nb = city.nodeById[e.b];
    if (!na || !nb) continue;
    const dx = nb.x - na.x;
    const dz = nb.z - na.z;
    const len2 = dx * dx + dz * dz || 1;
    let t = ((x - na.x) * dx + (z - na.z) * dz) / len2;
    t = Math.max(0, Math.min(1, t));
    const px = na.x + dx * t;
    const pz = na.z + dz * t;
    const d = dist(x, z, px, pz);
    if (d < best.dist) best = { x: px, z: pz, a: e.a, b: e.b, t, dist: d };
  }
  return best;
}

export function findPath(city: CityData, fromId: string, toId: string): PathStep[] {
  if (fromId === toId) return [{ id: fromId, kind: "street" }];
  const open: string[] = [fromId];
  const came: Record<string, string> = {};
  const cameKind: Record<string, EdgeKind> = {};
  const g: Record<string, number> = { [fromId]: 0 };
  const inOpen = new Set([fromId]);
  const closed = new Set<string>();
  const dest = city.nodeById[toId];
  if (!dest || !city.nodeById[fromId]) return [{ id: fromId, kind: "street" }];

  while (open.length) {
    let bi = 0;
    let bv = Infinity;
    for (let i = 0; i < open.length; i++) {
      const id = open[i];
      const n = city.nodeById[id];
      const h = Math.hypot(n.x - dest.x, n.z - dest.z);
      const f = (g[id] ?? Infinity) + h;
      if (f < bv) {
        bv = f;
        bi = i;
      }
    }
    const current = open.splice(bi, 1)[0];
    inOpen.delete(current);
    if (current === toId) break;
    closed.add(current);
    for (const e of city.adj[current] ?? []) {
      if (closed.has(e.to)) continue;
      const penalty = e.kind === "highway" ? 0.72 : e.kind === "boulevard" ? 0.88 : 1;
      const ng = (g[current] ?? Infinity) + e.length * penalty;
      if (ng < (g[e.to] ?? Infinity)) {
        g[e.to] = ng;
        came[e.to] = current;
        cameKind[e.to] = e.kind;
        if (!inOpen.has(e.to)) {
          open.push(e.to);
          inOpen.add(e.to);
        }
      }
    }
  }

  if (!came[toId] && fromId !== toId) {
    return [{ id: fromId, kind: "street" }];
  }

  const ids: PathStep[] = [];
  let c: string | undefined = toId;
  while (c) {
    ids.push({ id: c, kind: cameKind[c] ?? "street" });
    if (c === fromId) break;
    c = came[c];
  }
  ids.reverse();
  if (ids[0]?.id !== fromId) ids.unshift({ id: fromId, kind: "street" });
  return ids;
}

export function pathWorld(city: CityData, steps: PathStep[]): (Vec2 & { kind: EdgeKind })[] {
  return steps.map((s) => {
    const n = city.nodeById[s.id];
    return { x: n.x, z: n.z, kind: s.kind };
  });
}

export function pathLength(city: CityData, steps: PathStep[]) {
  let len = 0;
  for (let i = 0; i < steps.length - 1; i++) {
    const a = city.nodeById[steps[i].id];
    const b = city.nodeById[steps[i + 1].id];
    len += Math.hypot(a.x - b.x, a.z - b.z);
  }
  return len;
}

export function routeOnStreets(city: CityData, fromX: number, fromZ: number, toX: number, toZ: number): Vec2[] {
  const snap = nearestOnGraph(city, fromX, fromZ);
  const dest = (() => {
    let best = city.nodes[0];
    let bestD = Infinity;
    for (const n of city.nodes) {
      const d = dist(toX, toZ, n.x, n.z);
      if (d < bestD) {
        bestD = d;
        best = n;
      }
    }
    return best;
  })();

  const pathA = findPath(city, snap.a, dest.id);
  const pathB = findPath(city, snap.b, dest.id);
  const na = city.nodeById[snap.a];
  const nb = city.nodeById[snap.b];
  const reachA = pathA.length > 1 || snap.a === dest.id;
  const reachB = pathB.length > 1 || snap.b === dest.id;
  const costA = reachA ? dist(snap.x, snap.z, na.x, na.z) + pathLength(city, pathA) : Infinity;
  const costB = reachB ? dist(snap.x, snap.z, nb.x, nb.z) + pathLength(city, pathB) : Infinity;
  const chosen = costA <= costB ? pathA : pathB;
  const via = costA <= costB ? na : nb;
  if (chosen.length <= 1 && dest.id !== (costA <= costB ? snap.a : snap.b)) {
    return [{ x: snap.x, z: snap.z }];
  }
  const world = pathWorld(city, chosen);
  const trail: Vec2[] = [{ x: snap.x, z: snap.z }];
  if (dist(snap.x, snap.z, via.x, via.z) > 0.12) trail.push({ x: via.x, z: via.z });
  for (const p of world) {
    const last = trail[trail.length - 1];
    if (dist(last.x, last.z, p.x, p.z) > 0.12) trail.push({ x: p.x, z: p.z });
  }
  return trail;
}
