"use client";

import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { HINT_ORDER, HINT_PENALTY, hintStatus } from "@/engine/hints";
import type { HintKind, HintPayload, HintRecord } from "@/engine/types";

/** Text of a hint already given. A hint never names the country it points to. */
export function HintText({ payload }: { payload: HintPayload }) {
  const t = useTranslations("hint");
  const locale = useLocale() as "fr" | "en";
  return payload.kind === "letter" ? <>{t("letterText", { letter: payload.letter[locale] })}</> : <>{t("bordersText")}</>;
}

interface Props {
  hints: readonly HintRecord[];
  disabled?: boolean;
  /** Returns true when a hint was given (and its penalty applied). */
  onUse: (kind: HintKind) => boolean;
}

/**
 * Two progressive hints, used in order and once each. The score penalty is shown on the button and again in the
 * confirmation step; it is applied only when the player confirms. Hints never consume attempts.
 */
export function HintPanel({ hints, disabled, onUse }: Props) {
  const t = useTranslations();
  const [pending, setPending] = useState<HintKind | null>(null);
  const [none, setNone] = useState(false);

  const confirm = (kind: HintKind) => {
    setPending(null);
    setNone(!onUse(kind)); // nothing could be determined: no hint, no penalty, a clear message
  };

  return (
    <section aria-labelledby="hints-title">
      <h3 id="hints-title" className="eyebrow mb-2">{t("game.hintsTitle")}</h3>
      <div className="grid gap-2">
        {HINT_ORDER.map((k, i) => {
          const status = hintStatus(hints, k);
          return (
            <button
              key={k}
              type="button"
              disabled={disabled || status !== "available"}
              onClick={() => { setNone(false); setPending(k); }}
              className="btn !h-auto !items-start !justify-between gap-3 !px-3 !py-2 text-left"
              title={t(`hint.${k}.desc`)}
              data-testid={`hint-${k}`}
              data-status={status}
            >
              <span className="grid gap-0.5">
                <span className="flex items-center gap-1.5 text-sm">
                  <Icon name={status === "used" ? "check" : status === "locked" ? "lock" : "bulb"} size={15} />
                  {i + 1}. {t(`hint.${k}.name`)}
                </span>
                <span className="text-xs muted">{status === "locked" ? t("game.hintLocked") : t(`hint.${k}.desc`)}</span>
              </span>
              <span className={`flex-none text-xs ${status === "used" ? "muted" : "text-error"}`}>
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
          {hints.map((h, i) => (
            <li key={i} className="rounded-md border border-border-soft bg-accent-soft/60 px-3 py-2 text-sm anim-slide">
              <HintText payload={h.payload} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
