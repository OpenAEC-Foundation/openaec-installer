import { describe, expect, it } from "vitest";
import type { InstalledTool, ReleaseInfo, ReleaseVariant } from "./api";
import { pickUpdateVariant } from "./status";

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

  it("kiest niets zonder bekende installatiesoort of zonder varianten", () => {
    expect(pickUpdateVariant(pdf, installed(null, null))).toBeNull();
    expect(pickUpdateVariant({ ...pdf, variants: undefined }, installed("nsis", "user"))).toBeNull();
  });
});
