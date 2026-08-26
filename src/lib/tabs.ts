/**
 * Tabbladen voor webtools: pure logica, los van React zodat het te overzien
 * en te testen is. Een tab wordt geïdentificeerd door het tool-id uit de
 * catalogus; de catalogus zelf is een vaste, niet-sluitbare tab.
 */
import { CATALOG, type CatalogTool } from "../data/catalog";

export const CATALOG_TAB = "catalog";

export interface TabState {
  /** Tool-ids van de geopende webtabs, in tabvolgorde. */
  open: string[];
  /** CATALOG_TAB of een tool-id uit `open`. */
  active: string;
}

export const EMPTY_TABS: TabState = { open: [], active: CATALOG_TAB };

/**
 * Open een tool in een tab. Staat hij al open, dan wordt die tab alleen
 * geactiveerd — nooit een tweede tab voor dezelfde tool.
 */
export function openTab(state: TabState, id: string): TabState {
  return {
    open: state.open.includes(id) ? state.open : [...state.open, id],
    active: id,
  };
}

/**
 * Sluit een tab. Sluit je de actieve tab, dan springt de focus naar de
 * rechterbuur (of anders de linker, of terug naar de catalogus) — zoals in
 * een browser.
 */
export function closeTab(state: TabState, id: string): TabState {
  const index = state.open.indexOf(id);
  if (index === -1) return state;
  const open = state.open.filter((t) => t !== id);
  if (state.active !== id) return { open, active: state.active };
  const neighbour = open[index] ?? open[index - 1] ?? CATALOG_TAB;
  return { open, active: neighbour };
}

/**
 * Herstel bewaarde tabs: alleen ids die nog in de catalogus staan én een
 * webadres hebben. Zo levert een hernoemde of verwijderde tool geen lege tab op.
 */
export function restoreTabs(saved: Partial<TabState> | null): TabState {
  const openable = new Set(tabbableTools().map((t) => t.id));
  const open = (saved?.open ?? []).filter((id) => openable.has(id));
  const active = saved?.active && open.includes(saved.active) ? saved.active : CATALOG_TAB;
  return { open, active };
}

/** Tools die in een tab kunnen: alles met een webadres. */
export function tabbableTools(): CatalogTool[] {
  return CATALOG.filter((t) => !!t.webUrl);
}

/** De tool achter een tab-id. */
export function toolForTab(id: string): CatalogTool | undefined {
  return CATALOG.find((t) => t.id === id);
}
