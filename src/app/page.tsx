"use client";

import { useEffect } from "react";
import { utcDate } from "@/lib/daily-schedule";

/**
 * Static-export friendly entry point: opening Atlas resumes the game in progress if there is one, otherwise it goes
 * straight into today's Classic daily challenge, in the visitor's language (FR default). The home screen stays in the navigation.
 */
export default function RootRedirect() {
  useEffect(() => {
    let locale = "fr";
    try {
      const saved = localStorage.getItem("atlas-locale");
      if (saved === "en" || saved === "fr") locale = saved;
      else if (navigator.language?.toLowerCase().startsWith("en")) locale = "en";
    } catch {
      /* storage unavailable */
    }
    void (async () => {
      // A game in progress comes first: opening Atlas never abandons it silently.
      try {
        const { getDB, loadInProgress } = await import("@/lib/db");
        const rec = await loadInProgress(getDB());
        if (rec && rec.state?.status === "playing" && rec.key) {
          window.location.replace(`/${locale}/game/?${rec.key}`);
          return;
        }
      } catch {
        /* storage unavailable: fall through to the daily */
      }
      window.location.replace(`/${locale}/game/?daily=${utcDate()}&mode=classic`);
    })();
  }, []);
  return (
    <html lang="fr">
      <head>
        <noscript>
          <meta httpEquiv="refresh" content="0; url=/fr/" />
        </noscript>
        <title>Atlas</title>
      </head>
      <body />
    </html>
  );
}
