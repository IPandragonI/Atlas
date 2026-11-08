"use client";

import { useLocale, useTranslations } from "next-intl";
import { useEffect, useRef } from "react";
import { Flag } from "@/components/ui/Flag";
import { graph } from "@/lib/atlas";
import type { Locale } from "@/engine/types";

/** Rows shown at once. Beyond this the list scrolls instead of growing (each row is 2.25rem tall). */
export const ROUTE_VISIBLE_ROWS = 5;
const ROW_REM = 2.25;

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
  const box = useRef<HTMLDivElement>(null);
  const scrollable = full.length > ROUTE_VISIBLE_ROWS;
  const lastId = route[route.length - 1];

  // Keep the newest country in view: after a country is added, or the route is replaced by a change of direction, scroll to the
  // end. Nothing happens while the whole list fits (no needless scrolling, no layout shift).
  useEffect(() => {
    const el = box.current;
    if (!el || el.scrollHeight <= el.clientHeight + 1) return;
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    el.scrollTo({ top: el.scrollHeight, behavior: reduced ? "auto" : "smooth" });
  }, [route.length, lastId, finished]);

  return (
    <div
      ref={box}
      className="overflow-y-auto overflow-x-hidden overscroll-contain rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
      style={{ maxHeight: `${ROUTE_VISIBLE_ROWS * ROW_REM}rem`, scrollbarWidth: "thin" }}
      // a scrollable region must be reachable by keyboard (arrow keys / Page Up / Page Down then scroll it)
      tabIndex={scrollable ? 0 : undefined}
      role={scrollable ? "region" : undefined}
      aria-label={scrollable ? t("routeScroll") : undefined}
      data-testid="route-scroll"
      data-scrollable={scrollable}
    >
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
            {i < full.length - 1 && <span className="absolute left-3 top-6.5 h-full w-px bg-border-soft" aria-hidden="true" />}
            <Flag country={c} className={pending ? "opacity-50" : ""} />
            <span className={`truncate text-sm ${pending ? "muted" : "font-medium"}`}>{pending ? "?" : c.name[locale]}</span>
          </li>
        );
      })}
    </ol>
    </div>
  );
}
