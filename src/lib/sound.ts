/**
 * Tiny synthesized sound effects (no audio files: nothing to cache, they work offline).
 * Silent when disabled or unsupported. Every function is safe to call at any time.
 */
let ctx: AudioContext | null = null;

type Tone = [freq: number, start: number, dur: number];
const SOUNDS: Record<"ok" | "bad" | "lose", Tone[]> = {
  ok: [[660, 0, 0.09], [880, 0.07, 0.12]],
  bad: [[220, 0, 0.14], [165, 0.1, 0.18]],
  lose: [[330, 0, 0.16], [262, 0.14, 0.16], [196, 0.28, 0.28]],
};

function audioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx ??= new AC();
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

/**
 * Browsers only let audio start after a user gesture (iOS Safari is the strictest: the context has to be created or
 * resumed INSIDE a gesture handler). Call this from the first pointer / key event so the victory jingle, which fires a
 * moment later from an effect, is allowed to play. It never produces any sound.
 */
export function unlockAudio(): void {
  audioContext();
}

export function playSound(name: keyof typeof SOUNDS | "win", enabled: boolean): void {
  if (!enabled) return;
  if (name === "win") return playVictory();
  const c = audioContext();
  if (!c) return;
  try {
    const now = c.currentTime;
    for (const [freq, start, dur] of SOUNDS[name]) {
      const osc = c.createOscillator();
      const gain = c.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, now + start);
      gain.gain.exponentialRampToValueAtTime(0.08, now + start + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + start + dur);
      osc.connect(gain).connect(c.destination);
      osc.start(now + start);
      osc.stop(now + start + dur + 0.02);
    }
  } catch {
    /* audio not available */
  }
}

/**
 * The victory jingle: a rising major arpeggio (C – E – G – C) ending on a soft sustained chord, played with a little
 * bell-like overtone and a short echo. About 1.6 s, quiet, and clearly a "you did it" sound rather than an arcade one.
 */
function playVictory(): void {
  const c = audioContext();
  if (!c) return;
  try {
    const now = c.currentTime + 0.02;
    const master = c.createGain();
    master.gain.value = 0.9;
    // a short, soft echo gives the notes some air
    const echo = c.createDelay(0.5);
    echo.delayTime.value = 0.18;
    const feedback = c.createGain();
    feedback.gain.value = 0.28;
    const wet = c.createGain();
    wet.gain.value = 0.35;
    master.connect(c.destination);
    master.connect(echo);
    echo.connect(feedback).connect(echo);
    echo.connect(wet).connect(c.destination);

    const note = (freq: number, start: number, dur: number, peak: number) => {
      // fundamental + a quieter octave overtone = a gentle bell timbre
      for (const [mult, level, type] of [[1, 1, "sine"], [2, 0.28, "sine"], [3, 0.08, "triangle"]] as const) {
        const osc = c.createOscillator();
        const gain = c.createGain();
        osc.type = type;
        osc.frequency.value = freq * mult;
        const t0 = now + start;
        gain.gain.setValueAtTime(0.0001, t0);
        gain.gain.exponentialRampToValueAtTime(peak * level, t0 + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
        osc.connect(gain).connect(master);
        osc.start(t0);
        osc.stop(t0 + dur + 0.03);
      }
    };
    const C5 = 523.25, E5 = 659.25, G5 = 783.99, C6 = 1046.5;
    note(C5, 0, 0.45, 0.09);
    note(E5, 0.11, 0.45, 0.09);
    note(G5, 0.22, 0.5, 0.09);
    note(C6, 0.34, 1.1, 0.1);
    // the closing chord, soft and sustained
    note(G5, 0.34, 1.1, 0.045);
    note(E5, 0.34, 1.1, 0.04);
  } catch {
    /* audio not available */
  }
}
