import React from "react";

/** Facebook About–style colored circle + glyph. */
function IconCircle(props: { children: React.ReactNode; bg: string; color: string }) {
  return (
    <span
      className="profile-fb-icon-circle"
      style={{ background: props.bg, color: props.color }}
      aria-hidden
    >
      {props.children}
    </span>
  );
}

function Glyph(props: { d: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
      <path d={props.d} />
    </svg>
  );
}

export function IconLocation() {
  return (
    <IconCircle bg="rgba(24, 119, 242, 0.28)" color="#5cadff">
      <Glyph d="M10 2a5.5 5.5 0 0 0-5.5 5.5c0 3.9 5.5 10.5 5.5 10.5s5.5-6.6 5.5-10.5A5.5 5.5 0 0 0 10 2zm0 7.5a2 2 0 1 1 0-4 2 2 0 0 1 0 4z" />
    </IconCircle>
  );
}

export function IconHomeTown() {
  return (
    <IconCircle bg="rgba(168, 85, 247, 0.28)" color="#c084fc">
      <Glyph d="M10 3 3 9v8h5v-5h4v5h5V9l-7-6z" />
    </IconCircle>
  );
}

export function IconBirthday() {
  return (
    <IconCircle bg="rgba(236, 72, 153, 0.28)" color="#f472b6">
      <Glyph d="M10 2a1 1 0 0 1 1 1v1h2a1 1 0 0 1 1 1v1H6V5a1 1 0 0 1 1-1h2V3a1 1 0 0 1 1-1zm-3 6h6v2H7V8zm-2 3h10l-1 5H6l-1-5z" />
    </IconCircle>
  );
}

export function IconWork() {
  return (
    <IconCircle bg="rgba(249, 115, 22, 0.28)" color="#fb923c">
      <Glyph d="M6 6V5a4 4 0 0 1 8 0v1h2a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h2zm2-1a2 2 0 0 1 4 0v1H8V5z" />
    </IconCircle>
  );
}

export function IconEducation() {
  return (
    <IconCircle bg="rgba(24, 119, 242, 0.35)" color="#1877f2">
      <Glyph d="M10 3 3 7l7 4 7-4-7-4zm0 6.2L5 6.5V12h10V6.5l-5 2.7zM4 14h12v2H4v-2z" />
    </IconCircle>
  );
}

export function IconEmail() {
  return (
    <IconCircle bg="rgba(239, 68, 68, 0.25)" color="#f87171">
      <Glyph d="M3 5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5zm2-.5 4.2 3.3 3.3-3.3 3.3 3.3 3.3-3.3L15 4.5H5z" />
    </IconCircle>
  );
}

export function IconPhone() {
  return (
    <IconCircle bg="rgba(34, 197, 94, 0.28)" color="#4ade80">
      <Glyph d="M6.5 3h2l1 3-1.5 1a11 11 0 0 0 5 5l1-1.5 3 1v2a1 1 0 0 1-1 1A11.5 11.5 0 0 1 3 7.5a1 1 0 0 1 1-1z" />
    </IconCircle>
  );
}

export function IconUsername() {
  return (
    <IconCircle bg="rgba(14, 165, 233, 0.28)" color="#38bdf8">
      <Glyph d="M10 10a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm-6 7a6 6 0 0 1 12 0H4z" />
    </IconCircle>
  );
}

export function IconAvailability() {
  return (
    <IconCircle bg="rgba(245, 158, 11, 0.28)" color="#fbbf24">
      <Glyph d="M10 2a8 8 0 1 0 0 16 8 8 0 0 0 0-16zm1 4V9h4v2H9V6h2z" />
    </IconCircle>
  );
}

export function IconMemberSince() {
  return (
    <IconCircle bg="rgba(99, 102, 241, 0.28)" color="#818cf8">
      <Glyph d="M6 2h8v2H6V2zm-2 4h12v12H4V6zm2 2v8h8V8H6z" />
    </IconCircle>
  );
}

export function IconLanguages() {
  return (
    <IconCircle bg="rgba(20, 184, 166, 0.28)" color="#2dd4bf">
      <Glyph d="M3 6h14v2H3V6zm0 4h8v2H3v-2zm10 0h4v2h-4v-2zM3 14h6v2H3v-2zm8 0h6v2h-6v-2z" />
    </IconCircle>
  );
}
