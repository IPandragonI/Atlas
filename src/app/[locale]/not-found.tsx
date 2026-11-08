import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

export default function NotFound() {
  const t = useTranslations("notFound");
  const n = useTranslations("nav");
  return (
    <div className="mx-auto grid max-w-md place-items-center gap-3 px-4 py-24 text-center">
      <h1 className="text-3xl">{t("title")}</h1>
      <p className="muted">{t("body")}</p>
      <Link href="/" className="btn btn-primary">{n("home")}</Link>
    </div>
  );
}
