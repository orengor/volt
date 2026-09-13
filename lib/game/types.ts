export type Vec2 = { x: number; z: number };

export type NeighborhoodId =
  | "jaffa"
  | "florentin"
  | "rothschild"
  | "dizengoff"
  | "port"
  | "yarkon"
  | "east";

export type EdgeKind = "street" | "boulevard" | "highway" | "promenade";

export type MapNode = {
  id: string;
  x: number;
  z: number;
  label?: string;
};

export type MapEdge = {
  id: string;
  a: string;
  b: string;
  kind: EdgeKind;
};

export type BuildingSpec = {
  x: number;
  z: number;
  w: number;
  d: number;
  h: number;
  rot: number;
  color: number;
  roof: number;
  hood: NeighborhoodId;
};

export type TreeSpec = { x: number; z: number; scale: number; kind: "ficus" | "palm" | "park" };

export type LandmarkSpec =
  | { kind: "azrieli-round"; x: number; z: number }
  | { kind: "azrieli-tri"; x: number; z: number }
  | { kind: "azrieli-square"; x: number; z: number }
  | { kind: "clock-tower"; x: number; z: number }
  | { kind: "lighthouse"; x: number; z: number }
  | { kind: "dizengoff-center"; x: number; z: number }
  | { kind: "port-crane"; x: number; z: number; rot: number }
  | { kind: "pier"; x: number; z: number; w: number; d: number; rot: number }
  | { kind: "fountain"; x: number; z: number; r: number };

export type Neighborhood = {
  id: NeighborhoodId;
  name: string;
  color: number;
};

export type Restaurant = {
  id: string;
  name: string;
  address: string;
  hood: NeighborhoodId;
  nodeId: string;
  x: number;
  z: number;
};

export type CustomerSpot = {
  id: string;
  address: string;
  hood: NeighborhoodId;
  nodeId: string;
  x: number;
  z: number;
};

export type CityData = {
  nodes: MapNode[];
  nodeById: Record<string, MapNode>;
  edges: MapEdge[];
  adj: Record<string, { to: string; kind: EdgeKind; length: number }[]>;
  buildings: BuildingSpec[];
  trees: TreeSpec[];
  landmarks: LandmarkSpec[];
  restaurants: Restaurant[];
  customers: CustomerSpot[];
  neighborhoods: Neighborhood[];
  coast: Vec2[];
  yarkon: Vec2[];
  beach: Vec2[];
  ayalon: { x: number; z0: number; z1: number; width: number };
  hubNodeId: string;
  dizengoffCircle: { x: number; z: number; r: number };
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
};

export type DriverState = "idle" | "to_pickup" | "waiting" | "delivering" | "returning";

export type OrderStatus = "cooking" | "ready" | "assigned" | "picked" | "delivered" | "late";

export type OrderPhase = "queued" | "cooking" | "ready" | "out" | "late";

export type Order = {
  id: string;
  restaurantId: string;
  customerId: string;
  cookTotal: number;
  cookRemaining: number;
  createdGameMin: number;
  status: OrderStatus;
  driverId: string | null;
  points: number;
};

export type Driver = {
  id: string;
  name: string;
  color: number;
  nodeId: string;
  x: number;
  z: number;
  heading: number;
  assigned: string[];
  carrying: string[];
  trail: Vec2[];
  trailIndex: number;
  edgeT: number;
  wait: number;
  state: DriverState;
  statusLine: string;
};

export type UpgradeId = "second-bag" | "triple-stack" | "run-reds" | "highway-scooters" | "kitchen-radar";

export type ShopItemView = {
  id: string;
  title: string;
  blurb: string;
  cost: number;
  kind: "hire" | "upgrade";
  owned: boolean;
  affordable: boolean;
  disabledReason: string | null;
};

export type OrderView = {
  id: string;
  restaurantName: string;
  restaurantAddress: string;
  customerAddress: string;
  hood: string;
  status: OrderStatus;
  statusLabel: string;
  cookPct: number;
  cookReady: boolean;
  dueGameMin: number;
  dueLabel: string;
  slipping: boolean;
  driverId: string | null;
  driverName: string | null;
  driverColor: string | null;
  phase: OrderPhase;
  ticketNo: number;
  pairColor: string;
  selected: boolean;
  x: number;
  z: number;
  destX: number;
  destZ: number;
};

export type DriverView = {
  id: string;
  name: string;
  color: string;
  state: DriverState;
  statusLine: string;
  load: number;
  capacity: number;
  selected: boolean;
  idle: boolean;
  jobColor: string | null;
  jobVerb: string;
  x: number;
  z: number;
};

export type GameSnapshot = {
  started: boolean;
  over: boolean;
  score: number;
  strikes: number;
  deliveries: number;
  gameClock: string;
  gameMinutes: number;
  realElapsed: number;
  spawnHint: string;
  selectedOrderId: string | null;
  selectedDriverId: string | null;
  toast: string | null;
  incomingId: string | null;
  orders: OrderView[];
  drivers: DriverView[];
  shop: ShopItemView[];
  capacity: number;
  cookMultiplier: number;
  survivedGameMinutes: number;
};
