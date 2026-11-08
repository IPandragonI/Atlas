"use client";

import { useTranslations } from "next-intl";
import { Icon } from "@/components/ui/Icon";

interface Props {
  onZoomIn: () => void;
  onZoomOut: () => void;
  onRecenter: () => void;
  onFullscreen: () => void;
  isFullscreen: boolean;
}

export function MapControls({ onZoomIn, onZoomOut, onRecenter, onFullscreen, isFullscreen }: Props) {
  const t = useTranslations("game");
  return (
    <div className="absolute right-3 top-3 z-10 flex flex-col gap-1.5" role="group" aria-label="Map controls">
      <button type="button" className="map-ctl" onClick={onZoomIn} aria-label={t("zoomIn")} title={t("zoomIn")}>
        <Icon name="plus" />
      </button>
      <button type="button" className="map-ctl" onClick={onZoomOut} aria-label={t("zoomOut")} title={t("zoomOut")}>
        <Icon name="minus" />
      </button>
      <button type="button" className="map-ctl" onClick={onRecenter} aria-label={t("recenter")} title={t("recenter")}>
        <Icon name="target" />
      </button>
      <button
        type="button"
        className="map-ctl hidden md:flex"
        onClick={onFullscreen}
        aria-label={isFullscreen ? t("exitFullscreen") : t("fullscreen")}
        title={isFullscreen ? t("exitFullscreen") : t("fullscreen")}
      >
        <Icon name={isFullscreen ? "shrink" : "expand"} />
      </button>
    </div>
  );
}
