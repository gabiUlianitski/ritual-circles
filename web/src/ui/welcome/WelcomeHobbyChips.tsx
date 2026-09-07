import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../api/client";
import type { Hoby } from "../../api/types";
import { pickWelcomeHobbyChips } from "./pickWelcomeHobbyChips";
import "../welcome.css";
export function WelcomeHobbyChips(props: {
  onSelect: (hobbySlug: string) => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const [chips, setChips] = useState<Hoby[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      setLoading(true);
      try {
        const [hobies, circles] = await Promise.all([
          api.getHobies(),
          api.listCircles().catch(() => []),
        ]);
        if (cancelled) return;
        const list = Array.isArray(hobies) ? hobies : [];
        const catalog = Array.isArray(circles) ? circles : [];
        setChips(pickWelcomeHobbyChips(list, catalog));
      } catch {
        if (!cancelled) setChips([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  if (loading || chips.length === 0) return null;

  return (
    <div className="welcome-hobby-section">
      <p className="welcome-hobby-label">{t("guestExplore.hobbiesLabel")}</p>
      <ul className="welcome-hobby-chips" aria-label={t("guestExplore.hobbiesAria")}>
        {chips.map((hobby) => (
          <li key={hobby.slug}>
            <button
              type="button"
              className="welcome-hobby-chip"
              disabled={props.disabled}
              onClick={() => props.onSelect(hobby.slug)}
            >
              {hobby.icon ? (
                <span className="welcome-hobby-chip-icon" aria-hidden="true">{hobby.icon}</span>
              ) : null}
              <span className="welcome-hobby-chip-label">{hobby.displayName}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
