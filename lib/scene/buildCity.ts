import * as THREE from "three";
import type { CityData } from "@/lib/game/types";
import { ayalonX, coastX } from "@/lib/game/city";
import { paperTexture, waterTexture } from "./textures";

export function buildCityMesh(city: CityData) {
  const root = new THREE.Group();
  const interactables: THREE.Object3D[] = [];
  const paper = paperTexture();
  const waterTex = waterTexture();

  const ambient = new THREE.AmbientLight(0xfff6e8, 1.15);
  root.add(ambient);
  const sun = new THREE.DirectionalLight(0xfff3dc, 0.35);
  sun.position.set(20, 80, 10);
  root.add(sun);

  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(240, 260),
    new THREE.MeshBasicMaterial({ map: waterTex, color: 0x9fd0dc })
  );
  water.rotation.x = -Math.PI / 2;
  water.position.set(-18, -0.4, 0);
  root.add(water);

  const landShape = new THREE.Shape();
  const coast = city.coast;
  landShape.moveTo(coast[0].x, coast[0].z);
  for (const p of coast) landShape.lineTo(p.x, p.z);
  landShape.lineTo(city.bounds.maxX + 10, coast[coast.length - 1].z);
  landShape.lineTo(city.bounds.maxX + 10, coast[0].z);
  landShape.closePath();
  const landGeo = new THREE.ShapeGeometry(landShape, 8);
  landGeo.rotateX(Math.PI / 2);
  const land = new THREE.Mesh(landGeo, new THREE.MeshBasicMaterial({ map: paper, color: 0xf4ead8 }));
  land.position.y = 0;
  root.add(land);

  const sandShape = new THREE.Shape();
  sandShape.moveTo(coast[0].x, coast[0].z);
  for (const p of coast) sandShape.lineTo(p.x, p.z);
  for (let i = coast.length - 1; i >= 0; i--) {
    sandShape.lineTo(coast[i].x + 7.4, coast[i].z);
  }
  sandShape.closePath();
  const sandGeo = new THREE.ShapeGeometry(sandShape, 6);
  sandGeo.rotateX(Math.PI / 2);
  const sand = new THREE.Mesh(sandGeo, new THREE.MeshBasicMaterial({ color: 0xead9b4 }));
  sand.position.y = 0.015;
  root.add(sand);

  const park = new THREE.Mesh(
    new THREE.CircleGeometry(22, 20),
    new THREE.MeshBasicMaterial({ color: 0xc5dcb0 })
  );
  park.rotation.x = -Math.PI / 2;
  park.position.set(4, 0.03, 62);
  park.scale.set(1.6, 1, 0.7);
  root.add(park);

  const riverPts = city.yarkon.map((p) => new THREE.Vector3(p.x, 0.06, p.z));
  const river = new THREE.Mesh(
    new THREE.TubeGeometry(new THREE.CatmullRomCurve3(riverPts), 40, 1.35, 5, false),
    new THREE.MeshBasicMaterial({ color: 0x8ec4d2 })
  );
  root.add(river);

  for (let z = -86; z < 86; z += 10) {
    const x0 = ayalonX(z);
    const x1 = ayalonX(z + 10);
    const dx = x1 - x0;
    const len = Math.hypot(dx, 10);
    const strip = new THREE.Mesh(
      new THREE.BoxGeometry(3.4, 0.035, len + 0.2),
      new THREE.MeshBasicMaterial({ color: 0xcbbba4 })
    );
    strip.position.set((x0 + x1) / 2, 0.035, z + 5);
    strip.rotation.y = Math.atan2(dx, 10);
    root.add(strip);
  }

  const streetMat = new THREE.MeshBasicMaterial({ color: 0xe7dcc8 });
  const blvdMat = new THREE.MeshBasicMaterial({ color: 0xecdfc8 });
  const promMat = new THREE.MeshBasicMaterial({ color: 0xf0e6d4 });
  const hwyMat = new THREE.MeshBasicMaterial({ color: 0xd2c3ab });
  for (const e of city.edges) {
    const a = city.nodeById[e.a];
    const b = city.nodeById[e.b];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len = Math.hypot(dx, dz);
    const label = `${a.label ?? ""} ${b.label ?? ""}`;
    const major = /Dizengoff|Rothschild|HaYarkon|Ibn Gabirol|Allenby|Ayalon|Arlozorov|Namir|Ben Yehuda|Kaplan/.test(label);
    const w =
      e.kind === "highway"
        ? 2.45
        : e.kind === "boulevard"
          ? 1.38
          : e.kind === "promenade"
            ? 1.05
            : major
              ? 0.82
              : 0.42;
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(w, 0.03, len + 0.15),
      e.kind === "highway" ? hwyMat : e.kind === "boulevard" ? blvdMat : e.kind === "promenade" ? promMat : streetMat
    );
    mesh.position.set((a.x + b.x) / 2, 0.045, (a.z + b.z) / 2);
    mesh.rotation.y = Math.atan2(dx, dz);
    root.add(mesh);
  }

  const dummy = new THREE.Object3D();
  const box = new THREE.BoxGeometry(1, 1, 1);
  const subset = city.buildings.filter((_, i) => i % 3 === 0).slice(0, 140);
  const mats = new THREE.InstancedMesh(box, new THREE.MeshBasicMaterial({ color: 0xe6d3c2 }), subset.length);
  subset.forEach((b, i) => {
    dummy.position.set(b.x, 0.16, b.z);
    dummy.rotation.set(0, b.rot, 0);
    dummy.scale.set(b.w * 0.95, 0.3, b.d * 0.95);
    dummy.updateMatrix();
    mats.setMatrixAt(i, dummy.matrix);
  });
  root.add(mats);

  addLandmarks(root, city);
  addTrees(root, city);
  addLabels(root);
  addPads(root, city, interactables);
  addBeachUmbrellas(root);

  return {
    root,
    interactables,
    tick: (dt: number) => {
      waterTex.offset.x += dt * 0.008;
    },
  };
}

