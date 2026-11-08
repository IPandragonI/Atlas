"use client";

import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { useCountryName } from "@/components/ui/useNames";
import { HINT_ORDER, HINT_PENALTY, hintLiveness, hintStatus } from "@/engine/hints";
import type { Challenge, HintKind, HintPayload, HintRecord } from "@/engine/types";
import { graph } from "@/lib/atlas";

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
  /** The active route, the discovery history and the challenge: used to tell whether a hint is still current. */
  route: readonly string[];
  visited: readonly string[];
  challenge: Challenge;
  disabled?: boolean;
  /** Returns true when a hint was given (and its penalty applied). */
  onUse: (kind: HintKind) => boolean;
}

/**
 * Three progressive hints, used in order and once each. The score penalty is shown on the button and again in the
 * confirmation step; it is applied only when the player confirms. Hints never consume attempts.
 */
export function HintPanel({ hints, route, visited, challenge, disabled, onUse }: Props) {
  const t = useTranslations();
  const [pending, setPending] = useState<HintKind | null>(null);
  const [none, setNone] = useState(false);

  const confirm = (kind: HintKind) => {
    setPending(null);
    setNone(!onUse(kind)); // nothing could be determined: no hint, no penalty, a clear message
  };

  const left = HINT_ORDER.filter((k) => hintStatus(hints, k) !== "used").length;

  return (
    <section aria-labelledby="hints-title">
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <h3 id="hints-title" className="eyebrow">{t("game.hintsTitle")}</h3>
        <span className="text-xs muted">{t("game.hintsLeft", { n: left })}</span>
      </div>
      {/* one line: the three hints in order, each with its cost (details in the tooltip and the confirmation step) */}
      <div className="grid grid-cols-3 gap-2">
        {HINT_ORDER.map((k, i) => {
          const status = hintStatus(hints, k);
          return (
            <button
              key={k}
              type="button"
              disabled={disabled || status !== "available"}
              onClick={() => { setNone(false); setPending(k); }}
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
              <span className={`text-[11px] tabular-nums ${status === "used" ? "muted" : status === "locked" ? "muted" : "text-error"}`}>
                {status === "used" ? t("game.hintUsed") : t("game.hintCost", { n: HINT_PENALTY[k] })}
              </span>
            </button>
          );
        })}
      </div>

      {pending && (
        <div className="mt-2 grid gap-2 rounded-md border border-dest/50 bg-dest-soft p-3 text-sm anim-pop" role="alertdialog" aria-label={t(`hint.${pending}.name`)} data-testid="hint-confirm-box">
          <p>{t("game.hintConfirm", { n: HINT_PENALTY[pending] })}</p>
          <div className="flex gap-2">
            <button type="button" className="btn btn-primary" onClick={() => confirm(pending)} data-testid="hint-confirm">
              {t("game.hintUse")} · {t("game.hintCost", { n: HINT_PENALTY[pending] })}
            </button>
            <button type="button" className="btn" onClick={() => setPending(null)} data-testid="hint-cancel">{t("common.cancel")}</button>
          </div>
        </div>
      )}
      {none && <p className="mt-2 text-sm muted" role="status">{t("game.hintNone")}</p>}

      {hints.length > 0 && (
        <ul className="mt-3 grid gap-2" aria-live="polite" data-testid="hint-list">
          {hints.map((h, i) => {
            // A hint about a route the player has since left is never presented as guidance (its penalty is not refunded).
            const live = hintLiveness(graph, challenge, route, visited, h);
            return (
              <li
                key={i}
                data-testid={`hint-item-${h.payload.kind}`}
                data-liveness={live}
                className={`rounded-md border px-3 py-2 text-sm anim-slide ${live === "live" ? "border-border-soft bg-accent-soft/60" : "border-dashed border-border-soft muted"}`}
              >
                {live === "outdated" ? (
                  <><span className="font-medium">{t(`hint.${h.payload.kind}.name`)}</span> · {t("hint.outdated")}</>
                ) : (
                  <><HintText payload={h.payload} />{live === "followed" && <span className="ml-1 text-xs">· {t("hint.followed")}</span>}</>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
