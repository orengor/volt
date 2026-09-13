import {
  ARRIVE_RADIUS,
  BASE_SPEED,
  DRIVER_COLORS,
  DRIVER_NAMES,
  GAME_MINUTES_PER_REAL_SECOND,
  LATE_GAME_MINUTES,
  MAX_DRIVERS,
  MAX_STRIKES,
  ORDER_PAIR_COLORS,
  STARTING_DRIVERS,
  START_HOUR,
} from "./constants";
import type { CityData, Vec2 } from "./types";
import type {
  Driver,
  DriverView,
  GameSnapshot,
  Order,
  OrderView,
  ShopItemView,
  UpgradeId,
} from "./types";
import { curbAt, generateCity, nearestNode } from "./city";
import { routeOnStreets } from "./pathfind";
import { dist, formatDue, formatGameClock, hexColor } from "./util";

let seq = 1;
const uid = (p: string) => `${p}-${seq++}`;

function shortPlace(s: string) {
  return s.replace(/, Jaffa|, the Port/g, "").replace(/ St$| Blvd$| Rd$/g, "");
}

function jobVerb(state: Driver["state"]) {
  if (state === "to_pickup") return "To";
  if (state === "waiting") return "Wait";
  if (state === "delivering") return "Drop";
  if (state === "returning") return "Back";
  return "Idle";
}

export class GameSim {
  city: CityData;
  started = false;
  over = false;
  score = 0;
  strikes = 0;
  deliveries = 0;
  gameMinutes = 0;
  realElapsed = 0;
  spawnTimer = 1.6;
  orders: Order[] = [];
  drivers: Driver[] = [];
  selectedOrderId: string | null = null;
  selectedDriverId: string | null = null;
  toast: string | null = null;
  toastT = 0;
  incomingId: string | null = null;
  incomingT = 0;
  upgrades = new Set<UpgradeId>();
  hiredExtra = 0;
  onDing: (() => void) | null = null;
  private usedPairs = new Set<string>();

  constructor(city?: CityData) {
    this.city = city ?? generateCity();
    for (let i = 0; i < STARTING_DRIVERS; i++) this.addDriver(i);
  }

  setDingHandler(handler: (() => void) | null) {
    this.onDing = handler;
  }

  private addDriver(index: number) {
    const pose = curbAt(this.city, this.city.hubNodeId, index);
    const d: Driver = {
      id: uid("drv"),
      name: DRIVER_NAMES[index % DRIVER_NAMES.length],
      color: DRIVER_COLORS[index % DRIVER_COLORS.length],
      nodeId: pose.nodeId,
      x: pose.x,
      z: pose.z,
      heading: pose.heading,
      assigned: [],
      carrying: [],
      trail: [],
      trailIndex: 0,
      edgeT: 0,
      wait: 0,
      state: "idle",
      statusLine: "Idle",
    };
    this.drivers.push(d);
    return d;
  }

  get capacity() {
    if (this.upgrades.has("triple-stack")) return 3;
    if (this.upgrades.has("second-bag")) return 2;
    return 1;
  }

  get cookMultiplier() {
    return this.upgrades.has("kitchen-radar") ? 1.22 : 1;
  }

  get speedMul() {
    let m = 1;
    if (this.upgrades.has("highway-scooters")) m *= 1.28;
    if (this.upgrades.has("run-reds")) m *= 1.12;
    return m;
  }

  start() {
    this.started = true;
    this.spawnTimer = 0.35;
  }

  selectOrder(id: string | null) {
    this.selectedOrderId = id;
  }

  selectDriver(id: string | null) {
    this.selectedDriverId = id;
  }

