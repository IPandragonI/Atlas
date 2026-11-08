/** Tiny synthesized sound effects (no audio files to cache). Silent when disabled or unsupported. */
let ctx: AudioContext | null = null;

type Tone = [freq: number, start: number, dur: number];
const SOUNDS: Record<"ok" | "bad" | "win" | "lose", Tone[]> = {
  ok: [[660, 0, 0.09], [880, 0.07, 0.12]],
  bad: [[220, 0, 0.14], [165, 0.1, 0.18]],
  win: [[523, 0, 0.12], [659, 0.1, 0.12], [784, 0.2, 0.2]],
  lose: [[330, 0, 0.16], [262, 0.14, 0.16], [196, 0.28, 0.28]],
};

export function playSound(name: keyof typeof SOUNDS, enabled: boolean): void {
  if (!enabled || typeof window === "undefined") return;
  try {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    ctx ??= new AC();
    if (ctx.state === "suspended") void ctx.resume();
    const now = ctx.currentTime;
    for (const [freq, start, dur] of SOUNDS[name]) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, now + start);
      gain.gain.exponentialRampToValueAtTime(0.08, now + start + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + start + dur);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + start);
      osc.stop(now + start + dur + 0.02);
    }
  } catch {
    /* audio not available */
  }
}
