import type { GenRequest, Generated } from "@/engine/generator/generator";
import type { HistoryEntry } from "@/engine/generator/diversity";
import { genRequestFor, type GameConfig } from "./config";
import { handleGenerate, type WorkerRequest, type WorkerResponse } from "./generate";

/**
 * Challenge generation off the main thread. Falls back to running the very same handler on the main thread when workers
 * are unavailable (tests, very old browsers) or the worker fails, so a game can always be generated.
 */
// In development the worker bundle can be stale (it is built by scripts/build-worker.mjs), so dev runs on the main thread.
const WORKER_URL = "/workers/generate.worker.js";
let worker: Worker | null | undefined;
let seq = 0;
const pending = new Map<number, { resolve: (g: Generated | null) => void; fallback: () => Generated | null }>();

/** Records which path produced the last challenge (`<html data-gen-worker="worker|main">`): lets tests prove the worker is used. */
function mark(kind: "worker" | "main") {
  try {
    if (typeof document !== "undefined") document.documentElement.dataset.genWorker = kind;
  } catch {
    /* no DOM */
  }
}

function failAll() {
  for (const [id, p] of pending) {
    pending.delete(id);
    p.resolve(p.fallback());
  }
}

function getWorker(): Worker | null {
  if (worker !== undefined) return worker;
  if (typeof Worker === "undefined" || process.env.NODE_ENV !== "production") return (worker = null);
  try {
    const w = new Worker(WORKER_URL);
    w.onmessage = (e: MessageEvent<WorkerResponse>) => {
      const p = pending.get(e.data.id);
      if (!p) return;
      pending.delete(e.data.id);
      if ("error" in e.data) p.resolve(p.fallback());
      else {
        mark("worker");
        p.resolve(e.data.result);
      }
    };
    w.onerror = () => {
      worker = null; // never retry a broken worker; pending requests are answered on the main thread
      failAll();
    };
    return (worker = w);
  } catch {
    return (worker = null);
  }
}

/** Starts the worker early (e.g. while the player is choosing settings) so the first generation is instant. */
export function warmUpGenerator(): void {
  getWorker();
}

export interface GenerateOptions {
  attempts?: number;
  /** If the exclusion makes generation impossible, retry without it (replay in a tiny scope). */
  relaxExclude?: boolean;
  /** Give up on the worker after this long and compute on the main thread. */
  timeoutMs?: number;
}

export function generateAsync(req: GenRequest, history: readonly HistoryEntry[] = [], opts: GenerateOptions = {}): Promise<Generated | null> {
  const msg: WorkerRequest = { id: ++seq, req, history: [...history], attempts: opts.attempts ?? 6, relaxExclude: opts.relaxExclude ?? false };
  const fallback = () => {
    mark("main");
    return handleGenerate(msg).result ?? null;
  };
  const w = getWorker();
  if (!w) return Promise.resolve(fallback());
  return new Promise<Generated | null>((resolve) => {
    const timer = setTimeout(() => {
      if (pending.delete(msg.id)) resolve(fallback());
    }, opts.timeoutMs ?? 20_000);
    pending.set(msg.id, { resolve: (g) => { clearTimeout(timer); resolve(g); }, fallback });
    try {
      w.postMessage(msg);
    } catch {
      pending.delete(msg.id);
      clearTimeout(timer);
      resolve(fallback());
    }
  });
}

/** Same settings, any seed: the asynchronous counterpart of generateForConfig. */
export function generateForConfigAsync(
  cfg: GameConfig,
  seed: string,
  history: readonly HistoryEntry[] = [],
  exclude?: readonly [string, string],
  candidates = 300,
): Promise<Generated | null> {
  return generateAsync(genRequestFor(cfg, seed, exclude, candidates), history, { relaxExclude: !!exclude });
}
