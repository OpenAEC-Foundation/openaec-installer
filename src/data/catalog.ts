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
 * Welke tools erin staan, de volgorde, de namen en de omschrijvingen komen van
 * https://open-aec.com/ (zie ALL_TOOLS).
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
  /**
   * Begin van de naam van het installer-asset, voor een release met de setups
   * van meerdere apps (zoals Open Office Studio). Zonder prefix telt elk asset.
   */
  assetPrefix?: string;
  /** Verwachte exe-naam (fallback voor pad-detectie). */
  exeName?: string;
  /**
   * Vorige namen in het register (DisplayName). Een installatie onder zo'n naam
   * telt als deze tool; de kaart meldt bij bijwerken dat de naam verandert, en na
   * de update ruimt de installer de installatie onder de oude naam op.
   */
  legacyNames?: string[];
  /**
   * Publieke minisign-sleutel van de tool, gelijk aan `plugins.updater.pubkey`
   * in diens `tauri.conf.json`. Met een sleutel leest de installer eerst de
   * `latest.json` van de release (met terugval op de GitHub API) en installeert
   * hij alleen als de handtekening van de download klopt. Zet hem alleen als die
   * `latest.json` dezelfde soort setup aanbiedt als de API-route: Open PDF
   * Studio ondertekent alleen zijn systeembrede setup, terwijl de installer de
   * per-gebruiker-setup kiest, dus die krijgt (nog) geen sleutel.
   */
  pubkey?: string;
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
  /**
   * Eigen logo van de tool, pad onder /logos/. Vervangt het categorie-icoon in de
   * kaartkop en de tabbalk; zonder logo blijft het categorie-icoon staan.
   */
  logo?: string;
  description: { nl: string; en: string };
  /**
   * Disciplines van het ecosysteemfilter op open-aec.com: A(rchitecture),
   * E(ngineering), C(onstruction) en I(nfra & GWW), zoals "ECI".
   */
  disciplines?: string;
  /** Fase op open-aec.com, als die er is (gelezen 2026-10-22). */
  stage?: "alpha" | "beta" | "development";
  /** Community-project buiten de OpenAEC-Foundation org. */
  community?: boolean;
  /**
   * Tijdelijk uit de app gehouden: de tool verdwijnt uit het overzicht, uit de
   * registerscan en uit de release-check; weghalen van deze vlag zet de tool in
   * één keer weer terug. Een tool die niet meer op de website staat, gaat uit de
   * lijst in plaats van hier verborgen te blijven.
   */
  hidden?: boolean;
}

/**
 * Alle entries, inclusief verborgen. Gebruik CATALOG tenzij je bewust ook de verborgen tools nodig hebt.
 *
 * Alleen tools die op https://open-aec.com/ staan, in de volgorde van het
 * ecosysteemoverzicht daar (gelezen 2026-11-19). Namen, omschrijvingen,
 * disciplines en schermafbeeldingen komen van de website. Kaarten zonder iets
 * om te installeren of te openen (alleen "binnenkort", een standaard of een
 * uitbreiding op een andere tool) en tools die de website als "retired"
 * markeert, staan er niet in.
 */