  assign(orderId: string, driverId: string): { ok: boolean; error: string | null } {
    if (this.over) return { ok: false, error: "Night's over." };
    const order = this.orders.find((o) => o.id === orderId);
    const driver = this.drivers.find((d) => d.id === driverId);
    if (!order) return { ok: false, error: "That order already left the board." };
    if (!driver) return { ok: false, error: "No such rider." };
    if (order.status === "late" || order.status === "delivered") {
      return { ok: false, error: "Too late to send anyone." };
    }
    if (order.driverId && order.driverId !== driver.id) {
      return { ok: false, error: "Another rider already has this one." };
    }
    if (order.driverId === driver.id) return { ok: true, error: null };
    const load = driver.assigned.length;
    if (load >= this.capacity) {
      return {
        ok: false,
        error:
          this.capacity === 1
            ? `${driver.name} already has a bag. Buy a second bag — or pick an idle rider.`
            : `${driver.name} is full (${load}/${this.capacity}).`,
      };
    }
    order.driverId = driver.id;
    order.status = "assigned";
    driver.assigned.push(order.id);
    this.selectedOrderId = null;
    this.selectedDriverId = null;
    const rest = this.city.restaurants.find((r) => r.id === order.restaurantId);
    if (rest) this.routeTo(driver, rest.x, rest.z);
    this.ping(`${driver.name} rolling to ${rest?.name ?? "the kitchen"}`);
    return { ok: true, error: null };
  }

  pickOrder(id: string) {
    this.selectedOrderId = id;
    return this.tryPair();
  }

  pickDriver(id: string) {
    this.selectedDriverId = id;
    return this.tryPair();
  }

  private tryPair(): { ok: boolean; error: string | null } {
    if (!this.selectedOrderId || !this.selectedDriverId) return { ok: true, error: null };
    return this.assign(this.selectedOrderId, this.selectedDriverId);
  }

  private routeTo(driver: Driver, x: number, z: number) {
    const trail = routeOnStreets(this.city, driver.x, driver.z, x, z);
    if (trail[0]) {
      driver.x = trail[0].x;
      driver.z = trail[0].z;
    }
    this.setTrail(driver, trail);
  }

  private setTrail(driver: Driver, points: Vec2[]) {
    driver.trail = points.length >= 2 ? points : [];
    driver.trailIndex = 0;
    driver.edgeT = 0;
  }

  private liveOrders(driver: Driver) {
    return driver.assigned
      .map((id) => this.orders.find((o) => o.id === id))
      .filter((o): o is Order => !!o && o.status !== "late" && o.status !== "delivered");
  }

  buy(id: string): { ok: boolean; error: string | null } {
    if (this.over) return { ok: false, error: "Shop closed — the night ended." };
    if (id === "hire") {
      if (this.drivers.length >= MAX_DRIVERS) return { ok: false, error: "Roster's full. Eight riders is the cap." };
      const cost = this.hireCost();
      if (this.score < cost) return { ok: false, error: `Need ${cost - this.score} more points to hire.` };
      this.score -= cost;
      this.hiredExtra += 1;
      const d = this.addDriver(this.drivers.length);
      this.ping(`${d.name} is on the board. Tap a ticket, then a rider.`);
      return { ok: true, error: null };
    }
    const up = id as UpgradeId;
    const catalog = this.upgradeCatalog();
    const item = catalog.find((c) => c.id === up);
    if (!item) return { ok: false, error: "Unknown upgrade." };
    if (this.upgrades.has(up)) return { ok: false, error: "Already equipped." };
    if (up === "triple-stack" && !this.upgrades.has("second-bag")) {
      return { ok: false, error: "Buy the second bag first." };
    }
    if (this.score < item.cost) return { ok: false, error: `Need ${item.cost - this.score} more points.` };
    this.score -= item.cost;
    this.upgrades.add(up);
    this.ping(item.title + " is live.");
    return { ok: true, error: null };
  }

  hireCost() {
    return 160 + this.hiredExtra * 90;
  }

  upgradeCatalog(): { id: UpgradeId; title: string; blurb: string; cost: number }[] {
    return [
      { id: "second-bag", title: "Second bag", blurb: "One rider can carry two live orders.", cost: 220 },
      { id: "triple-stack", title: "Triple stack", blurb: "Three orders on a single scooter.", cost: 400 },
      { id: "run-reds", title: "Run the reds", blurb: "No more little pauses at crossings.", cost: 260 },
      { id: "highway-scooters", title: "Highway scooters", blurb: "A calmer, quicker glide across the city.", cost: 300 },
      { id: "kitchen-radar", title: "Kitchen radar", blurb: "Kitchens finish 22% faster citywide.", cost: 180 },
    ];
  }

  private ping(msg: string) {
    this.toast = msg;
    this.toastT = 3.2;
  }

  private spawnInterval() {
    const t = this.realElapsed;
    if (t < 30) return 9.2;
    if (t < 70) return 7.4;
    if (t < 120) return 5.8;
    if (t < 180) return 4.6;
    return 3.8;
  }

