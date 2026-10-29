import React from "react";
import ReactDOM from "react-dom/client";
import "./i18n/config";
// Fonts van ontwerp 0.4, dezelfde bestanden als de Rust-bibliotheek en het
// webpakket van OpenAEC-Blueprint (OpenAEC-Blueprint#30): Inter, Space Grotesk,
// JetBrains Mono, Inter AEC voor getallen en Noto Sans als terugval voor tekens.
import "./openaec/openaec-fonts.css";
// Tokens en componenten van ontwerp 0.4 (webpakket van OpenAEC-Blueprint), met
// de websitestijl van installervoorstel E; bij te werken met scripts/sync-openaec.mjs.
import "./openaec/openaec-tokens.css";
import "./openaec/openaec-components.css";
import App from "./App";

// Production: disable context menu and browser dev shortcuts
if (import.meta.env.PROD) {
  document.addEventListener("contextmenu", (e) => e.preventDefault());

  document.addEventListener("keydown", (e) => {
    if (e.key === "F12") { e.preventDefault(); return; }
    if (e.ctrlKey && e.shiftKey && e.key === "I") { e.preventDefault(); return; }
    if (e.ctrlKey && e.shiftKey && e.key === "J") { e.preventDefault(); return; }
    if (e.ctrlKey && e.shiftKey && e.key === "C") { e.preventDefault(); return; }
    if (e.ctrlKey && e.shiftKey && e.key === "R") { e.preventDefault(); return; }
    if (e.ctrlKey && e.key === "u") { e.preventDefault(); return; }
    if ((e.ctrlKey && e.key === "r") || e.key === "F5") { e.preventDefault(); return; }
  });
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
