import type { Challenge, GameResult } from "@/engine/types";

/** Text summary for sharing. It never contains the solution, only the shape of the player's game. */
export function buildShareText(args: {
  challenge: Challenge;
  result: GameResult;
  modeLabel: string;
  difficultyLabel: string;
  title: string;
}): string {
  const { challenge, result, modeLabel, difficultyLabel, title } = args;
  const steps = "🟩".repeat(result.intermediates) + (result.status === "won" ? "🏁" : "🛑");
  const misses = result.mistakes > 0 ? ` ${"🟥".repeat(Math.min(result.mistakes, 10))}` : "";
  const hints = result.hintsUsed.length > 0 ? ` 💡×${result.hintsUsed.length}` : "";
  const star = result.optimal ? " ⭐" : "";
  return [
    `${title} · ${modeLabel} · ${difficultyLabel}`,
    `${result.status === "won" ? "✅" : "❌"} ${result.score.total}/1000${star}`,
    `${steps}${misses}${hints}`,
    challenge.date ? "" : "",
  ]
    .filter((l, i, a) => l !== "" || i < a.length - 1)
    .join("\n")
    .trim();
}
