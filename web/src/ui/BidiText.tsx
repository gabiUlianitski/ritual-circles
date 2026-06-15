import React from "react";

/** Isolates bidirectional text so Latin hobby names don't render backwards in RTL (e.g. Padel → adelפ). */
export function BidiText(props: { children: React.ReactNode; className?: string; as?: "span" | "div" | "h2" | "p" }) {
  const Tag = props.as ?? "span";
  return (
    <Tag className={props.className ? `bidi-text ${props.className}` : "bidi-text"}>
      <bdi>{props.children}</bdi>
    </Tag>
  );
}
