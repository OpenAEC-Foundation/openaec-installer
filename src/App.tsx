import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import TitleBar from "./components/TitleBar";
import StatusBar from "./components/StatusBar";
import SettingsDialog, { applyTextSize, applyTheme, themeId } from "./components/settings/SettingsDialog";
import ToolCard, { PrimaryAction, VersionLine } from "./components/ToolCard";
import Hero from "./components/Hero";
import B2Icon from "./components/B2Icon";
import SelfUpdateBanner from "./components/SelfUpdateBanner";
import TabBar from "./components/TabBar";
import WebToolView from "./components/WebToolView";
import { CATALOG, DESKTOP_TOOLS, SELF_ID, WEB_TOOLS, type CatalogTool } from "./data/catalog";
import {
  cancelUpdate,
  downloadAndRunInstaller,
  getInstalledTools,
  getLatestReleases,
  getSelfRelease,
  launchTool,
  onDownloadProgress,
  onUpdatePhase,
  quitInstaller,
  takeLaunchRequest,
  updateTool,
  writeUpdateStatus,
  type DownloadProgress,
  type InstalledTool,
  type ReleaseInfo,
  type UpdatePhase,
} from "./lib/api";
import { compareVersions, deriveStatus, pickUpdateVariant } from "./lib/status";
import {
  CATALOG_TAB,
  EMPTY_TABS,
  closeTab,
  openTab,
  restoreTabs,
  toolForTab,
  type TabState,
} from "./lib/tabs";
import { getSetting, setSetting } from "./store";
import "./themes.css";
import "./App.css";

// ".v2" sinds het gekozen asset platform-afhankelijk is: een cache van een
// oudere versie kan nog Windows-installers bevatten, wat op Linux een
// "AppImage verwacht"-fout bij het installeren zou geven. ".v3" sinds releases
// een handtekening meedragen: zonder die handtekening weigert een tool met
// sleutel te installeren. ".v4" sinds releases alle soorten setup meegeven
// (`variants`); zonder die lijst kan een update de juiste soort niet kiezen.
const RELEASE_CACHE_KEY = "releaseCache.v4";
const TABS_KEY = "openTabs";
// Een ronde leest het releasebestand op GitHub Pages (één aanvraag, buiten de
// API-limiet) en alleen bij een probleem daarmee per tool de GitHub API (60 per
// uur per netwerk). Een uur cache is dus genoeg; met Controleren op updates
// forceer je altijd een check.
const RELEASE_CACHE_TTL_MS = 60 * 60 * 1000;

/** Filter op status; "all" toont alles. */
type Filter = "all" | "installed" | "updates";

/** Disciplines van het ecosysteemfilter op open-aec.com. */
const DISCIPLINES = ["A", "E", "C", "I"] as const;

/** Vaste keuze voor het uitgelichte vak, na de tools met een update. */
const FEATURED = ["open-calc-studio", "open-planner-studio", "open-energy-studio", "open-pointcloud-studio"];

interface ReleaseCache {
  /** Tijdstip van de laatste ronde die iets bruikbaars opleverde. */
  ts: number;
  data: ReleaseInfo[];
  /** Epoch-ms waarop de GitHub-limiet vrijgeeft; tot dan heeft proberen geen zin. */
  rateLimitReset?: number | null;
}

/** Het venster tonen en naar voren halen (het start verborgen, voor `--check`). */
async function showWindow() {
  try {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    const win = getCurrentWindow();
    await win.show();
    await win.unminimize();
    await win.setFocus();
  } catch {
    // buiten Tauri
  }
}

