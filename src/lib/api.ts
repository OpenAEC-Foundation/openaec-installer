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
    return { id: t.id, owner, repo };
  });
  // De installer controleert in dezelfde ronde zijn eigen laatste versie.
  const [selfOwner, selfName] = SELF_REPO.split("/");
  repos.push({ id: SELF_ID, owner: selfOwner, repo: selfName });
  return invoke<ReleaseInfo[]>("get_latest_releases", { repos });
}

export async function downloadAndRunInstaller(
  id: string,
  url: string,
  fileName: string,
): Promise<string> {
  return invoke<string>("download_and_run_installer", { id, url, fileName });
}

export async function launchTool(exePath: string): Promise<void> {
  return invoke("launch_tool", { exePath });
}

export function onDownloadProgress(
  handler: (p: DownloadProgress) => void,
): Promise<UnlistenFn> {
  return listen<DownloadProgress>("download-progress", (e) => handler(e.payload));
}
