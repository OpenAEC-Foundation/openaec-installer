import React from "react";
import ReactDOM from "react-dom/client";
import "./i18n/config";
// Huisstijl-fonts (DESIGN-SYSTEM.md): Space Grotesk / Inter / JetBrains Mono
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/space-grotesk/500.css";
import "@fontsource/space-grotesk/700.css";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/500.css";
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
