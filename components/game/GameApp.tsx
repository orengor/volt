"use client";

import { useEffect, useRef, useState } from "react";
import { GameAudio } from "@/lib/game/audio";
import { GameSim } from "@/lib/game/sim";
import { CityRenderer } from "@/lib/scene/CityRenderer";
import {
  BoardSheet,
  DispatchColumn,
  GameOverOverlay,
  ShopSheet,
  StartOverlay,
  TopHud,
  useScores,
} from "./panels";

declare global {
  interface Window {
    __volt?: {
      driverScreen: (index?: number) => { x: number; y: number } | null;
    };
  }
}

export default function GameApp() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const simRef = useRef<GameSim | null>(null);
  const audioRef = useRef<GameAudio | null>(null);
  const [snap, setSnap] = useState(() => new GameSim().snapshot());
  const [shopOpen, setShopOpen] = useState(false);
  const [boardOpen, setBoardOpen] = useState(false);
  const [assignError, setAssignError] = useState<string | null>(null);
  const [buyError, setBuyError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitOk, setSubmitOk] = useState(false);
  const board = useScores();
  const reloadBoard = board.reload;
  const reloadRef = useRef(reloadBoard);
  const overFetched = useRef(false);
  const startRef = useRef<() => void>(() => {});

  useEffect(() => {
    reloadRef.current = reloadBoard;
  }, [reloadBoard]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const audio = new GameAudio();
    audioRef.current = audio;
    const sim = simRef.current ?? new GameSim();
    simRef.current = sim;
    sim.onDing = () => audio.playDing();

    let renderer: CityRenderer;
    try {
      renderer = new CityRenderer(canvas, sim);
    } catch (err) {
      console.error("WebGL map failed", err);
      return;
    }
    renderer.attachSim(sim);
    renderer.setFocusHandler((hit) => {
      setAssignError(null);
      if (!hit) return;
      const r = hit.type === "driver" ? sim.pickDriver(hit.id) : hit.type === "order" ? sim.pickOrder(hit.id) : null;
      if (r?.error) setAssignError(r.error);
      setSnap(sim.snapshot());
    });

    let raf = 0;
    let last = performance.now();
    let lastFrame = last - 1000;
    let uiAcc = 0;
    const loop = (t: number) => {
      raf = 0;
      if (!document.hidden) {
        const frameInterval = 1000 / (sim.started && !sim.over ? 30 : 4);
        if (t - lastFrame >= frameInterval) {
          const dt = Math.min(0.05, (t - last) / 1000);
          last = t;
          lastFrame = t - ((t - lastFrame) % frameInterval);
          sim.update(dt);
          renderer.render(sim, dt);
          uiAcc += dt;
          if (uiAcc > 0.12) {
            uiAcc = 0;
            const snapNext = sim.snapshot();
            setSnap(snapNext);
            if (snapNext.over && !overFetched.current) {
              overFetched.current = true;
              void reloadRef.current();
            }
          }
        }
        raf = requestAnimationFrame(loop);
      }
    };
    raf = requestAnimationFrame(loop);
    const onVisibilityChange = () => {
      if (document.hidden) {
        cancelAnimationFrame(raf);
        raf = 0;
        return;
      }
      last = performance.now();
      lastFrame = last - 1000;
      if (!raf) raf = requestAnimationFrame(loop);
    };
    const onResize = () => renderer.resize();
    window.addEventListener("resize", onResize);
    document.addEventListener("visibilitychange", onVisibilityChange);
    const ro = new ResizeObserver(onResize);
    ro.observe(canvas);
    renderer.resize();
    window.__volt = {
      driverScreen: (index = 0) => {
        const d = sim.drivers[index];
        if (!d) return null;
        return renderer.screenPoint(d.x, d.z);
      },
    };

    const kickoff = (e: Event) => {
      if (sim.started) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.closest("[data-volt-start]") || t.tagName === "CANVAS" || t.closest("[data-volt-overlay]"))) {
        startRef.current();
      }
    };
    window.addEventListener("pointerup", kickoff, true);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("pointerup", kickoff, true);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      ro.disconnect();
      renderer.dispose();
      delete window.__volt;
    };
  }, []);

  const start = () => {
    try {
      audioRef.current?.unlock();
    } catch {
      /* autoplay can throw; the shift still starts */
    }
    const sim = simRef.current ?? new GameSim();
    simRef.current = sim;
    sim.start();
    setSnap(sim.snapshot());
  };
  useEffect(() => {
    startRef.current = start;
  });

  const onOrder = (id: string) => {
    setAssignError(null);
    const r = simRef.current?.pickOrder(id);
    if (r?.error) setAssignError(r.error);
    if (simRef.current) setSnap(simRef.current.snapshot());
  };

  const onDriver = (id: string) => {
    setAssignError(null);
    const r = simRef.current?.pickDriver(id);
    if (r?.error) setAssignError(r.error);
    if (simRef.current) setSnap(simRef.current.snapshot());
  };

  const onBuy = (id: string) => {
    const r = simRef.current?.buy(id);
    setBuyError(r?.error ?? null);
    if (simRef.current) setSnap(simRef.current.snapshot());
  };

  const submitScore = async () => {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch("/api/scores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          score: snap.score,
          deliveries: snap.deliveries,
          survivedGameMinutes: snap.survivedGameMinutes,
        }),
      });
      const data = (await res.json()) as {
        error?: string;
        scores?: { id: string; name: string; score: number; deliveries: number; survivedGameMinutes: number; at: string }[];
        storage?: string;
      };
      if (!res.ok) {
        setSubmitError(data.error ?? "Could not submit.");
        return;
      }
      setSubmitOk(true);
      if (data.scores) board.setScores({ scores: data.scores, storage: data.storage ?? "file" });
      else await board.reload();
    } catch {
      setSubmitError("Network dropped the score. Try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const again = () => {
    window.location.reload();
  };

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-[#8ec8d6] text-[#3d3830]">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 z-0 h-full w-full touch-none"
        style={{ pointerEvents: snap.started ? "auto" : "none" }}
        aria-label="Paper map of Tel Aviv"
      />
      {snap.started ? (
        <TopHud
          snap={snap}
          onShop={() => setShopOpen(true)}
          onBoard={() => {
            setBoardOpen(true);
            void reloadBoard();
          }}
        />
      ) : null}
      {snap.started && !snap.over ? (
        <DispatchColumn snap={snap} onOrder={onOrder} onDriver={onDriver} assignError={assignError} />
      ) : null}
      <ShopSheet open={shopOpen} onOpenChange={setShopOpen} snap={snap} onBuy={onBuy} buyError={buyError} />
      <BoardSheet
        open={boardOpen}
        onOpenChange={(open) => {
          setBoardOpen(open);
          if (open) void reloadBoard();
        }}
        scores={board.scores}
        loading={board.loading}
        error={board.error}
      />
      {!snap.started ? <StartOverlay onStart={start} /> : null}
      {snap.over ? (
        <GameOverOverlay
          snap={snap}
          name={name}
          onName={setName}
          onSubmit={submitScore}
          onAgain={again}
          submitting={submitting}
          submitError={submitError}
          submitOk={submitOk}
          scores={board.scores}
        />
      ) : null}
    </div>
  );
}
