import React, { useState } from "react";

export function memberInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return (parts[0]?.[0] ?? "?").toUpperCase();
}

export function CircleMemberAvatar(props: {
  name: string;
  avatarUrl?: string | null;
  isYou?: boolean;
  compact?: boolean;
}) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const avatarUrl = props.avatarUrl?.trim() || null;
  const canShowImage = Boolean(avatarUrl && failedUrl !== avatarUrl);
  const className = [
    "circle-details-member-avatar",
    props.isYou ? "circle-details-member-avatar--you" : "",
    props.compact ? "circle-details-member-avatar--compact" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <span
      className={className}
      {...(!canShowImage ? { role: "img", "aria-label": `${props.name} avatar` } : {})}
    >
      {canShowImage ? (
        <img
          src={avatarUrl!}
          alt={`${props.name} avatar`}
          loading="lazy"
          onError={() => setFailedUrl(avatarUrl)}
        />
      ) : (
        <span aria-hidden>{memberInitials(props.name)}</span>
      )}
    </span>
  );
}
