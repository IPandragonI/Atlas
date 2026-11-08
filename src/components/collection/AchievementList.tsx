"use client";

import { useTranslations } from "next-intl";
import { Icon } from "@/components/ui/Icon";
import { COUNTRIES } from "@/lib/atlas";
import { ACHIEVEMENTS } from "@/lib/progress";
import { useProgress } from "@/stores/progress";

export function AchievementList() {
  const t = useTranslations();
  const discovered = useProgress((s) => s.discovered);
  const games = useProgress((s) => s.games);
  const unlocked = useProgress((s) => s.achievements);
  const ctx = { countries: COUNTRIES, discovered: new Set(Object.keys(discovered)), optimalRoutes: games.filter((g) => g.optimal).length };
  const have = new Set(unlocked.map((a) => a.id));

  return (
    <ul className="grid gap-2 sm:grid-cols-2" aria-label={t("collection.achievements")}>
      {ACHIEVEMENTS.map((a) => {
        const [cur, target] = a.progress(ctx);
        const done = have.has(a.id) || a.check(ctx);
        return (
          <li key={a.id} className={`card flex items-start gap-3 p-3 ${done ? "" : "border-dashed"}`} data-unlocked={done}>
            <span className={`grid h-9 w-9 flex-none place-items-center rounded-full ${done ? "bg-dest-soft text-dest" : "bg-surface-2 text-text-2"}`}>
              <Icon name={done ? "trophy" : "lock"} size={17} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium">{t(`achievements.${a.id}.name`)}</div>
              <div className="text-xs muted">{t(`achievements.${a.id}.desc`)}</div>
              <div className="mt-1.5 flex items-center gap-2">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-border-soft" role="progressbar" aria-label={t(`achievements.${a.id}.name`)} aria-valuemin={0} aria-valuemax={target} aria-valuenow={cur}>
                  <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${Math.min(100, (cur / target) * 100)}%` }} />
                </div>
                <span className="text-[11px] tabular-nums muted">{cur}/{target}</span>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
