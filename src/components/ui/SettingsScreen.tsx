"use client";

import { useLocale, useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { useProgress } from "@/stores/progress";
import { useSettings, type LabelMode, type ThemePref } from "@/stores/settings";
import { Icon } from "./Icon";
import { LocaleSwitch } from "./LocaleSwitch";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: string }>;
}

function Row({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 py-3">
      <span className="text-sm font-medium">{title}</span>
      {children}
    </div>
  );
}

export function SettingsScreen() {
  const t = useTranslations();
  const locale = useLocale();
  const { theme, sound, labels, update } = useSettings();
  const exportJson = useProgress((s) => s.exportJson);
  const importJson = useProgress((s) => s.importJson);
  const reset = useProgress((s) => s.reset);
  const fileInput = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [typed, setTyped] = useState("");
  const [installEvt, setInstallEvt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const word = t("settings.resetWord");

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setInstallEvt(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => setInstalled(true);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    if (window.matchMedia("(display-mode: standalone)").matches) setInstalled(true);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const doExport = async () => {
    const blob = new Blob([await exportJson()], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `atlas-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const doImport = async (file: File) => {
    const res = await importJson(await file.text());
    setMsg(res.ok ? { text: t("settings.importOk"), ok: true } : { text: t("settings.importError", { reason: res.reason }), ok: false });
  };

  const seg = <T extends string>(value: T, opts: { v: T; label: string; icon?: Parameters<typeof Icon>[0]["name"] }[], on: (v: T) => void, label: string) => (
    <div className="inline-flex overflow-hidden rounded-md border border-border" role="radiogroup" aria-label={label}>
      {opts.map((o) => (
        <button
          key={o.v}
          type="button"
          role="radio"
          aria-checked={value === o.v}
          onClick={() => on(o.v)}
          className={`flex min-h-9 items-center gap-1.5 px-3 text-sm transition-colors ${value === o.v ? "bg-accent text-accent-contrast" : "bg-surface hover:bg-surface-2"}`}
        >
          {o.icon && <Icon name={o.icon} size={15} />}{o.label}
        </button>
      ))}
    </div>
  );

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6 md:py-10">
      <h1 className="mb-4 text-2xl md:text-3xl">{t("settings.title")}</h1>

      <section className="card divide-y divide-border-soft px-4" aria-label={t("settings.appearance")}>
        <Row title={t("common.language")}>
          <div className="inline-flex overflow-hidden rounded-md border border-border">
            {(["fr", "en"] as const).map((l) => (
              <LocaleSwitch key={l} target={l} className={`flex min-h-9 items-center px-3 text-sm ${locale === l ? "bg-accent text-accent-contrast" : "bg-surface hover:bg-surface-2"}`}>
                {l === "fr" ? "Français" : "English"}
              </LocaleSwitch>
            ))}
          </div>
        </Row>
        <Row title={t("common.theme")}>
          {seg<ThemePref>(theme, [
            { v: "light", label: t("themes.light"), icon: "sun" },
            { v: "dark", label: t("themes.dark"), icon: "moon" },
            { v: "system", label: t("themes.system"), icon: "monitor" },
          ], (v) => update({ theme: v }), t("common.theme"))}
        </Row>
        <Row title={t("settings.labels")}>
          {seg<LabelMode>(labels, [
            { v: "route", label: t("settings.labelsRoute") },
            { v: "all", label: t("settings.labelsAll") },
            { v: "none", label: t("settings.labelsNone") },
          ], (v) => update({ labels: v }), t("settings.labels"))}
        </Row>
        <Row title={t("settings.sound")}>
          <button type="button" role="switch" aria-checked={sound} onClick={() => update({ sound: !sound })} className={`relative h-6 w-11 rounded-full transition-colors ${sound ? "bg-accent" : "bg-border"}`} aria-label={t("settings.sound")}>
            <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${sound ? "left-[22px]" : "left-0.5"}`} />
          </button>
        </Row>
        <Row title={installed ? t("settings.installed") : t("settings.install")}>
          <button type="button" className="btn" disabled={!installEvt || installed} onClick={() => void installEvt?.prompt()}>
            <Icon name="download" size={16} />{t("settings.install")}
          </button>
        </Row>
      </section>

      <h2 className="mb-1 mt-8 text-xl">{t("settings.data")}</h2>
      <p className="mb-3 text-sm muted">{t("settings.dataDesc")}</p>
      <section className="card divide-y divide-border-soft px-4">
        <Row title={t("settings.export")}><button type="button" className="btn" onClick={doExport}><Icon name="download" size={16} />{t("settings.export")}</button></Row>
        <Row title={t("settings.import")}>
          <button type="button" className="btn" onClick={() => fileInput.current?.click()}><Icon name="upload" size={16} />{t("settings.import")}</button>
          <input ref={fileInput} type="file" accept="application/json,.json" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void doImport(f); e.target.value = ""; }} data-testid="import-input" />
        </Row>
        <Row title={t("settings.reset")}>
          <button type="button" className="btn btn-danger" onClick={() => { setConfirm(true); setTyped(""); }}><Icon name="trash" size={16} />{t("settings.reset")}</button>
        </Row>
      </section>
      {msg && <p className={`mt-3 text-sm ${msg.ok ? "text-success" : "text-error"}`} role="status">{msg.text}</p>}

      {confirm && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-labelledby="reset-title">
          <div className="card w-full max-w-sm p-5 anim-pop">
            <h2 id="reset-title" className="text-xl">{t("settings.resetConfirmTitle")}</h2>
            <p className="mt-1 text-sm muted">{t("settings.resetConfirmBody")}</p>
            <label className="mt-3 block text-sm">{t("settings.resetTypeToConfirm", { word })}
              <input autoFocus value={typed} onChange={(e) => setTyped(e.target.value)} className="mt-1 min-h-10 w-full rounded-md border border-border bg-surface px-3" style={{ fontSize: 16 }} data-testid="reset-input" />
            </label>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" className="btn" onClick={() => setConfirm(false)}>{t("common.cancel")}</button>
              <button
                type="button"
                className="btn btn-danger"
                disabled={typed.trim().toUpperCase() !== word}
                onClick={async () => { await reset(); setConfirm(false); setMsg({ text: t("settings.resetDone"), ok: true }); }}
                data-testid="reset-confirm"
              >
                {t("common.confirm")}
              </button>
            </div>
          </div>
        </div>
      )}

      <h2 className="mb-1 mt-8 text-xl">{t("settings.about")}</h2>
      <p className="text-sm muted">{t("settings.aboutBody")}</p>
    </div>
  );
}
