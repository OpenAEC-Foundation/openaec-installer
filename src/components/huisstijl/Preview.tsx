import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { color, fontFile, isDark, isObject, logoFile, readFile, type Added, type Brand } from "../../lib/huisstijl";

const MIME: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", svg: "image/svg+xml" };

/** Een bestand van het concept als object-URL; leeg zolang het er niet is. */
function useFileUrl(source: string | null, path: string | null, added: Added[]): string | null {
  const [url, setUrl] = useState<string | null>(null);
  const from = added.find((a) => a.path === path)?.from ?? "";
  useEffect(() => {
    let made: string | null = null;
    let gone = false;
    setUrl(null);
    const type = path ? MIME[path.split(".").pop()?.toLowerCase() ?? ""] : undefined;
    if (!path || !type) return;
    readFile(source, path, added)
      .then((bytes) => {
        if (gone) return;
        made = URL.createObjectURL(new Blob([bytes], { type }));
        setUrl(made);
      })
      .catch(() => {});
    return () => {
      gone = true;
      if (made) URL.revokeObjectURL(made);
    };
    // `from` zegt of het bestand op dit pad is vervangen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, path, from]);
  return url;
}

/** Het lettertype uit de huisstijl laden; geeft de naam voor `font-family`, of null. */
function useFont(source: string | null, path: string | null, added: Added[]): string | null {
  const [family, setFamily] = useState<string | null>(null);
  const from = added.find((a) => a.path === path)?.from ?? "";
  useEffect(() => {
    let gone = false;
    setFamily(null);
    if (!path) return;
    const name = `hs-${(source ?? "voorbeeld").length}-${path}-${from}`.replace(/[^A-Za-z0-9]/g, "-");
    readFile(source, path, added)
      .then((bytes) => new FontFace(name, bytes.buffer).load())
      .then((face) => {
        if (gone) return;
        document.fonts.add(face);
        setFamily(name);
      })
      .catch(() => {});
    return () => {
      gone = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, path, from]);
  return family;
}

/** Een schets van een rapportpagina in de huisstijl: kleuren, lettertypen en logo. */
export default function Preview({ brand, source, added }: { brand: Brand; source: string | null; added: Added[] }) {
  const { t } = useTranslation("huisstijl");
  const c = useMemo(() => {
    const primary = color(brand, ["primary"], "#D97706");
    const secondary = color(brand, ["secondary"], "#36363E");
    return {
      primary,
      secondary,
      text: color(brand, ["text", "text_dark"], secondary),
      muted: color(brand, ["text_muted", "text_light", "scaffold_gray"], "#6B6B75"),
      page: color(brand, ["background", "background_light", "blueprint_white"], "#FFFFFF"),
      alt: color(brand, ["background_alt", "background_card", "concrete"], "#F5F5F4"),
      rule: color(brand, ["rule", "separator"], "#E7E5E4"),
      tableHead: color(brand, ["table_header_bg"], secondary),
      tableFoot: color(brand, ["table_footer_bg"], primary),
      ok: color(brand, ["success", "accent"], "#16A34A"),
    };
  }, [brand]);
  const strip = isObject(brand.gradient) && Array.isArray(brand.gradient.accent_strip) ? brand.gradient.accent_strip.filter((v): v is string => typeof v === "string") : [];
  const gradient = strip.length > 1 ? `linear-gradient(90deg, ${strip.join(", ")})` : c.primary;
  const heading = useFont(source, fontFile(brand, ["heading"]), added);
  const body = useFont(source, fontFile(brand, ["body"]), added);
  const logo = useFileUrl(source, logoFile(brand, isDark(c.secondary) ? ["main", "white", "symbol", "light"] : ["light", "main", "symbol"]), added);
  const names = isObject(brand.brand) ? brand.brand : {};
  const name = typeof names.name === "string" ? names.name : "";
  const tagline = typeof names.tagline === "string" ? names.tagline : "";
  const on = (hex: string) => (isDark(hex) ? "#FFFFFF" : "#1F1F24");
  const h = { fontFamily: heading ? `"${heading}", sans-serif` : "sans-serif" };

  return (
    <div className="hs-page" style={{ background: c.page, color: c.text, fontFamily: body ? `"${body}", sans-serif` : "sans-serif" }}>
      <div className="hs-page-head" style={{ background: c.secondary, color: on(c.secondary) }}>
        {logo ? <img src={logo} alt="" /> : <strong style={h}>{name}</strong>}
        <span style={{ opacity: 0.75 }}>{t("preview.project")}</span>
      </div>
      <div className="hs-page-strip" style={{ background: gradient }} />
      <div className="hs-page-body">
        <p className="hs-page-kicker" style={{ color: c.primary }}>
          {name}
          {tagline && ` · ${tagline}`}
        </p>
        <h3 style={h}>{t("preview.report")}</h3>
        <h4 style={h}>{t("preview.heading")}</h4>
        <p>{t("preview.body")}</p>
        <h5 style={{ ...h, color: c.primary }}>{t("preview.sub")}</h5>
        <table style={{ borderColor: c.rule }}>
          <thead>
            <tr style={{ background: c.tableHead, color: on(c.tableHead) }}>
              <th>{t("preview.colLoad")}</th>
              <th>{t("preview.colValue")}</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={{ borderColor: c.rule }}>{t("preview.rowA")}</td>
              <td style={{ borderColor: c.rule }}>3,20 kN/m²</td>
            </tr>
            <tr style={{ background: c.alt }}>
              <td style={{ borderColor: c.rule }}>{t("preview.rowB")}</td>
              <td style={{ borderColor: c.rule }}>1,75 kN/m²</td>
            </tr>
            <tr style={{ background: c.tableFoot, color: on(c.tableFoot) }}>
              <td>{t("preview.total")}</td>
              <td>4,95 kN/m²</td>
            </tr>
          </tbody>
        </table>
        <p className="hs-page-check">
          <span style={{ background: c.ok }} />
          UC = 0,82 · {t("preview.ok")}
        </p>
      </div>
      <div className="hs-page-foot" style={{ borderColor: c.rule, color: c.muted }}>
        <span style={h}>{name}</span>
        <span style={{ color: c.primary }}>{t("preview.page")}</span>
      </div>
    </div>
  );
}
