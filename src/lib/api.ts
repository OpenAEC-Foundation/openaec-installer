/**
 * Typed wrappers rond de Tauri-commands uit src-tauri/src/lib.rs.
 */
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { DESKTOP_TOOLS, SELF_ID, SELF_REPO } from "../data/catalog";

export interface InstalledTool {
  id: string;
  displayName: string;
  version: string | null;
  exePath: string | null;
  /** "user" (per gebruiker) of "machine" (voor de hele pc). */
  scope?: "user" | "machine" | null;
  /** Met welk soort setup de tool erop kwam; een update gebruikt dezelfde soort. */
  kind?: "nsis" | "msi" | "inno" | "appimage" | null;
  /**
   * Andere installaties van dezelfde tool, bijvoorbeeld per gebruiker én voor de
   * hele pc. De velden hierboven zijn die van de eerste (HKCU vóór HKLM).
   */
  copies?: InstalledCopy[];
}

/** Een tweede (of verdere) installatie van een tool. */
export interface InstalledCopy {
  version: string | null;
  exePath: string | null;
  scope?: "user" | "machine" | null;
  kind?: "nsis" | "msi" | "inno" | "appimage" | null;
}

/** Eén soort setup in een release. */
export interface ReleaseVariant {
  /** "inno" en "innoUser" zet de installer zelf, voor een Inno Setup-installatie. */
  kind: "nsis" | "nsisUser" | "msi" | "appimage" | "inno" | "innoUser";
  assetName: string;
  assetUrl: string;
  signature: string | null;
}

export interface ReleaseInfo {
  id: string;
  ok: boolean;
  error: string | null;
  tag: string | null;
  version: string | null;
  assetName: string | null;
  assetUrl: string | null;
  assetSize: number | null;
  pageUrl: string | null;
  publishedAt: string | null;
  /** Bij error "rate_limited": epoch-seconden waarop de limiet vrijgeeft. */
  rateLimitReset?: number | null;
  /** Handtekening van het asset (base64), als de release er een levert. */
  signature?: string | null;
  /** "manifest" via latest.json, "api" via de GitHub API. */
  source?: "manifest" | "api" | null;
  /** Alle soorten setup in de release, voor een update in dezelfde soort. */
  variants?: ReleaseVariant[];
}

export interface InstallOutcome {
  path: string;
  /**
   * ranInstaller — setup-UI gestart (Windows);
   * installed — direct geïnstalleerd, klaar voor gebruik (Linux);
   * selfReplaced — eigen AppImage vervangen, herstart nodig (Linux);
   * selfUpdating — eigen setup stil gestart; de installer sluit nu en de setup
   *   start hem opnieuw (Windows, per-gebruiker-installatie).
   */
  mode: "ranInstaller" | "installed" | "selfReplaced" | "selfUpdating";
}

export interface UpdateOutcome {
  /** updated — stil bijgewerkt (Windows); installed — AppImage vervangen (Linux). */
  mode: "updated" | "installed" | "selfReplaced";
  /** De tool stond open en is na het bijwerken weer gestart. */
  relaunched: boolean;
  /** Windows moet opnieuw opstarten om het af te ronden (MSI). */
  restartRequired: boolean;
}

export interface UpdatePhase {
  id: string;
  /** waiting — wacht tot de gebruiker de tool sluit; installing — setup draait stil. */
  phase: "waiting" | "installing";
}

export interface DownloadProgress {
  id: string;
  downloaded: number;
  total: number | null;
  done: boolean;
}

export async function getInstalledTools(): Promise<InstalledTool[]> {
  const queries = DESKTOP_TOOLS.map((t) => ({
    id: t.id,
    displayName: t.registryName ?? t.name,
    exeName: t.exeName ?? null,
  }));
  return invoke<InstalledTool[]>("get_installed_tools", { queries });
}

