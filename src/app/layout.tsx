import type { ReactNode } from "react";

// The real <html> lives in app/[locale]/layout.tsx (locale-aware).
export default function RootLayout({ children }: { children: ReactNode }) {
  return children;
}