export const ALL_TOOLS: CatalogTool[] = [
  // ─── Desktop-tools (installers via GitHub Releases) ───
  {
    // Opvolger van Open 3D Viewer Studio: dezelfde app, die nu Viewer, Modeller
    // en BIM Validator bevat. De setup houdt de map en de uninstall-sleutel van
    // de oude naam aan; alleen de DisplayName is nieuw.
    id: "open-bim-suite",
    name: "Open BIM Suite",
    preview: "/previews/open-bim-suite.jpg",
    kind: "desktop",
    category: "bim",
    disciplines: "AEC",
    stage: "development",
    repo: "OpenAEC-Foundation/open-bim-suite",
    registryName: "Open BIM Suite",
    legacyNames: ["Open 3D Viewer Studio"],
    exeName: "open-3d-viewer.exe",
    webUrl: "https://open-3d-viewer.open-aec.com/?product=modeller",
    siteUrl: "https://open-aec.com/open-bim-suite/",
    description: {
      nl: "N in één: de toekomstige everything-app voor BIM. Nu al Viewer, Modeller en BIM Validator in één programma.",
      en: "N in One: the future everything BIM app. Already Viewer, Modeller and BIM Validator in one program.",
    },
  },
  {
    id: "open-cad-studio",
    name: "Open CAD Studio",
    preview: "/previews/open-cad-studio.jpg",
    kind: "desktop",
    category: "cad",
    disciplines: "AEC",
    repo: "HakanSeven12/OpenCADStudio",
    registryName: "Open CAD Studio",
    exeName: "OpenCADStudio.exe",
    webUrl: "https://www.opencadstudio.com/app/",
    siteUrl: "https://open-aec.com/open-cad-studio/",
    description: {
      nl: "Volwaardige 2D- en 3D-CAD in Rust die DWG en DXF leest en schrijft. Communityproject van Hakan Seven.",
      en: "Full 2D and 3D CAD in Rust that reads and writes DWG and DXF. Community project by Hakan Seven.",
    },
    community: true,
  },
  {
    id: "open-pdf-studio",
    name: "Open PDF Studio",
    preview: "/previews/open-pdf-studio.jpg",
    kind: "desktop",
    category: "documenten",
    disciplines: "AECI",
    stage: "beta",
    repo: "OpenAEC-Foundation/open-pdf-studio",
    registryName: "Open PDF Studio",
    exeName: "open-pdf-studio.exe",
    webUrl: "https://open-pdf-studio.open-aec.com/",
    siteUrl: "https://open-aec.com/open-pdf-studio/",
    description: {
      nl: "PDF-editor met eigen Rust-engine: annoteren, meten op schaal, formulieren en redigeren. In 39 talen.",
      en: "PDF editor with its own Rust engine: annotate, measure to scale, fill forms and redact. In 39 languages.",
    },
  },
  {
    id: "open-calculations-studio",
    name: "Open CalcSheet Studio",
    preview: "/previews/open-calculations-studio.jpg",
    kind: "desktop",
    category: "constructief",
    disciplines: "EI",
    stage: "beta",
    repo: "OpenAEC-Foundation/Open-CalcSheet-Studio",
    registryName: "Open CalcSheet Studio",
    legacyNames: ["Open Calculations Studio"],
    exeName: "open-calcsheet-studio.exe",
    webUrl: "https://open-calculations-studio.open-aec.com/",
    siteUrl: "https://open-aec.com/open-calcsheet-studio/",
    description: {
      nl: "Constructieve handberekeningen met eenheden, formules, tekeningen en IFC-export.",
      en: "Structural hand calculations with units, formulas, drawings and IFC export.",
    },
  },
  {
    id: "open-planner-studio",
    name: "Open Planner Studio",
    preview: "/previews/open-planner-studio.jpg",
    kind: "desktop",
    category: "planning",
    disciplines: "ACI",
    stage: "beta",
    repo: "OpenAEC-Foundation/open-planner-studio",
    registryName: "Open Planner Studio",
    exeName: "open-planner-studio.exe",
    pubkey:
      "dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1YmxpYyBrZXk6IDI4QUM4RjA4QTg3QzkwQ0QKUldUTmtIeW9DSStzS0RyRytOY0VQNVBqREY2cm5NakpIMlBnb2ZIVm8rWE12YmI0aTYyUlI0MnMK",
    webUrl: "https://open-planner-studio.open-aec.com/",
    siteUrl: "https://open-aec.com/open-planner-studio/",
    description: {
      nl: "Planning voor bouw, GWW en civiel: Gantt, kritiek pad, resources en voortgang.",
      en: "Scheduling for construction, infrastructure and civil works: Gantt, critical path, resources and progress.",
    },
  },
  {
    id: "open-pointcloud-studio",
    name: "Open Pointcloud Studio",
    preview: "/previews/open-pointcloud-studio.jpg",
    kind: "desktop",
    category: "bim",
    disciplines: "ECI",
    stage: "beta",
    repo: "OpenAEC-Foundation/open-pointcloud-studio",
    registryName: "Open Pointcloud Studio",
    exeName: "open-pointcloud-studio.exe",
    webUrl: "https://open-pointcloud-studio.open-aec.com/",
    siteUrl: "https://open-aec.com/open-pointcloud-studio/",
    description: {
      nl: "Puntenwolken openen, meten en doorsnijden: LAS, LAZ, E57 en complete scanprojecten.",
      en: "Open, measure and section point clouds: LAS, LAZ, E57 and complete scan projects.",
    },
  },
  {
    id: "open-calc-studio",
    name: "Open Calc Studio",
    preview: "/previews/open-calc-studio.jpg",
    kind: "desktop",
    category: "calculatie",
    disciplines: "CI",
    stage: "beta",
    repo: "OpenAEC-Foundation/open-calc-studio",
    registryName: "Open Calc Studio",
    // Deze tool zet mainBinaryName in tauri.conf.json, waardoor de binary niet
    // de Cargo-naam (open-calc-studio) krijgt maar de productnaam.
    exeName: "Open Calc Studio.exe",
    webUrl: "https://open-calc-studio.open-aec.com/",
    siteUrl: "https://open-aec.com/open-calc-studio/",
    description: {
      nl: "Kostenramingen en begrotingen voor bouw, GWW en civiele projecten.",
      en: "Cost estimates and budgets for buildings, infrastructure and civil works.",
    },
  },
  {
    // De release bevat ook de losse apps (Writer, Spreadsheet, …); de installer
    // neemt de setup van Open Office Studio zelf.
    id: "open-office-studio",
    name: "Open Office Studio",
    preview: "/previews/open-office-studio.jpg",
    kind: "desktop",
    category: "documenten",
    stage: "alpha",
    repo: "OpenAEC-Foundation/open-office-studio",
    assetPrefix: "Open.Office.Studio_",
    registryName: "Open Office Studio",
    exeName: "open-office-studio.exe",
    siteUrl: "https://open-aec.com/open-office-studio/",
    description: {
      nl: "Tekst, rekenblad, presentaties, notities, e-mail en Access-databases op je eigen computer.",
      en: "Documents, spreadsheets, presentations, notes, email and Access databases on your own computer.",
    },
  },
  {
    id: "open-geotechniek-studio",
    name: "Open Geotechniek Studio",
    preview: "/previews/open-geotechniek-studio.jpg",
    kind: "desktop",
    category: "geotechniek",
    disciplines: "EI",
    stage: "beta",
    repo: "OpenAEC-Foundation/open-geotechniek-studio",
    registryName: "Open Geotechniek Studio",
    exeName: "open-geotechniek-studio.exe",
    webUrl: "https://open-geotechniek-studio.open-aec.com/",
    siteUrl: "https://open-aec.com/open-geotechniek-studio/",
    description: {
      nl: "Bekijk en analyseer sonderingen (CPT, GEF en BRO-xml) voor fundering en grondwerk.",
      en: "View and analyse cone penetration tests (CPT, GEF and BRO-xml) for foundations and earthworks.",
    },
  },
  {
    id: "open-frame-studio",
    name: "Open Frame Studio",
    preview: "/previews/open-frame-studio.jpg",
    kind: "desktop",
    category: "constructief",
    disciplines: "AC",
    stage: "beta",
    repo: "OpenAEC-Foundation/open-frame-studio",
    registryName: "Open Frame Studio",
    exeName: "open-frame-studio.exe",
    webUrl: "https://open-frame-studio.open-aec.com/",
    siteUrl: "https://open-aec.com/open-frame-studio/",
    description: {
      nl: "Open source kozijnsoftware. Ontwerp ramen, deuren en puien in 2D en 3D en lever kozijnstaat, werkplaatstekening en IFC-export uit hetzelfde model.",
      en: "Open source window frame software. Design windows, doors and glazed walls in 2D and 3D, and deliver frame schedules, workshop drawings and IFC export from one model.",
    },
  },
  {
    id: "open-field-studio",
    name: "Open Field Studio",
    preview: "/previews/open-field-studio.jpg",
    kind: "desktop",
    category: "veld",
    disciplines: "C",
    stage: "beta",
    repo: "OpenAEC-Foundation/Open-Field-Studio",
    registryName: "Open Field Studio",
    exeName: "open-field-studio.exe",
    webUrl: "https://open-field-studio.open-aec.com/",
    siteUrl: "https://open-aec.com/open-field-studio/",
    description: {
      nl: "Inspectie en oplevering: gebreken op de plattegrond, checklists (NEN 2767) en handtekeningen. Werkt offline.",
      en: "Inspection and handover: defects on the floor plan, checklists (NEN 2767) and signatures. Works offline.",
    },
  },
  {
    id: "monty-ifc-viewer",
    name: "Monty IFC Viewer",
    preview: "/previews/monty-ifc-viewer.jpg",
    kind: "desktop",
    category: "bim",
    disciplines: "C",
    repo: "OpenAEC-Foundation/monty-ifc-viewer",
    registryName: "Monty IFC Viewer",
    exeName: "monty-ifc-viewer.exe",
    webUrl: "https://monty-ifc-viewer.open-aec.com/",
    siteUrl: "https://open-aec.com/monty-ifc-viewer/",
    description: {
      nl: "IFC-viewer voor montage op de bouw: open BIM-modellen snel bekijken op tablet en telefoon.",
      en: "IFC viewer for assembly on site: quickly inspect open BIM models on tablet and phone.",
    },
  },
  {
    id: "open-paint-studio",
    name: "Open Paint Studio",
    preview: "/previews/open-paint-studio.jpg",
    kind: "desktop",
    category: "documenten",
    stage: "alpha",
    repo: "OpenAEC-Foundation/open-paint-studio",
    // De setup registreert zich onder de productnaam uit tauri.conf.json.
    registryName: "OpenAEC Paint Studio",
    exeName: "openaec-paint-studio.exe",
    siteUrl: "https://open-aec.com/open-paint-studio/",
    description: {
      nl: "Eenvoudige beeldbewerker: schetsen en markeren, met bewerkbare vectorobjecten en MCP voor AI.",
      en: "Simple image editor: sketch and mark up, with editable vector objects and MCP for AI.",
    },
  },
  {
    id: "open-bim-validator",
    name: "Open BIM Validator",
    preview: "/previews/open-bim-validator.jpg",
    kind: "desktop",
    category: "bim",
    disciplines: "AECI",
    repo: "OpenAEC-Foundation/OpenAEC-BIM-validator",
    // De setup registreert zich onder de productnaam uit tauri.conf.json.
    registryName: "BIM Validator",
    exeName: "openaec-bim-validator.exe",
    siteUrl: "https://open-aec.com/open-bim-validator/",
    description: {
      nl: "Modellen samen controleren: IFC-modellen naast elkaar, toetsen aan IDS, botsingen zoeken en issues vastleggen in BCF.",
      en: "Check models together: IFC models side by side, checked against IDS, clashes found and issues recorded in BCF.",
    },
  },
  {
    // De sync-client van de OpenAEC SuperCloud (repo openaec-cloud-desktop); tot
    // versie 0.4 heette hij "OpenAEC Storage". Een systeemvak-app: sluiten verbergt
    // het venster, afsluiten gaat via het systeemvak. De setup is per gebruiker.
    // In het register heet hij "OpenAEC Desktop App"; hier de naam van de kaart op
    // de website.
    id: "openaec-cloud-desktop",
    name: "OpenAEC SuperCloud",
    preview: "/previews/openaec-cloud-desktop.jpg",
    kind: "desktop",
    category: "documenten",
    disciplines: "AECI",
    stage: "development",
    repo: "OpenAEC-Foundation/openaec-cloud-desktop",
    registryName: "OpenAEC Desktop App",
    exeName: "openaec-cloud.exe",
    pubkey:
      "dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1YmxpYyBrZXk6IEY1Nzg3M0JEQzQxRTNBQjQKUldTME9oN0V2WE40OWZRMCs3eHNSQkxhTEhuOHp1Q0s4dWdOKzJaQXFmK3NQdFJyMCtVTjhDSU8K",
    siteUrl: "https://open-aec.com/openaec-cloud/",
    description: {
      nl: "Eigen cloud, account en inlog voor het hele OpenAEC-ecosysteem. Zelf gehost en open.",
      en: "Own cloud, account and sign-in for the whole OpenAEC ecosystem. Self-hosted and open.",
    },
  },
  {
    id: "open-speech-studio",
    name: "Open Speech Studio",
    preview: "/previews/open-speech-studio.jpg",
    kind: "desktop",
    category: "ai",
    stage: "beta",
    repo: "OpenAEC-Foundation/open-speech-studio",
    registryName: "Open Speech Studio",
    exeName: "open-speech-studio.exe",
    siteUrl: "https://open-aec.com/open-speech-studio/",
    description: {
      nl: "Lokale spraak-naar-tekst en notulen voor bouwoverleg, zonder cloud.",
      en: "Local speech-to-text and meeting notes for project meetings, without the cloud.",
    },
  },

  // ─── Webtools (openen in een tabblad of de browser) ───
  {
    id: "y-app",
    name: "Y-app",
    preview: "/previews/y-app.jpg",
    kind: "web",
    category: "planning",
    disciplines: "AECI",
    stage: "beta",
    webUrl: "https://y-app.impertio.app",
    siteUrl: "https://open-aec.com/y-app/",
    description: {
      nl: "De everything-app: mail, ERP, uren, offertes, projecten en planning in één tool, op ERPNext.",
      en: "The everything app: mail, ERP, hours, quotes, projects and planning in one tool, on ERPNext.",
    },
  },
  {
    id: "pile-plan-studio",
    name: "Open Pile Plan Studio",
    preview: "/previews/pile-plan-studio.jpg",
    kind: "web",
    category: "constructief",
    disciplines: "EI",
    stage: "beta",
    webUrl: "https://pile-plan-studio.open-aec.com/",
    siteUrl: "https://open-aec.com/open-pile-plan-studio/",
    description: {
      nl: "Vergelijk en optimaliseer paalconfiguraties per belastinglocatie tot een praktisch paalplan.",
      en: "Compare and optimise pile configurations per load location into a practical pile plan.",
    },
  },
  {
    id: "open-energy-studio",
    name: "Open Energy Studio",
    preview: "/previews/open-energy-studio.jpg",
    logo: "/logos/open-energy-studio.png",
    kind: "web",
    category: "energie",
    disciplines: "E",
    stage: "beta",
    webUrl: "https://open-energy-studio.open-aec.com/",
    siteUrl: "https://open-aec.com/open-energy-studio/",
    description: {
      nl: "Energieprestatie volgens NTA 8800: BENG, energielabel en TOjuli, met rapport.",
      en: "Energy performance to NTA 8800: BENG, energy label and summer overheating, with report.",
    },
  },
  {
    id: "ifccad",
    name: "IFCCAD",
    preview: "/previews/ifccad.jpg",
    kind: "web",
    category: "cad",
    stage: "development",
    webUrl: "https://ifccad-explorer.open-aec.com/",
    siteUrl: "https://open-aec.com/ifccad/",
    description: {
      nl: "Open CAD-formaat op IFCX, met native alpha, maatvoering en DWG/DXF-uitwisseling via de Format Explorer.",
      en: "Open CAD format using IFCX, with a native alpha, dimensions and DWG/DXF exchange through the Format Explorer.",
    },
  },
  {
    id: "open-heatloss-studio",
    name: "Open Heatloss Studio",
    preview: "/previews/open-heatloss-studio.jpg",
    kind: "web",
    category: "energie",
    disciplines: "E",
    stage: "alpha",
    webUrl: "https://open-heatloss-studio.open-aec.com/",
    siteUrl: "https://open-aec.com/open-heatloss-studio/",
    description: {
      nl: "Warmteverliesberekening per ruimte volgens NEN 12831: transmissie en ventilatie.",
      en: "Heat loss calculation per room to NEN 12831: transmission and ventilation.",
    },
  },
  {
    id: "open-books",
    name: "Open Books Studio",
    preview: "/previews/open-books.jpg",
    kind: "web",
    category: "documenten",
    disciplines: "A",
    stage: "development",
    webUrl: "https://open-books.open-aec.com/",
    siteUrl: "https://open-aec.com/open-books/",
    description: {
      nl: "Oude bouwkundige boeken ingescand en doorzoekbaar, voor onderzoek en restauratie.",
      en: "Old building books scanned and searchable, for research and restoration.",
    },
  },
];

/** De zichtbare catalogus: alles wat niet tijdelijk verborgen is. */
export const CATALOG: CatalogTool[] = ALL_TOOLS.filter((t) => !t.hidden);

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
