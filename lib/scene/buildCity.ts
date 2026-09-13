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
    new THREE.MeshBasicMaterial({ map: waterTex, color: 0xa9dce5 })
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
  const land = new THREE.Mesh(landGeo, new THREE.MeshBasicMaterial({ map: paper, color: 0xf8eedc }));
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
  const sand = new THREE.Mesh(sandGeo, new THREE.MeshBasicMaterial({ color: 0xf1d89d }));
  sand.position.y = 0.015;
  root.add(sand);

  addDistrictTints(root);

  const park = new THREE.Mesh(
    new THREE.CircleGeometry(22, 20),
    new THREE.MeshBasicMaterial({ color: 0xbddca7 })
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

  const streetCasing = new THREE.MeshBasicMaterial({ color: 0xc9bca8 });
  const streetFill = new THREE.MeshBasicMaterial({ color: 0xfff9ec });
  const majorCasing = new THREE.MeshBasicMaterial({ color: 0xb6a58d });
  const majorFill = new THREE.MeshBasicMaterial({ color: 0xfff6df });
  const boulevardFill = new THREE.MeshBasicMaterial({ color: 0xfbecc9 });
  const promenadeFill = new THREE.MeshBasicMaterial({ color: 0xfff4db });
  const highwayCasing = new THREE.MeshBasicMaterial({ color: 0x947f68 });
  const highwayFill = new THREE.MeshBasicMaterial({ color: 0xd9c8ac });
  const boulevardMedian = new THREE.MeshBasicMaterial({ color: 0x91b879 });
  const highwayMedian = new THREE.MeshBasicMaterial({ color: 0xfff3d0 });
  for (const e of city.edges) {
    const a = city.nodeById[e.a];
    const b = city.nodeById[e.b];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len = Math.hypot(dx, dz);
    const label = `${a.label ?? ""} ${b.label ?? ""}`;
    const major = /Dizengoff|Rothschild|HaYarkon|Ibn Gabirol|Allenby|Ayalon|Arlozorov|Namir|Ben Yehuda|Kaplan|HaShalom|Yefet|Rokach/.test(label);
    const w =
      e.kind === "highway"
        ? 3.15
        : e.kind === "boulevard"
          ? 1.8
          : e.kind === "promenade"
            ? 1.35
            : major
              ? 1.16
              : 0.64;
    const casing = new THREE.Mesh(
      new THREE.BoxGeometry(w + (e.kind === "highway" ? 0.7 : 0.28), 0.025, len + 0.4),
      e.kind === "highway" ? highwayCasing : major || e.kind !== "street" ? majorCasing : streetCasing
    );
    casing.position.set((a.x + b.x) / 2, 0.038, (a.z + b.z) / 2);
    casing.rotation.y = Math.atan2(dx, dz);
    root.add(casing);

    const fill = new THREE.Mesh(
      new THREE.BoxGeometry(w, 0.025, len + 0.25),
      e.kind === "highway"
        ? highwayFill
        : e.kind === "boulevard"
          ? boulevardFill
          : e.kind === "promenade"
            ? promenadeFill
            : major
              ? majorFill
              : streetFill
    );
    fill.position.set((a.x + b.x) / 2, 0.055, (a.z + b.z) / 2);
    fill.rotation.y = casing.rotation.y;
    root.add(fill);

    if (e.kind === "boulevard") {
      const median = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.02, len - 0.1), boulevardMedian);
      median.position.set((a.x + b.x) / 2, 0.074, (a.z + b.z) / 2);
      median.rotation.y = casing.rotation.y;
      root.add(median);
    }
    if (e.kind === "highway") {
      const median = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.02, len - 0.1), highwayMedian);
      median.position.set((a.x + b.x) / 2, 0.075, (a.z + b.z) / 2);
      median.rotation.y = casing.rotation.y;
      root.add(median);
    }
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

function addDistrictTints(root: THREE.Group) {
  const districts = [
    { color: 0xf0bfa5, opacity: 0.11, points: [[-38, -86], [-15, -82], [-11, -57], [-28, -48], [-44, -60]] },
    { color: 0xf0a98e, opacity: 0.1, points: [[-27, -49], [10, -50], [12, -31], [-16, -30]] },
    { color: 0xe8c67f, opacity: 0.09, points: [[-22, -31], [20, -26], [18, 1], [-8, 8], [-28, -10]] },
    { color: 0x8fc7c0, opacity: 0.08, points: [[-39, -12], [18, -10], [23, 37], [-39, 42]] },
  ];
  for (const district of districts) {
    const shape = new THREE.Shape();
    district.points.forEach(([x, z], index) => {
      if (index === 0) shape.moveTo(x, z);
      else shape.lineTo(x, z);
    });
    shape.closePath();
    const geometry = new THREE.ShapeGeometry(shape);
    geometry.rotateX(Math.PI / 2);
    const mesh = new THREE.Mesh(
      geometry,
      new THREE.MeshBasicMaterial({ color: district.color, transparent: true, opacity: district.opacity, depthWrite: false })
    );
    mesh.position.y = 0.022;
    root.add(mesh);
  }
}

