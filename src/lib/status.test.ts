import { describe, expect, it } from "vitest";
import type { InstalledTool, ReleaseInfo, ReleaseVariant } from "./api";
import { compareVersions, pickUpdateVariant } from "./status";

describe("compareVersions", () => {
  it("vergelijkt semver en calver per getal", () => {
    expect(compareVersions("0.2.7", "0.2.8")).toBe(-1);
    expect(compareVersions("v2026.44.4", "2026.44.2")).toBe(1);
    expect(compareVersions("2026.43", "2026.43.0")).toBe(0);
  });

  it("telt een jaar van twee cijfers uit een MSI als hetzelfde jaar", () => {
    // Open CAD Studio: register "26.43.0", release "v2026.43".
    expect(compareVersions("26.43.0", "2026.43")).toBe(0);
    expect(compareVersions("26.43.0", "2026.44")).toBe(-1);
    expect(compareVersions("2026.44", "26.43.0")).toBe(1);
    // Gewone kleine versies blijven gewoon kleiner dan een jaartal.
    expect(compareVersions("0.13.0", "2026.1")).toBe(-1);
  });
});

const variant = (kind: ReleaseVariant["kind"], assetName: string): ReleaseVariant => ({
  kind,
  assetName,
  assetUrl: `https://github.com/OpenAEC-Foundation/open-pdf-studio/releases/download/v2026.43.4/${assetName}`,
  signature: null,
});

// Zoals Open PDF Studio: een systeembrede setup, een aparte
// per-gebruiker-setup en (hier erbij) een MSI.
const pdf: ReleaseInfo = {
  id: "open-pdf-studio",
  ok: true,
  error: null,
  tag: "v2026.43.4",
  version: "2026.43.4",
  assetName: "Open.PDF.Studio_2026.43.4_x64_user-setup.exe",
  assetUrl: null,
  assetSize: null,
  pageUrl: null,
  publishedAt: null,
  variants: [
    variant("nsis", "Open.PDF.Studio_2026.43.4_x64-setup.exe"),
    variant("nsisUser", "Open.PDF.Studio_2026.43.4_x64_user-setup.exe"),
    variant("msi", "Open.PDF.Studio_2026.43.4_x64_en-US.msi"),
  ],
};

const installed = (kind: InstalledTool["kind"], scope: InstalledTool["scope"]): InstalledTool => ({
  id: "open-pdf-studio",
  displayName: "Open PDF Studio",
  version: "2026.42.11",
  exePath: null,
  kind,
  scope,
});

describe("setup voor een update", () => {
  it("houdt een installatie per gebruiker per gebruiker", () => {
    expect(pickUpdateVariant(pdf, installed("nsis", "user"))?.assetName).toBe(
      "Open.PDF.Studio_2026.43.4_x64_user-setup.exe",
    );
  });

  it("geeft een installatie voor de hele pc nooit de per-gebruiker-setup", () => {
    expect(pickUpdateVariant(pdf, installed("nsis", "machine"))?.assetName).toBe(
      "Open.PDF.Studio_2026.43.4_x64-setup.exe",
    );
  });

  it("werkt een MSI-installatie alleen met de MSI bij", () => {
    expect(pickUpdateVariant(pdf, installed("msi", "machine"))?.kind).toBe("msi");
    const zonderMsi = { ...pdf, variants: pdf.variants!.filter((v) => v.kind !== "msi") };
    expect(pickUpdateVariant(zonderMsi, installed("msi", "machine"))).toBeNull();
  });

  it("gebruikt de enige NSIS-setup als er geen aparte per-gebruiker-setup is", () => {
    const planner = { ...pdf, variants: [variant("nsis", "Open.Planner.Studio_2026.43.0_x64-setup.nsis.zip")] };
    expect(pickUpdateVariant(planner, installed("nsis", "user"))?.kind).toBe("nsis");
  });

  it("draait een Inno Setup-installatie met de vlaggen van Inno, in dezelfde modus", () => {
    const pointcloud = { ...pdf, variants: [variant("nsis", "open-pointcloud-studio_2026.44.1_x64-setup.exe")] };
    expect(pickUpdateVariant(pointcloud, installed("inno", "user"))).toMatchObject({ kind: "innoUser", assetName: "open-pointcloud-studio_2026.44.1_x64-setup.exe" });
    expect(pickUpdateVariant(pointcloud, installed("inno", "machine"))?.kind).toBe("inno");
    expect(pickUpdateVariant({ ...pdf, variants: [] }, installed("inno", "user"))).toBeNull();
  });

  it("kiest niets zonder bekende installatiesoort of zonder varianten", () => {
    expect(pickUpdateVariant(pdf, installed(null, null))).toBeNull();
    expect(pickUpdateVariant({ ...pdf, variants: undefined }, installed("nsis", "user"))).toBeNull();
  });
});
