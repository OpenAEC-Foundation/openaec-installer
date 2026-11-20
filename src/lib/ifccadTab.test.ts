import { invoke } from "@tauri-apps/api/core";
import { beforeEach, expect, it, vi } from "vitest";
import { updateIfccadTab } from "./ifccadTab";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

const command = vi.mocked(invoke);

beforeEach(() => command.mockReset());

it("serialiseert openen, verbergen, sluiten en opnieuw openen", async () => {
  let finishOpening!: () => void;
  command.mockImplementationOnce(() => new Promise<void>((resolve) => { finishOpening = resolve; }));
  const show = { kind: "show", bounds: { x: 0, y: 96, width: 1024, height: 680 }, reload: false } as const;

  const opening = updateIfccadTab(show);
  const hiding = updateIfccadTab({ kind: "hide" });
  const closing = updateIfccadTab({ kind: "close" });
  const reopening = updateIfccadTab(show);
  await Promise.resolve();
  expect(command).toHaveBeenCalledTimes(1);

  finishOpening();
  await Promise.all([opening, hiding, closing, reopening]);
  expect(command.mock.calls).toEqual([
    ["update_ifccad_tab", { action: show }],
    ["update_ifccad_tab", { action: { kind: "hide" } }],
    ["update_ifccad_tab", { action: { kind: "close" } }],
    ["update_ifccad_tab", { action: show }],
  ]);
});

it("laat een mislukte opdracht een volgende poging niet blokkeren", async () => {
  command.mockRejectedValueOnce(new Error("WebView unavailable"));

  await expect(updateIfccadTab({ kind: "hide" })).rejects.toThrow("WebView unavailable");
  await expect(updateIfccadTab({ kind: "close" })).resolves.toBeUndefined();
  expect(command).toHaveBeenCalledTimes(2);
});
