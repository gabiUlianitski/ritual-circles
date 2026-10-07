import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { api } from "../api/client";
import type { CircleInvitation, CircleResponse, InvitationCandidate } from "../api/types";
import { circleInviteUrl } from "../circleInviteLink";
import { circleDisplayTitle } from "./circleDisplay";
import { CircleMemberAvatar } from "./CircleMemberAvatar";

function meetingLabel(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const day = date.toLocaleDateString(undefined, { weekday: "long" });
  const time = date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  return `${day} ${time}`;
}

export function CircleInviteModal(props: {
  isOpen: boolean;
  circle: CircleResponse;
  joined: number;
  capacity: number;
  meetingAt?: string | null;
  location?: string | null;
  canInviteMembers?: boolean;
  /** Render recommendations on the page. The dialog is for Circle Details. */
  embedded?: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const dialogRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(props.onClose);
  const [query, setQuery] = useState("");
  const [sameCity, setSameCity] = useState(false);
  const [recommended, setRecommended] = useState<InvitationCandidate[]>([]);
  const [recommendedReady, setRecommendedReady] = useState(false);
  const [searchHits, setSearchHits] = useState<InvitationCandidate[]>([]);
  const [searchReady, setSearchReady] = useState(false);
  const [pendingInvites, setPendingInvites] = useState<CircleInvitation[]>([]);
  const [invitedIds, setInvitedIds] = useState<string[]>([]);
  const [alreadyIds, setAlreadyIds] = useState<string[]>([]);
  const [peopleError, setPeopleError] = useState<string | null>(null);
  const [peopleBusy, setPeopleBusy] = useState<string | null>(null);
  const [shareHint, setShareHint] = useState<string | null>(null);
  const circleFull = props.joined >= props.capacity;
  const circle = props.circle;
  const title = circleDisplayTitle(circle);
  const when = meetingLabel(props.meetingAt);
  const location = props.location?.trim() || "";
  const icon = circle.hobyIcon?.trim() || "";
  onCloseRef.current = props.onClose;

  useEffect(() => {
    if (!(props.isOpen || props.embedded) || !props.canInviteMembers) return;
    setRecommendedReady(false);
    void api
      .searchInvitationCandidates(circle.id, "", false)
      .then(setRecommended)
      .catch(() => setPeopleError(t("circleDetails.inviteSearchFailed")))
      .finally(() => setRecommendedReady(true));
  }, [props.isOpen, props.embedded, props.canInviteMembers, circle.id, t]);

  useEffect(() => {
    if (!(props.isOpen || props.embedded) || !props.canInviteMembers) return;
    const text = query.trim();
    if (!text) {
      setSearchHits([]);
      setSearchReady(false);
      return;
    }
    setSearchReady(false);
    const handle = window.setTimeout(() => {
      void api
        .searchInvitationCandidates(circle.id, text, sameCity)
        .then(setSearchHits)
        .catch(() => setPeopleError(t("circleDetails.inviteSearchFailed")))
        .finally(() => setSearchReady(true));
    }, 300);
    return () => window.clearTimeout(handle);
  }, [props.isOpen, props.embedded, props.canInviteMembers, circle.id, query, sameCity, t]);

  useEffect(() => {
    if (!(props.isOpen || props.embedded) || !props.canInviteMembers) return;
    void api
      .listCircleInvitations(circle.id)
      .then(setPendingInvites)
      .catch(() => setPendingInvites([]));
  }, [props.isOpen, props.embedded, props.canInviteMembers, circle.id, invitedIds]);

  useEffect(() => {
    if (!props.isOpen || props.embedded) return;
    setPeopleError(null);
    dialogRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onCloseRef.current();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [props.isOpen, props.embedded]);

  async function sendInvite(person: InvitationCandidate) {
    setPeopleBusy(person.id);
    setPeopleError(null);
    try {
      const created = await api.createCircleInvitation(circle.id, person.id);
      setPendingInvites((rows) => [created, ...rows.filter((row) => row.id !== created.id)]);
      setInvitedIds((ids) => [...ids, person.id]);
    } catch (error) {
      const message = error instanceof Error ? error.message.toLowerCase() : "";
      if (message.includes("full")) setPeopleError(t("circleDetails.inviteCircleFull"));
      else if (message.includes("pending") || message.includes("already")) {
        setAlreadyIds((ids) => [...ids, person.id]);
      } else setPeopleError(t("circleDetails.inviteSendFailed"));
    } finally {
      setPeopleBusy(null);
    }
  }

  async function cancelInvite(invitation: CircleInvitation) {
    setPeopleBusy(invitation.id);
    setPeopleError(null);
    try {
      await api.cancelCircleInvitation(circle.id, invitation.id);
      setPendingInvites((rows) => rows.filter((row) => row.id !== invitation.id));
      setInvitedIds((ids) => ids.filter((id) => id !== invitation.inviteeId));
    } catch (error) {
      setPeopleError(error instanceof Error ? error.message : t("circleDetails.inviteSendFailed"));
    } finally {
      setPeopleBusy(null);
    }
  }

  function inviteLabel(personId: string): string {
    if (circleFull) return t("circleDetails.inviteCircleFull");
    if (peopleBusy === personId) return t("circleDetails.inviteSending");
    if (invitedIds.includes(personId)) return t("circleDetails.invited");
    if (alreadyIds.includes(personId)) return t("circleDetails.inviteAlready");
    return t("circleDetails.sendInvite");
  }

  async function shareWithSomeoneNew() {
    const text = [
      t("circleDetails.shareIntro"),
      "",
      title,
      [when, location].filter(Boolean).join("\n"),
      t("circleDetails.shareOpenInvitation"),
      circleInviteUrl(circle.id),
    ]
      .filter((part) => part !== "")
      .join("\n");
    setShareHint(null);
    if (navigator.share) {
      try {
        await navigator.share({ title, text });
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(text);
      setShareHint(t("circleDetails.shareCopiedLink"));
    } catch {
      setShareHint(t("circleDetails.shareUnavailable"));
    }
  }

  function renderPerson(person: InvitationCandidate) {
    const settled = invitedIds.includes(person.id) || alreadyIds.includes(person.id);
    return (
      <li key={person.id}>
        <CircleMemberAvatar name={person.displayName} avatarUrl={person.avatarUrl} compact />
        <span>
          <strong>{person.displayName}</strong>
          {person.reasonLabel ? <span className="circle-invite-modal-reason">{person.reasonLabel}</span> : null}
          {person.city ? <span className="muted">{person.city}</span> : null}
        </span>
        <button
          type="button"
          disabled={circleFull || peopleBusy === person.id || settled}
          onClick={() => void sendInvite(person)}
        >
          {inviteLabel(person.id)}
        </button>
      </li>
    );
  }

  if (!props.isOpen && !props.embedded) return null;

  const people = props.canInviteMembers ? (
    <>
      <section className="circle-invite-modal-section" aria-labelledby="circle-invite-recommended-title">
        <h3 id="circle-invite-recommended-title">{t("circleDetails.inviteRecommended")}</h3>
        {peopleError ? <p className="circle-invite-modal-error">{peopleError}</p> : null}
        {recommended.length ? (
          <ul className="circle-invite-modal-people-list">{recommended.map(renderPerson)}</ul>
        ) : recommendedReady ? (
          <div className="stack">
            <p className="muted">{t("circleDetails.inviteRecommendedEmpty")}</p>
            <p className="muted">{t("circleDetails.inviteRecommendedLater")}</p>
          </div>
        ) : null}
        {pendingInvites.length ? (
          <ul className="circle-invite-modal-people-list">
            {pendingInvites.map((row) => (
              <li key={row.id}>
                <span>
                  <strong>{row.inviteeName}</strong>
                  <span className="muted">{t("circleDetails.inviteAlready")}</span>
                </span>
                <button type="button" disabled={peopleBusy === row.id} onClick={() => void cancelInvite(row)}>
                  {t("circleDetails.cancelInvite")}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <section className="circle-invite-modal-section" aria-labelledby="circle-invite-search-title">
        <h3 id="circle-invite-search-title">{t("circleDetails.inviteSearchSection")}</h3>
        <label className="circle-invite-modal-search">
          <span className="sr-only">{t("circleDetails.inviteSearchLabel")}</span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("circleDetails.inviteSearchPlaceholder")}
            aria-label={t("circleDetails.inviteSearchLabel")}
          />
        </label>
        {location ? (
          <label className="circle-invite-modal-city">
            <input type="checkbox" checked={sameCity} onChange={(e) => setSameCity(e.target.checked)} />
            <span>{t("circleDetails.inviteSameCity")}</span>
          </label>
        ) : null}
        {query.trim() && searchHits.length ? (
          <ul className="circle-invite-modal-people-list">
            {searchHits.filter((person) => !recommended.some((row) => row.id === person.id)).map(renderPerson)}
          </ul>
        ) : null}
        {query.trim() && searchReady && !searchHits.length ? (
          <p className="muted">{t("circleDetails.inviteNone")}</p>
        ) : null}
      </section>

      <section className="circle-invite-modal-section circle-invite-modal-section--quiet" aria-labelledby="circle-invite-new-title">
        <h3 id="circle-invite-new-title">{t("circleDetails.inviteSomeoneNew")}</h3>
        <p className="muted">{t("circleDetails.inviteSomeoneNewBody")}</p>
        <button type="button" className="circle-invite-modal-outside" onClick={() => void shareWithSomeoneNew()}>
          {t("circleDetails.shareInvitation")}
        </button>
        {shareHint ? <p className="circle-invite-modal-hint">{shareHint}</p> : null}
      </section>
    </>
  ) : null;

  if (props.embedded) {
    return <div className="circle-invite-embedded stack">{people}</div>;
  }

  return createPortal(
    <div className="circle-invite-modal-root">
      <button type="button" className="circle-invite-modal-backdrop" aria-label={t("common.close")} onClick={props.onClose} />
      <div
        ref={dialogRef}
        className="circle-invite-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="circle-invite-modal-title"
        tabIndex={-1}
      >
        <button type="button" className="circle-invite-modal-close" onClick={props.onClose} aria-label={t("common.close")}>
          ×
        </button>
        <p className="circle-invite-modal-kicker">{t("circleDetails.inviteKicker")}</p>
        <h2 id="circle-invite-modal-title">{t("circleDetails.inviteTitle")}</h2>
        <p className="circle-invite-modal-support">{t("circleDetails.inviteSupport")}</p>

        <section className="circle-invite-modal-preview" aria-label={title}>
          <div className="circle-invite-modal-preview-head">
            {icon ? (
              <span className="home-hobby-badge circle-details-hobby-badge" aria-hidden>
                {icon}
              </span>
            ) : null}
            <strong>{title}</strong>
          </div>
          {when ? <p>{when}</p> : null}
          {location ? <p>{location}</p> : null}
          <p>{t("circleDetails.seatsFilled", { joined: props.joined, capacity: props.capacity })}</p>
        </section>

        {people}
      </div>
    </div>,
    document.body,
  );
}
