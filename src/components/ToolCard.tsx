import { useState } from "react";
import { useTranslation } from "react-i18next";
import { openUrl } from "@tauri-apps/plugin-opener";
import type { CatalogTool } from "../data/catalog";
import type { DownloadProgress, InstalledTool, ReleaseInfo, UpdatePhase } from "../lib/api";
import { allCopies, oldestVersion, type ToolStatus } from "../lib/status";
import B2Icon, { GitHubMark } from "./B2Icon";
import "./ToolCard.css";

/**
 * Een tool als websitetegel van installervoorstel E (OpenAEC-Blueprint#13 en
 * #16, `ui04 -- installer` in de galerij): schermafbeelding die in de tegel
 * vervaagt, logo of categorie-icoon naast de naam, discipline- en statuschips,
 * omschrijving, versie in mono, de hoofdknop en ronde knoppen.
 */
export interface ToolCardProps {
  tool: CatalogTool;
  status: ToolStatus;
  installed?: InstalledTool;
  release?: ReleaseInfo;
  progress?: DownloadProgress;
  busy?: boolean;
  error?: string;
  note?: string;
  /** Fase van een lopende update: wachten tot de tool dicht is, of stil installeren. */
  phase?: UpdatePhase["phase"];
  onInstall?: (tool: CatalogTool) => void;
  /** Stop het wachten tot de tool gesloten is. */
  onCancel?: (tool: CatalogTool) => void;
  onLaunch?: (tool: CatalogTool) => void;
  /** Open de webversie van de tool in een tabblad binnen de installer. */
  onOpenTab?: (tool: CatalogTool) => void;
}

const open = (url?: string) => {
  if (url) openUrl(url).catch(() => {});
};

/** Het eigen logo van de tool in een amberkleurige tegel, anders het categorie-icoon. */
export function ToolLogo({ tool, size }: { tool: CatalogTool; size: number }) {
  return (
    <span className="oa-icon-tile oa-icon-tile--amber tool-logo" style={{ width: size, height: size }}>
      {tool.logo ? <img src={tool.logo} alt="" /> : <B2Icon id={`tools.category-${tool.category}`} size={Math.round(size * 0.55)} />}
    </span>
  );
}

/** Versie in mono: geïnstalleerd, een pijl en de nieuwe versie in het accent. */
export function VersionLine({ tool, status, installed, release }: Pick<ToolCardProps, "tool" | "status" | "installed" | "release">) {
  const { t } = useTranslation();
  const latest = release?.ok ? release.version : null;
  if (tool.kind === "web") {
    return (
      <span className="version-line">
        <B2Icon id="link.open-external" size={12} />
        {t("versions.webtool")}
      </span>
    );
  }
  // Staat de tool twee keer op de pc, dan staat hier de oudste kopie: die
  // bepaalt of er een update is.
  const shown = oldestVersion(installed);
  if (shown) {
    return (
      <span className="version-line">
        <span className="version-check">
          <B2Icon id="status.success" size={12} />
        </span>
        <span title={t("versions.installed")}>v{shown}</span>
        {/* De pijl alleen bij een echte update: "→ zelfde versie" zou ten onrechte
            suggereren dat de geïnstalleerde versie niet actueel is. */}
        {status === "update_available" && latest && (
          <>
            <span>→</span>
            <span className="version-latest" title={t("versions.latest")}>v{latest}</span>
          </>
        )}
      </span>
    );
  }
  return <span className="version-line">{latest ? t("versions.available", { version: latest }) : "—"}</span>;
}

/**
 * De hoofdknop van een tool: openen, installeren, bijwerken of starten; tijdens
 * het downloaden de voortgang. Ook gebruikt in het uitgelichte vak bovenaan.
 */
