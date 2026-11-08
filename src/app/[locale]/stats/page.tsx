import { setRequestLocale } from "next-intl/server";
import { StatsScreen } from "@/components/collection/StatsScreen";

export default async function StatsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <StatsScreen />;
}
