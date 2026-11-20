import { invoke } from "@tauri-apps/api/core";

interface TabBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

type TabAction =
  | { kind: "show"; bounds: TabBounds; reload: boolean }
  | { kind: "hide" }
  | { kind: "close" };

let pending = Promise.resolve();

export function updateIfccadTab(action: TabAction): Promise<void> {
  // Een nieuwe tab kan al openen terwijl de vorige nog wordt opgeruimd.
  const next = pending.then(() => invoke<void>("update_ifccad_tab", { action }));
  pending = next.catch(() => {});
  return next;
}