function App() {
  const { t, i18n } = useTranslation();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [theme, setTheme] = useState("light");
  const [search, setSearch] = useState("");
  // Filterpillen van ontwerp E: op status, en los daarvan op discipline.
  const [filter, setFilter] = useState<Filter>("all");
  const [discipline, setDiscipline] = useState<string | null>(null);
  // Eigen versie, voor de zelf-update-check.
  const [appVersion, setAppVersion] = useState("");
  // Weggeklikte update-melding (per sessie; komt bij herstart weer terug).
  const [selfUpdateDismissed, setSelfUpdateDismissed] = useState(false);
  // Verse zelf-versie-check bij opstart (los van de tool-cache). Krijgt
  // voorrang op de gecachete waarde zodat een nieuwe installer-versie meteen
  // wordt gemeld.
  const [selfReleaseFresh, setSelfReleaseFresh] = useState<ReleaseInfo | null>(null);
  // Geopende webtool-tabs (browserachtig; blijven bewaard tussen sessies).
  const [tabs, setTabs] = useState<TabState>(EMPTY_TABS);

  const [installed, setInstalled] = useState<Record<string, InstalledTool>>({});
  const [releases, setReleases] = useState<Record<string, ReleaseInfo>>({});
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const [progress, setProgress] = useState<Record<string, DownloadProgress>>({});
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [phases, setPhases] = useState<Record<string, UpdatePhase["phase"]>>({});
  // `--update <id>` van een app (knop Bijwerken): start zodra versies en
  // installaties bekend zijn.
  const [pendingUpdate, setPendingUpdate] = useState<string | null>(null);
  const [scanned, setScanned] = useState(false);
  const refreshingRef = useRef(false);
  // Een klik op de tabs vóór de opstart-load mag niet overschreven worden.
  const tabsTouchedRef = useRef(false);

  const scanInstalled = useCallback(async () => {
    try {
      const list = await getInstalledTools();
      setInstalled(Object.fromEntries(list.map((i) => [i.id, i])));
    } catch {
      // buiten Tauri (bijv. vite preview) — laat leeg
    } finally {
      setScanned(true);
    }
  }, []);

  const fetchReleases = useCallback(async (force: boolean) => {
    if (refreshingRef.current) return;
    refreshingRef.current = true;
    setRefreshing(true);
    try {
      const cache = await getSetting<ReleaseCache | null>(RELEASE_CACHE_KEY, null);
      // Toon altijd meteen wat we al weten, ook als we zo meteen verversen.
      const known: Record<string, ReleaseInfo> = Object.fromEntries(
        (cache?.data ?? []).map((r) => [r.id, r]),
      );
      if (cache?.data?.length) {
        setReleases(known);
        if (cache.ts) setLastRefresh(new Date(cache.ts));
        // Ook zonder nieuwe ronde krijgen de apps de laatst bekende versies.
        void writeUpdateStatus(cache.data).catch(() => {});
      }

      // Vers genoeg? Dan geen aanroepen verspillen. Ook bij een bereikte
      // GitHub-limiet toch proberen: de versies komen eerst uit het
      // releasebestand, dat niet onder die limiet valt.
      if (!force && cache?.ts && Date.now() - cache.ts < RELEASE_CACHE_TTL_MS) return;

      const data = await getLatestReleases();
      // Samenvoegen in plaats van vervangen: een mislukte ronde (bijv. de
      // GitHub-limiet) mag eerder opgehaalde versie-info nooit wissen.
      const merged = { ...known };
      for (const r of data) {
        if (r.ok || !merged[r.id]?.ok) merged[r.id] = r;
      }
      setReleases(merged);
      void writeUpdateStatus(Object.values(merged)).catch(() => {});

      const anyOk = data.some((r) => r.ok);
      const resetSec = data.find((r) => r.rateLimitReset)?.rateLimitReset ?? null;
      const ts = anyOk ? Date.now() : (cache?.ts ?? 0);
      if (anyOk) setLastRefresh(new Date(ts));
      await setSetting<ReleaseCache>(RELEASE_CACHE_KEY, {
        ts,
        data: Object.values(merged),
        rateLimitReset: resetSec ? resetSec * 1000 : null,
      });
    } catch {
      // invoke-fout — bestaande data laten staan
    } finally {
      refreshingRef.current = false;
      setRefreshing(false);
    }
  }, []);

  const refresh = useCallback(
    (force: boolean) => {
      void scanInstalled();
      void fetchReleases(force);
    },
    [scanInstalled, fetchReleases],
  );

  // Opstart: thema laden, venster tonen, eerste scan + release-fetch.
  useEffect(() => {
    getSetting("theme", "light").then((saved) => {
      setTheme(themeId(saved));
      applyTheme(saved);
    });
    getSetting("textSize", "standard").then(applyTextSize);
    getSetting<Partial<TabState> | null>(TABS_KEY, null).then((saved) => {
      if (!tabsTouchedRef.current) setTabs(restoreTabs(saved));
    });
    import("@tauri-apps/api/app")
      .then(({ getVersion }) => getVersion())
      .then(setAppVersion)
      .catch(() => setAppVersion(""));
    // Altijd bij opstart de eigen versie checken (1 call), los van de 6-uurs
    // tool-cache. Zo verschijnt de update-melding meteen bij een nieuwe
    // installer-versie, zonder de rate limit met de hele toollijst te belasten.
    getSelfRelease()
      .then((self) => {
        if (self?.ok) setSelfReleaseFresh(self);
      })
      .catch(() => {});
    // `--check`: zonder venster controleren, updates.json schrijven en stoppen.
    // `--update <id>`: venster tonen, vers controleren en die tool bijwerken.
    takeLaunchRequest()
      .catch(() => null)
      .then(async (request) => {
        if (request?.check) {
          await fetchReleases(true);
          await quitInstaller().catch(() => {});
          return;
        }
        void showWindow();
        if (request?.update) setPendingUpdate(request.update);
        refresh(Boolean(request?.update));
      });
  }, [refresh, fetchReleases]);

  // Een tweede start (bijvoorbeeld Bijwerken in een app terwijl de installer al
  // open is) geeft zijn opdracht door; die wordt hier opgepakt.
  useEffect(() => {
    const timer = window.setInterval(() => {
      takeLaunchRequest()
        .then((request) => {
          if (request?.update) {
            setPendingUpdate(request.update);
            void showWindow();
            refresh(true);
          } else if (request?.check) {
            refresh(true);
          }
        })
        .catch(() => {});
    }, 1500);
    return () => window.clearInterval(timer);
  }, [refresh]);

  // Wanneer het venster focus terugkrijgt (bijv. na het doorlopen van een
  // installer) de geïnstalleerde tools opnieuw scannen.
  useEffect(() => {
    const onFocus = () => void scanInstalled();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [scanInstalled]);

  // Fasen van een stille update: wachten op sluiten, dan installeren.
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    onUpdatePhase((p) => {
      setPhases((prev) => ({ ...prev, [p.id]: p.phase }));
    }).then((fn) => {
      unlisten = fn;
    });
    return () => unlisten?.();
  }, []);

  // Download-voortgang uit de backend.
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    onDownloadProgress((p) => {
      setProgress((prev) => ({ ...prev, [p.id]: p }));
    }).then((fn) => {
      unlisten = fn;
    });
    return () => unlisten?.();
  }, []);

  // Bijwerken: stil, met dezelfde soort setup als de bestaande installatie.
  // Staat de tool open, dan wacht de backend tot de gebruiker hem sluit.
  const handleUpdate = useCallback(
    async (tool: CatalogTool) => {
      const release = releases[tool.id];
      const current = installed[tool.id];
      setErrors(({ [tool.id]: _drop, ...rest }) => rest);
      setNotes(({ [tool.id]: _drop, ...rest }) => rest);
      const variant = pickUpdateVariant(release, current);
      if (!variant) {
        const kind = [current?.kind, current?.scope].filter(Boolean).join(", ");
        setErrors((er) => ({ ...er, [tool.id]: t("update.noMatchingSetup", { kind }) }));
        return;
      }
      setBusy((b) => ({ ...b, [tool.id]: true }));
      try {
        const outcome = await updateTool({
          id: tool.id,
          variant,
          displayName: tool.name,
          pubkey: tool.pubkey,
          exePath: current?.exePath,
        });
        const version = release?.version ?? "";
        const key =
          outcome.mode !== "updated"
            ? "installedDone"
            : outcome.restartRequired
              ? "update.restartRequired"
              : outcome.relaunched
                ? "update.doneRelaunched"
                : "update.done";
        setNotes((n) => ({ ...n, [tool.id]: t(key, { version }) }));
        void scanInstalled();
      } catch (e) {
        setErrors((er) => ({
          ...er,
          [tool.id]: `${t("errors.updateFailed")}: ${String(e)}`,
        }));
      } finally {
        setBusy(({ [tool.id]: _drop, ...rest }) => rest);
        setProgress(({ [tool.id]: _drop, ...rest }) => rest);
        setPhases(({ [tool.id]: _drop, ...rest }) => rest);
      }
    },
    [releases, installed, t, scanInstalled],
  );

  // De update uit `--update <id>`, zodra de versies vers zijn en de scan klaar is.
  useEffect(() => {
    if (!pendingUpdate || !scanned || refreshing) return;
    setPendingUpdate(null);
    const tool = DESKTOP_TOOLS.find((x) => x.id === pendingUpdate);
    if (!tool) return;
    const status = deriveStatus(tool, installed[tool.id], releases[tool.id]);
    if (status === "update_available") void handleUpdate(tool);
    else if (status === "installed_latest")
      setNotes((n) => ({ ...n, [tool.id]: t("update.alreadyCurrent", { version: installed[tool.id]?.version ?? "" }) }));
  }, [pendingUpdate, scanned, refreshing, installed, releases, handleUpdate, t]);

  const handleCancelUpdate = useCallback((tool: CatalogTool) => {
    void cancelUpdate(tool.id);
  }, []);

  const handleInstall = useCallback(
    async (tool: CatalogTool) => {
      const release = releases[tool.id];
      if (!release?.assetUrl || !release.assetName) return;
      // Een geïnstalleerde tool met een bekende installatiesoort wordt stil
      // bijgewerkt; een nieuwe installatie doorloopt gewoon de setup.
      const current = installed[tool.id];
      if (current?.kind && deriveStatus(tool, current, release) === "update_available") {
        return handleUpdate(tool);
      }
      setBusy((b) => ({ ...b, [tool.id]: true }));
      setErrors(({ [tool.id]: _drop, ...rest }) => rest);
      setNotes(({ [tool.id]: _drop, ...rest }) => rest);
      try {
        const outcome = await downloadAndRunInstaller(
          tool.id,
          release.assetUrl,
          release.assetName,
          tool.name,
          { signature: release.signature, pubkey: tool.pubkey },
        );
        // Op Linux is de tool direct geïnstalleerd (geen setup-UI): andere
        // melding, en meteen opnieuw scannen zodat de status verspringt.
        setNotes((n) => ({
          ...n,
          [tool.id]: t(outcome.mode === "installed" ? "installedDone" : "installerStarted"),
        }));
        if (outcome.mode === "installed") void scanInstalled();
      } catch (e) {
        setErrors((er) => ({
          ...er,
          [tool.id]: `${t("errors.installFailed")}: ${String(e)}`,
        }));
      } finally {
        setBusy(({ [tool.id]: _drop, ...rest }) => rest);
        setProgress(({ [tool.id]: _drop, ...rest }) => rest);
      }
    },
    [releases, installed, t, scanInstalled, handleUpdate],
  );

  const handleLaunch = useCallback(
    async (tool: CatalogTool) => {
      const exe = installed[tool.id]?.exePath;
      if (!exe) return;
      try {
        await launchTool(exe);
      } catch (e) {
        setErrors((er) => ({ ...er, [tool.id]: String(e) }));
      }
    },
    [installed],
  );

  // ── Tabbladen ──
  const updateTabs = useCallback((next: TabState) => {
    tabsTouchedRef.current = true;
    setTabs(next);
    void setSetting(TABS_KEY, next);
  }, []);

  const handleOpenTab = useCallback(
    (tool: CatalogTool) => {
      if (!tool.webUrl) return;
      setTabs((prev) => {
        const next = openTab(prev, tool.id);
        tabsTouchedRef.current = true;
        void setSetting(TABS_KEY, next);
        return next;
      });
    },
    [],
  );

  const handleCloseTab = useCallback((id: string) => {
    setTabs((prev) => {
      const next = closeTab(prev, id);
      tabsTouchedRef.current = true;
      void setSetting(TABS_KEY, next);
      return next;
    });
  }, []);

  // Zoeken over naam, omschrijving en categorie.
  const lang = i18n.language?.startsWith("en") ? "en" : "nl";
  const matches = useCallback(
    (tool: CatalogTool) => {
      const q = search.trim().toLowerCase();
      if (!q) return true;
      return (
        tool.name.toLowerCase().includes(q) ||
        tool.description[lang].toLowerCase().includes(q) ||
        t(`categories.${tool.category}`).toLowerCase().includes(q)
      );
    },
    [search, lang, t],
  );

  const hasUpdate = useCallback(
    (tool: CatalogTool) => deriveStatus(tool, installed[tool.id], releases[tool.id]) === "update_available",
    [installed, releases],
  );
  const passes = useCallback(
    (tool: CatalogTool, f: Filter) =>
      f === "all" || (f === "installed" ? tool.kind === "desktop" && !!installed[tool.id] : hasUpdate(tool)),
    [installed, hasUpdate],
  );
  const visible = useCallback(
    (tool: CatalogTool) =>
      matches(tool) && passes(tool, filter) && (!discipline || !!tool.disciplines?.includes(discipline)),
    [matches, passes, filter, discipline],
  );
  const desktopTools = useMemo(() => DESKTOP_TOOLS.filter(visible), [visible]);
  const webTools = useMemo(() => WEB_TOOLS.filter(visible), [visible]);

  // ── Zelf-update: eigen versie vergelijken met de laatste release ──
  // Verse opstart-check heeft voorrang op de gecachete waarde.
  const selfRelease = selfReleaseFresh ?? releases[SELF_ID];
  const selfLatest = selfRelease?.ok ? selfRelease.version : null;
  const selfUpdateAvailable =
    !!appVersion && !!selfLatest && compareVersions(appVersion, selfLatest) < 0;

  const handleSelfUpdate = useCallback(async () => {
    if (!selfRelease?.assetUrl || !selfRelease.assetName) return;
    setBusy((b) => ({ ...b, [SELF_ID]: true }));
    setErrors(({ [SELF_ID]: _drop, ...rest }) => rest);
    setNotes(({ [SELF_ID]: _drop, ...rest }) => rest);
    try {
      const outcome = await downloadAndRunInstaller(
        SELF_ID,
        selfRelease.assetUrl,
        selfRelease.assetName,
      );
      // Op Linux is de eigen AppImage al vervangen — alleen nog herstarten.
      setNotes((n) => ({
        ...n,
        [SELF_ID]: t(
          outcome.mode === "selfReplaced" ? "selfUpdate.restartToApply" : "selfUpdate.started",
        ),
      }));
    } catch (e) {
      setErrors((er) => ({ ...er, [SELF_ID]: `${t("errors.installFailed")}: ${String(e)}` }));
    } finally {
      setBusy(({ [SELF_ID]: _drop, ...rest }) => rest);
      setProgress(({ [SELF_ID]: _drop, ...rest }) => rest);
    }
  }, [selfRelease, t]);

  const updateCount = useMemo(() => DESKTOP_TOOLS.filter(hasUpdate).length, [hasUpdate]);
  const installedCount = useMemo(() => DESKTOP_TOOLS.filter((tool) => installed[tool.id]).length, [installed]);

  // Alles bijwerken: een voor een, zodat elke update zo nodig kan wachten tot de
  // gebruiker die app sluit.
  const handleUpdateAll = useCallback(async () => {
    for (const tool of DESKTOP_TOOLS.filter(hasUpdate)) {
      await handleInstall(tool);
    }
  }, [hasUpdate, handleInstall]);

  // Uitgelicht bovenaan: eerst tools met een update en een schermafbeelding,
  // daarna een vaste keuze, zoals in de galerij.
  const featured = useMemo(() => {
    const list = DESKTOP_TOOLS.filter((tool) => hasUpdate(tool) && tool.preview);
    for (const id of FEATURED) {
      const tool = CATALOG.find((x) => x.id === id);
      if (tool && !list.includes(tool)) list.push(tool);
    }
    return list;
  }, [hasUpdate]);

  const cardProps = (tool: CatalogTool) => ({
    tool,
    status: deriveStatus(tool, installed[tool.id], releases[tool.id]),
    installed: installed[tool.id],
    release: releases[tool.id],
    progress: progress[tool.id],
    busy: busy[tool.id],
    error: errors[tool.id],
    note: notes[tool.id],
    phase: phases[tool.id],
    onInstall: handleInstall,
    onCancel: handleCancelUpdate,
    onLaunch: handleLaunch,
    onOpenTab: handleOpenTab,
  });

  const renderCard = (tool: CatalogTool) => <ToolCard key={tool.id} {...cardProps(tool)} />;

  const pill = (key: string, label: string, count: number, active: boolean, onClick: () => void, letter?: string) => (
    <button key={key} className="oa-pill" aria-pressed={active} onClick={onClick}>
      {letter && <span className="oa-pill-letter">{letter}</span>}
      {label}
      <span className="oa-count">{count}</span>
    </button>
  );

  return (
    <>
      <TitleBar onSettingsClick={() => setSettingsOpen(true)} />

      <TabBar
        open={tabs.open}
        active={tabs.active}
        onSelect={(id) => updateTabs({ ...tabs, active: id })}
        onClose={handleCloseTab}
      />

      <div className="catalog-view" hidden={tabs.active !== CATALOG_TAB}>
      <div className="catalog-scroll">
        <Hero
          counts={{ tools: CATALOG.length, installed: installedCount, updates: updateCount, web: WEB_TOOLS.length }}
          refreshing={refreshing}
          onUpdateAll={() => void handleUpdateAll()}
          onRefresh={() => refresh(true)}
          featured={featured}
          hasUpdate={hasUpdate}
          renderVersion={(tool) => <VersionLine {...cardProps(tool)} />}
          renderAction={(tool) => <PrimaryAction {...cardProps(tool)} />}
        />

        <main className="app-main">
          {selfUpdateAvailable && !selfUpdateDismissed && (
            <SelfUpdateBanner
              currentVersion={appVersion}
              latestVersion={selfLatest!}
              pageUrl={selfRelease?.pageUrl}
              canInstall={!!selfRelease?.assetUrl}
              busy={busy[SELF_ID]}
              progress={progress[SELF_ID]}
              error={errors[SELF_ID]}
              note={notes[SELF_ID]}
              onUpdate={handleSelfUpdate}
              onDismiss={() => setSelfUpdateDismissed(true)}
            />
          )}

          <div className="filter-pills" role="group" aria-label={t("filters.label")}>
            {pill("all", t("filters.all"), CATALOG.length, filter === "all" && !discipline, () => {
              setFilter("all");
              setDiscipline(null);
            })}
            {pill("installed", t("filters.installed"), installedCount, filter === "installed", () => setFilter("installed"))}
            {pill("updates", t("filters.updates"), updateCount, filter === "updates", () => setFilter("updates"))}
            {DISCIPLINES.map((letter) =>
              pill(
                letter,
                t(`filters.${letter}`),
                CATALOG.filter((tool) => tool.disciplines?.includes(letter)).length,
                discipline === letter,
                () => setDiscipline(discipline === letter ? null : letter),
                letter,
              ),
            )}
          </div>

          <section className="catalog-section">
            <div className="section-head-row">
              <div className="section-head">
                <span className="site-label">{t("catalog.desktopLabel", { count: desktopTools.length })}</span>
                <h2>{t("catalog.desktopTitle")}</h2>
                <p>{t("catalog.desktopText")}</p>
              </div>
              <label className="search-box">
                <B2Icon id="view.search" />
                <input
                  className="oa-field"
                  type="search"
                  value={search}
                  placeholder={t("search")}
                  aria-label={t("search")}
                  onChange={(e) => setSearch(e.target.value)}
                  spellCheck={false}
                />
              </label>
            </div>
            {desktopTools.length > 0 ? (
              <div className="tool-grid">{desktopTools.map(renderCard)}</div>
            ) : (
              <p className="catalog-empty">{search.trim() ? t("noResults", { query: search.trim() }) : t("catalog.noDesktop")}</p>
            )}
          </section>

          <div className="catalog-divider" aria-hidden="true">
            <span />
            <B2Icon id="software.open-webtab" />
            {t("catalog.divider")}
            <span />
          </div>

          <section className="catalog-section">
            <div className="section-head">
              <span className="site-label">{t("catalog.webLabel", { count: webTools.length })}</span>
              <h2>{t("catalog.webTitle")}</h2>
              <p>{t("catalog.webText")}</p>
            </div>
            {webTools.length > 0 ? (
              <div className="tool-grid">{webTools.map(renderCard)}</div>
            ) : (
              <p className="catalog-empty">{search.trim() ? t("noResults", { query: search.trim() }) : t("catalog.noWeb")}</p>
            )}
          </section>
        </main>
      </div>

      <StatusBar
        installedCount={installedCount}
        totalDesktop={DESKTOP_TOOLS.length}
        updateCount={updateCount}
        lastRefresh={lastRefresh}
        refreshing={refreshing}
      />
      </div>

      {/* Open tabs blijven gemount zodat hun staat bewaard blijft bij wisselen. */}
      {tabs.open.map((id) => {
        const tool = toolForTab(id);
        if (!tool?.webUrl) return null;
        return <WebToolView key={id} tool={tool} hidden={tabs.active !== id} />;
      })}

      <SettingsDialog
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        theme={theme}
        onThemeChange={setTheme}
        latestVersion={selfLatest}
      />
    </>
  );
}

export default App;
