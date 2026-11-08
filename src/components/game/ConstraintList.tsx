"use client";

import { useTranslations } from "next-intl";
import type { ChallengeRules } from "@/engine/types";
import { Icon } from "@/components/ui/Icon";
import { useCountryName, useRegionName } from "@/components/ui/useNames";

/** Number of rule lines `ConstraintList` shows (the connection-type line is always there). */
export function constraintCount(rules: ChallengeRules): number {
  return (
    1 +
    [rules.allowedRegion, rules.forbidden.length > 0, rules.mandatory.length > 0, rules.minCoastal !== undefined, rules.minIsland !== undefined, rules.maxIntermediate !== undefined, rules.requireRegion, rules.avoidRegion].filter(Boolean).length
  );
}

/** Human-readable list of the rules that apply to a challenge. */
export function ConstraintList({ rules }: { rules: ChallengeRules }) {
  const t = useTranslations();
  const name = useCountryName();
  const region = useRegionName();
  const list = (ids: string[]) => ids.map(name).join(", ");

  const lines: { icon: "ship" | "flag" | "lock" | "globe" | "star"; text: string }[] = [];
  if (rules.allowedRegion) lines.push({ icon: "globe", text: t("constraint.allowedRegion", { region: region(rules.allowedRegion) }) });
  lines.push(rules.maritime ? { icon: "ship", text: t("game.maritime") } : { icon: "flag", text: t("game.landOnly") });
  if (rules.forbidden.length) lines.push({ icon: "lock", text: t("constraint.forbidden", { countries: list(rules.forbidden) }) });
  if (rules.mandatory.length) lines.push({ icon: "star", text: t("constraint.mandatory", { countries: list(rules.mandatory) }) });
  if (rules.minCoastal !== undefined) lines.push({ icon: "ship", text: t("constraint.minCoastal", { n: rules.minCoastal }) });
  if (rules.minIsland !== undefined) lines.push({ icon: "ship", text: t("constraint.minIsland", { n: rules.minIsland }) });
  if (rules.maxIntermediate !== undefined) lines.push({ icon: "flag", text: t("constraint.maxIntermediate", { n: rules.maxIntermediate }) });
  if (rules.requireRegion) lines.push({ icon: "globe", text: t("constraint.requireRegion", { region: region(rules.requireRegion) }) });
  if (rules.avoidRegion) lines.push({ icon: "lock", text: t("constraint.avoidRegion", { region: region(rules.avoidRegion) }) });

  return (
    <ul className="grid gap-1.5" aria-label={t("game.constraints")}>
      {lines.map((l, i) => (
        <li key={i} className="flex items-start gap-2 text-sm">
          <span className="mt-0.5 text-accent"><Icon name={l.icon} size={15} /></span>
          <span>{l.text}</span>
        </li>
      ))}
    </ul>
  );
}
