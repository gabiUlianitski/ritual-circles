import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../api/client";
import type { CircleInvitationPreview, Hoby } from "../api/types";
import { markSuggestionDecision } from "../notificationInbox";
import { BidiText } from "./BidiText";
import { CircleDetailsSummary } from "./CircleDetailsSummary";
import { formatCircleScheduleChip } from "./circleDetailsFormat";
import { FormError } from "./FormError";
import { formatSessionDateTimeHero } from "./homeDashboardUtils";

function locationLine(preview: CircleInvitationPreview, onlineLabel: string, missingLabel: string): string {
  const place = preview.meetingPlace?.trim() ?? "";
  if (preview.modality === "online" || /^https?:\/\//i.test(place)) return onlineLabel;
  const city = (preview.cityName?.trim() || preview.city?.trim() || "").split(",")[0].trim();
  const placeLine = place && place !== city ? place : "";
  const line = [city, placeLine].filter(Boolean).join(" · ");
  return line || missingLabel;
}

function seatLine(
  joined: number,
  capacity: number,
  t: (key: string, options?: Record<string, unknown>) => string,
): string {
  const spots = Math.max(0, capacity - Math.max(0, joined));
  if (spots === 0) return t("invitePreview.circleFull");
  if (spots === 1) return t("invitePreview.oneSpotLeft");
  return t("invitePreview.spotsLeft", { count: spots });
}

export function CircleInvitePreview(props: {
  invitationId: string;
  myUserId: string | null;
  onBack: () => void;
  onAccepted: (circleId: string) => void | Promise<void>;
  onDeclined: () => void;
}) {
  const { t } = useTranslation();
  const [preview, setPreview] = useState<CircleInvitationPreview | null>(null);
  const [hobies, setHobies] = useState<Hoby[]>([]);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"accept" | "decline" | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setUnavailable(false);
    setPreview(null);
    setActionError(null);
    void Promise.all([
      api.getInvitationPreview(props.invitationId),
      api.getHobies().catch(() => [] as Hoby[]),
    ])
      .then(([row, catalogue]) => {
        if (cancelled) return;
        setPreview(row);
        setHobies(catalogue);
      })
      .catch(() => {
        if (!cancelled) setUnavailable(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [props.invitationId]);

  async function accept() {
    if (!preview || busy) return;
    setBusy("accept");
    setActionError(null);
    try {
      const saved = await api.acceptInvitation(preview.id);
      markSuggestionDecision(props.myUserId, `invite:${preview.id}`, "accepted");
      await props.onAccepted(saved.circleId);
    } catch (e) {
      const raw = String(e).toLowerCase();
      setActionError(raw.includes("full") ? t("invitePreview.circleFull") : t("invitePreview.actionFailed"));
      setBusy(null);
    }
  }

  async function decline() {
    if (!preview || busy) return;
    setBusy("decline");
    setActionError(null);
    try {
      await api.declineInvitation(preview.id);
      markSuggestionDecision(props.myUserId, `invite:${preview.id}`, "declined");
      props.onDeclined();
    } catch {
      setActionError(t("invitePreview.actionFailed"));
      setBusy(null);
    }
  }

  const circle = preview
    ? {
        ritualType: preview.ritualType,
        recurringTime: preview.recurringTime,
        isRecurring: preview.isRecurring,
        modality: preview.modality,
        city: preview.city,
        cityName: preview.cityName,
        meetingPlace: preview.meetingPlace,
        hobyDisplayName: preview.hobyDisplayName,
        hobyIcon: preview.hobyIcon,
        name: preview.name,
        displayTitle: preview.title,
        hasCustomName: preview.hasCustomName,
        maxSize: preview.maxSize,
      }
    : null;
  const description = preview?.description?.trim() ?? "";
  const when = circle
    ? preview?.nextSessionAt
      ? formatSessionDateTimeHero(preview.nextSessionAt)
      : formatCircleScheduleChip(circle, t)
    : "";
  const where = preview
    ? locationLine(preview, t("circleDetails.online"), t("circleDetails.locationTbd"))
    : "";

  return (
    <div className="card stack circle-details-page circle-invite-preview">
      <button type="button" className="circle-details-back" onClick={props.onBack}>
        {t("circleDetails.back")}
      </button>

      {loading ? <p className="muted">{t("invitePreview.loading")}</p> : null}
      {unavailable ? <FormError>{t("invitePreview.unavailable")}</FormError> : null}

      {preview && circle ? (
        <>
          <CircleDetailsSummary
            circle={circle}
            hobiesCatalog={hobies}
            hideFacts
            hideDescription
            hidePeople
            hideStatus
            showEyebrow={false}
          />

          <div className="circle-invite-preview-facts">
            <BidiText as="p" className="circle-invite-preview-invite">
              {t("invitePreview.invitedYou", { name: preview.inviterName })}
            </BidiText>
            {preview.matchedHobbyName ? (
              <p className="circle-invite-preview-interest">
                {t("invitePreview.interestLine", { hobby: preview.matchedHobbyName })}
              </p>
            ) : null}
            <p>{when}</p>
            <BidiText as="p">{where}</BidiText>
            <p className="circle-invite-preview-seat">
              {seatLine(preview.memberCount, preview.maxSize, t)}
            </p>
          </div>

          <div className="circle-invite-preview-actions">
            {actionError ? <FormError>{actionError}</FormError> : null}
            <button type="button" className="circle-details-primary" disabled={busy !== null} onClick={() => void accept()}>
              {busy === "accept" ? t("circleDetails.joining") : t("invitePreview.acceptInvitation")}
            </button>
            <div className="circle-invite-preview-links">
              <button type="button" disabled={busy !== null} onClick={props.onBack}>
                {t("invitePreview.maybeLater")}
              </button>
              <button type="button" disabled={busy !== null} onClick={() => void decline()}>
                {t("invitePreview.declineInvitation")}
              </button>
            </div>
          </div>

          {description ? <p className="circle-invite-preview-description">{description}</p> : null}
        </>
      ) : null}
    </div>
  );
}
