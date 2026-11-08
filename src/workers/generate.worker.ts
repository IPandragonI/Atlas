/// <reference lib="webworker" />
import { handleGenerate, type WorkerRequest, type WorkerResponse } from "@/lib/generate";

/**
 * Challenge generation runs here so the interface never freezes (generation takes 0.3-0.5 s of CPU).
 * The worker only wraps the pure handler used by the main-thread fallback: identical results either way.
 */
const ctx = self as unknown as { onmessage: ((e: MessageEvent<WorkerRequest>) => void) | null; postMessage: (m: WorkerResponse) => void };

ctx.onmessage = (e) => {
  const msg = e.data;
  try {
    ctx.postMessage(handleGenerate(msg));
  } catch (err) {
    ctx.postMessage({ id: msg.id, error: err instanceof Error ? err.message : "generation failed" });
  }
};

export {};
