"use client";

import { useEffect } from "react";
import { utcDate } from "@/lib/daily-schedule";

/**
 * Static-export friendly entry point: opening Atlas goes straight into today's Classic daily challenge, in the
 * visitor's language (FR default). The home screen stays available from the navigation.
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
    window.location.replace(`/${locale}/game/?daily=${utcDate()}&mode=classic`);
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
