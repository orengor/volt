import type {
  BuildingSpec,
  CityData,
  CustomerSpot,
  EdgeKind,
  LandmarkSpec,
  MapEdge,
  MapNode,
  NeighborhoodId,
  Restaurant,
  TreeSpec,
  Vec2,
} from "./types";
import { dist, mulberry32 } from "./util";
import { HUB_NODE_HINT } from "./constants";

export function coastX(z: number) {
  const jaffa = z < -52 ? -9 * Math.max(0, (-52 - z) / 42) : 0;
  const portNotch = z > 20 && z < 50 ? -5.5 * Math.sin(((z - 20) / 30) * Math.PI) : 0;
  const wave = 2.4 * Math.sin(z * 0.055) + 1.1 * Math.sin(z * 0.17 + 0.8);
  return -51 + wave + jaffa + portNotch;
}

export function hayarkonX(z: number) {
  return coastX(z) + 8.6;
}

export function benYehudaX(z: number) {
  return coastX(z) + 16.8;
}

export function ibnX(z: number) {
  return 1.8 - z * 0.048;
}

export function namirX(z: number) {
  return 20.2 + z * 0.02 + Math.sin(z * 0.038) * 0.9;
}

export function ayalonX(z: number) {
  return 34.1 + z * 0.03 + Math.sin(z * 0.026) * 1.25;
}

export function inYarkonPark(x: number, z: number) {
  return z > 50 && z < 78 && x > coastX(z) + 2 && x < ayalonX(z) + 4;
}

export function inAyalon(x: number, z: number) {
  return Math.abs(x - ayalonX(z)) < 4.4 && z > -88 && z < 88;
}

export function onLand(x: number, z: number) {
  return x > coastX(z) + 0.8 && z > -92 && z < 92 && x < 62;
}

export function neighborhoodAt(x: number, z: number): NeighborhoodId {
  if (z < -48) return "jaffa";
  if (z < -26 && x < 28) return "florentin";
  if (z > 48) return "yarkon";
  if (z > 16 && x < -18) return "port";
  if (x > 22) return "east";
  if (z < -4 && x < 16) return "rothschild";
  return "dizengoff";
}

const HOOD_BUILD: Record<
  NeighborhoodId,
  { colors: number[]; roofs: number[]; h0: number; h1: number }
> = {
  jaffa: { colors: [0xd4b896, 0xc4a070, 0xe6d0ae, 0xb98a62], roofs: [0x8a5a3a, 0xa56b42], h0: 4.2, h1: 10.5 },
  florentin: { colors: [0xc4785a, 0xa66a4e, 0xd9a078, 0x8d6b55], roofs: [0x5c4030, 0x704838], h0: 5, h1: 12 },
  rothschild: { colors: [0xf0e4d4, 0xe4d5c2, 0xddd0bf, 0xf7efe4], roofs: [0xb9a48c, 0x9d8a74], h0: 11, h1: 22 },
  dizengoff: { colors: [0xeee6da, 0xf6f1e8, 0xe2d8cc, 0xf3eadc], roofs: [0xc8b8a4, 0xab9a86], h0: 8, h1: 16.5 },
  port: { colors: [0xc5d0d4, 0xb7c4c8, 0xd8e0e2, 0x9aaab0], roofs: [0x6d7c82, 0x55656c], h0: 6, h1: 14 },
  yarkon: { colors: [0xe8efe4, 0xd5e0d2, 0xf2f4ee], roofs: [0x8aa48c, 0x6f8a74], h0: 6, h1: 13 },
  east: { colors: [0x8aa4b8, 0xc5d0d8, 0x9bb0be, 0xd7dee4], roofs: [0x4e6270, 0x6a7e8c], h0: 14, h1: 36 },
};

type StreetDef = { name: string; kind: EdgeKind; pts: Vec2[]; spacing?: number };

function densify(pts: Vec2[], spacing: number): Vec2[] {
  if (pts.length < 2) return pts.slice();
  const out: Vec2[] = [{ ...pts[0] }];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const len = dist(a.x, a.z, b.x, b.z);
    const n = Math.max(1, Math.round(len / spacing));
    for (let k = 1; k <= n; k++) {
      const t = k / n;
      out.push({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t });
    }
  }
  return out;
}

function sampleZ(z0: number, z1: number, step: number, xOf: (z: number) => number): Vec2[] {
  const pts: Vec2[] = [];
  const dir = z1 >= z0 ? 1 : -1;
  for (let z = z0; dir > 0 ? z <= z1 : z >= z1; z += step * dir) {
    pts.push({ x: xOf(z), z });
  }
  const end = { x: xOf(z1), z: z1 };
  const last = pts[pts.length - 1];
  if (!last || dist(last.x, last.z, end.x, end.z) > 0.2) pts.push(end);
  return pts;
}

