import React, { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../api/client";
import type { CircleListItem, Hoby } from "../../api/types";
import { DiscoverCircleCard } from "../DiscoverCircleCard";
import { FormError } from "../FormError";
import { scoreCircleForUser } from "../circleDiscover";
import { OnboardingStepIndicator } from "./OnboardingHome";

export function RecommendedCircles(props: {
  interestSlugs: string[];
  onBack: () => void;
  onCreateCircle: () => void;
  onJoined: () => void;
}) {
  const { t, i18n } = useTranslation();
  const [catalog, setCatalog] = useState<CircleListItem[]>([]);
  const [hobies, setHobies] = useState<Hoby[]>([]);
  const [loading, setLoading] = useState(true);
  const [joinBusyId, setJoinBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const [list, hobbyList] = await Promise.all([api.listCircles(), api.getHobies()]);
        if (!cancelled) {
          setCatalog(Array.isArray(list) ? list.filter((c) => !c.isYours) : []);
          setHobies(Array.isArray(hobbyList) ? hobbyList : []);
        }
      } catch (e) {
        if (!cancelled) {
          setCatalog([]);
          setError(String(e));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [i18n.language]);

  const userHobies = useMemo(
    () => props.interestSlugs.map((slug) => ({ slug, subtype: null, level: null })),
    [props.interestSlugs],
  );

  const recommended = useMemo(() => {
    const slugSet = new Set(props.interestSlugs.map((s) => s.toLowerCase()));
    const matched = catalog.filter((c) => slugSet.has(c.ritualType.trim().toLowerCase()));
    const pool = matched.length > 0 ? matched : catalog;
    return [...pool]
      .map((circle) => ({ circle, score: scoreCircleForUser(circle, userHobies, null) }))
      .sort((a, b) => b.score - a.score || b.circle.memberCount - a.circle.memberCount)
      .slice(0, 6)
      .map((x) => x.circle);
  }, [catalog, props.interestSlugs, userHobies]);

  async function joinCircle(circleId: string) {
    setJoinBusyId(circleId);
    setError(null);
    try {
      await api.joinCircleOpen(circleId);
      props.onJoined();
    } catch (e) {
      setError(String(e));
    } finally {
      setJoinBusyId(null);
    }
  }

  return (
    <div className="onboarding-screen card stack">
      <OnboardingStepIndicator step={3} />
      <div className="onboarding-copy stack">
        <h1 className="onboarding-title">{t("onboarding.recommendedTitle")}</h1>
        <p className="onboarding-subtitle muted">{t("onboarding.recommendedSubtitle")}</p>
      </div>

      {loading ? (
        <p className="muted">{t("common.loading")}</p>
      ) : recommended.length > 0 ? (
        <div className="discover-cards onboarding-recommended-cards">
          {recommended.map((c) => (
            <DiscoverCircleCard
              key={c.id}
              circle={c}
              fullDescription
              hobiesCatalog={hobies}
              onPress={() => {}}
              joinAction={
                c.inviteOnly === false
                  ? {
                      label: t("discoverPage.join"),
                      busy: joinBusyId === c.id,
                      disabled: joinBusyId !== null,
                      onJoin: () => void joinCircle(c.id),
                    }
                  : {
                      label: t("discoverPage.requestJoin"),
                      secondary: true,
                      onJoin: props.onCreateCircle,
                    }
              }
            />
          ))}
        </div>
      ) : (
        <div className="onboarding-empty-guidance stack">
          <p className="onboarding-empty-title">{t("onboarding.noMatchesTitle")}</p>
          <p className="muted">{t("onboarding.noMatchesSubtitle")}</p>
        </div>
      )}

      {error ? <FormError>{error}</FormError> : null}

      <div className="onboarding-actions stack">
        <button type="button" className="primary onboarding-primary" onClick={props.onCreateCircle}>
          {t("onboarding.createYourOwn")}
        </button>
        <button type="button" className="onboarding-secondary" onClick={props.onBack}>
          {t("onboarding.changeInterests")}
        </button>
      </div>
    </div>
  );
}
