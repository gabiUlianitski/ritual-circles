import React from "react";

/** Friendly minimal meetup scene — flat, low detail, no stock-photo feel. */
export function LandingIllustration() {
  return (
    <div className="landing-illustration" aria-hidden>
      <svg viewBox="0 0 160 160" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="80" cy="82" r="58" fill="#1E293B" opacity="0.55" />
        <circle cx="80" cy="82" r="48" fill="#1E293B" opacity="0.35" />
        <ellipse cx="80" cy="118" rx="52" ry="10" fill="#334155" opacity="0.45" />
        <path
          d="M28 98c8-18 24-28 52-28s44 10 52 28"
          stroke="#475569"
          strokeWidth="2"
          strokeLinecap="round"
          opacity="0.5"
        />
        <circle cx="52" cy="72" r="11" fill="#F8FAFC" />
        <path d="M38 104c4-14 10-20 14-22 6-3 12-2 16 0 4-2 10-3 16 0 4 2 10 8 14 22" fill="#93C5FD" />
        <circle cx="80" cy="66" r="12" fill="#F8FAFC" />
        <path d="M64 102c5-16 12-22 16-24 6-3 14-2 20 2 6 4 12 12 16 22" fill="#3B82F6" />
        <circle cx="108" cy="74" r="10" fill="#F8FAFC" />
        <path d="M96 104c3-12 8-18 12-19 5-2 10-1 14 1 4-2 9-1 13 2 3 3 7 9 9 16" fill="#60A5FA" />
        <circle cx="44" cy="48" r="6" fill="#334155" opacity="0.7" />
        <circle cx="118" cy="44" r="5" fill="#334155" opacity="0.6" />
        <path d="M36 52c6-8 14-12 22-10" stroke="#475569" strokeWidth="2" strokeLinecap="round" opacity="0.4" />
        <path d="M124 48c-5-7-13-10-20-8" stroke="#475569" strokeWidth="2" strokeLinecap="round" opacity="0.4" />
      </svg>
    </div>
  );
}