function segIntersect(a: Vec2, b: Vec2, c: Vec2, d: Vec2) {
  const rx = b.x - a.x;
  const rz = b.z - a.z;
  const sx = d.x - c.x;
  const sz = d.z - c.z;
  const den = rx * sz - rz * sx;
  if (Math.abs(den) < 1e-7) return null;
  const qx = c.x - a.x;
  const qz = c.z - a.z;
  const t = (qx * sz - qz * sx) / den;
  const u = (qx * rz - qz * rx) / den;
  if (t < 0.06 || t > 0.94 || u < 0.06 || u > 0.94) return null;
  return { x: a.x + t * rx, z: a.z + t * rz };
}

class GraphBuilder {
  nodes: MapNode[] = [];
  nodeById: Record<string, MapNode> = {};
  edges: MapEdge[] = [];
  private seenEdge = new Set<string>();
  private aliases: Record<string, string> = {};
  private seq = 0;

  resolve(id: string) {
    return this.aliases[id] ?? id;
  }

  private mergeAt(x: number, z: number, r = 2.05): MapNode | null {
    let best: MapNode | null = null;
    let bestD = r;
    for (const n of this.nodes) {
      const d = dist(x, z, n.x, n.z);
      if (d < bestD) {
        bestD = d;
        best = n;
      }
    }
    return best;
  }

  addNode(id: string, x: number, z: number, label?: string) {
    const existing = this.nodeById[id];
    if (existing) return existing;
    const hit = this.mergeAt(x, z);
    if (hit) {
      this.aliases[id] = hit.id;
      if (label && hit.label && hit.label !== label && !hit.label.includes(label)) {
        hit.label = `${hit.label} & ${label}`;
      } else if (label && !hit.label) {
        hit.label = label;
      }
      return hit;
    }
    const n: MapNode = { id, x, z, label };
    this.nodes.push(n);
    this.nodeById[id] = n;
    return n;
  }

  addEdge(a0: string, b0: string, kind: EdgeKind) {
    const a = this.resolve(a0);
    const b = this.resolve(b0);
    if (!this.nodeById[a] || !this.nodeById[b] || a === b) return;
    const id = a < b ? `${a}|${b}` : `${b}|${a}`;
    if (this.seenEdge.has(id)) return;
    this.seenEdge.add(id);
    this.edges.push({ id, a, b, kind });
  }

  addStreet(name: string, kind: EdgeKind, pts: Vec2[], spacing = 6.4) {
    const dense = densify(
      pts.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.z)),
      spacing
    ).filter((p) => onLand(p.x, p.z) || kind === "promenade" || kind === "highway");
    const ids: string[] = [];
    dense.forEach((p, i) => {
      const id = `${name.replace(/\s+/g, "-").toLowerCase()}-${this.seq++}`;
      const skipPark = inYarkonPark(p.x, p.z) && kind !== "highway" && !/Ibn|Namir|HaYarkon|Rokach|Reading/i.test(name);
      if (skipPark) return;
      if (kind !== "highway" && kind !== "promenade" && !onLand(p.x, p.z)) return;
      const n = this.addNode(id, p.x, p.z, name);
      ids.push(n.id);
    });
    for (let i = 0; i < ids.length - 1; i++) {
      const a = this.nodeById[ids[i]];
      const b = this.nodeById[ids[i + 1]];
      if (!a || !b) continue;
      if (dist(a.x, a.z, b.x, b.z) > spacing * 2.8) continue;
      this.addEdge(ids[i], ids[i + 1], kind);
    }
    return ids;
  }

  splitCrossings() {
    for (let pass = 0; pass < 5; pass++) {
      let split = 0;
      const list = this.edges.slice();
      for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length; j++) {
          const e1 = list[i];
          const e2 = list[j];
          if (!e1 || !e2) continue;
          if (e1.a === e2.a || e1.a === e2.b || e1.b === e2.a || e1.b === e2.b) continue;
          const a = this.nodeById[e1.a];
          const b = this.nodeById[e1.b];
          const c = this.nodeById[e2.a];
          const d = this.nodeById[e2.b];
          if (!a || !b || !c || !d) continue;
          const hit = segIntersect(a, b, c, d);
          if (!hit) continue;
          const n = this.addNode(`x-${this.seq++}`, hit.x, hit.z, undefined);
          this.removeEdge(e1.id);
          this.removeEdge(e2.id);
          this.addEdge(e1.a, n.id, e1.kind);
          this.addEdge(n.id, e1.b, e1.kind);
          this.addEdge(e2.a, n.id, e2.kind);
          this.addEdge(n.id, e2.b, e2.kind);
          split += 1;
        }
      }
      if (!split) break;
    }
  }

  private removeEdge(id: string) {
    this.edges = this.edges.filter((e) => e.id !== id);
    this.seenEdge.delete(id);
  }

  adjacency() {
    const adj: CityData["adj"] = {};
    for (const n of this.nodes) adj[n.id] = [];
    for (const e of this.edges) {
      const na = this.nodeById[e.a];
      const nb = this.nodeById[e.b];
      const length = dist(na.x, na.z, nb.x, nb.z);
      adj[e.a].push({ to: e.b, kind: e.kind, length });
      adj[e.b].push({ to: e.a, kind: e.kind, length });
    }
    return adj;
  }

  stitchOrphans(maxDist = 12) {
    const adj = this.adjacency();
    const unseen = new Set(this.nodes.map((n) => n.id));
    const comps: string[][] = [];
    for (const start of this.nodes.map((n) => n.id)) {
      if (!unseen.has(start)) continue;
      unseen.delete(start);
      const q = [start];
      const comp = [start];
      while (q.length) {
        const cur = q.pop()!;
        for (const e of adj[cur] ?? []) {
          if (unseen.has(e.to)) {
            unseen.delete(e.to);
            q.push(e.to);
            comp.push(e.to);
          }
        }
      }
      comps.push(comp);
    }
    comps.sort((a, b) => b.length - a.length);
    const main = new Set(comps[0] ?? []);
    for (const comp of comps.slice(1)) {
      let bestA = "";
      let bestB = "";
      let bestD = maxDist;
      for (const id of comp) {
        const n = this.nodeById[id];
        for (const m of this.nodes) {
          if (!main.has(m.id)) continue;
          const d = dist(n.x, n.z, m.x, m.z);
          if (d < bestD) {
            bestD = d;
            bestA = id;
            bestB = m.id;
          }
        }
      }
      if (bestA && bestB) {
        this.addEdge(bestA, bestB, "street");
        for (const id of comp) main.add(id);
      }
    }
  }
}

