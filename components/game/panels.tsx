"use client";

import { useRef, useState } from "react";
import type { DriverView, GameSnapshot } from "@/lib/game/types";
import type { ScoreRow } from "@/lib/leaderboard/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { ShoppingBag, Trophy } from "lucide-react";

type ScoresState = { scores: ScoreRow[]; storage: string } | null;

export function StartOverlay({ onStart }: { onStart: () => void }) {
  return (
    <div className="pointer-events-auto absolute inset-0 z-30 flex items-end justify-center bg-[#8ec8d6]/35 p-4 md:items-center" data-volt-overlay="true">
      <div className="w-full max-w-md rounded-[28px] border-2 border-[#ff7a45]/70 bg-[#141c24]/92 p-5 text-white shadow-[0_18px_50px_rgba(20,12,8,0.35)] md:p-7">
        <p className="font-heading text-[12px] font-semibold tracking-[0.28em] text-[#ffb088] uppercase">Tel Aviv night shift</p>
        <h1 className="font-display mt-1 text-6xl leading-none tracking-wide text-[#ffe7c8]">VOLT</h1>
        <p className="mt-3 text-[15px] leading-relaxed text-[#d5cfc6]">
          Tickets slam in on the right. Tap an order, then a rider — list or map. They stick to the streets, wait on the curb, then roll the bag to the door.
        </p>
        <ul className="mt-4 space-y-2 text-sm text-[#c9c0b4]">
          <li>Matching numbers pair a kitchen (circle) with its drop (diamond). Tap ticket then rider.</li>
          <li>Three dinners more than one game-hour late ends the night. That hour is about 2:15 real.</li>
        </ul>
        <button
          type="button"
          data-volt-start="true"
          className="relative z-40 mt-6 flex h-14 w-full items-center justify-center rounded-xl bg-[#ff5c2d] text-lg font-heading font-semibold tracking-wide text-white shadow-[0_8px_0_#b83a16] hover:bg-[#ff7048] active:translate-y-0.5 active:shadow-[0_6px_0_#b83a16]"
          onPointerDown={(e) => {
            e.stopPropagation();
            onStart();
          }}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onStart();
          }}
        >
          Clear for taxi
        </button>
        <p className="mt-3 text-center text-xs text-[#9aa3ab]">Tap ticket then rider · pinch to zoom · drag paper to pan</p>
      </div>
    </div>
  );
}

export function TopHud({
  snap,
  onShop,
  onBoard,
}: {
  snap: GameSnapshot;
  onShop: () => void;
  onBoard: () => void;
}) {
  const shopAvailable = snap.shop.filter((item) => item.affordable && !item.owned && !item.disabledReason).length;
  return (
    <header className="pointer-events-none absolute inset-x-0 top-0 z-20 p-2 pr-[min(46vw,268px)] pt-[max(0.45rem,env(safe-area-inset-top))] sm:pr-[276px]">
      <div className="pointer-events-auto mx-auto flex max-w-[720px] items-center gap-2 rounded-2xl border border-[#2ee6c7]/35 bg-[#141c24]/88 px-2 py-1.5 text-white shadow-[0_10px_28px_rgba(12,18,24,0.35)] backdrop-blur-md md:px-3">
        <div className="px-2">
          <div className="font-heading text-[10px] font-semibold tracking-[0.28em] text-[#2ee6c7] uppercase">Volt</div>
          <div className="font-display text-[28px] leading-none tracking-wide text-[#ffe7c8]">{snap.gameClock}</div>
        </div>
        <div className="hidden font-heading text-[11px] tracking-wide text-[#9aa3ab] sm:block">1h ≈ 2:15 real</div>
        <div className="ml-auto flex items-center gap-1">
          <div className="rounded-xl bg-[#ff5c2d] px-2.5 py-1 text-center shadow-[0_3px_0_#b83a16]">
            <div className="text-[8px] font-heading font-semibold tracking-[0.16em] text-white/80 uppercase">pts</div>
            <div className="font-display text-lg leading-none">{snap.score}</div>
          </div>
          <div className="flex gap-1 px-1" aria-label={`${snap.strikes} of 3 late orders`}>
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className={cn(
                  "size-3 rounded-full border-2",
                  i < snap.strikes ? "border-[#ffd166] bg-[#ff5c2d] shadow-[0_0_10px_#ff5c2d]" : "border-[#4a5560] bg-transparent"
                )}
              />
            ))}
          </div>
          <Button size="icon" variant="ghost" className="size-11 text-white hover:bg-white/10" onClick={onBoard} aria-label="Leaderboard">
            <Trophy className="size-4" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className={cn(
              "relative size-11 text-white hover:bg-white/10",
              shopAvailable > 0 && "bg-[#ffd166] text-[#141c24] shadow-[0_0_0_3px_rgba(255,209,102,0.22)] hover:bg-[#ffe08a]"
            )}
            onClick={onShop}
            aria-label={shopAvailable > 0 ? `Shop — ${shopAvailable} available` : "Shop"}
            data-shop-control="true"
          >
            <ShoppingBag className="relative z-10 size-4" />
            {shopAvailable > 0 ? (
              <>
                <span className="pointer-events-none absolute inset-0 animate-ping rounded-xl bg-[#ffd166]/35" aria-hidden="true" />
                <span className="pointer-events-none absolute -top-1 -right-1 z-10 grid size-5 place-items-center rounded-full border-2 border-[#141c24] bg-[#ff5c2d] font-display text-[11px] leading-none text-white">
                  {shopAvailable}
                </span>
              </>
            ) : null}
          </Button>
        </div>
      </div>
      {snap.toast ? (
        <div className="pointer-events-none mx-auto mt-2 max-w-md rounded-full bg-[#141c24]/90 px-3 py-1.5 text-center font-heading text-xs text-[#ffe7c8] shadow-lg">
          {snap.toast}
        </div>
      ) : null}
    </header>
  );
}

