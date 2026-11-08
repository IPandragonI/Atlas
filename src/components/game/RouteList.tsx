"use client";

import { useLocale, useTranslations } from "next-intl";
import { Flag } from "@/components/ui/Flag";
import { graph } from "@/lib/atlas";
import type { Locale } from "@/engine/types";

interface Props {
  route: readonly string[];
  destination: string;
  finished: boolean;
}

/** The player's path so far: start, accepted countries, and the destination slot. */
export function RouteList({ route, destination, finished }: Props) {
  const t = useTranslations("game");
  const locale = useLocale() as Locale;
  const full = finished ? route : [...route, destination];
  return (
    <ol className="grid gap-0" aria-label={t("route")} data-testid="route-list">
      {full.map((id, i) => {
        const c = graph.country(id);
        const isStart = i === 0;
        const isDest = id === destination && (i === full.length - 1);
        const pending = isDest && !finished;
        return (
          <li key={id + i} className={`relative flex items-center gap-3 py-1.5 ${i === route.length - 1 && !finished ? "anim-pop" : ""}`}>
            <span
              className={`relative z-10 grid h-6 w-6 flex-none place-items-center rounded-full border text-[11px] font-bold ${
                isStart ? "border-accent bg-accent text-accent-contrast" : isDest ? "border-dest bg-dest text-white" : "border-border bg-surface"
              } ${pending ? "opacity-60" : ""}`}
            >
              {isStart ? "A" : isDest ? "B" : i}
            </span>
            {i < full.length - 1 && <span className="absolute left-3 top-[26px] h-full w-px bg-border-soft" aria-hidden="true" />}
            <Flag country={c} className={pending ? "opacity-50" : ""} />
            <span className={`truncate text-sm ${pending ? "muted" : "font-medium"}`}>{pending ? "?" : c.name[locale]}</span>
          </li>
        );
      })}
    </ol>
  );
}