export function PrimaryAction({
  tool,
  status,
  installed,
  release,
  progress,
  busy,
  phase,
  onInstall,
  onCancel,
  onLaunch,
  onOpenTab,
}: ToolCardProps) {
  const { t } = useTranslation();
  const waiting = phase === "waiting";
  // Balk zichtbaar houden tot de hele installatie-aanroep afrondt (busy zakt):
  // anders knippert de kaart rond het einde (balk weg → lege regel → melding).
  const downloading = !waiting && !!progress && (!progress.done || !!busy);
  const pct = progress && progress.total ? Math.min(100, Math.round((progress.downloaded / progress.total) * 100)) : null;

  if (downloading) {
    return (
      <div className="tool-progress" role="progressbar" aria-valuenow={pct ?? undefined}>
        <div className="oa-progress">
          <span className={pct === null ? "indeterminate" : undefined} style={pct !== null ? { width: `${pct}%` } : undefined} />
        </div>
        <span className="tool-progress-label">
          {progress?.done
            ? t(phase === "installing" ? "actions.updating" : "actions.starting")
            : `${t("actions.downloading")} ${pct !== null ? `${pct}%` : ""}`}
        </span>
      </div>
    );
  }
  if (tool.kind === "web") {
    return (
      <button className="oa-site-button oa-site-button--primary oa-site-button--small" onClick={() => onOpenTab?.(tool)}>
        <B2Icon id="software.open-webtab" />
        {t("actions.open")}
      </button>
    );
  }
  if (waiting) {
    return (
      <button className="oa-site-button oa-site-button--small" onClick={() => onCancel?.(tool)}>
        {t("actions.cancel")}
      </button>
    );
  }
  const canInstall = !!release?.assetUrl && (status === "not_installed" || status === "update_available");
  if (canInstall) {
    const update = status === "update_available";
    return (
      <button className="oa-site-button oa-site-button--primary oa-site-button--small" disabled={busy} onClick={() => onInstall?.(tool)}>
        <B2Icon id={update ? "software.update" : "software.install"} />
        {busy
          ? t(phase === "installing" ? "actions.updating" : "actions.downloading")
          : t(update ? "actions.update" : "actions.install")}
      </button>
    );
  }
  if (installed?.exePath) {
    return (
      <button className="oa-site-button oa-site-button--primary oa-site-button--small" onClick={() => onLaunch?.(tool)}>
        <B2Icon id="software.launch" />
        {t("actions.launch")}
      </button>
    );
  }
  return null;
}