  private spawnOrder() {
    const rests = this.city.restaurants;
    const custs = this.city.customers;
    const rest = rests[Math.floor(Math.random() * rests.length)];
    let cust = custs[Math.floor(Math.random() * custs.length)];
    let guard = 0;
    while ((rest.nodeId === cust.nodeId || (rest.hood === cust.hood && guard < 6)) && guard < 12) {
      cust = custs[Math.floor(Math.random() * custs.length)];
      guard += 1;
    }
    const pair = `${rest.id}:${cust.id}`;
    if (this.usedPairs.has(pair)) {
      cust = custs[Math.floor(Math.random() * custs.length)];
    }
    this.usedPairs.add(pair);
    const cook = 12 + Math.random() * 16;
    const order: Order = {
      id: uid("ord"),
      restaurantId: rest.id,
      customerId: cust.id,
      cookTotal: cook,
      cookRemaining: cook,
      createdGameMin: this.gameMinutes,
      status: "cooking",
      driverId: null,
      points: 0,
    };
    this.orders.push(order);
    this.incomingId = order.id;
    this.incomingT = 3.4;
    this.onDing?.();
  }

  update(dt: number) {
    if (!this.started || this.over) return;
    const step = Math.min(dt, 0.05);
    this.realElapsed += step;
    this.gameMinutes += step * GAME_MINUTES_PER_REAL_SECOND;
    if (this.toastT > 0) {
      this.toastT -= step;
      if (this.toastT <= 0) this.toast = null;
    }
    if (this.incomingT > 0) {
      this.incomingT -= step;
      if (this.incomingT <= 0) this.incomingId = null;
    }

    this.spawnTimer -= step;
    if (this.spawnTimer <= 0) {
      this.spawnOrder();
      this.spawnTimer = this.spawnInterval();
    }

    for (const o of this.orders) {
      if (o.status === "delivered" || o.status === "late") continue;
      if (o.cookRemaining > 0) {
        o.cookRemaining = Math.max(0, o.cookRemaining - step * this.cookMultiplier);
        if (o.cookRemaining === 0 && o.status === "cooking") o.status = "ready";
      }
      const age = this.gameMinutes - o.createdGameMin;
      if (age >= LATE_GAME_MINUTES) this.failOrder(o);
    }

    for (const d of this.drivers) this.tickDriver(d, step);
  }

  private failOrder(order: Order) {
    if (order.status === "late" || order.status === "delivered") return;
    order.status = "late";
    this.strikes += 1;
    if (order.driverId) {
      const d = this.drivers.find((x) => x.id === order.driverId);
      if (d) {
        d.assigned = d.assigned.filter((id) => id !== order.id);
        d.carrying = d.carrying.filter((id) => id !== order.id);
        d.trail = [];
        d.trailIndex = 0;
      }
    }
    const r = this.city.restaurants.find((x) => x.id === order.restaurantId);
    this.ping(`${r?.name ?? "An order"} went cold. ${this.strikes}/${MAX_STRIKES} late.`);
    if (this.strikes >= MAX_STRIKES) {
      this.over = true;
      this.toast = "Three dinners went cold. Tel Aviv noticed.";
    }
  }

