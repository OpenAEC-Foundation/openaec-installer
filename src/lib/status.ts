/**
 * Statusmodel per tool: afgeleid uit register-scan + laatste GitHub-release.
 */
import type { CatalogTool } from "../data/catalog";
import type { InstalledTool, ReleaseInfo } from "./api";

export type ToolStatus =
  | "not_installed"
  | "installed_latest"
  | "update_available"
  | "installed_unknown" // geïnstalleerd, maar laatste versie onbekend (API-fout)
  | "web_only";

/**
 * Vergelijk twee versies numeriek per segment (werkt voor semver "0.8.7"
 * én calver "2026.7.10"). Retourneert -1 / 0 / 1.
 */
export function compareVersions(a: string, b: string): number {
  const parse = (v: string) =>
    v
      .trim()
      .replace(/^[vV]/, "")
      .split(/[.+-]/)
      .map((p) => parseInt(p, 10))
      .filter((n) => !Number.isNaN(n));
  const pa = parse(a);
  const pb = parse(b);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const na = pa[i] ?? 0;
    const nb = pb[i] ?? 0;
    if (na < nb) return -1;
    if (na > nb) return 1;
  }
  return 0;
}

export function deriveStatus(
  tool: CatalogTool,
  installed: InstalledTool | undefined,
  release: ReleaseInfo | undefined,
): ToolStatus {
  if (tool.kind === "web") return "web_only";
  if (!installed) return "not_installed";
  const latest = release?.ok ? release.version : null;
  if (!latest || !installed.version) return "installed_unknown";
  return compareVersions(installed.version, latest) < 0
    ? "update_available"
    : "installed_latest";
}
