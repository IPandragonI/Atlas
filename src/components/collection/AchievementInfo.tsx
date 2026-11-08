"use client";

import { useTranslations } from "next-intl";
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { Icon } from "@/components/ui/Icon";

interface Props {
  /** Achievement id (keys `achievements.<id>.*`). */
  id: string;
  /** Current progress, when known: [current, target]. */
  progress?: readonly [number, number];
}

/**
 * A discreet "?" next to an achievement title. Hovering (desktop), focusing (keyboard) or tapping (touch) opens a small
 * popover that says what the achievement stands for, the exact unlock condition and the player's progress.
 * The popover is positioned against the viewport so it never overflows on a narrow screen.
 */
export function AchievementInfo({ id, progress }: Props) {
  const t = useTranslations();
  const uid = useId();
  const btn = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false); // opened by a tap/click/keyboard (stays until dismissed) rather than by hover
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const name = t(`achievements.${id}.name`);

  const close = useCallback(() => {
    setOpen(false);
    setPinned(false);
    setPos(null);
  }, []);

  // Keep the popover inside the viewport: clamp horizontally, flip above the icon when there is no room below.
  useLayoutEffect(() => {
    if (!open || !btn.current || !pop.current) return;
    const b = btn.current.getBoundingClientRect();
    const p = pop.current.getBoundingClientRect();
    const margin = 8;
    const left = Math.min(Math.max(margin, b.left + b.width / 2 - p.width / 2), window.innerWidth - p.width - margin);
    const below = b.bottom + 6;
    const top = below + p.height + margin > window.innerHeight ? Math.max(margin, b.top - p.height - 6) : below;
    setPos({ left, top });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        close();
        btn.current?.focus();
      }
    };
    const onDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (!btn.current?.contains(target) && !pop.current?.contains(target)) close();
    };
    const onScroll = () => close();
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [open, close]);

  return (
    <span className="inline-flex" onMouseLeave={() => !pinned && close()}>
      <button
        ref={btn}
        type="button"
        className="grid h-5 w-5 flex-none place-items-center rounded-full border border-border-soft text-text-2 transition-colors hover:border-text-2 hover:text-text focus-visible:text-text"
        aria-label={t("achievements.infoLabel", { name })}
        aria-expanded={open}
        aria-controls={open ? uid : undefined}
        data-testid={`achievement-info-${id}`}
        onMouseEnter={() => setOpen(true)}
        onClick={() => {
          // a tap (or a click, or Enter/Space) pins the popover; tapping the icon again dismisses it
          if (open && pinned) close();
          else {
            setOpen(true);
            setPinned(true);
          }
        }}
      >
        <Icon name="help" size={12} />
      </button>
      {open && (
        <div
          ref={pop}
          id={uid}
          role="note"
          data-testid={`achievement-popover-${id}`}
          className="card fixed z-50 grid w-[min(18rem,calc(100vw-1rem))] gap-2 p-3 text-left text-sm shadow-lg"
          style={{ left: pos?.left ?? 0, top: pos?.top ?? 0, visibility: pos ? "visible" : "hidden" }}
        >
          <p className="font-medium">{name}</p>
          <p className="muted">{t(`achievements.${id}.about`)}</p>
          <div>
            <p className="eyebrow">{t("achievements.conditionTitle")}</p>
            <p>{t(`achievements.${id}.condition`)}</p>
          </div>
          {progress && (
            <p className="tabular-nums" data-testid="achievement-progress">
              <span className="eyebrow">{t("achievements.progressTitle")}</span> {progress[0]} / {progress[1]}
            </p>
          )}
        </div>
      )}
    </span>
  );
}