  private tickDriver(driver: Driver, dt: number) {
    const live = this.liveOrders(driver);
    driver.assigned = live.map((o) => o.id);

    if (driver.wait > 0) {
      driver.wait -= dt;
      return;
    }

    if (live.length === 0) {
      const hub = this.city.nodeById[this.city.hubNodeId];
      if (!hub) {
        driver.state = "idle";
        driver.statusLine = "Idle";
        return;
      }
      const atHub = dist(driver.x, driver.z, hub.x, hub.z) < ARRIVE_RADIUS * 1.6;
      if (atHub) {
        if (driver.state !== "idle") {
          const pose = curbAt(this.city, this.city.hubNodeId, driver.name.length);
          driver.x = pose.x;
          driver.z = pose.z;
          driver.heading = pose.heading;
          driver.nodeId = pose.nodeId;
        }
        driver.state = "idle";
        driver.statusLine = "Idle";
        driver.carrying = [];
        driver.trail = [];
        driver.trailIndex = 0;
        return;
      }
      driver.state = "returning";
      driver.statusLine = "Back · Dizengoff";
      driver.carrying = [];
      if (driver.trail.length < 2) this.routeTo(driver, hub.x, hub.z);
      this.followTrail(driver, dt);
      return;
    }

    const unpicked = live.filter((o) => !driver.carrying.includes(o.id));
    if (unpicked.length) {
      const order = unpicked[0];
      const rest = this.city.restaurants.find((r) => r.id === order.restaurantId)!;
      const here = dist(driver.x, driver.z, rest.x, rest.z) < ARRIVE_RADIUS;
      if (here) {
        if (order.cookRemaining > 0) {
          if (driver.state !== "waiting") {
            const pose = curbAt(this.city, rest.nodeId, driver.name.length);
            driver.x = pose.x;
            driver.z = pose.z;
            driver.heading = pose.heading;
            driver.nodeId = pose.nodeId;
            driver.trail = [];
            driver.trailIndex = 0;
          }
          driver.state = "waiting";
          driver.statusLine = `Wait · ${rest.name}`;
          return;
        }
        driver.carrying.push(order.id);
        order.status = "picked";
        driver.trail = [];
        driver.trailIndex = 0;
        const nextUnpicked = live.filter((o) => !driver.carrying.includes(o.id));
        if (nextUnpicked.length) {
          const nxt = this.city.restaurants.find((r) => r.id === nextUnpicked[0].restaurantId)!;
          this.routeTo(driver, nxt.x, nxt.z);
          driver.statusLine = `To ${nxt.name}`;
        } else {
          const cust = this.city.customers.find((c) => c.id === order.customerId)!;
          this.routeTo(driver, cust.x, cust.z);
          driver.statusLine = `Drop · ${shortPlace(cust.address)}`;
        }
        return;
      }
      driver.state = "to_pickup";
      driver.statusLine = `To ${rest.name}`;
      if (driver.trail.length < 2) this.routeTo(driver, rest.x, rest.z);
      this.followTrail(driver, dt);
      return;
    }

    const order = live.find((o) => driver.carrying.includes(o.id))!;
    const cust = this.city.customers.find((c) => c.id === order.customerId)!;
    const here = dist(driver.x, driver.z, cust.x, cust.z) < ARRIVE_RADIUS;
    if (here) {
      this.complete(order, driver);
      return;
    }
    driver.state = "delivering";
    driver.statusLine = `Drop · ${shortPlace(cust.address)}`;
    if (driver.trail.length < 2) this.routeTo(driver, cust.x, cust.z);
    this.followTrail(driver, dt);
  }

  private followTrail(driver: Driver, dt: number) {
    const pts = driver.trail;
    if (pts.length < 2) return;
    const spd = BASE_SPEED * this.speedMul;
    let remainDt = dt;
    while (remainDt > 0 && driver.trailIndex < pts.length - 1) {
      const a = pts[driver.trailIndex];
      const b = pts[driver.trailIndex + 1];
      const len = Math.max(0.001, dist(a.x, a.z, b.x, b.z));
      const remain = (1 - driver.edgeT) * len;
      const step = spd * remainDt;
      driver.heading = Math.atan2(b.x - a.x, b.z - a.z);
      if (step >= remain) {
        remainDt -= remain / spd;
        driver.edgeT = 0;
        driver.trailIndex += 1;
        driver.x = b.x;
        driver.z = b.z;
        if (!this.upgrades.has("run-reds") && Math.random() < 0.04) {
          driver.wait = 0.22 + Math.random() * 0.28;
          break;
        }
      } else {
        driver.edgeT += step / len;
        driver.x = a.x + (b.x - a.x) * driver.edgeT;
        driver.z = a.z + (b.z - a.z) * driver.edgeT;
        remainDt = 0;
      }
    }
    if (driver.trailIndex >= pts.length - 1) {
      driver.trail = [];
      driver.trailIndex = 0;
      driver.edgeT = 0;
    }
  }

  private complete(order: Order, driver: Driver) {
    order.status = "delivered";
    const rest = this.city.restaurants.find((r) => r.id === order.restaurantId)!;
    const cust = this.city.customers.find((c) => c.id === order.customerId)!;
    const distance = dist(rest.x, rest.z, cust.x, cust.z);
    const left = LATE_GAME_MINUTES - (this.gameMinutes - order.createdGameMin);
    const bonus = left > 20 ? 30 : left > 8 ? 10 : 0;
    const pts = 90 + Math.round(distance * 0.45) + bonus;
    order.points = pts;
    this.score += pts;
    this.deliveries += 1;
    driver.assigned = driver.assigned.filter((id) => id !== order.id);
    driver.carrying = driver.carrying.filter((id) => id !== order.id);
    driver.trail = [];
    driver.trailIndex = 0;
    this.ping(`Dropped at ${cust.address} · +${pts}`);
  }

