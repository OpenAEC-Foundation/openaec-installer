import { describe, expect, it } from "vitest";
import { CATALOG_TAB, EMPTY_TABS, closeTab, openTab, restoreTabs } from "./tabs";

describe("openTab", () => {
  it("opent een tool en maakt hem actief", () => {
    expect(openTab(EMPTY_TABS, "open-books")).toEqual({
      open: ["open-books"],
      active: "open-books",
    });
  });

  it("opent dezelfde tool nooit twee keer, maar activeert de bestaande tab", () => {
    const state = { open: ["open-books", "open-field-studio"], active: "open-field-studio" };
    expect(openTab(state, "open-books")).toEqual({
      open: ["open-books", "open-field-studio"],
      active: "open-books",
    });
  });
});

describe("closeTab", () => {
  const three = {
    open: ["a", "b", "c"],
    active: "b",
  };

  it("springt naar de rechterbuur bij het sluiten van de actieve tab", () => {
    expect(closeTab(three, "b")).toEqual({ open: ["a", "c"], active: "c" });
  });

  it("springt naar links wanneer de laatste tab actief was", () => {
    expect(closeTab({ open: ["a", "b"], active: "b" }, "b")).toEqual({
      open: ["a"],
      active: "a",
    });
  });

  it("valt terug op de catalogus wanneer de laatste tab sluit", () => {
    expect(closeTab({ open: ["a"], active: "a" }, "a")).toEqual({
      open: [],
      active: CATALOG_TAB,
    });
  });

  it("laat de actieve tab met rust bij het sluiten van een andere", () => {
    expect(closeTab(three, "a")).toEqual({ open: ["b", "c"], active: "b" });
  });

  it("negeert een tab die niet open staat", () => {
    expect(closeTab(three, "zzz")).toBe(three);
  });
});

describe("restoreTabs", () => {
  it("herstelt bewaarde tabs inclusief de actieve", () => {
    const saved = { open: ["open-books", "open-field-studio"], active: "open-field-studio" };
    expect(restoreTabs(saved)).toEqual(saved);
  });

  it("laat tools vallen die niet meer bestaan of geen webadres hebben", () => {
    // open-frame-studio heeft geen webUrl; verwijderd-tool bestaat niet meer.
    const restored = restoreTabs({
      open: ["open-books", "open-frame-studio", "verwijderd-tool"],
      active: "verwijderd-tool",
    });
    expect(restored).toEqual({ open: ["open-books"], active: CATALOG_TAB });
  });

  it("geeft een lege staat terug zonder opgeslagen voorkeur", () => {
    expect(restoreTabs(null)).toEqual(EMPTY_TABS);
  });
});
