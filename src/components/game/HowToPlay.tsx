"use client";

import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { useFocusTrap } from "@/components/ui/useFocusTrap";

export const TUTORIAL_KEY = "atlas-tutorial-v1";

const STEPS = ["goal", "play", "branch", "map", "score"] as const;

/** First-run walkthrough, also reachable from the "?" button of the game screen. */
export function HowToPlay({ onClose }: { onClose: () => void }) {
  const t = useTranslations("tutorial");
  const [step, setStep] = useState(0);
  const dialog = useRef<HTMLDivElement>(null);
  const last = step === STEPS.length - 1;

  const close = () => {
    try {
      localStorage.setItem(TUTORIAL_KEY, "done");
    } catch {
      /* storage unavailable */
    }
    onClose();
  };
  useFocusTrap(dialog, true, close);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 md:items-center md:p-6" onMouseDown={(e) => e.target === e.currentTarget && close()} data-testid="howto">
      <div ref={dialog} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="howto-title" className="card w-full outline-none anim-pop max-md:rounded-b-none md:max-w-md">
        <header className="flex items-start justify-between gap-3 border-b border-border-soft px-5 py-4">
          <div>
            <p className="eyebrow">{t("title")}</p>
            <h2 id="howto-title" className="text-xl" data-testid="howto-step-title">{t(`steps.${STEPS[step]}.title`)}</h2>
          </div>
          <button type="button" className="btn btn-ghost !min-h-9 !px-2" onClick={close} aria-label={t("close")}>
            <Icon name="x" />
          </button>
        </header>
        <div className="grid gap-2 px-5 py-5" aria-live="polite">
          <p className="text-[15px] leading-relaxed">{t(`steps.${STEPS[step]}.body`)}</p>
          <p className="text-sm muted">{t(`steps.${STEPS[step]}.tip`)}</p>
        </div>
        <footer className="flex items-center justify-between gap-3 border-t border-border-soft px-5 py-4" style={{ paddingBottom: "calc(1rem + var(--safe-bottom))" }}>
          <div className="flex gap-1.5" aria-label={t("progress", { n: step + 1, total: STEPS.length })} role="img">
            {STEPS.map((s, i) => (
              <span key={s} className={`h-2 w-2 rounded-full ${i === step ? "bg-accent" : "bg-border"}`} />
            ))}
          </div>
          <div className="flex gap-2">
            {step > 0 && <button type="button" className="btn" onClick={() => setStep(step - 1)}>{t("back")}</button>}
            <button type="button" className="btn btn-primary" onClick={() => (last ? close() : setStep(step + 1))} data-autofocus data-testid="howto-next">
              {last ? t("done") : t("next")}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