  remainingTrail(driverId: string): Vec2[] {
    const d = this.drivers.find((x) => x.id === driverId);
    if (!d || d.trail.length < 2) return [];
    return [{ x: d.x, z: d.z }, ...d.trail.slice(d.trailIndex + 1)];
  }

  pairInfo(orderId: string) {
    const board = this.orders.filter((o) => o.status !== "delivered" && o.status !== "late");
    const idx = board.findIndex((o) => o.id === orderId);
    if (idx < 0) return { ticketNo: 0, color: 0x9aa3ab };
    return { ticketNo: idx + 1, color: ORDER_PAIR_COLORS[idx % ORDER_PAIR_COLORS.length] };
  }

  driverRouteKind(driverId: string): "pickup" | "delivery" | null {
    const d = this.drivers.find((x) => x.id === driverId);
    if (!d) return null;
    if (d.state === "to_pickup" || d.state === "waiting") return "pickup";
    if (d.state === "delivering") return "delivery";
    if (d.state === "returning") return "delivery";
    return d.trail.length >= 2 ? "pickup" : null;
  }

  snapshot(): GameSnapshot {
    const hoodName = (id: string) => this.city.neighborhoods.find((h) => h.id === id)?.name ?? id;
    const board = this.orders.filter((o) => o.status !== "delivered" && o.status !== "late");
    const lateOnes = this.orders.filter((o) => o.status === "late");
    const toView = (o: Order, idx: number): OrderView => {
        const r = this.city.restaurants.find((x) => x.id === o.restaurantId)!;
        const c = this.city.customers.find((x) => x.id === o.customerId)!;
        const due = LATE_GAME_MINUTES - (this.gameMinutes - o.createdGameMin);
        const drv = this.drivers.find((d) => d.id === o.driverId);
        const pairColor = hexColor(ORDER_PAIR_COLORS[idx % ORDER_PAIR_COLORS.length]);
        let phase: OrderView["phase"] = "cooking";
        if (o.status === "late") phase = "late";
        else if (o.status === "picked") phase = "out";
        else if (o.driverId && o.cookRemaining > 0) phase = "queued";
        else if (o.cookRemaining <= 0) phase = "ready";
        else phase = "cooking";
        const statusLabel =
          phase === "late"
            ? "Late"
            : phase === "out"
              ? "Out for delivery"
              : phase === "queued"
                ? "Queued · cooking"
                : phase === "ready"
                  ? "Ready"
                  : "Cooking";
        return {
          id: o.id,
          restaurantName: r.name,
          restaurantAddress: r.address,
          customerAddress: c.address,
          hood: hoodName(r.hood),
          status: o.status,
          statusLabel,
          cookPct: 1 - o.cookRemaining / o.cookTotal,
          cookReady: o.cookRemaining <= 0,
          dueGameMin: due,
          latePct: Math.max(0, Math.min(1, due / LATE_GAME_MINUTES)),
          dueLabel: formatDue(due),
          slipping: due <= 22 && o.status !== "late",
          driverId: o.driverId,
          driverName: drv?.name ?? null,
          driverColor: drv ? hexColor(drv.color) : null,
          phase,
          ticketNo: idx + 1,
          pairColor,
          selected: this.selectedOrderId === o.id,
          x: r.x,
          z: r.z,
          destX: c.x,
          destZ: c.z,
        };
      };
    const orders: OrderView[] = [
      ...board.map((o, i) => toView(o, i)),
      ...lateOnes.map((o) => toView(o, 8)),
    ];

    const drivers: DriverView[] = this.drivers.map((d) => {
      const driverJobs = d.assigned
        .map((id) => orders.find((o) => o.id === id))
        .filter((o): o is OrderView => !!o && o.phase !== "late");
      const jobOrder = driverJobs[0];
      const carrying = driverJobs.find((o) => d.carrying.includes(o.id) || o.phase === "out");
      const pickup = driverJobs.find((o) => !d.carrying.includes(o.id) && o.phase !== "out");
      const nearbyRestaurant = this.city.restaurants.find((r) => dist(r.x, r.z, d.x, d.z) < 2.4);
      const street = nearestNode(this.city, d.x, d.z).label?.replace(/ & /g, " × ");
      const locationLabel = nearbyRestaurant
        ? `${nearbyRestaurant.name} · ${nearbyRestaurant.address}`
        : street
          ? `On ${street}`
          : "On the Tel Aviv street grid";
      const destinationLabel =
        d.state === "delivering" && carrying
          ? carrying.customerAddress
          : (d.state === "to_pickup" || d.state === "waiting") && pickup
            ? `${pickup.restaurantName} · ${pickup.restaurantAddress}`
            : d.state === "returning"
              ? "Dizengoff rider hub"
              : driverJobs.length
                ? driverJobs[0].phase === "out"
                  ? driverJobs[0].customerAddress
                  : `${driverJobs[0].restaurantName} · ${driverJobs[0].restaurantAddress}`
                : "Waiting for an order";
      return {
        id: d.id,
        name: d.name,
        color: hexColor(d.color),
        state: d.state,
        statusLine: d.statusLine,
        locationLabel,
        destinationLabel,
        load: d.assigned.length,
        capacity: this.capacity,
        selected: this.selectedDriverId === d.id,
        idle: d.state === "idle",
        jobColor: jobOrder?.pairColor ?? null,
        jobVerb: jobVerb(d.state),
        jobs: driverJobs.map((o) => ({
          id: o.id,
          ticketNo: o.ticketNo,
          pairColor: o.pairColor,
          restaurantName: o.restaurantName,
          restaurantAddress: o.restaurantAddress,
          customerAddress: o.customerAddress,
          statusLabel: o.statusLabel,
          targetLabel:
            d.carrying.includes(o.id) || o.phase === "out"
              ? `Drop · ${o.customerAddress}`
              : o.cookReady
                ? `Pickup · ${o.restaurantAddress}`
                : `Cooking · ${o.restaurantName}`,
        })),
        x: d.x,
        z: d.z,
      };
    });

    const shop: ShopItemView[] = [
      {
        id: "hire",
        title: "Hire a rider",
        blurb:
          this.drivers.length >= MAX_DRIVERS
            ? "Roster is full."
            : `They wait on the Dizengoff curb. You have ${this.drivers.length} on the board.`,
        cost: this.hireCost(),
        kind: "hire",
        owned: this.drivers.length >= MAX_DRIVERS,
        affordable: this.score >= this.hireCost() && this.drivers.length < MAX_DRIVERS,
        disabledReason:
          this.drivers.length >= MAX_DRIVERS
            ? "Already at eight riders"
            : this.score < this.hireCost()
              ? `Need ${this.hireCost() - this.score} more points`
              : null,
      },
      ...this.upgradeCatalog().map((u) => {
        const owned = this.upgrades.has(u.id);
        const locked = u.id === "triple-stack" && !this.upgrades.has("second-bag");
        let disabledReason: string | null = null;
        if (owned) disabledReason = "Already owned";
        else if (locked) disabledReason = "Buy Second bag first";
        else if (this.score < u.cost) disabledReason = `Need ${u.cost - this.score} more points`;
        return {
          id: u.id,
          title: u.title,
          blurb: u.blurb,
          cost: u.cost,
          kind: "upgrade" as const,
          owned,
          affordable: !owned && !locked && this.score >= u.cost,
          disabledReason,
        };
      }),
    ];

    const active = orders.filter((o) => o.status !== "late").length;
    return {
      started: this.started,
      over: this.over,
      score: this.score,
      strikes: this.strikes,
      deliveries: this.deliveries,
      gameClock: formatGameClock(this.gameMinutes, START_HOUR),
      gameMinutes: this.gameMinutes,
      realElapsed: this.realElapsed,
      spawnHint:
        active === 0
          ? "Quiet chart. Next ping is coming."
          : `${active} live · tap a ticket, then a rider`,
      selectedOrderId: this.selectedOrderId,
      selectedDriverId: this.selectedDriverId,
      toast: this.toast,
      incomingId: this.incomingId,
      orders,
      drivers,
      shop,
      capacity: this.capacity,
      cookMultiplier: this.cookMultiplier,
      survivedGameMinutes: this.gameMinutes,
    };
  }
}