function addLandmarks(root: THREE.Group, city: CityData) {
  const shadow = new THREE.MeshBasicMaterial({ color: 0x7a6e62, transparent: true, opacity: 0.2 });
  const pale = new THREE.MeshBasicMaterial({ color: 0x9bbbc3 });
  const outline = new THREE.MeshBasicMaterial({ color: 0x587d86 });
  const sand = new THREE.MeshBasicMaterial({ color: 0xc7845f });
  const cream = new THREE.MeshBasicMaterial({ color: 0xf0e6d6 });
  const coral = new THREE.MeshBasicMaterial({ color: 0xe77756 });

  const roundShadow = new THREE.Mesh(new THREE.CircleGeometry(4, 28), shadow);
  roundShadow.rotation.x = -Math.PI / 2;
  roundShadow.position.set(42, 0.12, 2.4);
  const roundOutline = new THREE.Mesh(new THREE.CylinderGeometry(3.8, 3.8, 0.42, 28), outline);
  roundOutline.position.set(41.2, 0.28, 3.2);
  const round = new THREE.Mesh(new THREE.CylinderGeometry(3.25, 3.25, 0.5, 28), pale);
  round.position.set(41.2, 0.28, 3.2);
  const roundRoof = new THREE.Mesh(new THREE.CircleGeometry(1.8, 24), cream);
  roundRoof.rotation.x = -Math.PI / 2;
  roundRoof.position.set(41.2, 0.55, 3.2);
  const triOutline = new THREE.Mesh(new THREE.CylinderGeometry(3.5, 3.5, 0.42, 3), outline);
  triOutline.position.set(44.6, 0.27, 6.4);
  triOutline.rotation.y = 0.4;
  const tri = new THREE.Mesh(new THREE.CylinderGeometry(3.05, 3.05, 0.5, 3), pale);
  tri.position.set(44.6, 0.28, 6.4);
  tri.rotation.y = 0.4;
  const sqOutline = new THREE.Mesh(new THREE.BoxGeometry(6.2, 0.42, 6.2), outline);
  sqOutline.position.set(39.4, 0.27, 7.6);
  const sq = new THREE.Mesh(new THREE.BoxGeometry(5.4, 0.5, 5.4), pale);
  sq.position.set(39.4, 0.28, 7.6);
  root.add(roundShadow, roundOutline, round, roundRoof, triOutline, tri, sqOutline, sq);

  const clockBase = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.28, 3.4), cream);
  clockBase.position.set(-28.5, 0.25, -74);
  const clock = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.55, 2.2), sand);
  clock.position.set(-28.5, 0.35, -74);
  const clockFace = new THREE.Mesh(new THREE.CircleGeometry(0.7, 16), cream);
  clockFace.rotation.x = -Math.PI / 2;
  clockFace.position.set(-28.5, 0.65, -74);
  root.add(clockBase, clock, clockFace);

  const fountainRing = new THREE.Mesh(new THREE.RingGeometry(2.7, 3.6, 28), new THREE.MeshBasicMaterial({ color: 0xb98764 }));
  fountainRing.rotation.x = -Math.PI / 2;
  fountainRing.position.set(city.dizengoffCircle.x, 0.065, city.dizengoffCircle.z);
  const fountain = new THREE.Mesh(new THREE.CircleGeometry(2.7, 24), new THREE.MeshBasicMaterial({ color: 0x82cad3 }));
  fountain.rotation.x = -Math.PI / 2;
  fountain.position.set(city.dizengoffCircle.x, 0.07, city.dizengoffCircle.z);
  root.add(fountainRing, fountain);

  for (const lm of city.landmarks) {
    if (lm.kind === "pier") {
      const p = new THREE.Mesh(new THREE.BoxGeometry(lm.w, 0.12, lm.d), cream);
      p.position.set(lm.x, 0.08, lm.z);
      p.rotation.y = lm.rot;
      root.add(p);
    }
    if (lm.kind === "lighthouse") {
      const halo = new THREE.Mesh(new THREE.RingGeometry(1.1, 1.65, 20), cream);
      halo.rotation.x = -Math.PI / 2;
      halo.position.set(lm.x, 0.11, lm.z);
      const t = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.95, 0.55, 12), coral);
      t.position.set(lm.x, 0.3, lm.z);
      root.add(halo, t);
    }
    if (lm.kind === "port-crane") {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.16, 3.2), coral);
      arm.position.set(lm.x, 0.25, lm.z);
      arm.rotation.y = lm.rot;
      root.add(arm);
    }
  }

  addLandmarkLabel(root, "AZRIELI", 41.6, 14, 10.5);
  addLandmarkLabel(root, "JAFFA CLOCK", -23.5, -78, 13);
  addLandmarkLabel(root, "DIZENGOFF SQ.", -21.8, 13.6, 14);
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