export function generateCity(seed = 7): CityData {
  const rand = mulberry32(seed);
  const g = new GraphBuilder();

  const dizengoffCircle = { x: -23.2, z: 8.5, r: 4.6 };
  const streets: StreetDef[] = [
    {
      name: "Tayelet",
      kind: "promenade",
      spacing: 8,
      pts: sampleZ(-86, 50, 8, (z) => coastX(z) + 2.3),
    },
    {
      name: "Tayelet North",
      kind: "promenade",
      spacing: 8,
      pts: sampleZ(74, 88, 8, (z) => coastX(z) + 2.3),
    },
    {
      name: "HaYarkon",
      kind: "street",
      spacing: 6.2,
      pts: sampleZ(-58, 52, 5.5, hayarkonX),
    },
    {
      name: "Ben Yehuda",
      kind: "street",
      spacing: 6.4,
      pts: sampleZ(-22, 46, 5.8, benYehudaX),
    },
    {
      name: "Dizengoff",
      kind: "boulevard",
      spacing: 5.8,
      pts: [
        { x: -16.4, z: -11.5 },
        { x: -18.8, z: -4.2 },
        { x: -21.4, z: 2.4 },
        { x: dizengoffCircle.x, z: dizengoffCircle.z },
        { x: -24.6, z: 16.2 },
        { x: -26.4, z: 24.5 },
        { x: -27.8, z: 34.2 },
      ],
    },
    {
      name: "Ibn Gabirol",
      kind: "street",
      spacing: 6,
      pts: sampleZ(-22, 78, 6, ibnX),
    },
    {
      name: "Namir",
      kind: "street",
      spacing: 6.5,
      pts: sampleZ(-12, 80, 6.2, namirX),
    },
    {
      name: "Ayalon Hwy",
      kind: "highway",
      spacing: 8,
      pts: sampleZ(-86, 88, 7.5, ayalonX),
    },
    {
      name: "Yigal Allon",
      kind: "street",
      spacing: 8,
      pts: [
        { x: 47.2, z: -48 },
        { x: 46.4, z: -18 },
        { x: 45.8, z: 4.8 },
        { x: 46.6, z: 22 },
        { x: 48.2, z: 48 },
      ],
    },
    {
      name: "Rothschild Blvd",
      kind: "boulevard",
      spacing: 5.4,
      pts: [
        { x: -26.5, z: -44.5 },
        { x: -18.2, z: -34.8 },
        { x: -10.6, z: -24.2 },
        { x: -4.2, z: -14.6 },
        { x: 1.4, z: -5.2 },
        { x: 6.2, z: 2.4 },
      ],
    },
    {
      name: "Allenby",
      kind: "street",
      spacing: 5.6,
      pts: [
        { x: hayarkonX(-16) - 6.5, z: -15.2 },
        { x: hayarkonX(-17), z: -16.4 },
        { x: benYehudaX(-18), z: -18.2 },
        { x: -18.4, z: -21.6 },
        { x: -10.8, z: -27.4 },
        { x: -4.6, z: -36.8 },
        { x: -12.4, z: -48.5 },
        { x: -18.8, z: -58.2 },
      ],
    },
    {
      name: "King George",
      kind: "street",
      spacing: 5.5,
      pts: [
        { x: -18.4, z: -21.6 },
        { x: -19.6, z: -12.4 },
        { x: -21.2, z: -2.8 },
        { x: dizengoffCircle.x + 1.4, z: dizengoffCircle.z - 3.2 },
        { x: dizengoffCircle.x, z: dizengoffCircle.z },
      ],
    },
    {
      name: "Kaplan",
      kind: "street",
      spacing: 6,
      pts: [
        { x: -10.4, z: 3.2 },
        { x: ibnX(4.6), z: 4.6 },
        { x: 12.4, z: 5.4 },
        { x: namirX(5.8), z: 5.8 },
        { x: ayalonX(5.2) - 2, z: 5.2 },
        { x: ayalonX(4.8), z: 4.8 },
      ],
    },
    {
      name: "HaShalom",
      kind: "street",
      spacing: 5.5,
      pts: [
        { x: namirX(5.8), z: 5.8 },
        { x: 28.4, z: 5.1 },
        { x: ayalonX(4.8), z: 4.8 },
        { x: 45.8, z: 4.8 },
      ],
    },
    {
      name: "Arlozorov",
      kind: "street",
      spacing: 6,
      pts: [
        { x: hayarkonX(16.4), z: 16.4 },
        { x: benYehudaX(16.8), z: 16.8 },
        { x: -24.8, z: 17.1 },
        { x: ibnX(17.6), z: 17.6 },
        { x: namirX(18.2), z: 18.2 },
        { x: ayalonX(18.6), z: 18.6 },
      ],
    },
    {
      name: "Nordau",
      kind: "boulevard",
      spacing: 6.2,
      pts: [
        { x: hayarkonX(33.5), z: 33.5 },
        { x: benYehudaX(33.8), z: 33.8 },
        { x: -27.8, z: 34.2 },
        { x: ibnX(34.6) - 6, z: 34.4 },
      ],
    },
    {
      name: "Bograshov",
      kind: "street",
      spacing: 6,
      pts: [
        { x: hayarkonX(-0.8), z: -0.8 },
        { x: benYehudaX(-0.2), z: -0.2 },
        { x: -20.2, z: 0.8 },
        { x: -16.8, z: 1.4 },
      ],
    },
    {
      name: "Frishman",
      kind: "street",
      spacing: 6,
      pts: [
        { x: hayarkonX(5.6), z: 5.6 },
        { x: benYehudaX(6.0), z: 6.0 },
        { x: dizengoffCircle.x - 3.2, z: dizengoffCircle.z - 1.2 },
        { x: ibnX(6.4) - 4, z: 6.8 },
      ],
    },
    {
      name: "Yirmiyahu",
      kind: "street",
      spacing: 6.5,
      pts: [
        { x: hayarkonX(43.5), z: 43.5 },
        { x: benYehudaX(43.8), z: 43.8 },
        { x: ibnX(44.2), z: 44.2 },
        { x: namirX(44.6), z: 44.6 },
      ],
    },
    {
      name: "Reading",
      kind: "street",
      spacing: 6.5,
      pts: sampleZ(74, 86, 6, hayarkonX),
    },
    {
      name: "Rokach",
      kind: "street",
      spacing: 7,
      pts: [
        { x: hayarkonX(76.4), z: 76.4 },
        { x: ibnX(76.8), z: 76.8 },
        { x: namirX(77.2), z: 77.2 },
        { x: ayalonX(77.6), z: 77.6 },
      ],
    },
    {
      name: "Salame",
      kind: "street",
      spacing: 6.2,
      pts: [
        { x: -22.4, z: -43.2 },
        { x: -8.6, z: -44.6 },
        { x: 6.4, z: -45.4 },
        { x: namirX(-46) - 4, z: -45.8 },
        { x: ayalonX(-46.4), z: -46.4 },
      ],
    },
    {
      name: "Florentin",
      kind: "street",
      spacing: 5.8,
      pts: [
        { x: -18.8, z: -36.4 },
        { x: -9.2, z: -34.8 },
        { x: 1.4, z: -33.2 },
        { x: 10.6, z: -35.6 },
      ],
    },
    {
      name: "Abarbanel",
      kind: "street",
      spacing: 5.4,
      pts: [
        { x: -14.2, z: -48.8 },
        { x: -11.6, z: -40.2 },
        { x: -8.8, z: -32.6 },
      ],
    },
    {
      name: "Vital",
      kind: "street",
      spacing: 5.2,
      pts: [
        { x: -6.4, z: -50.2 },
        { x: -4.2, z: -41.4 },
        { x: -1.8, z: -32.8 },
      ],
    },
    {
      name: "Yefet",
      kind: "street",
      spacing: 5.5,
      pts: [
        { x: -36.8, z: -86.2 },
        { x: -30.4, z: -78.4 },
        { x: -27.8, z: -73.6 },
        { x: -22.6, z: -62.4 },
        { x: -18.8, z: -54.2 },
      ],
    },
    {
      name: "Kedem",
      kind: "street",
      spacing: 6,
      pts: [
        { x: coastX(-80) + 5, z: -80.4 },
        { x: -34.2, z: -76.8 },
        { x: -24.6, z: -72.2 },
      ],
    },
    {
      name: "Pasteur",
      kind: "street",
      spacing: 6,
      pts: [
        { x: hayarkonX(-68), z: -68 },
        { x: -24.8, z: -70.4 },
        { x: -14.2, z: -69.2 },
      ],
    },
    {
      name: "Begin",
      kind: "street",
      spacing: 7,
      pts: [
        { x: ayalonX(-28) - 7.4, z: -28 },
        { x: ayalonX(-8) - 7.8, z: -8 },
        { x: ayalonX(6) - 8.2, z: 6.2 },
        { x: ayalonX(18) - 8.4, z: 18.4 },
      ],
    },
    {
      name: "Weizmann",
      kind: "street",
      spacing: 6.5,
      pts: [
        { x: 9.4, z: -16.8 },
        { x: 8.2, z: -4.4 },
        { x: 10.6, z: 5.2 },
        { x: 11.8, z: 14.6 },
      ],
    },
    {
      name: "Namal",
      kind: "street",
      spacing: 5.5,
      pts: [
        { x: hayarkonX(31.4), z: 31.4 },
        { x: coastX(32) + 4.2, z: 32.6 },
        { x: coastX(36) + 3.4, z: 37.2 },
        { x: hayarkonX(38.2), z: 38.2 },
      ],
    },
    {
      name: "Lilienblum",
      kind: "street",
      spacing: 5.4,
      pts: [
        { x: -22.8, z: -30.4 },
        { x: -12.6, z: -28.8 },
        { x: -4.8, z: -26.2 },
      ],
    },
    {
      name: "Ahad Ha'am",
      kind: "street",
      spacing: 5.6,
      pts: [
        { x: -16.2, z: -18.4 },
        { x: -6.8, z: -16.2 },
        { x: 2.4, z: -14.6 },
      ],
    },
    {
      name: "Montefiore",
      kind: "street",
      spacing: 5.5,
      pts: [
        { x: -20.4, z: -24.8 },
        { x: -11.2, z: -22.6 },
        { x: -2.6, z: -20.4 },
      ],
    },
    {
      name: "Shabazi",
      kind: "street",
      spacing: 5.4,
      pts: [
        { x: -32.4, z: -48.6 },
        { x: -24.8, z: -46.2 },
        { x: -18.6, z: -42.4 },
      ],
    },
  ];

  for (const s of streets) g.addStreet(s.name, s.kind, s.pts, s.spacing ?? 6.2);

  for (let i = 0; i < 8; i++) {
    const ang = (i / 8) * Math.PI * 2 - 0.4;
    const x = dizengoffCircle.x + Math.cos(ang) * dizengoffCircle.r;
    const z = dizengoffCircle.z + Math.sin(ang) * dizengoffCircle.r;
    g.addNode(`circle-${i}`, x, z, "Dizengoff Circle");
  }
  for (let i = 0; i < 8; i++) g.addEdge(`circle-${i}`, `circle-${(i + 1) % 8}`, "boulevard");

  for (let k = 0; k < 6; k++) {
    const z = -84 + k * 5.4;
    const x0 = coastX(z) + 4.2 + rand() * 5;
    g.addStreet(
      "Old Jaffa",
      "street",
      [
        { x: x0, z },
        { x: x0 + 5.5 + rand() * 4, z: z + 1.6 + rand() * 2 },
        { x: x0 + 9 + rand() * 3, z: z + 0.4 },
      ],
      4.2
    );
  }

  g.splitCrossings();
  g.stitchOrphans(12);

  const { nodes, nodeById, edges } = g;
  const adj = g.adjacency();

  function nearest(x: number, z: number, pred?: (n: MapNode) => boolean) {
    let best = nodes[0];
    let bestD = Infinity;
    for (const n of nodes) {
      if (pred && !pred(n)) continue;
      const d = dist(x, z, n.x, n.z);
      if (d < bestD) {
        bestD = d;
        best = n;
      }
    }
    return best;
  }

  const coast: Vec2[] = [];
  for (let z = -94; z <= 94; z += 2) coast.push({ x: coastX(z), z });

  const yarkon: Vec2[] = [];
  for (let t = 0; t <= 1.001; t += 0.03) {
    const x = 58 - t * (58 - coastX(62 + Math.sin(t * 3) * 2) - 1);
    const z = 58 + Math.sin(t * 5.2) * 3.2 + t * 8;
    yarkon.push({ x, z });
  }

  const beach: Vec2[] = coast.map((p) => ({ x: p.x + 1.6, z: p.z }));

  const buildings: BuildingSpec[] = [];
  const occupied: Vec2[] = [];
  for (const e of edges) {
    if (e.kind === "highway" || e.kind === "promenade") continue;
    const a = nodeById[e.a];
    const b = nodeById[e.b];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len = Math.max(0.001, dist(a.x, a.z, b.x, b.z));
    const px = -dz / len;
    const pz = dx / len;
    const rot = Math.atan2(dx, dz);
    const nBuild = Math.max(1, Math.round(len / 6.8));
    for (let i = 0; i < nBuild; i++) {
      const t = (i + 0.42 + rand() * 0.16) / nBuild;
      const mx = a.x + dx * t;
      const mz = a.z + dz * t;
      for (const side of [-1, 1] as const) {
        if (rand() < 0.12) continue;
        const offset = (e.kind === "boulevard" ? 2.35 : 1.55) + rand() * 0.45;
        const x = mx + px * side * offset;
        const z = mz + pz * side * offset;
        if (!onLand(x, z) || inYarkonPark(x, z) || inAyalon(x, z)) continue;
        if (x < coastX(z) + 5.2) continue;
        if (dist(x, z, dizengoffCircle.x, dizengoffCircle.z) < 6.4) continue;
        if (dist(x, z, 42, 5) < 9) continue;
        if (occupied.some((o) => dist(o.x, o.z, x, z) < 3.3)) continue;
        occupied.push({ x, z });
        const hood = neighborhoodAt(x, z);
        const pal = HOOD_BUILD[hood];
        const h = pal.h0 + rand() * (pal.h1 - pal.h0);
        buildings.push({
          x,
          z,
          w: 2.4 + rand() * 2.8,
          d: 2.2 + rand() * 2.4,
          h: hood === "jaffa" ? h * 0.85 + 1.5 : h,
          rot: hood === "jaffa" ? rot + (rand() - 0.5) * 0.45 : rot + (rand() - 0.5) * 0.05,
          color: pal.colors[Math.floor(rand() * pal.colors.length)],
          roof: pal.roofs[Math.floor(rand() * pal.roofs.length)],
          hood,
        });
      }
    }
  }

  const trees: TreeSpec[] = [];
  for (const e of edges) {
    if (e.kind !== "boulevard") continue;
    const a = nodeById[e.a];
    const b = nodeById[e.b];
    const steps = 3;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const x = a.x + (b.x - a.x) * t;
      const z = a.z + (b.z - a.z) * t;
      if (!onLand(x, z) || inYarkonPark(x, z)) continue;
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const len = Math.max(0.001, dist(a.x, a.z, b.x, b.z));
      trees.push({ x: x - (dz / len) * 1.05, z: z + (dx / len) * 1.05, scale: 1.05 + rand() * 0.3, kind: "ficus" });
      trees.push({ x: x + (dz / len) * 1.05, z: z - (dx / len) * 1.05, scale: 1.05 + rand() * 0.3, kind: "ficus" });
    }
  }
  for (let z = -84; z < 84; z += 6.5) {
    if (z > 50 && z < 74) continue;
    trees.push({ x: coastX(z) + 3.1, z, scale: 1.3 + rand() * 0.4, kind: "palm" });
  }
  for (let k = 0; k < 90; k++) {
    const x = -20 + rand() * 55;
    const z = 52 + rand() * 24;
    if (inYarkonPark(x, z) && !inAyalon(x, z)) {
      trees.push({ x, z, scale: 0.9 + rand() * 0.7, kind: "park" });
    }
  }

  const landmarks: LandmarkSpec[] = [
    { kind: "azrieli-round", x: 41.2, z: 3.2 },
    { kind: "azrieli-tri", x: 44.6, z: 6.4 },
    { kind: "azrieli-square", x: 39.4, z: 7.6 },
    { kind: "clock-tower", x: -28.5, z: -74 },
    { kind: "lighthouse", x: coastX(34) - 2.2, z: 34 },
    { kind: "dizengoff-center", x: -18.5, z: 7.2 },
    { kind: "fountain", x: dizengoffCircle.x, z: dizengoffCircle.z, r: 2.2 },
    { kind: "port-crane", x: coastX(32) - 1.5, z: 31, rot: 0.2 },
    { kind: "port-crane", x: coastX(38) - 1.8, z: 38, rot: -0.3 },
    { kind: "pier", x: coastX(30) - 6, z: 30, w: 12, d: 1.6, rot: 0.05 },
    { kind: "pier", x: coastX(36) - 8, z: 36.5, w: 16, d: 1.8, rot: -0.04 },
    { kind: "pier", x: coastX(42) - 5.5, z: 42, w: 11, d: 1.4, rot: 0.08 },
  ];

  const restaurantSeeds: (Omit<Restaurant, "nodeId" | "x" | "z"> & { street?: string; near: Vec2 })[] = [
    { id: "miznon", name: "Miznon", address: "23 Ibn Gabirol St", hood: "dizengoff", street: "Ibn Gabirol", near: { x: ibnX(8), z: 8 } },
    { id: "hakosem", name: "HaKosem", address: "1 Shlomo HaMelech", hood: "dizengoff", street: "King George", near: { x: -20, z: -6 } },
    { id: "messika", name: "Messika", address: "17 Montefiore St", hood: "rothschild", street: "Montefiore", near: { x: -12, z: -22 } },
    { id: "allora", name: "Allora", address: "10 Rothschild Blvd", hood: "rothschild", street: "Rothschild", near: { x: -10, z: -24 } },
    { id: "portsaid", name: "Port Said", address: "5 Har Sinai St", hood: "rothschild", street: "Allenby", near: { x: -12, z: -26 } },
    { id: "ouzeria", name: "Ouzeria", address: "3 Matalon St", hood: "florentin", street: "Florentin", near: { x: -10, z: -35 } },
    { id: "cafenoir", name: "Café Noir", address: "16 Vital St", hood: "florentin", street: "Vital", near: { x: -4, z: -40 } },
    { id: "vitrina", name: "Vitrina", address: "38 Abarbanel St", hood: "florentin", street: "Abarbanel", near: { x: -12, z: -40 } },
    { id: "abuhassan", name: "Abu Hassan", address: "1 HaDolphin St, Jaffa", hood: "jaffa", street: "Yefet", near: { x: -30, z: -74 } },
    { id: "shakshuka", name: "Dr. Shakshuka", address: "3 Beit Eshel St, Jaffa", hood: "jaffa", street: "Yefet", near: { x: -26, z: -70 } },
    { id: "abulafia", name: "Abulafia Bakery", address: "7 Yefet St, Jaffa", hood: "jaffa", street: "Yefet", near: { x: -28, z: -76 } },
    { id: "mantaray", name: "Manta Ray", address: "Alma Beach", hood: "jaffa", street: "Tayelet", near: { x: coastX(-62) + 4, z: -62 } },
    { id: "frishman", name: "Sabich Frishman", address: "42 Frishman St", hood: "dizengoff", street: "Frishman", near: { x: benYehudaX(6), z: 6 } },
    { id: "anita", name: "Anita", address: "96 Ben Yehuda St", hood: "dizengoff", street: "Ben Yehuda", near: { x: benYehudaX(12), z: 12 } },
    { id: "shila", name: "Shila", address: "182 Ben Yehuda St", hood: "port", street: "Ben Yehuda", near: { x: benYehudaX(30), z: 30 } },
    { id: "nala", name: "Nala", address: "Namal Tel Aviv", hood: "port", street: "Namal", near: { x: coastX(34) + 6, z: 34 } },
    { id: "zakaim", name: "Zakaim", address: "20 Dizengoff St", hood: "dizengoff", street: "Dizengoff", near: { x: -22, z: 4 } },
    { id: "northabraxas", name: "North Abraxas", address: "40 Lilienblum St", hood: "rothschild", street: "Lilienblum", near: { x: -12, z: -28 } },
    { id: "miznonport", name: "Miznon Namal", address: "Hangar 1, the Port", hood: "port", street: "Namal", near: { x: hayarkonX(32), z: 32 } },
    { id: "yarkonkafe", name: "Café Yarkon", address: "Park HaYarkon", hood: "yarkon", street: "Rokach", near: { x: ibnX(76), z: 76 } },
  ];

  function snapSpot(near: Vec2, street?: string) {
    const labeled = street
      ? nearest(near.x, near.z, (n) => (n.label ?? "").includes(street))
      : nearest(near.x, near.z);
    if (street && dist(labeled.x, labeled.z, near.x, near.z) > 18) return nearest(near.x, near.z);
    return labeled;
  }

  const restaurants: Restaurant[] = restaurantSeeds.map((r) => {
    const n = snapSpot(r.near, r.street);
    return { id: r.id, name: r.name, address: r.address, hood: r.hood, nodeId: n.id, x: n.x, z: n.z };
  });

  const addressSeeds: { address: string; hood: NeighborhoodId; street?: string; near: Vec2 }[] = [
    { address: "45 Rothschild Blvd", hood: "rothschild", street: "Rothschild", near: { x: -8, z: -16 } },
    { address: "12 Dizengoff St", hood: "dizengoff", street: "Dizengoff", near: { x: -22, z: 6 } },
    { address: "8 Florentin St", hood: "florentin", street: "Florentin", near: { x: -10, z: -35 } },
    { address: "22 Yefet St, Jaffa", hood: "jaffa", street: "Yefet", near: { x: -28, z: -74 } },
    { address: "3 Namal Tel Aviv", hood: "port", street: "Namal", near: { x: coastX(34) + 6, z: 34 } },
    { address: "17 Ibn Gabirol St", hood: "dizengoff", street: "Ibn Gabirol", near: { x: ibnX(10), z: 10 } },
    { address: "9 Allenby St", hood: "rothschild", street: "Allenby", near: { x: -16, z: -22 } },
    { address: "4 King George St", hood: "dizengoff", street: "King George", near: { x: -20, z: -8 } },
    { address: "31 Nordau Blvd", hood: "port", street: "Nordau", near: { x: benYehudaX(34), z: 34 } },
    { address: "6 Montefiore St", hood: "rothschild", street: "Montefiore", near: { x: -12, z: -22 } },
    { address: "18 Ahad Ha'am St", hood: "rothschild", street: "Ahad Ha'am", near: { x: -8, z: -16 } },
    { address: "2 HaYarkon St", hood: "dizengoff", street: "HaYarkon", near: { x: hayarkonX(2), z: 2 } },
    { address: "55 Ben Yehuda St", hood: "dizengoff", street: "Ben Yehuda", near: { x: benYehudaX(10), z: 10 } },
    { address: "14 Shabazi St, Neve Tzedek", hood: "jaffa", street: "Shabazi", near: { x: -24, z: -46 } },
    { address: "27 Nahalat Binyamin", hood: "rothschild", street: "Allenby", near: { x: -14, z: -24 } },
    { address: "11 Salame Rd", hood: "florentin", street: "Salame", near: { x: -8, z: -44 } },
    { address: "8 Abarbanel St", hood: "florentin", street: "Abarbanel", near: { x: -12, z: -40 } },
    { address: "19 Yirmiyahu St", hood: "yarkon", street: "Yirmiyahu", near: { x: ibnX(44), z: 44 } },
    { address: "4 Rokach Blvd", hood: "yarkon", street: "Rokach", near: { x: ibnX(76), z: 76 } },
    { address: "16 Arlozorov St", hood: "dizengoff", street: "Arlozorov", near: { x: -20, z: 17 } },
    { address: "7 Mazeh St", hood: "rothschild", street: "Rothschild", near: { x: -6, z: -12 } },
    { address: "23 Bograshov St", hood: "dizengoff", street: "Bograshov", near: { x: benYehudaX(0), z: 0 } },
    { address: "5 Kedem St, Jaffa", hood: "jaffa", street: "Kedem", near: { x: -30, z: -76 } },
    { address: "2 Hangar 2, the Port", hood: "port", street: "Namal", near: { x: hayarkonX(36), z: 36 } },
    { address: "40 Yigal Allon St", hood: "east", street: "Yigal Allon", near: { x: 46, z: 8 } },
    { address: "1 Kaplan St", hood: "east", street: "Kaplan", near: { x: 18, z: 5 } },
    { address: "18 Begin Rd", hood: "east", street: "Begin", near: { x: ayalonX(6) - 8, z: 6 } },
    { address: "9 Frishman St", hood: "dizengoff", street: "Frishman", near: { x: hayarkonX(6), z: 6 } },
    { address: "33 Basel St", hood: "port", street: "Nordau", near: { x: -30, z: 32 } },
    { address: "6 HaDolphin St, Jaffa", hood: "jaffa", street: "Yefet", near: { x: -32, z: -72 } },
    { address: "21 Lilienblum St", hood: "rothschild", street: "Lilienblum", near: { x: -14, z: -28 } },
    { address: "15 Vital St", hood: "florentin", street: "Vital", near: { x: -4, z: -40 } },
    { address: "8 University Rd", hood: "yarkon", street: "Rokach", near: { x: namirX(77), z: 77 } },
    { address: "12 HaHashmal St", hood: "florentin", street: "Salame", near: { x: 4, z: -44 } },
    { address: "4 Herbert Samuel", hood: "dizengoff", street: "Tayelet", near: { x: coastX(0) + 3, z: 0 } },
    { address: "26 Weizmann St", hood: "east", street: "Weizmann", near: { x: 10, z: 4 } },
  ];

  const customers: CustomerSpot[] = addressSeeds.map((a, i) => {
    const n = snapSpot(a.near, a.street);
    return { id: `cust-${i}`, address: a.address, hood: a.hood, nodeId: n.id, x: n.x, z: n.z };
  });

  const hub = nearest(HUB_NODE_HINT.x, HUB_NODE_HINT.z, (n) => (n.label ?? "").includes("Dizengoff"));

  return {
    nodes,
    nodeById,
    edges,
    adj,
    buildings,
    trees,
    landmarks,
    restaurants,
    customers,
    neighborhoods: [
      { id: "jaffa", name: "Jaffa", color: 0xd4b896 },
      { id: "florentin", name: "Florentin", color: 0xc4785a },
      { id: "rothschild", name: "Rothschild", color: 0xf0e4d4 },
      { id: "dizengoff", name: "Dizengoff", color: 0xeee6da },
      { id: "port", name: "the Port", color: 0xb7c4c8 },
      { id: "yarkon", name: "Yarkon", color: 0x8bbf7a },
      { id: "east", name: "Ayalon", color: 0x8aa4b8 },
    ],
    coast,
    yarkon,
    beach,
    ayalon: { x: 34, z0: -88, z1: 88, width: 7.2 },
    hubNodeId: hub.id,
    dizengoffCircle,
    bounds: { minX: -78, maxX: 68, minZ: -96, maxZ: 96 },
  };
}

export function nearestNode(city: CityData, x: number, z: number) {
  let best = city.nodes[0];
  let bestD = Infinity;
  for (const n of city.nodes) {
    const d = dist(x, z, n.x, n.z);
    if (d < bestD) {
      bestD = d;
      best = n;
    }
  }
  return best;
}

export function curbAt(city: CityData, nodeId: string, salt = 0) {
  const n = city.nodeById[nodeId] ?? nearestNode(city, 0, 0);
  const links = city.adj[n.id] ?? [];
  if (!links.length) return { x: n.x, z: n.z, heading: 0, nodeId: n.id };
  const link = links[Math.abs(salt) % links.length];
  const o = city.nodeById[link.to];
  const dx = o.x - n.x;
  const dz = o.z - n.z;
  const len = Math.max(0.001, dist(n.x, n.z, o.x, o.z));
  const heading = Math.atan2(dx, dz);
  const px = -dz / len;
  const pz = dx / len;
  const side = salt % 2 === 0 ? 1 : -1;
  return {
    x: n.x + px * 0.58 * side,
    z: n.z + pz * 0.58 * side,
    heading,
    nodeId: n.id,
  };
}
