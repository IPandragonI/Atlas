"use client";

import { useLocale, useTranslations } from "next-intl";
import { Flag } from "@/components/ui/Flag";
import { Icon } from "@/components/ui/Icon";
import { useRegionName, useSubregionName } from "@/components/ui/useNames";
import { hashString } from "@/engine/rng";
import { COUNTRIES, graph } from "@/lib/atlas";
import type { DiscoveredRecord } from "@/lib/db";

const RANK = [...COUNTRIES].sort((a, b) => b.area - a.area).map((c) => c.id);

interface Props {
  id: string;
  record?: DiscoveredRecord;
  onClose: () => void;
}

/** Country detail. Undiscovered countries only show a locked silhouette: no names are leaked. */
export function CountryCard({ id, record, onClose }: Props) {
  const t = useTranslations("collection");
  const locale = useLocale() as "fr" | "en";
  const sub = useSubregionName();
  const regionName = useRegionName();
  const c = graph.country(id);
  const nf = new Intl.NumberFormat(locale);

  if (!record) {
    return (
      <div className="card grid gap-2 p-4 anim-pop" data-testid="country-card" data-discovered="false">
        <div className="flex items-start justify-between">
          <span className="grid h-10 w-10 place-items-center rounded-full bg-surface-2 text-text-2"><Icon name="lock" /></span>
          <button type="button" className="btn btn-ghost !min-h-8 !px-2" onClick={onClose} aria-label={t("closeDetail")}><Icon name="x" size={16} /></button>
        </div>
        <h3 className="text-lg">{t("undiscovered")}</h3>
        <p className="text-sm muted">{t("undiscoveredHint")}</p>
        <p className="text-xs muted">{regionName(c.continent)}</p>
      </div>
    );
  }

  const facts = [
    t("fact1", { n: graph.landDegree(id) }),
    c.isIsland ? t("factIsland") : !c.isCoastal ? t("factLandlocked") : t("factRank", { rank: RANK.indexOf(id) + 1 }),
    t("factRank", { rank: RANK.indexOf(id) + 1 }),
    c.area > 0 && c.population > 0 ? t("factDensity", { n: nf.format(Math.round(c.population / c.area)) }) : t("fact1", { n: graph.landDegree(id) }),
  ];
  const fact = facts[hashString(id) % facts.length];
  const date = new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(record.firstAt));
  const rows: [string, string][] = [
    [t("capital"), c.capital[locale]],
    [t("population"), nf.format(c.population)],
    [t("area"), t("areaValue", { n: nf.format(Math.round(c.area)) })],
    [t("continent"), regionName(c.continent)],
    [t("region"), sub(c.region)],
    [t("firstDiscovery"), date],
    [t("visits"), String(record.visits)],
  ];

  return (
    <div className="card grid gap-3 p-4 anim-pop" data-testid="country-card" data-discovered="true">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <Flag country={c} className="!h-8 !w-11" />
          <div>
            <h3 className="text-xl leading-tight">{c.name[locale]}</h3>
            <p className="text-xs muted">{c.name[locale === "fr" ? "en" : "fr"]}</p>
          </div>
        </div>
        <button type="button" className="btn btn-ghost !min-h-8 !px-2" onClick={onClose} aria-label={t("closeDetail")}><Icon name="x" size={16} /></button>
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
        {rows.map(([k, v]) => (
          <div key={k} className="contents"><dt className="muted">{k}</dt><dd className="text-right font-medium">{v}</dd></div>
        ))}
      </dl>
      <p className="border-t border-border-soft pt-2 text-sm text-text-2">{fact}</p>
    </div>
  );
}