function makeLabel(
  text: string,
  options: { kind?: "place" | "street" | "water"; width?: number; rotation?: number } = {}
) {
  const kind = options.kind ?? "place";
  const c = document.createElement("canvas");
  c.width = 1024;
  c.height = 128;
  const ctx = c.getContext("2d")!;
  ctx.clearRect(0, 0, c.width, c.height);
  if (kind === "street") {
    ctx.fillStyle = "rgba(255,250,238,0.9)";
    ctx.strokeStyle = "rgba(128,104,78,0.5)";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.roundRect(12, 10, c.width - 24, c.height - 20, 38);
    ctx.fill();
    ctx.stroke();
    ctx.font = "800 82px ui-sans-serif, system-ui, sans-serif";
    ctx.fillStyle = "#45392d";
  } else if (kind === "water") {
    ctx.font = "italic 600 70px ui-serif, Georgia, serif";
    ctx.fillStyle = "rgba(39,105,123,0.78)";
  } else {
    ctx.font = "800 76px ui-sans-serif, system-ui, sans-serif";
    ctx.fillStyle = "rgba(91,72,52,0.72)";
  }
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, c.width / 2, c.height / 2);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearFilter;
  const material = new THREE.MeshBasicMaterial({
    map: tex,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const geometry = new THREE.PlaneGeometry(1, 1);
  geometry.rotateX(-Math.PI / 2);
  const label = new THREE.Mesh(geometry, material);
  label.scale.set(options.width ?? 20, 1, kind === "street" ? 3.6 : 4.6);
  label.rotation.y = -(options.rotation ?? 0);
  label.renderOrder = 12;
  return label;
}

function addLabels(root: THREE.Group) {
  const placeLabels = [
    { text: "MEDITERRANEAN SEA", x: -69, z: 2, width: 31, kind: "water" as const },
    { text: "OLD JAFFA", x: -18, z: -66, width: 18 },
    { text: "FLORENTIN", x: 2, z: -39, width: 17 },
    { text: "NEVE TZEDEK", x: -25, z: -43, width: 20 },
    { text: "LEVINSKY", x: 12, z: -30, width: 16 },
    { text: "TEL AVIV PORT", x: -35, z: 45, width: 23 },
    { text: "PARK HAYARKON", x: 4, z: 67, width: 23 },
  ];
  for (const label of placeLabels) {
    const s = makeLabel(label.text, { kind: label.kind, width: label.width });
    s.position.set(label.x, 0.82, label.z);
    root.add(s);
  }

  const streetLabels = [
    { text: "TAYELET", x: -46, z: -25, width: 13, rotation: Math.PI / 2 },
    { text: "HAYARKON ST", x: -38, z: 10, width: 18, rotation: Math.PI / 2 - 0.08 },
    { text: "BEN YEHUDA ST", x: -31.5, z: 22, width: 20, rotation: Math.PI / 2 - 0.08 },
    { text: "DIZENGOFF ST", x: -24.2, z: 22.5, width: 19, rotation: Math.PI / 2 - 0.13 },
    { text: "IBN GABIROL ST", x: -2, z: 31, width: 21, rotation: Math.PI / 2 + 0.06 },
    { text: "NAMIR RD", x: 24, z: 39, width: 14, rotation: Math.PI / 2 + 0.03 },
    { text: "AYALON HWY 20", x: 36.8, z: -24, width: 20, rotation: Math.PI / 2 - 0.03 },
    { text: "ROTHSCHILD BLVD", x: -7.5, z: -17.5, width: 23, rotation: 0.96 },
    { text: "ALLENBY ST", x: -12.5, z: -29, width: 17, rotation: 0.92 },
    { text: "KING GEORGE ST", x: -17.9, z: -10, width: 21, rotation: Math.PI / 2 - 0.12 },
    { text: "ARLOZOROV ST", x: -1, z: 19.8, width: 20, rotation: 0 },
    { text: "KAPLAN ST", x: 11.5, z: 7.7, width: 15, rotation: 0 },
    { text: "HASHALOM RD", x: 31, z: 7.2, width: 18, rotation: 0 },
    { text: "NORDAU BLVD", x: -15, z: 36.5, width: 18, rotation: 0 },
    { text: "ROKACH BLVD", x: 21, z: 79.8, width: 18, rotation: 0 },
    { text: "SALAME RD", x: 12, z: -47.4, width: 15, rotation: 0 },
    { text: "YEFET ST", x: -26, z: -65, width: 13, rotation: Math.PI / 2 - 0.38 },
  ];
  for (const label of streetLabels) {
    const s = makeLabel(label.text, {
      kind: "street",
      width: label.width,
      rotation: label.rotation,
    });
    s.position.set(label.x, 0.9, label.z);
    root.add(s);
  }
}

function addLandmarkLabel(root: THREE.Group, text: string, x: number, z: number, width: number) {
  const label = makeLabel(text, { kind: "street", width });
  label.position.set(x, 0.95, z);
  root.add(label);
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
