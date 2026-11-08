import { setRequestLocale } from "next-intl/server";
import { Suspense } from "react";
import { PlaySetup } from "@/components/home/PlaySetup";

export default async function PlayPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  return (
    <Suspense>
      <PlaySetup />
    </Suspense>
  );
}
