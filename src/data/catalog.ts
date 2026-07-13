/**
 * Catalogus van OpenAEC Foundation tools.
 *
 * - `desktop`-tools hebben Windows-installers op GitHub Releases; de app
 *   detecteert de geïnstalleerde versie via het Windows-register
 *   (`registryName` = DisplayName in de Uninstall-sleutel, `exeName` = fallback
 *   om de exe te vinden als het register geen pad geeft).
 * - `web`-tools draaien in de browser en worden als snelkoppeling geopend.
 *
 * Omschrijvingen komen van https://open-aec.com/.
 */

export type ToolKind = "desktop" | "web";

export type Category =
  | "calculatie"
  | "cad"
  | "constructief"
  | "geotechniek"
  | "bim"
  | "planning"
  | "documenten"
  | "ai"
  | "energie"
  | "veld";

export interface CatalogTool {
  id: string;
  name: string;
  kind: ToolKind;
  category: Category;
  /** GitHub repo als "owner/naam" (alleen desktop-tools). */
  repo?: string;
  /** DisplayName in de Windows Uninstall-registersleutel. */
  registryName?: string;
  /** Verwachte exe-naam (fallback voor pad-detectie). */
  exeName?: string;
  /** Web-app of demo-URL. */
  webUrl?: string;
  /** Productpagina op open-aec.com. */
  siteUrl?: string;
  description: { nl: string; en: string };
  /** Community-project buiten de OpenAEC-Foundation org. */
  community?: boolean;
}

