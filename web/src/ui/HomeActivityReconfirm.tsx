import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../api/client";
import type { HomeActivityItem } from "../api/types";
import { occurrenceWhen } from "./activityDisplay";
import { ActivityChanged } from "./ActivitySuggestions";
import { FormError } from "./FormError";
import { homeActivityPlace } from "./homeActivities";

/** "Still going" / "Leave" for a joined Activity date whose time or place changed. */
export function HomeActivityReconfirm(props: { item: HomeActivityItem; onDone: () => Promise<void> | void }) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { item } = props;
  const when = occurrenceWhen(item.startAt, item.endAt);
  const summary = [item.title, when.date, when.time, homeActivityPlace(item)].filter(Boolean).join(" · ");

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      await props.onDone();
    } catch {
      setError(t("activityParticipation.participationFailed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <ActivityChanged
        summary={summary}
        busy={busy}
        leaveLabel={item.occurrenceId ? t("activityParticipation.leaveDate") : undefined}
        onStillGoing={() =>
          void run(() =>
            item.occurrenceId
              ? api.reconfirmOccurrence(item.activityId, item.occurrenceId)
              : api.reconfirmActivity(item.activityId),
          )
        }
        onLeave={() =>
          void run(() =>
            item.occurrenceId
              ? api.leaveOccurrence(item.activityId, item.occurrenceId)
              : api.leaveActivity(item.activityId),
          )
        }
      />
      {error ? <FormError>{error}</FormError> : null}
    </>
  );
}
