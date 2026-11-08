import { setRequestLocale } from "next-intl/server";
import { Suspense } from "react";
import { GameScreen } from "@/components/game/GameScreen";

export default async function GamePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  return (
    <Suspense>
      <GameScreen />
    </Suspense>
  );
}