export const CATALOG: CatalogTool[] = [
  // ─── Desktop-tools (Windows-installers via GitHub Releases) ───
  {
    id: "open-calc-studio",
    name: "Open Calc Studio",
    kind: "desktop",
    category: "calculatie",
    repo: "OpenAEC-Foundation/open-calc-studio",
    registryName: "Open Calc Studio",
    exeName: "open-calc-studio.exe",
    webUrl: "https://open-calc-studio.open-aec.com/",
    description: {
      nl: "Open source calculatie en begroting voor de bouwsector, met AI-assistent.",
      en: "Open-source cost estimation and budgeting for construction, with AI assistant.",
    },
  },
  {
    id: "open-pdf-studio",
    name: "Open PDF Studio",
    kind: "desktop",
    category: "documenten",
    repo: "OpenAEC-Foundation/open-pdf-studio",
    registryName: "Open PDF Studio",
    exeName: "open-pdf-studio.exe",
    webUrl: "https://open-pdf-studio.open-aec.com/",
    description: {
      nl: "PDF's bekijken, bewerken en annoteren — gericht op bouwdocumentatie en tekeningen.",
      en: "View, edit and annotate PDFs — focused on construction documents and drawings.",
    },
  },
  {
    id: "open-planner-studio",
    name: "Open Planner Studio",
    kind: "desktop",
    category: "planning",
    repo: "OpenAEC-Foundation/open-planner-studio",
    registryName: "Open Planner Studio",
    exeName: "open-planner-studio.exe",
    webUrl: "https://open-planner-studio.open-aec.com/",
    siteUrl: "https://open-aec.com/open-planner-studio/",
    description: {
      nl: "Open source projectplanning en werkcoördinatie voor bouwprojecten.",
      en: "Open-source project planning and coordination for construction projects.",
    },
  },
  {
    id: "open-2d-studio",
    name: "Open 2D Studio",
    kind: "desktop",
    category: "cad",
    repo: "OpenAEC-Foundation/open-2d-studio",
    registryName: "Open 2D Studio",
    exeName: "open-2d-studio.exe",
    webUrl: "https://open-2d-studio.open-aec.com/",
    description: {
      nl: "2D tekeningen en documenten bekijken en bewerken.",
      en: "View and edit 2D drawings and documents.",
    },
  },
  {
    id: "open-cad-studio",
    name: "Open CAD Studio",
    kind: "desktop",
    category: "cad",
    repo: "HakanSeven12/OpenCADStudio",
    registryName: "Open CAD Studio",
    exeName: "OpenCADStudio.exe",
    webUrl: "https://hakanseven12.github.io/OpenCADStudio/",
    description: {
      nl: "Volwaardige 2D + 3D CAD-applicatie met DWG/DXF-ondersteuning (community-project).",
      en: "Full 2D + 3D CAD application with DWG/DXF support (community project).",
    },
    community: true,
  },
  {
    id: "open-calculations-studio",
    name: "Open Calculations Studio",
    kind: "desktop",
    category: "constructief",
    repo: "OpenAEC-Foundation/Open-Calculations-Studio",
    registryName: "Open Calculations Studio",
    exeName: "open-calculations-studio.exe",
    webUrl: "https://open-calculations-studio.open-aec.com/",
    description: {
      nl: "Constructieve handberekeningen met CalcPAD-syntax, herleidbaar en deelbaar.",
      en: "Structural hand calculations with CalcPAD syntax, traceable and shareable.",
    },
  },
  {
    id: "open-frame-studio",
    name: "Open Frame Studio",
    kind: "desktop",
    category: "constructief",
    repo: "OpenAEC-Foundation/open-frame-studio",
    registryName: "Open Frame Studio",
    exeName: "open-frame-studio.exe",
    description: {
      nl: "Parametrisch kozijn- en raamwerkontwerp voor de bouw.",
      en: "Parametric window frame design software for the construction industry.",
    },
  },
  {
    id: "open-fem2d-studio",
    name: "Open FEM2D Studio",
    kind: "desktop",
    category: "constructief",
    repo: "OpenAEC-Foundation/open-fem2d-studio",
    registryName: "Open FEM2D Studio",
    exeName: "open-fem2d-studio.exe",
    description: {
      nl: "2D eindige-elementenanalyse voor constructies.",
      en: "2D finite element analysis for structures.",
    },
  },
  {
    id: "open-geotechniek-studio",
    name: "Open Geotechniek Studio",
    kind: "desktop",
    category: "geotechniek",
    repo: "OpenAEC-Foundation/open-geotechniek-studio",
    registryName: "Open Geotechniek Studio",
    exeName: "open-geotechniek-studio.exe",
    webUrl: "https://open-geotechniek-studio.open-aec.com/",
    description: {
      nl: "Viewer voor sonderingen: CPT's in GEF- en BRO-XML-formaat.",
      en: "Viewer for cone penetration tests: GEF and BRO-XML (CPT analysis).",
    },
  },
  {
    id: "monty-ifc-viewer",
    name: "Monty IFC Viewer",
    kind: "desktop",
    category: "bim",
    repo: "OpenAEC-Foundation/monty-ifc-viewer",
    registryName: "Monty IFC Viewer",
    exeName: "monty-ifc-viewer.exe",
    webUrl: "https://monty-ifc-viewer.open-aec.com/",
    description: {
      nl: "Open source IFC-viewer voor BIM-modellen, ook op de bouwplaats.",
      en: "Open-source IFC viewer for BIM models, on site too.",
    },
  },
  {
    id: "open-speech-studio",
    name: "Open Speech Studio",
    kind: "desktop",
    category: "ai",
    repo: "OpenAEC-Foundation/open-speech-studio",
    registryName: "Open Speech Studio",
    exeName: "open-speech-studio.exe",
    siteUrl: "https://open-aec.com/open-speech-studio/",
    description: {
      nl: "Lokale spraak-naar-tekst en vergadernotities — 100% op je eigen machine.",
      en: "Local speech-to-text and meeting notes — 100% on your own machine.",
    },
  },

  // ─── Webtools (browser-snelkoppelingen) ───
  {
    id: "open-heatloss-studio",
    name: "Open Heatloss Studio",
    kind: "web",
    category: "energie",
    webUrl: "https://open-heatloss-studio.open-aec.com/",
    description: {
      nl: "Warmteverliesberekeningen voor gebouwen volgens NEN-EN 12831 / ISSO 51.",
      en: "Building heat-loss calculations per NEN-EN 12831 / ISSO 51.",
    },
  },
  {
    id: "open-field-studio",
    name: "Open Field Studio",
    kind: "web",
    category: "veld",
    webUrl: "https://open-field-studio.open-aec.com/",
    description: {
      nl: "Inspecties, opleveringen en kwaliteitsborging met checklists.",
      en: "Inspections, handovers and quality assurance with checklists.",
    },
  },
  {
    id: "open-energy-studio",
    name: "Open Energy Studio",
    kind: "web",
    category: "energie",
    webUrl: "https://open-energy-studio.open-aec.com/",
    description: {
      nl: "Energieanalyse en gebouwprestaties.",
      en: "Energy analysis and building performance.",
    },
  },
  {
    id: "open-pointcloud-studio",
    name: "Open Pointcloud Studio",
    kind: "web",
    category: "bim",
    webUrl: "https://open-pointcloud-studio.open-aec.com/",
    description: {
      nl: "Pointcloud-viewer voor renovatie en analyse.",
      en: "Point cloud viewer for renovation and analysis.",
    },
  },
  {
    id: "open-books",
    name: "Open Books Studio",
    kind: "web",
    category: "documenten",
    webUrl: "https://open-books.open-aec.com/",
    description: {
      nl: "Digitalisering van historische bouwliteratuur.",
      en: "Digitisation of historical construction literature.",
    },
  },
];

export const DESKTOP_TOOLS = CATALOG.filter((t) => t.kind === "desktop");
export const WEB_TOOLS = CATALOG.filter((t) => t.kind === "web");
