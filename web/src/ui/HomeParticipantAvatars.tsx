import React from "react";

export function HomeParticipantAvatars(props: { count: number; maxVisible?: number }) {
  const count = Math.max(0, props.count);
  if (count === 0) return null;

  const maxVisible = props.maxVisible ?? 3;
  const shown = Math.min(count, maxVisible);
  const extra = count - shown;

  return (
    <div className="home-avatars" aria-hidden>
      {Array.from({ length: shown }).map((_, i) => (
        <span key={i} className="home-avatar" />
      ))}
      {extra > 0 ? <span className="home-avatar home-avatar--more">+{extra}</span> : null}
    </div>
  );
}
