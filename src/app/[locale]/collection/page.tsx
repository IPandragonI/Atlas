import { setRequestLocale } from "next-intl/server";
import { CollectionScreen } from "@/components/collection/CollectionScreen";

export default async function CollectionPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <CollectionScreen />;
}
