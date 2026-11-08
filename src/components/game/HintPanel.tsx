"use client";

import { useLocale, useTranslations } from "next-intl";
import { Icon } from "@/components/ui/Icon";
import { useSubregionName } from "@/components/ui/useNames";
import { HINT_PENALTY } from "@/engine/scoring";
import type { HintKind, HintPayload, HintRecord } from "@/engine/types";

const KINDS: HintKind[] = ["geographic", "connectivity", "discovery"];

export function HintText({ payload }: { payload: HintPayload }) {
  const t = useTranslations("hint");
  const locale = useLocale() as "fr" | "en";
  const sub = useSubregionName();
  switch (payload.kind) {
    case "geographic":
      return <>{t("geographicText", { region: sub(payload.region) })}</>;
    case "connectivity":
      return <>{t("connectivityText", { n: payload.borders })}</>;
    case "discovery":
      return <>{t("discoveryText", { letter: payload.letter[locale] })}</>;
  }
}

interface Props {
  hints: readonly HintRecord[];
  disabled?: boolean;
  onUse: (kind: HintKind) => void;
}

/** Hints never consume attempts; the score penalty is displayed BEFORE the player activates one. */
export function HintPanel({ hints, disabled, onUse }: Props) {
  const t = useTranslations();
  return (
    <section aria-labelledby="hints-title">
      <h3 id="hints-title" className="eyebrow mb-2">{t("game.hintsTitle")}</h3>
      <div className="grid grid-cols-3 gap-2">
        {KINDS.map((k) => (
          <button
            key={k}
            type="button"
            disabled={disabled}
            onClick={() => onUse(k)}
            className="btn min-w-0 flex-col !items-start gap-0.5 !px-2.5 !py-2 text-left"
            title={t(`hint.${k}.desc`)}
            data-testid={`hint-${k}`}
          >
            <span className="flex items-center gap-1.5 text-sm"><Icon name="bulb" size={15} />{t(`hint.${k}.short`)}</span>
            <span className="text-xs text-error">{t("game.hintCost", { n: HINT_PENALTY[k] })}</span>
          </button>
        ))}
      </div>
      {hints.length > 0 && (
        <ul className="mt-3 grid gap-2" aria-live="polite">
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