function CookingProgress({ progress, ready }: { progress: number; ready: boolean }) {
  const pct = Math.round(Math.max(0, Math.min(1, progress)) * 100);
  return (
    <span
      className="grid size-7 shrink-0 place-items-center rounded-full"
      style={{
        background: `conic-gradient(${ready ? "#2ee6c7" : "#ffd166"} ${pct}%, rgba(255,255,255,0.14) 0)`,
      }}
      aria-label={ready ? "Cooking complete" : `Cooking ${pct}% complete`}
      title={ready ? "Ready for pickup" : `Cooking · ${pct}%`}
    >
      <span className="grid size-5 place-items-center rounded-full bg-[#141c24] font-heading text-[8px] font-bold text-white">
        {ready ? "✓" : pct}
      </span>
    </span>
  );
}

export function RiderInspector({ driver }: { driver: DriverView | null }) {
  if (!driver) return null;
  return (
    <aside
      data-rider-inspector={driver.id}
      className="pointer-events-none absolute bottom-3 left-3 z-20 w-[min(330px,calc(54vw-20px))] overflow-hidden rounded-2xl border border-white/60 bg-[#141c24]/94 text-white shadow-[0_16px_42px_rgba(9,14,18,0.38)] backdrop-blur-md"
    >
      <div className="flex items-center gap-2 border-b border-white/10 px-3 py-2.5">
        <span className="size-3.5 shrink-0 rounded-full ring-2 ring-white/40" style={{ background: driver.color }} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-heading text-sm font-bold text-[#ffe7c8]">{driver.name}</p>
          <p className="truncate font-heading text-[10px] font-semibold tracking-[0.12em] text-[#2ee6c7] uppercase">
            {driver.statusLine}
          </p>
        </div>
        <span className="rounded-full bg-white/10 px-2 py-1 font-display text-xs text-[#ffe7c8]">
          {driver.load}/{driver.capacity}
        </span>
      </div>
      <div className="space-y-2 px-3 py-2.5 text-[11px] leading-snug">
        <div className="grid grid-cols-[42px_1fr] gap-2">
          <span className="font-heading font-bold tracking-wide text-[#9aa3ab] uppercase">Now</span>
          <span className="truncate text-[#f4eee5]">{driver.locationLabel}</span>
          <span className="font-heading font-bold tracking-wide text-[#9aa3ab] uppercase">Next</span>
          <span className="truncate text-[#ffd166]">{driver.destinationLabel}</span>
        </div>
        {driver.jobs.length ? (
          <div className="space-y-1.5 border-t border-white/10 pt-2">
            {driver.jobs.map((job) => (
              <div key={job.id} className="rounded-lg bg-white/5 px-2 py-1.5" style={{ borderLeft: `4px solid ${job.pairColor}` }}>
                <div className="flex items-center gap-1.5">
                  <span
                    className="grid size-4 shrink-0 place-items-center rounded-full font-display text-[10px] text-[#141c24]"
                    style={{ background: job.pairColor }}
                  >
                    {job.ticketNo}
                  </span>
                  <span className="min-w-0 flex-1 truncate font-heading font-semibold">{job.restaurantName}</span>
                  <span className="shrink-0 text-[9px] font-semibold text-[#9aa3ab] uppercase">{job.statusLabel}</span>
                </div>
                <p className="mt-0.5 truncate pl-5 text-[10px] text-[#d5cfc6]">{job.targetLabel}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="border-t border-white/10 pt-2 text-[#9aa3ab]">Available now — no tickets on board.</p>
        )}
      </div>
    </aside>
  );
}

function RiderRow({
  driver,
  inspected,
  onDriver,
  onInspect,
}: {
  driver: DriverView;
  inspected: boolean;
  onDriver: (id: string) => void;
  onInspect: (id: string | null) => void;
}) {
  const longPress = useRef<number | null>(null);
  const clearLongPress = () => {
    if (longPress.current !== null) window.clearTimeout(longPress.current);
    longPress.current = null;
  };
  return (
    <button
      type="button"
      data-rider-id={driver.id}
      onPointerEnter={(e) => {
        if (e.pointerType === "mouse") onInspect(driver.id);
      }}
      onPointerLeave={(e) => {
        clearLongPress();
        if (e.pointerType === "mouse") onInspect(null);
      }}
      onPointerDown={(e) => {
        e.stopPropagation();
        if (e.pointerType !== "mouse") {
          clearLongPress();
          longPress.current = window.setTimeout(() => onInspect(driver.id), 420);
        }
      }}
      onPointerUp={clearLongPress}
      onPointerCancel={clearLongPress}
      onFocus={() => onInspect(driver.id)}
      onBlur={() => onInspect(null)}
      onClick={(e) => {
        e.stopPropagation();
        onInspect(driver.id);
        onDriver(driver.id);
      }}
      className={cn(
        "flex min-h-11 w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition",
        driver.selected && "bg-[#263945] ring-2 ring-[#2ee6c7]",
        inspected && !driver.selected && "bg-white/10 ring-1 ring-white/25",
        !driver.selected && !inspected && "hover:bg-white/5"
      )}
    >
      <span className="relative size-3.5 shrink-0 rounded-full ring-2 ring-white/30" style={{ background: driver.color }}>
        {driver.jobColor ? (
          <span className="absolute -right-0.5 -bottom-0.5 size-2 rounded-full border border-[#0f161c]" style={{ background: driver.jobColor }} />
        ) : null}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-heading text-[13px] font-semibold">
          {driver.name}
          <span className="ml-1 font-heading text-[10px] tracking-wide text-[#2ee6c7] uppercase">{driver.jobVerb}</span>
        </span>
        <span className="block truncate text-[10px] text-[#9aa3ab]">{driver.destinationLabel}</span>
      </span>
      <span className="shrink-0 font-display text-[13px] text-[#2ee6c7]">
        {driver.load}/{driver.capacity}
      </span>
    </button>
  );
}

export function DispatchColumn({
  snap,
  onOrder,
  onDriver,
  inspectedDriverId,
  onInspectDriver,
  assignError,
}: {
  snap: GameSnapshot;
  onOrder: (id: string) => void;
  onDriver: (id: string) => void;
  inspectedDriverId: string | null;
  onInspectDriver: (id: string | null) => void;
  assignError: string | null;
}) {
  const live = snap.orders
    .filter((o) => o.status !== "late")
    .sort((a, b) => {
      const priority = (o: (typeof snap.orders)[number]) =>
        o.selected ? 0 : o.slipping ? 1 : o.phase === "ready" ? 2 : o.phase === "out" ? 3 : 4;
      return priority(a) - priority(b) || a.dueGameMin - b.dueGameMin;
    });
  const late = snap.orders.filter((o) => o.status === "late");
  return (
    <aside className="absolute inset-y-0 right-0 z-30 flex w-[min(46vw,252px)] isolate flex-col gap-2 p-2 pt-[max(3.6rem,env(safe-area-inset-top))] pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:w-[260px] [transform:translateZ(0)]">
      <div className="pointer-events-auto flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border-2 border-[#141c24] bg-[#141c24]/90 text-white shadow-[0_16px_40px_rgba(12,18,24,0.4)] backdrop-blur-md">
        <div className="shrink-0 bg-[#ff5c2d] px-3 py-2.5">
          <p className="font-heading text-[12px] font-semibold tracking-[0.22em] uppercase">Tickets</p>
          <p className="text-[11px] leading-snug text-white/90">{assignError ?? snap.spawnHint}</p>
        </div>
        <ScrollArea className="min-h-0 flex-1 px-2 pb-2">
          <div className="space-y-2 pt-2">
            {live.length === 0 ? (
              <div className="rounded-xl border border-dashed border-white/20 px-3 py-3 text-xs text-[#9aa3ab]">
                Quiet board. The next ping is coming.
              </div>
            ) : (
              live.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    onOrder(o.id);
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    onOrder(o.id);
                  }}
                  className={cn(
                    "w-full rounded-xl border px-2.5 py-2 text-left transition",
                    o.driverId ? "border-white/10 bg-[#1e2a34]/85" : "border-dashed border-white/15 bg-[#1a242c]/72",
                    o.phase === "ready" && "border-[#2ee6c7]/75 bg-[#17302e]",
                    o.slipping && "border-[#ff7a45] bg-[#34221f]",
                    o.selected && "ring-2 ring-[#ff5c2d]",
                    o.slipping && "volt-slip",
                    o.id === snap.incomingId && "volt-ding"
                  )}
                  style={{ boxShadow: o.driverId ? `inset 4px 0 0 ${o.pairColor}` : undefined }}
                >
                  <div className="flex items-start justify-between gap-1">
                    <span className="flex min-w-0 items-center gap-1.5">
                      <span
                        className="flex size-5 shrink-0 items-center justify-center rounded-full font-display text-[13px] leading-none text-[#141c24]"
                        style={{ background: o.pairColor }}
                      >
                        {o.ticketNo}
                      </span>
                      <span className="truncate font-heading text-[14px] font-semibold text-[#ffe7c8]">{o.restaurantName}</span>
                    </span>
                    <span className="flex shrink-0 items-center gap-1.5">
                      <CookingProgress progress={o.cookPct} ready={o.cookReady} />
                      <Badge
                        className={cn(
                          "h-5 shrink-0 font-heading text-[10px] uppercase",
                          o.phase === "late" && "bg-[#ff5c2d] text-white",
                          o.phase === "out" && "bg-[#5b4dff] text-white",
                          o.phase === "ready" && "bg-[#12b886] text-white",
                          o.phase === "queued" && "bg-[#f59f00] text-[#141c24]",
                          o.phase === "cooking" && "bg-white/15 text-[#ffd166]"
                        )}
                      >
                        {o.phase === "out" ? "Out" : o.phase}
                      </Badge>
                    </span>
                  </div>
                  <div className="truncate pl-6 text-[11px] text-[#9aa3ab]">to {o.customerAddress}</div>
                  <div className="mt-1.5 flex items-center justify-between pl-6 font-heading text-[9px] font-semibold tracking-[0.12em] uppercase">
                    <span className="text-[#9aa3ab]">Time before late</span>
                    <span className={o.slipping ? "text-[#ff7a45]" : "text-[#d5cfc6]"}>
                      {o.dueLabel.replace(" — slipping", "")}
                    </span>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/10">
                    <div
                      className={cn(
                        "h-full rounded-full transition-[width,background-color] duration-500",
                        o.latePct <= 0.18 ? "bg-[#ff5c2d]" : o.latePct <= 0.38 ? "bg-[#ffd166]" : "bg-[#2ee6c7]"
                      )}
                      style={{ width: `${Math.round(o.latePct * 100)}%` }}
                    />
                  </div>
                  <div className="mt-1.5 flex items-center gap-1.5 pl-6">
                    {o.driverId ? (
                      <>
                        <span className="size-2.5 rounded-full" style={{ background: o.driverColor ?? o.pairColor }} />
                        <span className="truncate font-heading text-[11px] text-white">
                          {o.driverName} · {o.statusLabel}
                        </span>
                      </>
                    ) : (
                      <span className="truncate font-heading text-[11px] uppercase tracking-wide text-[#ffd166]">
                        Unassigned · {o.statusLabel}
                      </span>
                    )}
                  </div>
                </button>
              ))
            )}
            {late.length ? (
              <p className="px-1 font-heading text-[11px] text-[#ff7a45]">
                {late.length} cold ticket{late.length > 1 ? "s" : ""} — they count toward the three.
              </p>
            ) : null}
          </div>
        </ScrollArea>
        <div className="shrink-0 border-t border-white/10 bg-[#0f161c] px-2 py-2">
          <p className="px-1 pb-1.5 font-heading text-[11px] font-semibold tracking-[0.22em] text-[#2ee6c7] uppercase">Riders</p>
          <div className="space-y-1">
            {snap.drivers.map((d) => (
              <RiderRow
                key={d.id}
                driver={d}
                inspected={inspectedDriverId === d.id}
                onDriver={onDriver}
                onInspect={onInspectDriver}
              />
            ))}
          </div>
        </div>
      </div>
    </aside>
  );
}