export async function getLatestReleases(): Promise<ReleaseInfo[]> {
  const repos = DESKTOP_TOOLS.filter((t) => t.repo).map((t) => {
    const [owner, repo] = t.repo!.split("/");
    return { id: t.id, owner, repo, pubkey: t.pubkey ?? null };
  });
  // De installer controleert in dezelfde ronde zijn eigen laatste versie.
  const [selfOwner, selfName] = SELF_REPO.split("/");
  repos.push({ id: SELF_ID, owner: selfOwner, repo: selfName, pubkey: null });
  return invoke<ReleaseInfo[]>("get_latest_releases", { repos });
}

/**
 * Alleen de laatste release van de installer zelf ophalen, uit het
 * releasebestand (of met 1 API-aanroep als terugval). Wordt bij elke opstart
 * gebruikt, los van de cache voor de tools, zodat een nieuwe versie van de
 * installer meteen wordt opgemerkt.
 */
export async function getSelfRelease(): Promise<ReleaseInfo | null> {
  const [owner, repo] = SELF_REPO.split("/");
  const list = await invoke<ReleaseInfo[]>("get_latest_releases", {
    repos: [{ id: SELF_ID, owner, repo }],
  });
  return list[0] ?? null;
}

export async function downloadAndRunInstaller(
  id: string,
  url: string,
  fileName: string,
  displayName?: string,
  verify?: { signature?: string | null; pubkey?: string | null },
): Promise<InstallOutcome> {
  return invoke<InstallOutcome>("download_and_run_installer", {
    id,
    url,
    fileName,
    displayName: displayName ?? null,
    // Met een sleutel weigert de backend te installeren zonder kloppende handtekening.
    signature: verify?.signature ?? null,
    pubkey: verify?.pubkey ?? null,
  });
}

/**
 * Werk een geïnstalleerde tool stil bij met dezelfde soort setup. Staat de tool
 * open, dan wacht de backend tot de gebruiker hem sluit (fase "waiting") en
 * start hem na het bijwerken weer.
 */
export async function updateTool(args: {
  id: string;
  variant: ReleaseVariant;
  displayName: string;
  pubkey?: string | null;
  exePath?: string | null;
}): Promise<UpdateOutcome> {
  return invoke<UpdateOutcome>("update_tool", {
    id: args.id,
    url: args.variant.assetUrl,
    fileName: args.variant.assetName,
    displayName: args.displayName,
    signature: args.variant.signature,
    pubkey: args.pubkey ?? null,
    kind: args.variant.kind,
    exePath: args.exePath ?? null,
  });
}

export async function cancelUpdate(id: string): Promise<void> {
  return invoke("cancel_update", { id });
}

export function onUpdatePhase(handler: (p: UpdatePhase) => void): Promise<UnlistenFn> {
  return listen<UpdatePhase>("update-phase", (e) => handler(e.payload));
}

export async function launchTool(exePath: string): Promise<void> {
  return invoke("launch_tool", { exePath });
}

export function onDownloadProgress(
  handler: (p: DownloadProgress) => void,
): Promise<UnlistenFn> {
  return listen<DownloadProgress>("download-progress", (e) => handler(e.payload));
}

/** De opdracht waarmee de installer gestart is: `--update <id>` of `--check`. */
export interface LaunchRequest {
  update: string | null;
  check: boolean;
}

/** Eenmalig de opdracht van deze start, daarna doorgegeven opdrachten van een tweede start. */
export async function takeLaunchRequest(): Promise<LaunchRequest | null> {
  return invoke<LaunchRequest | null>("take_launch_request");
}

/**
 * Schrijf `updates.json`: per tool de nieuwste versie en de releasepagina. Apps
 * lezen dit bij het starten en tonen dan "Versie … staat klaar" (OpenAEC-Blueprint#33).
 */
export async function writeUpdateStatus(releases: ReleaseInfo[]): Promise<void> {
  const apps: Record<string, { latest: string; page_url?: string }> = {};
  for (const r of releases) {
    if (r.ok && r.version) apps[r.id] = r.pageUrl ? { latest: r.version, page_url: r.pageUrl } : { latest: r.version };
  }
  await invoke("write_update_status", { apps });
}

/** Sluit de installer (na `--check`). */
export async function quitInstaller(): Promise<void> {
  await invoke("quit");
}
