import * as THREE from "three";
import type { GameSim } from "@/lib/game/sim";
import type { Vec2 } from "@/lib/game/types";
import { resampleDots } from "@/lib/game/util";
import { buildCityMesh } from "./buildCity";

type Hit = { type: string; id: string };

export class CityRenderer {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.OrthographicCamera;
  private cityTick: (dt: number) => void;
  private driverMeshes = new Map<string, THREE.Group>();
  private trailDots = new Map<string, THREE.InstancedMesh>();
  private orderMarkers = new Map<string, THREE.Group>();
  private raycaster = new THREE.Raycaster();
  private ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private interactables: THREE.Object3D[];
  private disposed = false;
  private pointers = new Map<number, { x: number; y: number }>();
  private panning: { pointerId: number; x: number; y: number } | null = null;
  private pendingTap: { pointerId: number; x: number; y: number } | null = null;
  private pinch: { dist: number; zoom: number } | null = null;
  private viewH = 92;
  private onFocus: ((hit: Hit | null) => void) | null = null;
  private dummy = new THREE.Object3D();
  private dotGeo = new THREE.CircleGeometry(0.42, 10);
  private vehicleGeo: THREE.BufferGeometry;

  constructor(private canvas: HTMLCanvasElement, sim: GameSim) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
      failIfMajorPerformanceCaveat: false,
      preserveDrawingBuffer: true,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x8ec8d6, 1);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.scene = new THREE.Scene();

    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 400);
    this.camera.position.set(-6, 160, 10);
    this.camera.up.set(0, 0, 1);
    this.camera.lookAt(-6, 0, 0);

    const built = buildCityMesh(sim.city);
    this.scene.add(built.root);
    this.interactables = built.interactables;
    this.cityTick = built.tick;
    this.vehicleGeo = makeChevron();

    canvas.style.touchAction = "none";
    canvas.style.pointerEvents = sim.started ? "auto" : "none";
    canvas.addEventListener("pointerdown", this.onDown);
    canvas.addEventListener("pointermove", this.onMove);
    canvas.addEventListener("pointerup", this.onUp);
    canvas.addEventListener("pointercancel", this.onUp);
    canvas.addEventListener("wheel", this.onWheel, { passive: false });
    this.resize();
  }

  setFocusHandler(fn: (hit: Hit | null) => void) {
    this.onFocus = fn;
  }

  private refreshCamera() {
    this.camera.updateProjectionMatrix();
  }

  /** Screen-space position for capture / hit tests. */
  screenPoint(x: number, z: number) {
    const v = new THREE.Vector3(x, 0.4, z).project(this.camera);
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: (v.x * 0.5 + 0.5) * rect.width + rect.left,
      y: (-v.y * 0.5 + 0.5) * rect.height + rect.top,
    };
  }

  private frustum() {
    const w = this.canvas.clientWidth || 1;
    const h = this.canvas.clientHeight || 1;
    const aspect = w / h;
    const hh = this.viewH / this.camera.zoom;
    return { w, h, aspect, hh, hw: hh * aspect };
  }

  private worldFromEvent(e: PointerEvent): Vec2 | null {
    const rect = this.canvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(new THREE.Vector2(x, y), this.camera);
    const hit = new THREE.Vector3();
    if (!this.raycaster.ray.intersectPlane(this.ground, hit)) return null;
    return { x: hit.x, z: hit.z };
  }

  private screenDist(ax: number, ay: number, bx: number, by: number) {
    return Math.hypot(ax - bx, ay - by);
  }

  private hitDriver(sim: GameSim, sx: number, sy: number): string | null {
    const rect = this.canvas.getBoundingClientRect();
    let best: string | null = null;
    let bestD = 42;
    for (const d of sim.drivers) {
      const v = new THREE.Vector3(d.x, 0.4, d.z).project(this.camera);
      const px = (v.x * 0.5 + 0.5) * rect.width;
      const py = (-v.y * 0.5 + 0.5) * rect.height;
      const dist = this.screenDist(px, py, sx - rect.left, sy - rect.top);
      if (dist < bestD) {
        bestD = dist;
        best = d.id;
      }
    }
    return best;
  }

  private hitOrder(sim: GameSim, world: Vec2): string | null {
    let best: string | null = null;
    let bestD = 6.5;
    for (const o of sim.orders) {
      if (o.status === "delivered" || o.status === "late") continue;
      const r = sim.city.restaurants.find((x) => x.id === o.restaurantId);
      const c = sim.city.customers.find((x) => x.id === o.customerId);
      if (!r || !c) continue;
      const d = Math.min(Math.hypot(world.x - r.x, world.z - r.z), Math.hypot(world.x - c.x, world.z - c.z));
      if (d < bestD) {
        bestD = d;
        best = o.id;
      }
    }
    return best;
  }

  private simFromCanvas(): GameSim | null {
    return (this.canvas as HTMLCanvasElement & { __sim?: GameSim }).__sim ?? null;
  }

  attachSim(sim: GameSim) {
    (this.canvas as HTMLCanvasElement & { __sim?: GameSim }).__sim = sim;
  }

  private onDown = (e: PointerEvent) => {
    this.canvas.setPointerCapture(e.pointerId);
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.pointers.size === 2) {
      this.pendingTap = null;
      this.panning = null;
      const pts = [...this.pointers.values()];
      this.pinch = { dist: Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y), zoom: this.camera.zoom };
      return;
    }
    this.pendingTap = { pointerId: e.pointerId, x: e.clientX, y: e.clientY };
  };

  private onMove = (e: PointerEvent) => {
    if (this.pointers.has(e.pointerId)) this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.pointers.size >= 2 && this.pinch) {
      const pts = [...this.pointers.values()];
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      const scale = dist / Math.max(8, this.pinch.dist);
      this.camera.zoom = Math.min(2.4, Math.max(0.72, this.pinch.zoom * scale));
      this.refreshCamera();
      return;
    }
    if (this.pendingTap && this.pendingTap.pointerId === e.pointerId) {
      const moved = Math.hypot(e.clientX - this.pendingTap.x, e.clientY - this.pendingTap.y);
      if (moved > 10) {
        this.panning = { pointerId: e.pointerId, x: this.pendingTap.x, y: this.pendingTap.y };
        this.pendingTap = null;
      } else {
        return;
      }
    }
    if (this.panning && this.panning.pointerId === e.pointerId) {
      const { hw, hh, w, h } = this.frustum();
      const dx = e.clientX - this.panning.x;
      const dy = e.clientY - this.panning.y;
      this.panning.x = e.clientX;
      this.panning.y = e.clientY;
      this.camera.position.x -= (dx / w) * hw * 2;
      this.camera.position.z += (dy / h) * hh * 2;
      this.camera.lookAt(this.camera.position.x, 0, this.camera.position.z - 10);
    }
  };

  private onUp = (e: PointerEvent) => {
    this.pointers.delete(e.pointerId);
    if (this.pointers.size < 2) this.pinch = null;
    if (this.pendingTap && this.pendingTap.pointerId === e.pointerId) {
      const sim = this.simFromCanvas();
      if (sim && sim.started && !sim.over) {
        const world = this.worldFromEvent(e);
        const driverId = this.hitDriver(sim, e.clientX, e.clientY);
        const orderId = world ? this.hitOrder(sim, world) : null;
        if (driverId) this.onFocus?.({ type: "driver", id: driverId });
        else if (orderId) this.onFocus?.({ type: "order", id: orderId });
      }
      this.pendingTap = null;
    }
    if (this.panning?.pointerId === e.pointerId) this.panning = null;
    try {
      this.canvas.releasePointerCapture(e.pointerId);
    } catch {
      /* already released */
    }
  };

  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    const next = this.camera.zoom * (e.deltaY > 0 ? 0.92 : 1.08);
    this.camera.zoom = Math.min(2.4, Math.max(0.72, next));
    this.refreshCamera();
  };

  private writeDots(mesh: THREE.InstancedMesh, dots: Vec2[]) {
    const n = Math.min(dots.length, mesh.count);
    mesh.count = Math.max(n, 1);
    for (let i = 0; i < n; i++) {
      this.dummy.position.set(dots[i].x, 0.35, dots[i].z);
      this.dummy.rotation.set(-Math.PI / 2, 0, 0);
      this.dummy.scale.setScalar(1);
      this.dummy.updateMatrix();
      mesh.setMatrixAt(i, this.dummy.matrix);
    }
    if (n === 0) {
      this.dummy.position.set(0, -10, 0);
      this.dummy.updateMatrix();
      mesh.setMatrixAt(0, this.dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }

  resize() {
    const w = this.canvas.clientWidth || this.canvas.parentElement?.clientWidth || 1;
    const h = this.canvas.clientHeight || this.canvas.parentElement?.clientHeight || 1;
    const aspect = w / Math.max(1, h);
    this.viewH = Math.max(100, 80 / aspect);
    // Swap left/right so camera-right is world +X. Looking down with up=+Z
    // otherwise puts the Mediterranean (west, −X) on the right of the screen.
    this.camera.left = this.viewH * aspect;
    this.camera.right = -this.viewH * aspect;
    this.camera.top = this.viewH;
    this.camera.bottom = -this.viewH;
    this.refreshCamera();
    this.renderer.setSize(w, h, false);
  }

  render(sim: GameSim, dt: number) {
    if (this.disposed) return;
    this.canvas.style.pointerEvents = sim.started && !sim.over ? "auto" : "none";
    this.attachSim(sim);
    this.cityTick(dt);
    this.syncDrivers(sim);
    this.syncTrails(sim);
    this.syncOrders(sim);
    this.renderer.render(this.scene, this.camera);
  }

  private syncDrivers(sim: GameSim) {
    const seen = new Set<string>();
    for (const d of sim.drivers) {
      seen.add(d.id);
      let g = this.driverMeshes.get(d.id);
      if (!g) {
        g = new THREE.Group();
        const shadow = new THREE.Mesh(
          new THREE.CircleGeometry(1.15, 12),
          new THREE.MeshBasicMaterial({ color: 0x3a3228, transparent: true, opacity: 0.14, side: THREE.DoubleSide })
        );
        shadow.rotation.x = -Math.PI / 2;
        shadow.position.y = 0.12;
        const body = new THREE.Mesh(this.vehicleGeo, new THREE.MeshBasicMaterial({ color: d.color, side: THREE.DoubleSide }));
        body.position.y = 0.4;
        const rim = new THREE.Mesh(this.vehicleGeo, new THREE.MeshBasicMaterial({ color: 0xfffaf2, side: THREE.DoubleSide }));
        rim.position.y = 0.38;
        rim.scale.setScalar(1.18);
        g.add(shadow, rim, body);
        g.userData = { type: "driver", id: d.id };
        this.scene.add(g);
        this.driverMeshes.set(d.id, g);
      }
      g.position.set(d.x, 0, d.z);
      g.rotation.y = d.heading;
      g.scale.setScalar(sim.selectedDriverId === d.id ? 1.18 : 1);
      const job = sim.orders.find((o) => o.driverId === d.id && o.status !== "late" && o.status !== "delivered");
      let halo = g.userData.halo as THREE.Mesh | undefined;
      if (!halo) {
        halo = new THREE.Mesh(
          new THREE.RingGeometry(1.35, 1.85, 20),
          new THREE.MeshBasicMaterial({ color: d.color, side: THREE.DoubleSide, transparent: true, opacity: 0.9 })
        );
        halo.rotation.x = -Math.PI / 2;
        halo.position.y = 0.13;
        g.add(halo);
        g.userData.halo = halo;
      }
      if (job) {
        halo.visible = true;
        (halo.material as THREE.MeshBasicMaterial).color.setHex(sim.pairInfo(job.id).color);
      } else {
        halo.visible = d.state === "returning";
        (halo.material as THREE.MeshBasicMaterial).color.setHex(0x9aa3ab);
      }
    }
    for (const [id, g] of this.driverMeshes) {
      if (!seen.has(id)) {
        this.scene.remove(g);
        this.driverMeshes.delete(id);
      }
    }
  }

  private syncTrails(sim: GameSim) {
    const seen = new Set<string>();
    for (const d of sim.drivers) {
      const pts = sim.remainingTrail(d.id);
      if (pts.length < 2) {
        const old = this.trailDots.get(d.id);
        if (old) {
          this.scene.remove(old);
          this.trailDots.delete(d.id);
        }
        continue;
      }
      seen.add(d.id);
      const kind = sim.driverRouteKind(d.id);
      const color = kind === "delivery" ? 0x4a8f9a : kind === "pickup" ? 0xe07a4a : d.color;
      const gap = kind === "delivery" ? 1.65 : 2.25;
      const dots = resampleDots(pts, gap);
      let mesh = this.trailDots.get(d.id);
      if (!mesh) {
        mesh = new THREE.InstancedMesh(
          this.dotGeo,
          new THREE.MeshBasicMaterial({ color: d.color, transparent: true, opacity: 0.92, side: THREE.DoubleSide }),
          360
        );
        mesh.frustumCulled = false;
        this.scene.add(mesh);
        this.trailDots.set(d.id, mesh);
      }
      (mesh.material as THREE.MeshBasicMaterial).color.setHex(color);
      this.writeDots(mesh, dots);
    }
    for (const [id, mesh] of this.trailDots) {
      if (!seen.has(id)) {
        this.scene.remove(mesh);
        this.trailDots.delete(id);
      }
    }
  }

  private syncOrders(sim: GameSim) {
    const live = sim.orders.filter((o) => o.status !== "delivered" && o.status !== "late");
    const seen = new Set<string>();
    for (const o of live) {
      seen.add(o.id);
      const info = sim.pairInfo(o.id);
      let g = this.orderMarkers.get(o.id);
      if (!g || g.userData.ticketNo !== info.ticketNo || g.userData.pairColor !== info.color) {
        if (g) this.scene.remove(g);
        g = makePairedOrder(info.color, info.ticketNo);
        g.userData.type = "order";
        g.userData.id = o.id;
        this.scene.add(g);
        this.orderMarkers.set(o.id, g);
      }
      const rest = sim.city.restaurants.find((x) => x.id === o.restaurantId)!;
      const cust = sim.city.customers.find((x) => x.id === o.customerId)!;
      const pickup = g.userData.pickup as THREE.Group;
      const drop = g.userData.drop as THREE.Group;
      pickup.position.set(rest.x, 0.12, rest.z);
      drop.position.set(cust.x, 0.12, cust.z);
      const pulse = o.id === sim.incomingId ? 1.12 + Math.sin(performance.now() / 180) * 0.08 : o.id === sim.selectedOrderId ? 1.1 : 1;
      pickup.scale.setScalar(pulse);
      drop.scale.setScalar(o.status === "picked" ? 1.12 : 0.95);
      const line = g.userData.line as THREE.Line;
      const pos = line.geometry.getAttribute("position") as THREE.BufferAttribute;
      pos.setXYZ(0, rest.x, 0.2, rest.z);
      pos.setXYZ(1, cust.x, 0.2, cust.z);
      pos.needsUpdate = true;
      line.computeLineDistances();
    }
    for (const [id, g] of this.orderMarkers) {
      if (!seen.has(id)) {
        this.scene.remove(g);
        this.orderMarkers.delete(id);
      }
    }
  }

  dispose() {
    this.disposed = true;
    this.canvas.removeEventListener("pointerdown", this.onDown);
    this.canvas.removeEventListener("pointermove", this.onMove);
    this.canvas.removeEventListener("pointerup", this.onUp);
    this.canvas.removeEventListener("pointercancel", this.onUp);
    this.canvas.removeEventListener("wheel", this.onWheel);
    this.renderer.dispose();
  }
}

function makeChevron() {
  const shape = new THREE.Shape();
  shape.moveTo(0, 1.55);
  shape.bezierCurveTo(0.18, 1.2, 0.55, 0.2, 0.72, -1.05);
  shape.lineTo(0, -0.35);
  shape.lineTo(-0.72, -1.05);
  shape.bezierCurveTo(-0.55, 0.2, -0.18, 1.2, 0, 1.55);
  const geo = new THREE.ShapeGeometry(shape);
  geo.rotateX(-Math.PI / 2);
  // Nose was −Z after the X rotation; yaw 0 should face +Z (travel north).
  geo.rotateY(Math.PI);
  return geo;
}

function makePairedOrder(color: number, n: number) {
  const g = new THREE.Group();
  g.userData.ticketNo = n;
  g.userData.pairColor = color;

  const pickup = new THREE.Group();
  const fill = new THREE.Mesh(
    new THREE.CircleGeometry(1.2, 22),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.92, side: THREE.DoubleSide })
  );
  fill.rotation.x = -Math.PI / 2;
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(1.28, 1.72, 26),
    new THREE.MeshBasicMaterial({ color: 0xfffaf2, side: THREE.DoubleSide })
  );
  ring.rotation.x = -Math.PI / 2;
  const kitchenNo = numberSprite(n);
  kitchenNo.position.y = 1.05;
  pickup.add(fill, ring, kitchenNo);

  const drop = new THREE.Group();
  const sq = new THREE.Mesh(
    new THREE.PlaneGeometry(2.15, 2.15),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, side: THREE.DoubleSide })
  );
  sq.rotation.x = -Math.PI / 2;
  sq.rotation.z = Math.PI / 4;
  const dropNo = numberSprite(n);
  dropNo.position.y = 1.05;
  drop.add(sq, dropNo);

  const lineGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(1, 0, 0)]);
  const line = new THREE.Line(
    lineGeo,
    new THREE.LineDashedMaterial({ color, transparent: true, opacity: 0.42, dashSize: 1.35, gapSize: 0.85 })
  );

  g.add(pickup, drop, line);
  g.userData.pickup = pickup;
  g.userData.drop = drop;
  g.userData.line = line;
  g.userData.type = "order";
  return g;
}

function numberSprite(n: number) {
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext("2d")!;
  ctx.clearRect(0, 0, 128, 128);
  ctx.font = "800 78px ui-sans-serif, system-ui, sans-serif";
  ctx.fillStyle = "#fffaf2";
  ctx.strokeStyle = "rgba(20,28,36,0.55)";
  ctx.lineWidth = 10;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.strokeText(String(n), 64, 70);
  ctx.fillText(String(n), 64, 70);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
  spr.scale.set(-3.2, 3.2, 1);
  spr.renderOrder = 12;
  return spr;
}