export default function ToolCard(props: ToolCardProps) {
  const { tool, status, installed, release, progress, busy, error, note, phase, onLaunch, onOpenTab } = props;
  const { t, i18n } = useTranslation();
  const [previewFailed, setPreviewFailed] = useState(false);
  const lang = i18n.language?.startsWith("en") ? "en" : "nl";
  const update = status === "update_available";
  const waiting = phase === "waiting";
  const downloading = !waiting && !!progress && (!progress.done || !!busy);
  const canLaunch = tool.kind === "desktop" && !!installed?.exePath;

  // Een tool die per gebruiker én voor de hele pc staat: zeg het, met de versies.
  const copies = allCopies(installed);
  const duplicate =
    tool.kind === "desktop" && copies.length > 1
      ? t("update.duplicate", {
          count: copies.length,
          list: copies
            .map((c) => t(c.scope === "machine" ? "update.copyMachine" : "update.copyUser", { version: c.version ?? "?" }))
            .join(", "),
        })
      : null;

  const releaseError = (() => {
    if (tool.kind !== "desktop") return null;
    if (release && !release.ok) {
      // Bij de GitHub-limiet is "wanneer kan het weer" veel nuttiger dan
      // "probeer later opnieuw".
      if (release.error === "rate_limited" && release.rateLimitReset) {
        return t("errors.rateLimitedUntil", {
          time: new Intl.DateTimeFormat(i18n.language, { timeStyle: "short" }).format(new Date(release.rateLimitReset * 1000)),
        });
      }
      return t([`errors.${release.error}`, "errors.network"]);
    }
    if (release?.ok && !release.assetUrl) return t("errors.noInstaller");
    return null;
  })();

  // Snelkoppeling op de schermafbeelding: de tool bekijken of gebruiken, bewust
  // nooit installeren (dat blijft een expliciete knop, zodat een klik geen
  // ongewenste download start). Geïnstalleerd → starten; anders de webversie
  // in een tabblad, of de productpagina.
  const externalTarget = tool.siteUrl ?? (tool.repo ? `https://github.com/${tool.repo}` : undefined);
  const shortcut = canLaunch
    ? { label: t("actions.launch"), run: () => onLaunch?.(tool) }
    : tool.webUrl
      ? { label: t("actions.open"), run: () => onOpenTab?.(tool) }
      : externalTarget
        ? { label: t("actions.open"), run: () => open(externalTarget) }
        : null;

  const chip = (() => {
    if (downloading || busy) return { tone: "info", label: t("chips.busy") };
    if (update) return { tone: "warning", label: t("chips.update") };
    if (tool.kind === "web") return { tone: "info", label: t("chips.web") };
    if (installed) return { tone: "success", label: t("chips.installed") };
    return null;
  })();

  return (
    <article className={`oa-site-card tool-card${update ? " oa-site-card--featured" : ""}`}>
      <button
        type="button"
        className="tool-preview"
        onClick={() => shortcut?.run()}
        disabled={!shortcut}
        title={shortcut?.label}
        aria-label={shortcut ? `${tool.name}: ${shortcut.label}` : tool.name}
      >
        {tool.preview && !previewFailed ? (
          <img className="oa-preview-image" src={tool.preview} loading="lazy" alt="" onError={() => setPreviewFailed(true)} />
        ) : (
          <span className="tool-preview-empty">
            <span className="oa-icon-tile oa-icon-tile--amber" style={{ width: 64, height: 64 }}>
              <B2Icon id={`tools.category-${tool.category}`} size={36} />
            </span>
          </span>
        )}
      </button>

      <div className="tool-head">
        <ToolLogo tool={tool} size={44} />
        <div className="tool-titles">
          <h3 className="tool-name">{tool.name}</h3>
          <div className="tool-chips">
            {[...(tool.disciplines ?? "")].map((letter) => (
              <span key={letter} className="oa-chip" title={t(`filters.${letter}`)}>
                {letter}
              </span>
            ))}
            {chip && <span className={`oa-chip oa-chip--${chip.tone}`}>{chip.label}</span>}
            {tool.stage && <span className={`oa-chip${tool.stage === "beta" ? " oa-chip--warning" : ""}`}>{t(`stage.${tool.stage}`)}</span>}
            {tool.community && <span className="oa-chip">{t("community")}</span>}
          </div>
        </div>
      </div>

      <p className="tool-desc">{tool.description[lang]}</p>

      <div className="oa-meta tool-meta">
        <VersionLine tool={tool} status={status} installed={installed} release={release} />
      </div>

      {waiting && <p className="tool-note">{t("update.waiting", { name: tool.name })}</p>}
      {error && <p className="tool-error">{error}</p>}
      {!error && !downloading && !waiting && note && <p className="tool-note">{note}</p>}
      {!error && !downloading && !note && releaseError && <p className="tool-hint">{releaseError}</p>}
      {!error && !downloading && !waiting && duplicate && <p className="tool-hint">{duplicate}</p>}

      <div className="oa-card-actions tool-actions">
        <PrimaryAction {...props} />
        <span className="tool-actions-gap" />
        {update && canLaunch && !downloading && (
          <button className="oa-round-icon" title={t("actions.launchCurrent")} aria-label={t("actions.launchCurrent")} onClick={() => onLaunch?.(tool)}>
            <B2Icon id="software.launch" />
          </button>
        )}
        {tool.repo && (
          <button className="oa-round-icon" title={t("actions.github")} aria-label={t("actions.github")} onClick={() => open(`https://github.com/${tool.repo}`)}>
            <GitHubMark />
          </button>
        )}
        {/* Desktop-tools: de webversie in een tabblad. Bij webtools doet de
            hoofdknop dit al, dus daar zou het icoon dubbelop zijn. */}
        {tool.kind === "desktop" && tool.webUrl && (
          <button className="oa-round-icon" title={t("tabs.openHere")} aria-label={t("tabs.openHere")} onClick={() => onOpenTab?.(tool)}>
            <B2Icon id="software.open-webtab" />
          </button>
        )}
        {tool.webUrl && (
          <button className="oa-round-icon" title={t("tabs.openExternal")} aria-label={t("tabs.openExternal")} onClick={() => open(tool.webUrl)}>
            <B2Icon id="link.open-external" />
          </button>
        )}
        {tool.kind === "desktop" && !tool.webUrl && tool.siteUrl && (
          <button className="oa-round-icon" title={t("actions.website")} aria-label={t("actions.website")} onClick={() => open(tool.siteUrl)}>
            <B2Icon id="link.open-external" />
          </button>
        )}
      </div>
    </article>
  );
}
