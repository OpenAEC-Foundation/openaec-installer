import { describe, expect, it } from "vitest";
import { ALL_TOOLS, CATALOG, DESKTOP_TOOLS, WEB_TOOLS } from "./catalog";
import { tabbableTools } from "../lib/tabs";

describe("verborgen tools", () => {
  const hidden = ALL_TOOLS.filter((t) => t.hidden);

  it("laat verborgen tools uit de zichtbare catalogus", () => {
    expect(CATALOG).toHaveLength(ALL_TOOLS.length - hidden.length);
    for (const tool of hidden) {
      expect(CATALOG.map((t) => t.id)).not.toContain(tool.id);
    }
  });

  it("neemt verborgen tools niet mee in de afgeleide lijsten", () => {
    // DESKTOP_TOOLS voedt de registerscan en de release-check; WEB_TOOLS en de
    // tabbladen bepalen wat er te openen is. Verborgen hoort nergens op te duiken.
    const ids = [...DESKTOP_TOOLS, ...WEB_TOOLS, ...tabbableTools()].map((t) => t.id);
    for (const tool of hidden) {
      expect(ids).not.toContain(tool.id);
    }
  });

  it("houdt de ids van alle entries uniek", () => {
    const ids = ALL_TOOLS.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
