"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { Icon } from "./Icon";

/** Registers the service worker (production only), and shows offline / update status. */
export function PwaRegister() {
  const t = useTranslations("pwa");
  const [offline, setOffline] = useState(false);
  const [update, setUpdate] = useState<ServiceWorkerRegistration | null>(null);

  useEffect(() => {
    const sync = () => setOffline(!navigator.onLine);
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, []);

  // While online, warm the cache with the next days' daily files: they stay playable offline without precaching a whole year.
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !navigator.onLine) return;
    const t0 = Date.now();
    for (let i = 0; i < 7; i++) fetch(`/daily/${new Date(t0 + i * 86400000).toISOString().slice(0, 10)}.json`).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    let cancelled = false;
    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then((reg) => {
        if (cancelled) return;
        reg.addEventListener("updatefound", () => {
          const sw = reg.installing;
          sw?.addEventListener("statechange", () => {
            if (sw.state === "installed" && navigator.serviceWorker.controller) setUpdate(reg);
          });
        });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  if (!offline && !update) return null;
  return (
    <div
      className="fixed bottom-3 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-full border border-border-soft bg-surface px-4 py-2 text-sm shadow-lg anim-slide"
      style={{ marginBottom: "var(--safe-bottom)" }}
      role="status"
    >
      {offline ? (
        <>
          <Icon name="wifiOff" size={16} /> {t("offlineBanner")}
        </>
      ) : (
        <>
          {t("updateReady")}
          <button
            type="button"
            className="btn btn-primary !min-h-8 !px-3"
            onClick={() => {
              update?.waiting?.postMessage({ type: "SKIP_WAITING" });
              window.location.reload();
            }}
          >
            {t("reload")}
          </button>
        </>
      )}
    </div>
  );
}