function addLandmarks(root: THREE.Group, city: CityData) {
  const pale = new THREE.MeshBasicMaterial({ color: 0xc5d4dc });
  const sand = new THREE.MeshBasicMaterial({ color: 0xd7b48a });
  const cream = new THREE.MeshBasicMaterial({ color: 0xf0e6d6 });
  const coral = new THREE.MeshBasicMaterial({ color: 0xe8a078 });

  const round = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 3.4, 0.45, 24), pale);
  round.position.set(41.2, 0.28, 3.2);
  const tri = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.2, 0.45, 3), pale);
  tri.position.set(44.6, 0.28, 6.4);
  tri.rotation.y = 0.4;
  const sq = new THREE.Mesh(new THREE.BoxGeometry(5.4, 0.45, 5.4), pale);
  sq.position.set(39.4, 0.28, 7.6);
  root.add(round, tri, sq);

  const clock = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.5, 2.2), sand);
  clock.position.set(-28.5, 0.35, -74);
  root.add(clock);

  const fountain = new THREE.Mesh(new THREE.CircleGeometry(3.4, 20), new THREE.MeshBasicMaterial({ color: 0xd8eee8 }));
  fountain.rotation.x = -Math.PI / 2;
  fountain.position.set(city.dizengoffCircle.x, 0.06, city.dizengoffCircle.z);
  root.add(fountain);

  for (const lm of city.landmarks) {
    if (lm.kind === "pier") {
      const p = new THREE.Mesh(new THREE.BoxGeometry(lm.w, 0.12, lm.d), cream);
      p.position.set(lm.x, 0.08, lm.z);
      p.rotation.y = lm.rot;
      root.add(p);
    }
    if (lm.kind === "lighthouse") {
      const t = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.9, 0.5, 8), coral);
      t.position.set(lm.x, 0.3, lm.z);
      root.add(t);
    }
  }
}

function addTrees(root: THREE.Group, city: CityData) {
  const canopy = new THREE.CircleGeometry(0.85, 8);
  const green = new THREE.MeshBasicMaterial({ color: 0xa8c98a });
  const dummy = new THREE.Object3D();
  const trees = city.trees.filter((_, i) => i % 3 === 0);
  const inst = new THREE.InstancedMesh(canopy, green, trees.length);
  trees.forEach((t, i) => {
    dummy.position.set(t.x, 0.08, t.z);
    dummy.rotation.set(-Math.PI / 2, 0, 0);
    dummy.scale.setScalar(t.scale * 0.7);
    dummy.updateMatrix();
    inst.setMatrixAt(i, dummy.matrix);
  });
  root.add(inst);
}

function makeLabel(text: string) {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 96;
  const ctx = c.getContext("2d")!;
  ctx.clearRect(0, 0, 512, 96);
  ctx.font = "500 36px ui-serif, Georgia, serif";
  ctx.fillStyle = "rgba(90,70,50,0.42)";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, 256, 48);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
  // Negative X undoes the mirrored ortho camera so chart labels stay readable.
  spr.scale.set(-18, 3.4, 1);
  spr.renderOrder = 8;
  return spr;
}

function addLabels(root: THREE.Group) {
  const labels = [
    { text: "Mediterranean", x: -64, z: 2 },
    { text: "Jaffa", x: -22, z: -72 },
    { text: "Florentin", x: -6, z: -36 },
    { text: "Rothschild", x: -8, z: -14 },
    { text: "Dizengoff", x: -24, z: 10 },
    { text: "the Port", x: -40, z: 34 },
    { text: "Yarkon", x: 6, z: 64 },
    { text: "Ayalon Hwy", x: 38, z: -18 },
    { text: "Azrieli", x: 44, z: 12 },
    { text: "HaYarkon", x: -40, z: -8 },
    { text: "Ben Yehuda", x: -32, z: 18 },
    { text: "Ibn Gabirol", x: 6, z: 22 },
    { text: "Allenby", x: -14, z: -28 },
    { text: "Arlozorov", x: -6, z: 20 },
  ];
  for (const l of labels) {
    const s = makeLabel(l.text);
    s.position.set(l.x, 0.8, l.z);
    root.add(s);
  }
}

function addPads(root: THREE.Group, city: CityData, interactables: THREE.Object3D[]) {
  const fillMat = new THREE.MeshBasicMaterial({ color: 0xe8dcc8, transparent: true, opacity: 0.35, side: THREE.DoubleSide });
  for (const r of city.restaurants) {
    const g = new THREE.Group();
    const b = new THREE.Mesh(new THREE.CircleGeometry(0.55, 12), fillMat);
    b.rotation.x = -Math.PI / 2;
    g.add(b);
    g.position.set(r.x, 0.08, r.z);
    g.userData = { type: "restaurant", id: r.id };
    root.add(g);
    interactables.push(g);
  }
}

function addBeachUmbrellas(root: THREE.Group) {
  const colors = [0xf2a0a0, 0xf0d58a, 0xa8c8e8];
  let i = 0;
  for (let z = -78; z < 44; z += 14) {
    if (z > 20 && z < 46) continue;
    const x = coastX(z) + 3.4;
    const u = new THREE.Mesh(new THREE.CircleGeometry(0.9, 8), new THREE.MeshBasicMaterial({ color: colors[i % colors.length] }));
    u.rotation.x = -Math.PI / 2;
    u.position.set(x, 0.1, z);
    root.add(u);
    i += 1;
  }
}
