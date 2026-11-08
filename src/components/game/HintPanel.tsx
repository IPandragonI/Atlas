"use client";

import { useLocale, useTranslations } from "next-intl";
import { Icon } from "@/components/ui/Icon";
import { useCountryName } from "@/components/ui/useNames";
import { HINT_ORDER, HINT_PENALTY, hintStatus } from "@/engine/hints";
import type { HintKind, HintPayload, HintRecord } from "@/engine/types";

/** Text of a hint already given. Only the third hint names a country; the first two never do. */
export function HintText({ payload }: { payload: HintPayload }) {
  const t = useTranslations("hint");
  const locale = useLocale() as "fr" | "en";
  const name = useCountryName();
  if (payload.kind === "letter") return <>{t("letterText", { letter: payload.letter[locale] })}</>;
  if (payload.kind === "reveal") return <>{t("revealText", { name: name(payload.countryId) })}</>;
  return <>{t("bordersText")}</>;
}

interface Props {
  hints: readonly HintRecord[];
  disabled?: boolean;
  /** Uses a hint right away. Returns true when it was given (its penalty applied). */
  onUse: (kind: HintKind) => boolean;
}

/**
 * The three hint actions, in order, once each. Clicking one uses it IMMEDIATELY (no confirmation step: the cost is on the
 * button before the click) and the game shows a short confirmation; the hint itself appears where it is useful (the
 * first letter and the name in the input, the borders on the map), never in a list under these buttons.
 * States: available, used, or locked until the previous hint has been used. Hints never consume attempts.
 */
export function HintPanel({ hints, disabled, onUse }: Props) {
  const t = useTranslations();
  const left = HINT_ORDER.filter((k) => hintStatus(hints, k) !== "used").length;

  return (
    <section aria-labelledby="hints-title">
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <h3 id="hints-title" className="eyebrow">{t("game.hintsTitle")}</h3>
        <span className="text-xs muted">{t("game.hintsLeft", { n: left })}</span>
      </div>
      {/* one line: the three hints in order, each with its cost */}
      <div className="grid grid-cols-3 gap-2">
        {HINT_ORDER.map((k, i) => {
          const status = hintStatus(hints, k);
          return (
            <button
              key={k}
              type="button"
              disabled={disabled || status !== "available"}
              onClick={() => onUse(k)}
              className="btn !h-auto !min-h-12 !flex-col !items-start !justify-center gap-0.5 !px-2.5 !py-1.5 text-left"
              title={`${t(`hint.${k}.name`)} — ${t(`hint.${k}.desc`)}${status === "locked" ? ` (${t("game.hintLocked")})` : ""}`}
              aria-label={`${i + 1}. ${t(`hint.${k}.name`)}, ${status === "used" ? t("game.hintUsed") : t("game.hintCost", { n: HINT_PENALTY[k] })}${status === "locked" ? `, ${t("game.hintLocked")}` : ""}`}
              data-testid={`hint-${k}`}
              data-status={status}
            >
              <span className="flex items-center gap-1 text-xs font-medium">
                <Icon name={status === "used" ? "check" : status === "locked" ? "lock" : "bulb"} size={13} />
                {i + 1}. {t(`hint.${k}.short`)}
              </span>
              <span className={`text-[11px] tabular-nums ${status === "available" ? "text-error" : "muted"}`}>
                {status === "used" ? t("game.hintUsed") : t("game.hintCost", { n: HINT_PENALTY[k] })}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
