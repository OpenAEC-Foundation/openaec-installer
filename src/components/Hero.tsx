import { useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { CatalogTool } from "../data/catalog";
import B2Icon from "./B2Icon";
import { ToolLogo } from "./ToolCard";
import "./Hero.css";

/**
 * Het donkere vlak bovenaan installervoorstel E: links label, kop met een
 * accentdeel, de knoppen en de cijfers; rechts een uitgelichte tool die elke zes
 * seconden wisselt. Het vlak blijft donker in elk thema behalve High contrast.
 */
interface HeroProps {
  counts: { tools: number; installed: number; updates: number; web: number };
  refreshing: boolean;
  onUpdateAll: () => void;
  onRefresh: () => void;
  /** Uitgelichte tools; de eerste met een update toont "Nieuwe versie". */
  featured: CatalogTool[];
  hasUpdate: (tool: CatalogTool) => boolean;
  renderVersion: (tool: CatalogTool) => ReactNode;
  renderAction: (tool: CatalogTool) => ReactNode;
}

export default function Hero({ counts, refreshing, onUpdateAll, onRefresh, featured, hasUpdate, renderVersion, renderAction }: HeroProps) {
  const { t } = useTranslation();
  const [feature, setFeature] = useState(0);

  useEffect(() => {
    if (featured.length < 2) return;
    const timer = window.setInterval(() => setFeature((n) => (n + 1) % featured.length), 6000);
    return () => window.clearInterval(timer);
  }, [featured.length, feature]);

  const spot = featured.length ? featured[feature % featured.length] : null;
  const stats: [number, string][] = [
    [counts.tools, t("hero.tools")],
    [counts.installed, t("hero.installed")],
    [counts.updates, t("hero.updates")],
    [counts.web, t("hero.web")],
  ];

  return (
    <header className="oa-dark-band hero">
      <div className="hero-text">
        <span className="site-label">{t("hero.label")}</span>
        <h1 className="hero-title">
          {t("hero.title")}
          <br />
          <span className="hero-title-accent">{t("hero.titleAccent")}</span>
        </h1>
        <p className="hero-lead">{t("hero.lead")}</p>
        <div className="hero-actions">
          <button className="oa-site-button oa-site-button--primary" disabled={counts.updates === 0} onClick={onUpdateAll}>
            <B2Icon id="software.update" />
            {counts.updates === 0 ? t("hero.allCurrent") : t("hero.updateAll", { count: counts.updates })}
          </button>
          <button className="oa-site-button oa-site-button--glass" disabled={refreshing} onClick={onRefresh}>
            <span className={refreshing ? "hero-spin" : undefined}>
              <B2Icon id="ui.check-updates" />
            </span>
            {refreshing ? t("hero.checking") : t("hero.check")}
          </button>
        </div>
        <dl className="hero-stats">
          {stats.map(([value, label]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      </div>

      {spot && (
        <section className="oa-glass-card hero-spot" aria-live="polite">
          <div className="hero-spot-head">
            <span className="site-label">{hasUpdate(spot) ? t("hero.newVersion") : t("hero.featured")}</span>
            <span className="hero-dots">
              {featured.map((tool, n) => (
                <button
                  key={tool.id}
                  className={n === feature % featured.length ? "active" : undefined}
                  title={t("hero.show", { name: tool.name })}
                  aria-label={t("hero.show", { name: tool.name })}
                  aria-pressed={n === feature % featured.length}
                  onClick={() => setFeature(n)}
                />
              ))}
            </span>
          </div>
          {spot.preview ? (
            <img className="hero-shot" src={spot.preview} alt="" />
          ) : (
            <span className="hero-shot hero-shot-empty">
              <ToolLogo tool={spot} size={64} />
            </span>
          )}
          <div className="hero-spot-foot">
            <ToolLogo tool={spot} size={40} />
            <div className="hero-spot-name">
              <b>{spot.name}</b>
              <span className="oa-meta">{renderVersion(spot)}</span>
            </div>
            {renderAction(spot)}
          </div>
        </section>
      )}
    </header>
  );
}
