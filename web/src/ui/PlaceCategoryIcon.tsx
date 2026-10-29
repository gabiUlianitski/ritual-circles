import React from "react";

export type PlaceIconKind = "city" | "sports" | "park" | "cafe" | "community" | "transit" | "generic";

const PATHS: Record<PlaceIconKind, React.ReactNode> = {
  city: (
    <>
      <path d="M4 20V9l5-3v14" />
      <path d="M9 20V4l8 4v12" />
      <path d="M3 20h18" />
      <path d="M12 9h2M12 12h2M12 15h2" />
    </>
  ),
  sports: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M4.5 9.5c3 1 6 1 9-1.5M10.5 19.8c.5-3.3 2.5-6 5.8-7.6M8 4.8c2 2.2 3 5 2.8 8" />
    </>
  ),
  park: (
    <>
      <path d="M12 3l5 7h-3l4 6H6l4-6H7z" />
      <path d="M12 16v5" />
    </>
  ),
  cafe: (
    <>
      <path d="M4 9h12v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z" />
      <path d="M16 10h1.5a2.5 2.5 0 0 1 0 5H16" />
      <path d="M8 3v3M12 3v3" />
    </>
  ),
  community: (
    <>
      <circle cx="9" cy="8" r="3" />
      <circle cx="17" cy="9" r="2.3" />
      <path d="M3.5 19a5.5 5.5 0 0 1 11 0" />
      <path d="M15 14.2a4.5 4.5 0 0 1 6 4.3" />
    </>
  ),
  transit: (
    <>
      <rect x="6" y="3" width="12" height="14" rx="3" />
      <path d="M6 11h12M9 21l1.5-4M15 21l-1.5-4" />
      <circle cx="9.5" cy="14" r=".6" />
      <circle cx="14.5" cy="14" r=".6" />
    </>
  ),
  generic: (
    <>
      <path d="M12 21s-6.5-6-6.5-11a6.5 6.5 0 0 1 13 0c0 5-6.5 11-6.5 11z" />
      <circle cx="12" cy="10" r="2.4" />
    </>
  ),
};

export function placeIconKind(category: string | null | undefined): PlaceIconKind {
  return category && category in PATHS ? (category as PlaceIconKind) : "generic";
}

/** Decorative category icon; the place name next to it carries the meaning. */
export function PlaceCategoryIcon(props: { category: string | null | undefined; className?: string }) {
  return (
    <svg
      className={`place-category-icon${props.className ? ` ${props.className}` : ""}`}
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {PATHS[placeIconKind(props.category)]}
    </svg>
  );
}
