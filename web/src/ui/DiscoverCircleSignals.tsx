import { useTranslation } from "react-i18next";
import { BidiText } from "./BidiText";
import { DiscoverMemberPreview, type DiscoverMemberPerson } from "./DiscoverMemberPreview";

/** True only when the card already has a meetup time that is still ahead. */
function hasScheduledActivity(value?: string | null): boolean {
  const raw = value?.trim();
  if (!raw) return false;
  const time = Date.parse(raw);
  return Number.isFinite(time) && time >= Date.now();
}

type ScheduleSignalKey =
  | "discoverPage.signalWeekly"
  | "discoverPage.signalBiweekly"
  | "discoverPage.signalMonthly"
  | "discoverPage.signalOneTime";

const STORED_CADENCE: Record<string, ScheduleSignalKey> = {
  weekly: "discoverPage.signalWeekly",
  biweekly: "discoverPage.signalBiweekly",
  "bi-weekly": "discoverPage.signalBiweekly",
  monthly: "discoverPage.signalMonthly",
};

/**
 * Rhythm already stored on the circle.
 * Recurring weekday/time is weekly. An exact cadence word is mapped.
 * One-time is isRecurring false. Anything else is hidden.
 */
export function discoverScheduleSignalKey(input: {
  isRecurring?: boolean;
  recurringTime?: string | null;
}): ScheduleSignalKey | null {
  const raw = input.recurringTime?.trim().toLowerCase() ?? "";
  const stored = raw ? STORED_CADENCE[raw] : undefined;
  if (stored) return stored;
  if (input.isRecurring === false) return "discoverPage.signalOneTime";
  if (!raw) return null;
  return "discoverPage.signalWeekly";
}

/** Compact confidence row. Only facts already on the circle are shown. */
export function DiscoverCircleSignals(props: {
  memberCount: number;
  people?: DiscoverMemberPerson[] | null;
  nextSessionAt?: string | null;
  isRecurring?: boolean;
  recurringTime?: string | null;
}) {
  const { t } = useTranslation();
  const members = Math.max(0, props.memberCount);
  const scheduleKey = discoverScheduleSignalKey({
    isRecurring: props.isRecurring,
    recurringTime: props.recurringTime,
  });
  const items: { key: string; icon: string; label: string; good?: boolean }[] = [];

  if (hasScheduledActivity(props.nextSessionAt)) {
    items.push({
      key: "activity",
      icon: "✅",
      label: t("discoverPage.signalActivityScheduled"),
      good: true,
    });
  }
  if (scheduleKey) {
    items.push({
      key: "schedule",
      icon: "📅",
      label: t(scheduleKey),
    });
  }

  if (members <= 0 && items.length === 0) return null;

  return (
    <ul className="discover-circle-signals" aria-label={t("discoverPage.signalsAria")}>
      {members > 0 ? (
        <li>
          <DiscoverMemberPreview memberCount={members} people={props.people} />
        </li>
      ) : null}
      {items.map((item) => (
        <li key={item.key} className={item.good ? "is-good" : undefined}>
          <span aria-hidden>{item.icon}</span>
          <BidiText>{item.label}</BidiText>
        </li>
      ))}
    </ul>
  );
}
