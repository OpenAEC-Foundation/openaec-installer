import type { Category } from "../data/catalog";

/**
 * Lijn-iconen per toolcategorie (stroke, amber via currentColor) —
 * geven de cards en previews meer onderscheid dan één generiek logo.
 */
export default function CategoryIcon({
  category,
  size = 24,
}: {
  category: Category;
  size?: number;
}) {
  const paths: Record<Category, React.ReactNode> = {
    calculatie: (
      <>
        <rect x="4" y="2" width="16" height="20" rx="2" />
        <line x1="8" y1="6" x2="16" y2="6" />
        <line x1="16" y1="14" x2="16" y2="18" />
        <path d="M8 10h.01M12 10h.01M16 10h.01M8 14h.01M12 14h.01M8 18h.01M12 18h.01" />
      </>
    ),
    cad: (
      <>
        <circle cx="12" cy="5" r="2" />
        <path d="m12 7-5 13" />
        <path d="m12 7 5 13" />
        <path d="M5 16.5c2 1.5 4.5 2.2 7 2.2s5-.7 7-2.2" />
      </>
    ),
    constructief: (
      <>
        <path d="M5 4h14" />
        <path d="M5 20h14" />
        <path d="M12 4v16" />
        <path d="M8 4v2M16 4v2M8 18v2M16 18v2" />
      </>
    ),
    geotechniek: (
      <>
        <path d="m12 2 8.5 4.5L12 11 3.5 6.5 12 2z" />
        <path d="m3.5 11.5 8.5 4.5 8.5-4.5" />
        <path d="m3.5 16.5 8.5 4.5 8.5-4.5" />
      </>
    ),
    bim: (
      <>
        <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
        <path d="m3.3 7 8.7 5 8.7-5" />
        <path d="M12 22V12" />
      </>
    ),
    planning: (
      <>
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <path d="M7 9h6" />
        <path d="M10 13h8" />
        <path d="M7 17h4" />
      </>
    ),
    documenten: (
      <>
        <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
        <path d="M14 2v4a2 2 0 0 0 2 2h4" />
        <path d="M16 13H8" />
        <path d="M16 17H8" />
      </>
    ),
    ai: (
      <>
        <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
        <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
        <line x1="12" y1="19" x2="12" y2="22" />
      </>
    ),
    energie: (
      <>
        <path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z" />
      </>
    ),
    veld: (
      <>
        <rect x="8" y="2" width="8" height="4" rx="1" />
        <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
        <path d="m9 14 2 2 4-4" />
      </>
    ),
  };

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {paths[category]}
    </svg>
  );
}
