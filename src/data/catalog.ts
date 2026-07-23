/**
 * Catalogus van OpenAEC Foundation tools.
 *
 * - `desktop`-tools hebben installers op GitHub Releases (Windows-setup en
 *   AppImage); de app detecteert de geïnstalleerde versie op Windows via het
 *   register (`registryName` = DisplayName in de Uninstall-sleutel, `exeName` =
 *   fallback om de exe te vinden als het register geen pad geeft) en op Linux
 *   via de eigen beheerde AppImage-map.
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
  | "veld"
  | "gis";

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
  /**
   * Lokaal gebundelde previewafbeelding (van open-aec.com), pad onder /previews/.
   * Ontbreekt als er geen screenshot beschikbaar is → dan valt de kaart terug op
   * het categorie-icoon.
   */
  preview?: string;
  description: { nl: string; en: string };
  /** Community-project buiten de OpenAEC-Foundation org. */
  community?: boolean;
}

export const CATALOG: CatalogTool[] = [
  // ─── Desktop-tools (Windows-installers via GitHub Releases) ───
  {
    id: "open-3d-studio",
    name: "Open 3D Studio",
    kind: "desktop",
    category: "bim",
    repo: "OpenAEC-Foundation/open-3d-studio",
    registryName: "Open 3D Studio",
    exeName: "open-3d-studio.exe",
    description: {
      nl: "Open source 3D-modelleerstudio met IFC als native output. Teken parametrische componenten op geladen IFC- en DXF-modellen, met sheets, aantallen en STL/PDF-export.",
      en: "Open-source 3D modelling studio with IFC as native output. Draw parametric components on loaded IFC and DXF models, with sheets, quantities and STL/PDF export.",
    },
  },
  {
    id: "open-calc-studio",
    name: "Open Calc Studio",
    preview: "/previews/open-calc-studio.jpg",
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
    preview: "/previews/open-pdf-studio.jpg",
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
    preview: "/previews/open-planner-studio.jpg",
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
    preview: "/previews/open-2d-studio.jpg",
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
    preview: "/previews/open-cad-studio.jpg",
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
    preview: "/previews/open-calculations-studio.jpg",
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
    preview: "/previews/open-geotechniek-studio.jpg",
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
    preview: "/previews/monty-ifc-viewer.jpg",
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
    preview: "/previews/open-speech-studio.jpg",
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
  {
    id: "open-stl-3dmap-studio",
    name: "Open STL-3DMap Studio",
    kind: "desktop",
    category: "gis",
    repo: "OpenAEC-Foundation/Open-STL-3DMap-Studio",
    registryName: "Open STL-3DMap Studio",
    exeName: "Open STL-3DMap Studio.exe",
    description: {
      nl: "Maak 3D-printbare meerkleuren stadskaarten van Nederland op basis van 3DBAG en BGT.",
      en: "Create 3D-printable multi-colour city maps of the Netherlands from 3DBAG and BGT data.",
    },
  },

  // ─── Webtools (browser-snelkoppelingen) ───
  {
    id: "open-heatloss-studio",
    name: "Open Heatloss Studio",
    preview: "/previews/open-heatloss-studio.jpg",
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
    preview: "/previews/open-field-studio.jpg",
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
    preview: "/previews/open-energy-studio.jpg",
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
    preview: "/previews/open-pointcloud-studio.jpg",
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
    preview: "/previews/open-books.jpg",
    kind: "web",
    category: "documenten",
    webUrl: "https://open-books.open-aec.com/",
    description: {
      nl: "Digitalisering van historische bouwliteratuur.",
      en: "Digitisation of historical construction literature.",
    },
  },
  {
    id: "open-bim-validator",
    name: "Open BIM Validator Studio",
    preview: "/previews/open-bim-validator.jpg",
    kind: "web",
    category: "bim",
    repo: "OpenAEC-Foundation/OpenAEC-BIM-validator",
    webUrl: "https://open-aec.com/bim-validator/",
    description: {
      nl: "Valideer IFC-modellen tegen standaarden zoals IDS, NL-BIM Basis ILS en de RVB BIM Norm.",
      en: "Validate IFC models against standards such as IDS, NL-BIM Basis ILS and the RVB BIM Norm.",
    },
  },
  {
    id: "pile-plan-studio",
    name: "Pile Plan Studio",
    kind: "web",
    category: "constructief",
    repo: "OpenAEC-Foundation/pile-plan-studio",
    webUrl: "https://pile-plan-studio.open-aec.com/",
    description: {
      nl: "Funderingspalenplannen opstellen en beheren, met positionering en technische uitvoer.",
      en: "Create and manage foundation pile plans, with positioning and technical output.",
    },
  },
];

export const DESKTOP_TOOLS = CATALOG.filter((t) => t.kind === "desktop");
export const WEB_TOOLS = CATALOG.filter((t) => t.kind === "web");

/**
 * De installer zelf. Staat bewust niet in CATALOG (hij hoort niet als kaart in
 * het overzicht), maar wordt wel meegenomen in de release-check zodat de app
 * kan zien of er een nieuwere versie van zichzelf is en zich kan bijwerken.
 * Onze eigen setup installeert per gebruiker → bijwerken vraagt geen
 * beheerdersrechten.
 */
export const SELF_ID = "openaec-installer";
export const SELF_REPO = "OpenAEC-Foundation/openaec-installer";
