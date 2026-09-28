import React, { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../api/client";
import type { Hoby } from "../../api/types";
import { BidiText } from "../BidiText";
import { FormError } from "../FormError";
import {
  levelsForSelectedType,
  parseHobyLevelsFlat,
  parseHobyTypesNested,
  type HobyLevelRow,
  type HobyTypeRow,
} from "../hobyMetadata";
import { formatGroupSizeSummary } from "../groupSize";

function hobySubtitle(h: { slug: string; shortDescription?: string | null }) {
  const d = h.shortDescription?.trim();
  return d || h.slug;
}

export function GuestHobbyDetail(props: {
  slug: string;
  onBack: () => void;
  onSeeCircles?: (slug: string) => void;
}) {
  const { t, i18n } = useTranslation();
  const [hobies, setHobies] = useState<Hoby[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openTypeKey, setOpenTypeKey] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const list = await api.getHobies();
        if (!cancelled) setHobies(Array.isArray(list) ? list : []);
      } catch (e) {
        if (!cancelled) {
          setError(String(e));
          setHobies([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [i18n.language]);

  const hoby = useMemo(
    () => hobies.find((item) => item.slug.trim().toLowerCase() === props.slug.trim().toLowerCase()) ?? null,
    [hobies, props.slug],
  );

  const hobyLevelsFlat = useMemo(() => parseHobyLevelsFlat(hoby?.levels), [hoby]);
  const types = useMemo(() => parseHobyTypesNested(hoby?.types), [hoby]);

  const openType = useMemo(
    () => (openTypeKey ? types.find((typeRow) => typeRow.key === openTypeKey) ?? null : null),
    [types, openTypeKey],
  );

  const levelsForOpenType: HobyLevelRow[] = useMemo(() => {
    if (!openTypeKey) return [];
    return levelsForSelectedType(hobyLevelsFlat, types, openTypeKey);
  }, [openTypeKey, hobyLevelsFlat, types]);

  useEffect(() => {
    setOpenTypeKey(null);
  }, [props.slug]);

  function typeLevelHint(typeRow: HobyTypeRow) {
    const shared = hobyLevelsFlat.length > 0;
    const legacyNested = typeRow.levels.length > 0 && !shared;
    if (shared) return t("hobbiesPage.levelsCount", { count: hobyLevelsFlat.length });
    if (legacyNested) return t("hobbiesPage.levelsCount", { count: typeRow.levels.length });
    return t("hobbiesPage.open");
  }

  function renderTypeBubble(typeRow: HobyTypeRow, index: number) {
    const title = typeRow.label || typeRow.key;
    return (
      <button
        key={typeRow.key}
        type="button"
        className="hoby-type-bubble"
        data-bubble={index % 5}
        onClick={() => setOpenTypeKey(typeRow.key)}
        aria-label={`${title}, ${typeLevelHint(typeRow)}`}
      >
        <span className="hoby-type-bubble-label">{title}</span>
        {typeRow.description ? <span className="hoby-type-bubble-desc">{typeRow.description}</span> : null}
        <span className="hoby-type-bubble-meta">{typeLevelHint(typeRow)}</span>
      </button>
    );
  }

  function renderLevelBubble(lv: HobyLevelRow, index: number) {
    const title = lv.label || lv.key;
    return (
      <div key={lv.key} className="hoby-level-bubble" data-bubble={index % 5}>
        <span className="hoby-type-bubble-label">{title}</span>
        {lv.description ? <span className="hoby-type-bubble-desc">{lv.description}</span> : null}
      </div>
    );
  }

  return (
    <div className="stack guest-hobby-detail">
      <button type="button" className="home-btn-text" style={{ alignSelf: "flex-start" }} onClick={props.onBack}>
        {t("common.back")}
      </button>

      {loading ? <p className="muted">{t("common.loading")}</p> : null}
      {error ? <FormError>{error}</FormError> : null}

      {!loading && !hoby ? (
        <div className="card muted">{t("guestExplore.hobbyNotFound")}</div>
      ) : null}

      {hoby ? (
        <div className="card stack" style={{ padding: 16, gap: 14 }}>
          <div className="row" style={{ gap: 12, alignItems: "flex-start" }}>
            {hoby.icon ? (
              <span style={{ fontSize: "2.25rem", lineHeight: 1 }} aria-hidden="true">
                {hoby.icon}
              </span>
            ) : null}
            <div className="stack" style={{ gap: 6, flex: 1, minWidth: 0 }}>
              <h1 style={{ margin: 0, fontSize: "1.35rem", fontWeight: 700, lineHeight: 1.2 }}>
                <BidiText>{hoby.displayName}</BidiText>
              </h1>
              <p className="muted" style={{ margin: 0, lineHeight: 1.45 }}>
                {hobySubtitle(hoby)}
              </p>
              {hoby.groupSize ? (
                <p className="muted" style={{ margin: 0, fontSize: "0.88em" }}>
                  {t("hobbiesPage.preferredGroup", {
                    summary: formatGroupSizeSummary(hoby.groupSize, t),
                  })}
                </p>
              ) : null}
            </div>
          </div>

          {!types.length && hobyLevelsFlat.length ? (
            <div className="hoby-types-thread" style={{ gap: 8 }}>
              <div className="hoby-types-thread-hint muted">{t("hobbiesPage.levels")}</div>
              <div className="hoby-level-bubbles" role="list">
                {hobyLevelsFlat.map((lv, i) => renderLevelBubble(lv, i))}
              </div>
            </div>
          ) : null}

          {types.length ? (
            <div className="hoby-types-thread" style={{ gap: 8 }}>
              {openTypeKey === null ? (
                <>
                  <div className="hoby-types-thread-hint muted">{t("hobbiesPage.tapTypeForLevels")}</div>
                  <div className="hoby-type-bubbles" role="list">
                    {types.map((typeRow, i) => renderTypeBubble(typeRow, i))}
                  </div>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    className="hoby-thread-back"
                    style={{ width: "auto" }}
                    onClick={() => setOpenTypeKey(null)}
                  >
                    {t("hobbiesPage.backToTypes")}
                  </button>
                  <div className="hoby-type-bubble hoby-type-bubble--anchor is-static">
                    <span className="hoby-type-bubble-label">{openType?.label ?? openTypeKey}</span>
                    {openType?.description ? (
                      <span className="hoby-type-bubble-desc">{openType.description}</span>
                    ) : null}
                  </div>
                  {levelsForOpenType.length ? (
                    <div className="hoby-level-bubbles" role="list">
                      {levelsForOpenType.map((lv, i) => renderLevelBubble(lv, i))}
                    </div>
                  ) : (
                    <div className="muted">{t("hobbiesPage.noLevelsForType")}</div>
                  )}
                </>
              )}
            </div>
          ) : null}

          {props.onSeeCircles ? (
            <button type="button" className="primary" onClick={() => props.onSeeCircles?.(hoby.slug)}>
              {t("guestExplore.seeCirclesForHobby", { hobby: hoby.displayName })}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
