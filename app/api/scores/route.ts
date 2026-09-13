import { addScore, listScores, storageMode } from "@/lib/leaderboard/store";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const scores = await listScores();
  return NextResponse.json({ scores, storage: storageMode() });
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Send JSON with a name and score." }, { status: 400 });
  }
  const b = body as Record<string, unknown>;
  const name = typeof b.name === "string" ? b.name.trim() : "";
  if (name.length < 2 || name.length > 16) {
    return NextResponse.json({ error: "Name must be 2–16 characters." }, { status: 400 });
  }
  if (!/^[\p{L}\p{N} _.'-]+$/u.test(name)) {
    return NextResponse.json({ error: "Use letters, numbers, and spaces only." }, { status: 400 });
  }
  const score = Number(b.score);
  const deliveries = Number(b.deliveries);
  const survivedGameMinutes = Number(b.survivedGameMinutes);
  if (!Number.isFinite(score) || score < 0 || score > 1_000_000) {
    return NextResponse.json({ error: "Score looks invalid." }, { status: 400 });
  }
  if (!Number.isFinite(deliveries) || deliveries < 0 || deliveries > 10_000) {
    return NextResponse.json({ error: "Deliveries look invalid." }, { status: 400 });
  }
  try {
    const scores = await addScore({
      name,
      score: Math.round(score),
      deliveries: Math.round(deliveries),
      survivedGameMinutes: Math.max(0, survivedGameMinutes),
    });
    return NextResponse.json({ scores, storage: storageMode(), ok: true });
  } catch {
    return NextResponse.json({ error: "Could not save that score. Try again." }, { status: 500 });
  }
}
