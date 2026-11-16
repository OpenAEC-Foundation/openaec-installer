import { describe, expect, it } from "vitest";
import { blankLike, color, fileSlot, fontFile, getAt, isDark, isHex, removeAt, renameAt, setAt, slotPath, type Brand } from "./huisstijl";

const brand: Brand = {
  brand: { name: "Jansen Bouw", tagline: "Sinds 1962" },
  colors: { primary: "#1F6F43", secondary: "#222222", fout: "groen" },
  fonts: { heading: "Lato-Bold", body: "Lato-Regular" },
  font_files: { "Lato-Bold": "fonts/Lato-Bold.ttf" },
  header: { height: 38, elements: [{ type: "line", color: "$primary" }, { type: "image", src: "logos/logo.png" }] },
};

describe("bewerken van brand.yaml", () => {
  it("zet een waarde zonder de volgorde of het origineel te veranderen", () => {
    const next = setAt(brand, ["colors", "primary"], "#000000");
    expect(Object.keys(next.colors as object)).toEqual(["primary", "secondary", "fout"]);
    expect(getAt(next, ["colors", "primary"])).toBe("#000000");
    expect(getAt(brand, ["colors", "primary"])).toBe("#1F6F43");
    expect(Object.keys(setAt(brand, ["colors", "accent"], "#FF0000").colors as object)).toEqual(["primary", "secondary", "fout", "accent"]);
    expect(getAt(setAt(brand, ["header", "elements", 1, "src"], "logos/nieuw.png"), ["header", "elements", 1, "src"])).toBe("logos/nieuw.png");
  });

  it("hernoemt en verwijdert", () => {
    const renamed = renameAt(brand, ["colors", "secondary"], "donker");
    expect(Object.keys(renamed.colors as object)).toEqual(["primary", "donker", "fout"]);
    expect(renameAt(brand, ["colors", "secondary"], "primary")).toEqual(brand);
    expect(renameAt(brand, ["colors", "secondary"], "  ")).toEqual(brand);
    expect(Object.keys(removeAt(brand, ["colors", "fout"]).colors as object)).toEqual(["primary", "secondary"]);
    expect((getAt(removeAt(brand, ["header", "elements", 0]), ["header", "elements"]) as unknown[]).length).toBe(1);
  });

  it("maakt een leeg item van dezelfde soort", () => {
    expect(blankLike({ type: "line", width: 210, color: "#D97706", on: true })).toEqual({ type: "", width: 0, color: "#000000", on: false });
  });
});

describe("bestanden en kleuren", () => {
  it("herkent vakken met een bestand", () => {
    expect(fileSlot(["font_files", "Lato-Bold"], "fonts/Lato-Bold.ttf")?.folder).toBe("fonts");
    expect(fileSlot(["logos", "main"], "")?.folder).toBe("logos");
    expect(fileSlot(["stationery", "cover", "source"], "")?.folder).toBe("stationery");
    expect(fileSlot(["header", "elements", 1, "src"], "logos/logo.png")?.folder).toBe("logos");
    expect(fileSlot(["brand", "name"], "Jansen Bouw")).toBeNull();
    expect(slotPath("logos", "C:\\Huisstijl\\Logo Jansen (2).png")).toBe("logos/Logo_Jansen__2_.png");
  });

  it("zoekt kleuren en lettertypen met terugval", () => {
    expect(isHex("#1f6f43")).toBe(true);
    expect(isHex("groen")).toBe(false);
    expect(color(brand, ["fout", "primary"], "#FFFFFF")).toBe("#1F6F43");
    expect(color(brand, ["onbekend"], "#FFFFFF")).toBe("#FFFFFF");
    expect(fontFile(brand, ["heading"])).toBe("fonts/Lato-Bold.ttf");
    expect(fontFile(brand, ["body"])).toBeNull();
    expect(isDark("#222222")).toBe(true);
    expect(isDark("#FAFAF9")).toBe(false);
  });
});
