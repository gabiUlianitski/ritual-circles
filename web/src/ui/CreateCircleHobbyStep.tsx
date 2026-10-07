import React, { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Hoby } from "../api/types";
import { SUBCATEGORY_ANY } from "./hobyMetadata";
import type { HobyLevelRow, HobyTypeRow } from "./hobyMetadata";

function hobbyMatches(hoby: Hoby, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const haystack = [hoby.displayName, hoby.canonicalDisplayName, hoby.slug]
    .filter((part): part is string => Boolean(part?.trim()))
    .join(" ")
    .toLowerCase();
  return haystack.includes(q);
}

function useReveal(open: boolean) {
  const [mounted, setMounted] = useState(open);
  const [phase, setPhase] = useState<"in" | "out">(open ? "in" : "out");

  useEffect(() => {
    if (open) {
      setPhase("in");
      setMounted(true);
      return;
    }
    setPhase("out");
    const timer = window.setTimeout(() => setMounted(false), 220);
    return () => window.clearTimeout(timer);
  }, [open]);

  return { mounted, phase };
}

export function CreateCircleHobbyStep(props: {
  hobies: Hoby[];
  hobySlug: string;
  hobySubtype: string;
  hobyLevel: string;
  types: HobyTypeRow[];
  levels: HobyLevelRow[];
  showTypes: boolean;
  showLevels: boolean;
  disabled?: boolean;
  onHobbyChange: (slug: string) => void;
  onTypeChange: (key: string) => void;
  onLevelChange: (key: string) => void;
}) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const selected = props.hobies.find((hoby) => hoby.slug === props.hobySlug) ?? null;
  const typesReveal = useReveal(props.showTypes);
  const levelsReveal = useReveal(props.showLevels);
  const typeSnap = React.useRef({
    slug: props.hobySlug,
    types: props.types,
    subtype: props.hobySubtype,
  });
  const levelSnap = React.useRef({
    slug: props.hobySlug,
    subtype: props.hobySubtype,
    levels: props.levels,
    level: props.hobyLevel,
  });
  if (props.showTypes) {
    typeSnap.current = {
      slug: props.hobySlug,
      types: props.types,
      subtype: props.hobySubtype,
    };
  }
  if (props.showLevels) {
    levelSnap.current = {
      slug: props.hobySlug,
      subtype: props.hobySubtype,
      levels: props.levels,
      level: props.hobyLevel,
    };
  }
  const typeView = typesReveal.phase === "out" ? typeSnap.current : {
    slug: props.hobySlug,
    types: props.types,
    subtype: props.hobySubtype,
  };
  const levelView = levelsReveal.phase === "out" ? levelSnap.current : {
    slug: props.hobySlug,
    subtype: props.hobySubtype,
    levels: props.levels,
    level: props.hobyLevel,
  };
  const visible = useMemo(() => {
    const matched = props.hobies.filter((hoby) => hobbyMatches(hoby, query));
    if (selected && !matched.some((hoby) => hoby.slug === selected.slug)) return [selected, ...matched];
    return matched;
  }, [props.hobies, query, selected]);

  return (
    <section className="create-circle-step create-hobby-step stack" aria-labelledby="create-step-1">
      <h2 id="create-step-1" className="create-circle-step-title">
        {t("createCircle.hobbyQuestion")}
      </h2>

      {props.hobies.length ? (
        <>
          <label className="create-circle-field stack">
            <span className="sr-only">{t("createCircle.hobbySearch")}</span>
            <input
              type="search"
              className="create-circle-input"
              value={query}
              placeholder={t("createCircle.hobbySearch")}
              aria-label={t("createCircle.hobbySearch")}
              disabled={props.disabled}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>

          {visible.length ? (
            <div className="create-hobby-grid" role="listbox" aria-label={t("createCircle.hobbyQuestion")}>
              {visible.map((hoby) => {
                const isSelected = hoby.slug === props.hobySlug;
                return (
                  <button
                    key={hoby.id}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    className={`create-hobby-card${isSelected ? " is-selected" : ""}`}
                    disabled={props.disabled}
                    onClick={() => {
                      if (hoby.slug !== props.hobySlug) props.onHobbyChange(hoby.slug);
                    }}
                  >
                    <span className="create-hobby-card-icon" aria-hidden>
                      {hoby.icon?.trim() || "🎯"}
                    </span>
                    <span className="create-hobby-card-name">{hoby.displayName}</span>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="stack">
              <p className="create-hobby-follow-title">{t("createCircle.hobbyMissing")}</p>
              <HobbySlugField
                value={props.hobySlug}
                disabled={props.disabled}
                label={t("createCircle.hobbyMissing")}
                placeholder={t("createCircle.hobbySearch")}
                onChange={props.onHobbyChange}
              />
            </div>
          )}
        </>
      ) : (
        <HobbySlugField
          value={props.hobySlug}
          disabled={props.disabled}
          label={t("createCircle.hobbyQuestion")}
          placeholder={t("createCircle.hobbySearch")}
          onChange={props.onHobbyChange}
        />
      )}

      {selected ? (
        <div className="create-hobby-hero create-hobby-reveal" key={selected.slug}>
          <span className="create-hobby-hero-icon" aria-hidden>
            {selected.icon?.trim() || "🎯"}
          </span>
          <span className="create-hobby-hero-copy">
            <span className="create-hobby-hero-name" dir="auto">
              {selected.displayName}
            </span>
            <span className="create-hobby-hero-kicker muted">{t("createCircle.hobbySelected")}</span>
          </span>
        </div>
      ) : null}

      {typesReveal.mounted ? (
        <div
          className={`create-hobby-follow create-hobby-reveal stack${typesReveal.phase === "out" ? " is-out" : ""}`}
        >
          <h3 className="create-hobby-follow-title">{t("createCircle.typeQuestion")}</h3>
          <div
            className="create-hobby-chips create-hobby-reveal"
            role="listbox"
            aria-label={t("createCircle.typeQuestion")}
            key={typeView.slug}
          >
            <button
              type="button"
              role="option"
              aria-selected={typeView.subtype === SUBCATEGORY_ANY}
              className={`create-hobby-chip${typeView.subtype === SUBCATEGORY_ANY ? " is-selected" : ""}`}
              disabled={props.disabled || typesReveal.phase === "out"}
              onClick={() => props.onTypeChange(SUBCATEGORY_ANY)}
            >
              {t("hobbyDetail.anyType")}
            </button>
            {typeView.types.map((type) => {
              const isSelected = type.key === typeView.subtype;
              return (
                <button
                  key={type.key}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  className={`create-hobby-chip${isSelected ? " is-selected" : ""}`}
                  disabled={props.disabled || typesReveal.phase === "out"}
                  onClick={() => props.onTypeChange(type.key)}
                >
                  {type.icon ? <span aria-hidden>{type.icon} </span> : null}
                  {type.label ?? type.key}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {levelsReveal.mounted ? (
        <div
          className={`create-hobby-follow create-hobby-reveal stack${levelsReveal.phase === "out" ? " is-out" : ""}`}
        >
          <h3 className="create-hobby-follow-title">{t("createCircle.levelQuestion")}</h3>
          <p className="create-hobby-hint muted">{t("createCircle.levelHint")}</p>
          <div
            className="create-hobby-segments create-hobby-reveal"
            role="listbox"
            aria-label={t("createCircle.levelQuestion")}
            key={`${levelView.slug}:${levelView.subtype}`}
          >
            {levelView.levels.map((level) => {
              const isSelected = level.key === levelView.level;
              return (
                <button
                  key={level.key}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  className={`create-hobby-segment${isSelected ? " is-selected" : ""}`}
                  disabled={props.disabled || levelsReveal.phase === "out"}
                  onClick={() => props.onLevelChange(level.key)}
                >
                  {level.label ?? level.key}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function HobbySlugField(props: {
  value: string;
  disabled?: boolean;
  label: string;
  placeholder: string;
  onChange: (slug: string) => void;
}) {
  return (
    <label className="create-circle-field stack">
      <span className="sr-only">{props.label}</span>
      <input
        className="create-circle-input"
        placeholder={props.placeholder}
        value={props.value}
        disabled={props.disabled}
        aria-label={props.label}
        onChange={(e) => props.onChange(e.target.value)}
      />
    </label>
  );
}
