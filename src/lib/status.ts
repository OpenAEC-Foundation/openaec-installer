/**
 * Statusmodel per tool: afgeleid uit register-scan + laatste GitHub-release.
 */
import type { CatalogTool } from "../data/catalog";
import type { InstalledTool, ReleaseInfo, ReleaseVariant } from "./api";

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
  // Een MSI-versie mag niet boven 255 komen, dus een MSI van calver 2026.43
  // zet "26.43.0" in het register (Open CAD Studio). Tegenover een jaartal van
  // vier cijfers telt een eerste getal onder 100 daarom als 20xx.
  if (pa[0] < 100 && pb[0] >= 2000) pa[0] += 2000;
  if (pb[0] < 100 && pa[0] >= 2000) pb[0] += 2000;
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

/**
 * De setup voor een update: dezelfde soort als de bestaande installatie, zodat
 * de tool er niet twee keer op komt te staan.
 *
 * - MSI-installatie → de MSI.
 * - NSIS per gebruiker → een aparte per-gebruiker-setup als die er is, anders de
 *   gewone NSIS-setup (dan is dat de enige).
 * - NSIS voor de hele pc → de gewone NSIS-setup, nooit de per-gebruiker-setup.
 * - AppImage → de AppImage.
 *
 * `null` als de release geen passende setup heeft.
 */
export function pickUpdateVariant(
  release: ReleaseInfo | undefined,
  installed: InstalledTool | undefined,
): ReleaseVariant | null {
  const variants = release?.variants ?? [];
  const find = (kind: ReleaseVariant["kind"]) => variants.find((v) => v.kind === kind) ?? null;
  switch (installed?.kind) {
    case "msi":
      return find("msi");
    case "appimage":
      return find("appimage");
    case "nsis":
      return installed.scope === "user" ? (find("nsisUser") ?? find("nsis")) : find("nsis");
    case "inno": {
      // Een Inno Setup-setup is ook een .exe; hij heet in de release "nsis", maar
      // draait met de vlaggen van Inno, in dezelfde modus als de installatie.
      const setup = find("nsis");
      return setup ? { ...setup, kind: installed.scope === "user" ? "innoUser" : "inno" } : null;
    }
    default:
      return null;
  }
}
