import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../api/client";
import type { Hoby } from "../../api/types";
import { FormError } from "../FormError";
import { OnboardingStepIndicator } from "./OnboardingHome";

export function InterestsSelection(props: {
  initialSelected: string[];
  onBack: () => void;
  onContinue: (slugs: string[]) => Promise<void>;
}) {
  const { t, i18n } = useTranslation();
  const [hobies, setHobies] = useState<Hoby[]>([]);
  const [selected, setSelected] = useState<Set<string>>(() => new Set(props.initialSelected));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      try {
        const list = await api.getHobies();
        if (!cancelled) setHobies(Array.isArray(list) ? list : []);
      } catch {
        if (!cancelled) setHobies([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [i18n.language]);

  function toggle(slug: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });
  }

  async function handleContinue() {
    if (selected.size === 0) {
      setError(t("onboarding.pickOneInterest"));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await props.onContinue([...selected]);
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="onboarding-screen card stack">
      <OnboardingStepIndicator step={2} />
      <div className="onboarding-copy stack">
        <h1 className="onboarding-title">{t("onboarding.interestsTitle")}</h1>
        <p className="onboarding-subtitle muted">{t("onboarding.interestsSubtitle")}</p>
      </div>

      {loading ? (
        <p className="muted">{t("common.loading")}</p>
      ) : (
        <div className="onboarding-chips" role="group" aria-label={t("onboarding.interestsTitle")}>
          {hobies.map((h) => {
            const active = selected.has(h.slug);
            return (
              <button
                key={h.slug}
                type="button"
                className={`onboarding-chip${active ? " onboarding-chip--active" : ""}`}
                aria-pressed={active}
                onClick={() => toggle(h.slug)}
              >
                {h.icon ? <span aria-hidden>{h.icon} </span> : null}
                {h.displayName}
              </button>
            );
          })}
        </div>
      )}

      {error ? <FormError>{error}</FormError> : null}

      <div className="onboarding-actions row">
        <button type="button" style={{ width: "auto" }} onClick={props.onBack} disabled={saving}>
          {t("common.back")}
        </button>
        <button type="button" className="primary onboarding-primary" disabled={saving || loading} onClick={() => void handleContinue()}>
          {saving ? t("common.saving") : t("onboarding.continue")}
        </button>
      </div>
    </div>
  );
}
