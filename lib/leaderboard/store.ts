import { promises as fs } from "fs";
import path from "path";
import type { ScoreRow } from "./types";

export type { ScoreRow } from "./types";

const KEY = "volt:leaderboard";
const MAX = 20;

let memory: ScoreRow[] | null = null;

function rank(rows: ScoreRow[]) {
  return [...rows]
    .sort((a, b) => b.score - a.score || Date.parse(a.at) - Date.parse(b.at))
    .slice(0, MAX);
}

function kvCreds() {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return { url: url.replace(/\/$/, ""), token };
}

async function kvGet(): Promise<ScoreRow[] | null> {
  const kv = kvCreds();
  if (!kv) return null;
  try {
    const res = await fetch(kv.url, {
      method: "POST",
      headers: { Authorization: `Bearer ${kv.token}`, "Content-Type": "application/json" },
      body: JSON.stringify(["GET", KEY]),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { result?: string | null };
    if (!data.result) return [];
    const parsed = JSON.parse(data.result) as ScoreRow[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return null;
  }
}

async function kvSet(rows: ScoreRow[]) {
  const kv = kvCreds();
  if (!kv) return false;
  try {
    const res = await fetch(kv.url, {
      method: "POST",
      headers: { Authorization: `Bearer ${kv.token}`, "Content-Type": "application/json" },
      body: JSON.stringify(["SET", KEY, JSON.stringify(rows)]),
    });
    return res.ok;
  } catch {
    return false;
  }
}

const LOCAL_FILE = path.join(process.cwd(), "data", "scores.json");
const TMP_FILE = "/tmp/volt-scores.json";

async function fileGet(): Promise<ScoreRow[] | null> {
  for (const p of [LOCAL_FILE, TMP_FILE] as const) {
    try {
      const raw = await fs.readFile(/* turbopackIgnore: true */ p, "utf8");
      const parsed = JSON.parse(raw) as ScoreRow[];
      if (Array.isArray(parsed)) return parsed;
    } catch {
      /* try next */
    }
  }
  return null;
}

async function fileSet(rows: ScoreRow[]) {
  const body = JSON.stringify(rows, null, 2);
  for (const p of [LOCAL_FILE, TMP_FILE] as const) {
    try {
      await fs.mkdir(path.dirname(p), { recursive: true });
      await fs.writeFile(/* turbopackIgnore: true */ p, body, "utf8");
      return true;
    } catch {
      /* try next */
    }
  }
  return false;
}

export function storageMode(): "kv" | "file" | "memory" {
  if (kvCreds()) return "kv";
  return process.env.VERCEL ? "memory" : "file";
}

export async function listScores(): Promise<ScoreRow[]> {
  const fromKv = await kvGet();
  if (fromKv) {
    memory = fromKv;
    return rank(fromKv);
  }
  const fromFile = await fileGet();
  if (fromFile) {
    memory = fromFile;
    return rank(fromFile);
  }
  return rank(memory ?? []);
}

export async function addScore(input: Omit<ScoreRow, "id" | "at"> & { at?: string }): Promise<ScoreRow[]> {
  const current = await listScores();
  const row: ScoreRow = {
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    name: input.name,
    score: input.score,
    deliveries: input.deliveries,
    survivedGameMinutes: input.survivedGameMinutes,
    at: input.at ?? new Date().toISOString(),
  };
  const next = rank([row, ...current]);
  memory = next;
  if (kvCreds()) await kvSet(next);
  else await fileSet(next);
  return next;
}
