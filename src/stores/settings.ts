"use client";

import { create } from "zustand";
import { getDB, saveSettings } from "@/lib/db";

export type ThemePref = "light" | "dark" | "system";
export type LabelMode = "all" | "route" | "none";

export interface Settings {
  theme: ThemePref;
  sound: boolean;
  labels: LabelMode;
  /** Preference for FUTURE free games: strait crossings are valid links. Daily challenges define their own rules. */
  straits: boolean;
  /** Preference for FUTURE free games: connections through disputed territory are valid links. */
  disputes: boolean;
}

const DEFAULTS: Settings = { theme: "system", sound: true, labels: "route", straits: false, disputes: false };
const LS_KEY = "atlas-settings";

function readLocal(): Settings {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return sanitize(JSON.parse(raw));
  } catch {
    /* ignore */
  }
  return DEFAULTS;
}

export function sanitize(raw: unknown): Settings {
  const r = (raw ?? {}) as Record<string, unknown>;
  return {
    theme: r.theme === "light" || r.theme === "dark" || r.theme === "system" ? r.theme : DEFAULTS.theme,
    sound: typeof r.sound === "boolean" ? r.sound : DEFAULTS.sound,
    labels: r.labels === "all" || r.labels === "route" || r.labels === "none" ? r.labels : DEFAULTS.labels,
    straits: typeof r.straits === "boolean" ? r.straits : DEFAULTS.straits,
    disputes: typeof r.disputes === "boolean" ? r.disputes : DEFAULTS.disputes,
  };
}

interface SettingsStore extends Settings {
  ready: boolean;
  init: () => void;
  update: (patch: Partial<Settings>) => void;
  replace: (s: unknown) => void;
}

export const useSettings = create<SettingsStore>((set, get) => ({
  ...DEFAULTS,
  ready: false,
  init: () => {
    if (get().ready) return;
    set({ ...readLocal(), ready: true });
  },
  update: (patch) => {
    set(patch);
    persist(get());
  },
  replace: (s) => {
    set(sanitize(s));
    persist(get());
  },
}));

function persist(s: Settings) {
  const value: Settings = { theme: s.theme, sound: s.sound, labels: s.labels, straits: s.straits, disputes: s.disputes };
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(value));
  } catch {
    /* ignore */
  }
  saveSettings(getDB(), value as unknown as Record<string, unknown>).catch(() => undefined);
}

/** Resolves the effective theme (system preference applied). */
export function resolveTheme(pref: ThemePref): "light" | "dark" {
  if (pref !== "system") return pref;
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}
