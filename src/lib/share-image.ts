/** Spoiler-free result card (score, shape of the route, mistakes, hints) rendered on a canvas in the active theme. */
export interface ShareImageArgs {
  heading: string;
  subtitle: string;
  won: boolean;
  score: number;
  outOf: string;
  optimalLabel: string | null;
  steps: number;
  mistakes: number;
  hints: number;
  legend: string;
  footer: string;
}

const W = 1080;
const H = 1350;

export async function renderShareImage(a: ShareImageArgs): Promise<Blob> {
  const css = getComputedStyle(document.documentElement);
  const v = (n: string, fallback: string) => css.getPropertyValue(n).trim() || fallback;
  const bg = v("--bg", "#f5f3eb");
  const surface = v("--surface", "#ffffff");
  const text = v("--text", "#252923");
  const text2 = v("--text-2", "#6c6f65");
  const accent = v("--accent", "#55745c");
  const dest = v("--dest", "#c08a2e");
  const error = v("--error", "#b5594a");
  const border = v("--border-soft", "#dcd8cb");

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const g = canvas.getContext("2d");
  if (!g) throw new Error("canvas unavailable");
  const serif = 'Georgia, "Iowan Old Style", "Palatino Linotype", serif';
  const sans = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

  g.fillStyle = bg;
  g.fillRect(0, 0, W, H);
  // card
  g.fillStyle = surface;
  g.strokeStyle = border;
  g.lineWidth = 3;
  roundRect(g, 60, 60, W - 120, H - 120, 36);
  g.fill();
  g.stroke();

  g.textAlign = "center";
  g.fillStyle = accent;
  g.font = `600 64px ${serif}`;
  g.fillText("Atlas", W / 2, 190);
  g.fillStyle = text2;
  g.font = `500 36px ${sans}`;
  g.fillText(a.subtitle, W / 2, 255);
  g.fillText(a.heading, W / 2, 305);

  g.fillStyle = a.won ? text : error;
  g.font = `600 260px ${serif}`;
  g.fillText(String(a.score), W / 2, 640);
  g.fillStyle = text2;
  g.font = `500 40px ${sans}`;
  g.fillText(a.outOf, W / 2, 705);
  if (a.optimalLabel) {
    g.fillStyle = dest;
    g.font = `600 44px ${sans}`;
    g.fillText(`★ ${a.optimalLabel}`, W / 2, 790);
  }

  // shape of the route: one square per entered country, a diamond for the arrival, red squares for mistakes
  const size = 56;
  const gap = 14;
  const row = (count: number, y: number, color: string, tail?: "diamond") => {
    const total = count + (tail ? 1 : 0);
    const perRow = Math.max(1, Math.floor((W - 260) / (size + gap)));
    const n = Math.min(total, perRow);
    const startX = (W - (n * size + (n - 1) * gap)) / 2;
    for (let i = 0; i < n; i++) {
      const x = startX + i * (size + gap);
      const isTail = tail && i === n - 1 && a.won;
      g.fillStyle = isTail ? dest : color;
      if (isTail) {
        g.save();
        g.translate(x + size / 2, y + size / 2);
        g.rotate(Math.PI / 4);
        roundRect(g, -size * 0.38, -size * 0.38, size * 0.76, size * 0.76, 8);
        g.fill();
        g.restore();
      } else {
        roundRect(g, x, y, size, size, 12);
        g.fill();
      }
    }
  };
  row(Math.min(a.steps, 12), 880, accent, a.won ? "diamond" : undefined);
  if (a.mistakes > 0) row(Math.min(a.mistakes, 12), 970, error);
  if (a.hints > 0) {
    g.fillStyle = text2;
    g.font = `500 38px ${sans}`;
    g.fillText(`💡 × ${a.hints}`, W / 2, 1090);
  }
  g.fillStyle = text2;
  g.font = `500 30px ${sans}`;
  g.fillText(a.legend, W / 2, 1160);
  g.fillText(a.footer, W / 2, 1245);

  return await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("png failed"))), "image/png"));
}

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}
