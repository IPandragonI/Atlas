"use client";

import { useEffect, useRef, useState } from "react";

/** Total length of the celebration. The overlay unmounts itself afterwards. */
export const BURST_MS = 3400;

interface Particle {
  x: number; y: number; vx: number; vy: number;
  size: number; life: number; born: number;
  kind: "star" | "dot" | "spark";
  color: string; spin: number; phase: number;
}

/** A four-pointed sparkle centred on (0,0). */
function sparkle(g: CanvasRenderingContext2D, r: number) {
  g.beginPath();
  g.moveTo(0, -r);
  g.quadraticCurveTo(r * 0.14, -r * 0.14, r, 0);
  g.quadraticCurveTo(r * 0.14, r * 0.14, 0, r);
  g.quadraticCurveTo(-r * 0.14, r * 0.14, -r, 0);
  g.quadraticCurveTo(-r * 0.14, -r * 0.14, 0, -r);
  g.closePath();
}

/**
 * A short, restrained burst of stars, sparkles and soft dots. It is drawn on a canvas that never receives pointer events,
 * so it cannot block the results panel or the map. It plays once per mount (the parent changes `runKey` for each victory)
 * and removes itself. Nothing is drawn when the user prefers reduced motion.
 */
export function VictoryBurst({ runKey }: { runKey: number | null }) {
  const [active, setActive] = useState<number | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (runKey === null) return;
    if (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    setActive(runKey);
    const stop = setTimeout(() => setActive(null), BURST_MS + 120);
    return () => clearTimeout(stop);
  }, [runKey]);

  useEffect(() => {
    const el = canvas.current;
    if (active === null || !el) return;
    const g = el.getContext("2d");
    if (!g) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = el.clientWidth;
    const h = el.clientHeight;
    el.width = Math.max(1, Math.round(w * dpr));
    el.height = Math.max(1, Math.round(h * dpr));
    g.scale(dpr, dpr);

    const css = getComputedStyle(document.documentElement);
    const v = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback;
    const palette = [v("--dest", "#c08a2e"), v("--accent", "#55745c"), v("--discovered", "#8fb394"), v("--dest", "#c08a2e"), "#e9c46a"];

    const particles: Particle[] = [];
    const rnd = (a: number, b: number) => a + Math.random() * (b - a);
    // three soft bursts, a little apart in time and place, in the upper-middle of the map (clear of the bottom sheet)
    const bursts = [
      { at: 0, x: 0.5, y: 0.34, n: 34 },
      { at: 380, x: 0.3, y: 0.28, n: 22 },
      { at: 700, x: 0.7, y: 0.3, n: 22 },
    ];
    const spawned = new Set<number>();
    const spawn = (b: (typeof bursts)[number], now: number) => {
      const scale = Math.min(1, Math.max(0.6, Math.min(w, h) / 600));
      for (let i = 0; i < b.n; i++) {
        const a = rnd(0, Math.PI * 2);
        const sp = rnd(1.2, 4.6) * scale;
        const kind: Particle["kind"] = i % 5 === 0 ? "star" : i % 3 === 0 ? "spark" : "dot";
        particles.push({
          x: b.x * w, y: b.y * h, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 0.6 * scale,
          size: (kind === "dot" ? rnd(1.4, 2.6) : rnd(5, 11)) * scale, life: rnd(1300, 2400), born: now,
          kind, color: palette[Math.floor(Math.random() * palette.length)], spin: rnd(-0.004, 0.004), phase: rnd(0, 6.28),
        });
      }
    };

    let raf = 0;
    const t0 = performance.now();
    const frame = (time: number) => {
      const elapsed = Math.max(0, time - t0);
      g.clearRect(0, 0, w, h);
      bursts.forEach((b, i) => {
        if (!spawned.has(i) && elapsed >= b.at) {
          spawned.add(i);
          spawn(b, elapsed);
        }
      });
      for (const p of particles) {
        const age = elapsed - p.born;
        if (age < 0 || age > p.life) continue;
        const k = age / p.life;
        const drag = Math.pow(0.985, age / 16);
        const x = p.x + p.vx * (age / 16) * drag;
        const y = p.y + p.vy * (age / 16) * drag + 0.00004 * age * age; // gentle fall
        // quick fade-in, long fade-out, with a twinkle on the stars
        const twinkle = p.kind === "dot" ? 1 : 0.65 + 0.35 * Math.sin(age * 0.012 + p.phase);
        g.globalAlpha = Math.max(0, Math.min(1, k < 0.08 ? k / 0.08 : 1 - (k - 0.08) / 0.92)) * twinkle;
        g.fillStyle = p.color;
        g.save();
        g.translate(x, y);
        if (p.kind === "dot") {
          g.beginPath();
          g.arc(0, 0, p.size, 0, Math.PI * 2);
          g.fill();
        } else {
          g.rotate(p.kind === "star" ? age * p.spin : 0);
          g.shadowColor = p.color;
          g.shadowBlur = 6;
          sparkle(g, p.kind === "star" ? p.size : p.size * 0.6);
          g.fill();
        }
        g.restore();
      }
      g.globalAlpha = 1;
      if (elapsed < BURST_MS) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [active]);

  if (active === null) return null;
  return (
    <canvas
      ref={canvas}
      className="pointer-events-none absolute inset-0 z-10 h-full w-full"
      aria-hidden="true"
      data-testid="victory-burst"
      data-run={active}
    />
  );
}
