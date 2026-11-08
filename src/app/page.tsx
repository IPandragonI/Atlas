"use client";

import { useEffect } from "react";

/** Static-export friendly root: sends visitors to their language (FR default). */
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
    window.location.replace(`/${locale}/`);
  }, []);
  return (
    <html lang="fr">
      <head>
        <meta httpEquiv="refresh" content="0; url=/fr/" />
        <title>Atlas</title>
      </head>
      <body />
    </html>
  );
}
