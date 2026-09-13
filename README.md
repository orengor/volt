# Volt

Casual browser game: coordinate food deliveries on a sparse, top-down paper map of Tel Aviv. The look is Flight Control (pastel chart, small colorful riders, dotted routes). The play is dispatch: tap a ticket, then a rider.

Orders ding in. Kitchens still have to finish cooking. Three dinners more than one game-hour late ends the night. One game hour is about **135 real seconds** (~2:15).

## Stack

Next.js App Router, TypeScript, Three.js, Tailwind, shadcn/ui. No auth, no database. Scores use a Route Handler.

## Run locally

```bash
npm install
npm run dev
```

Open [http://127.0.0.1:4287](http://127.0.0.1:4287). The dev server binds to port **4287**.

- Tickets sit in a vertical list on the right. Tap one, then tap a rider (list or map).
- The rider auto-routes **along the street graph** to the kitchen, waits on the curb, then delivers. Coral trail = pickup, teal = drop-off.
- Pinch to zoom, drag empty paper to pan.
- Points buy extra riders and upgrades. Order rate rises. Three lates close the board.

## Map

The street graph is a stylized Tel Aviv — coast and Jaffa port, HaYarkon, Ben Yehuda, Dizengoff, Ibn Gabirol, Rothschild Blvd, Allenby, King George, Kaplan / HaShalom, Ayalon Hwy, Florentin, Arlozorov, and the Yarkon park belt. Buildings follow those streets. Restaurants and addresses snap to the graph.

## How you lose

Ignore three orders. Each one is late after **60 game minutes ≈ 135 real seconds**. Three lates close the board.

## Upgrades

Points buy extra riders, a second/third bag, skipping crossing pauses, faster scooters, and kitchen radar.

## Leaderboard

`GET` / `POST` `/api/scores`. After game over, enter a name and submit.

Persistence:

1. **Vercel KV / Upstash** if these env vars are set:
   - `KV_REST_API_URL` and `KV_REST_API_TOKEN`
   - or `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`
2. **Local file** `data/scores.json` when running on your machine without KV.
3. **In-memory** on Vercel without KV (resets on deploy / cold instances). First deploys do not require KV.

## Deploy on Vercel

Next.js defaults, no custom server. Add the KV REST env vars for a shared board.

## Assets

- City: `lib/game/city.ts` + `lib/scene/buildCity.ts` (pastel paper Tel Aviv).
- Paper / water textures: `lib/scene/textures.ts`.
- Order ding: `public/sounds/order-ding.wav` plus Web Audio fallback in `lib/game/audio.ts`.
