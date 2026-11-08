"use client";

import { useLocale, useTranslations } from "next-intl";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Flag } from "@/components/ui/Flag";
import { searchIndex } from "@/lib/atlas";
import { resolveCountry, searchCountries } from "@/engine/search";
import type { Locale } from "@/engine/types";

interface Props {
  disabled?: boolean;
  onSubmit: (countryId: string) => void;
  /** Increments when a wrong answer was just given (triggers the shake). */
  errorTick?: number;
  autoFocus?: boolean;
  onFocus?: () => void;
  /** Texts (default: the in-game answer field). */
  label?: string;
  placeholder?: string;
  submitLabel?: string;
  /** Open the suggestion list above the field (when the field sits at the bottom of a scrolling container). */
  dropUp?: boolean;
}

/**
 * Accessible autocomplete (ARIA 1.2 combobox) used ONLY to find and spell country names: it searches all
 * playable countries (French + English names and aliases, accent/case-insensitive) from the typed text alone.
 * It knows nothing about the route, adjacency, visited or forbidden countries, so it can never help solve the
 * geographic puzzle. Whether a submitted country is correct is decided by the engine.
 */
export function CountryCombobox({ disabled, onSubmit, errorTick, autoFocus, onFocus, label, placeholder, submitLabel, dropUp }: Props) {
  const t = useTranslations("game");
  const locale = useLocale() as Locale;
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [shake, setShake] = useState(false);

  const results = useMemo(() => (value.trim() ? searchCountries(searchIndex, value, null, locale, 8) : []), [value, locale]);

  useEffect(() => {
    if (!errorTick) return;
    setShake(true);
    const tm = setTimeout(() => setShake(false), 320);
    return () => clearTimeout(tm);
  }, [errorTick]);

  useEffect(() => {
    if (autoFocus && !disabled && window.matchMedia("(pointer: fine)").matches) input.current?.focus();
  }, [autoFocus, disabled]);

  const submit = (countryId: string) => {
    onSubmit(countryId);
    setValue("");
    setActive(0);
    setOpen(false);
    input.current?.focus({ preventScroll: true });
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActive((a) => Math.min(results.length - 1, a + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === "Escape") {
      setOpen(false);
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (disabled) return;
      if (open && results[active]) return submit(results[active].id);
      // Free text: any known country can be submitted; the engine decides whether it is correct.
      const any = resolveCountry(searchIndex, value, null, locale);
      if (any) submit(any.id);
    }
  };

  const listId = `${id}-list`;
  const showList = open && value.trim().length > 0 && !disabled;
  const canSubmit = !disabled && value.trim().length > 0 && (results.length > 0 || !!resolveCountry(searchIndex, value, null, locale));

  return (
    <div className="relative">
      <label htmlFor={`${id}-input`} className="eyebrow mb-1.5 block">{label ?? t("inputLabel")}</label>
      <div className={`flex gap-2 ${shake ? "anim-shake" : ""}`}>
        <input
          id={`${id}-input`}
          ref={input}
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={showList && results[active] ? `${id}-opt-${results[active].id}` : undefined}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          enterKeyHint="go"
          disabled={disabled}
          value={value}
          placeholder={placeholder ?? t("inputPlaceholder")}
          onFocus={() => {
            setOpen(true);
            onFocus?.();
          }}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onChange={(e) => {
            setValue(e.target.value);
            setActive(0);
            setOpen(true);
          }}
          onKeyDown={onKey}
          className="min-h-11 w-full min-w-0 rounded-md border border-border bg-surface px-3 text-base outline-none transition-colors focus:border-accent"
          style={{ fontSize: 16 }}
        />
        <button
          type="button"
          className="btn btn-primary"
          disabled={!canSubmit}
          onClick={() => {
            if (results[active] && open) return submit(results[active].id);
            const any = resolveCountry(searchIndex, value, null, locale);
            if (any) submit(any.id);
          }}
        >
          {submitLabel ?? t("submit")}
        </button>
      </div>
      {showList && (
        <ul
          id={listId}
          role="listbox"
          className={`absolute left-0 right-0 z-20 max-h-56 overflow-auto rounded-md border border-border-soft bg-surface p-1 shadow-lg anim-pop ${dropUp ? "bottom-[calc(100%-1.75rem)] mb-1" : "mt-1"}`}
        >
          {results.length === 0 ? (
            <li className="px-3 py-2 text-sm muted" role="option" aria-selected="false" aria-disabled="true">{t("noSuggestions")}</li>
          ) : (
            results.map((c, i) => (
              <li
                key={c.id}
                id={`${id}-opt-${c.id}`}
                role="option"
                aria-selected={i === active}
                onMouseDown={(e) => {
                  e.preventDefault();
                  submit(c.id);
                }}
                onMouseEnter={() => setActive(i)}
                className={`flex min-h-10 cursor-pointer items-center gap-2.5 rounded px-2.5 py-1.5 ${i === active ? "bg-accent-soft" : ""}`}
              >
                <Flag country={c} />
                <span>{c.name[locale]}</span>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}