export function ShopSheet({
  open,
  onOpenChange,
  snap,
  onBuy,
  buyError,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  snap: GameSnapshot;
  onBuy: (id: string) => void;
  buyError: string | null;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-[86dvh] gap-0 bg-[#f7f0e4] p-0 text-[#3d3830] md:h-full md:w-[420px] md:max-w-[420px]">
        <SheetHeader className="border-b border-[#e6d7c2] p-4">
          <SheetTitle className="text-[#3d3830]">Hangar shop</SheetTitle>
          <SheetDescription className="text-[#8a8174]">
            {snap.score} points. Extra riders wait on the Dizengoff curb.
          </SheetDescription>
        </SheetHeader>
        <ScrollArea className="flex-1 p-4">
          {buyError ? <p className="mb-3 text-sm text-[#c45c3a]">{buyError}</p> : null}
          <div className="space-y-3">
            {snap.shop.map((item) => (
              <div key={item.id} className="rounded-2xl border border-[#e6d7c2] bg-white/50 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-base font-semibold">{item.title}</div>
                    <p className="mt-1 text-sm text-[#8a8174]">{item.blurb}</p>
                  </div>
                  <Badge variant={item.owned ? "secondary" : "default"}>{item.owned ? "Owned" : `${item.cost} pts`}</Badge>
                </div>
                <Button
                  className="mt-3 h-11 w-full bg-[#e07a4a] text-white hover:bg-[#c96a3e]"
                  disabled={!!item.disabledReason}
                  onClick={() => onBuy(item.id)}
                >
                  {item.disabledReason ?? (item.kind === "hire" ? "Hire" : "Buy")}
                </Button>
              </div>
            ))}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}

export function BoardSheet({
  open,
  onOpenChange,
  scores,
  loading,
  error,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  scores: ScoresState;
  loading: boolean;
  error: string | null;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-[80dvh] bg-[#f7f0e4] p-0 text-[#3d3830] md:h-full md:w-[420px] md:max-w-[420px]">
        <SheetHeader className="border-b border-[#e6d7c2] p-4">
          <SheetTitle className="text-[#3d3830]">City board</SheetTitle>
          <SheetDescription className="text-[#8a8174]">
            Same list for every dispatcher. {scores?.storage === "kv" ? "Saved on the shared board." : "Local or in-memory until KV is set."}
          </SheetDescription>
        </SheetHeader>
        <div className="p-4">
          {loading ? <p className="text-sm text-[#8a8174]">Loading the board…</p> : null}
          {error ? <p className="text-sm text-[#c45c3a]">{error}</p> : null}
          {!loading && !error && scores && scores.scores.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-[#dccdb6] p-6 text-sm text-[#8a8174]">
              No scores yet. Finish a night and put your name up.
            </p>
          ) : null}
          <ol className="space-y-2">
            {scores?.scores.map((s, i) => (
              <li key={s.id} className="flex items-center justify-between rounded-xl bg-white/60 px-3 py-3">
                <span className="min-w-0">
                  <span className="mr-2 font-mono text-[#8a8174]">{i + 1}</span>
                  <span className="font-medium">{s.name}</span>
                  <span className="ml-2 text-xs text-[#8a8174]">{s.deliveries} drops</span>
                </span>
                <span className="font-mono font-semibold">{s.score}</span>
              </li>
            ))}
          </ol>
        </div>
      </SheetContent>
    </Sheet>
  );
}

export function GameOverOverlay({
  snap,
  name,
  onName,
  onSubmit,
  onAgain,
  submitting,
  submitError,
  submitOk,
  scores,
}: {
  snap: GameSnapshot;
  name: string;
  onName: (v: string) => void;
  onSubmit: () => void;
  onAgain: () => void;
  submitting: boolean;
  submitError: string | null;
  submitOk: boolean;
  scores: ScoresState;
}) {
  return (
    <div className="absolute inset-0 z-40 flex items-end justify-center bg-[#8ec8d6]/45 p-3 md:items-center">
      <div className="max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-[28px] border border-[#e2d3ba] bg-[#f7f0e4] p-5 text-[#3d3830] shadow-xl">
        <p className="text-[11px] font-medium tracking-[0.2em] text-[#c45c3a] uppercase">Grounded</p>
        <h2 className="mt-1 text-3xl font-semibold">Three dinners went cold.</h2>
        <p className="mt-2 text-sm text-[#5c564c]">
          Tel Aviv noticed. You last until {snap.gameClock} with {snap.deliveries} drops and {snap.score} points.
        </p>
        <Separator className="my-4 bg-[#e6d7c2]" />
        {submitOk ? (
          <p className="rounded-xl bg-[#dcece8] px-3 py-3 text-sm text-[#2f6b70]">Posted. You&apos;re on the city board.</p>
        ) : (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              onSubmit();
            }}
          >
            <label className="block text-sm text-[#5c564c]" htmlFor="dispatch-name">
              Your name on the board
            </label>
            <Input
              id="dispatch-name"
              className="h-12 border-[#e6d7c2] bg-white text-base text-[#3d3830]"
              value={name}
              maxLength={16}
              placeholder="e.g. Noa"
              onChange={(e) => onName(e.target.value)}
            />
            {submitError ? <p className="text-sm text-[#c45c3a]">{submitError}</p> : null}
            <Button type="submit" className="h-12 w-full bg-[#e07a4a] text-white hover:bg-[#c96a3e]" disabled={submitting}>
              {submitting ? "Sending…" : "Submit score"}
            </Button>
          </form>
        )}
        <div className="mt-5">
          <div className="mb-2 text-sm font-medium">Top of the board</div>
          {scores && scores.scores.length === 0 ? (
            <p className="text-sm text-[#8a8174]">Empty board — you can be first.</p>
          ) : (
            <ol className="space-y-1.5 text-sm">
              {scores?.scores.slice(0, 8).map((s, i) => (
                <li key={s.id} className="flex justify-between">
                  <span>
                    {i + 1}. {s.name}
                  </span>
                  <span className="font-mono">{s.score}</span>
                </li>
              ))}
            </ol>
          )}
        </div>
        <Button variant="secondary" className="mt-5 h-12 w-full" onClick={onAgain}>
          Run the night again
        </Button>
        <p className="mt-3 text-xs text-[#8a8174]">
          To hit game over on purpose: ignore tickets. Each one goes late after about 2:15 real (one game hour). Three lates ends it.
        </p>
      </div>
    </div>
  );
}

export function useScores() {
  const [scores, setScores] = useState<ScoresState>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/scores", { cache: "no-store" });
      if (!res.ok) throw new Error("board");
      const data = (await res.json()) as { scores: ScoreRow[]; storage: string };
      setScores({ scores: data.scores, storage: data.storage });
    } catch {
      setError("Could not load the city board.");
    } finally {
      setLoading(false);
    }
  };

  return { scores, loading, error, reload, setScores, setError };
}
