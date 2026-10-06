import React, { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../api/client";
import type { CircleMeResponse, Hoby } from "../api/types";
import { CircleChat } from "./CircleChat";
import { CircleScheduledTab } from "./CircleScheduledTab";
import { dedupeMembers } from "./circleMembers";
import { markCircleLeftBySelf } from "../notificationInbox";
import { FormError } from "./FormError";
import { CircleDetailsSummary, CircleDetailsWhyJoin } from "./CircleDetailsSummary";
import { CircleDetailsMembersSection } from "./CircleDetailsMembersSection";
import { CircleMomentumNote, CircleProgressCard } from "./CircleProgressCard";
import { formatSessionDateTimeHero } from "./homeDashboardUtils";

type DetailsTab = "details" | "scheduled";
type DetailsTabInput = DetailsTab | "chat";

function normalizeTab(tab?: DetailsTabInput): DetailsTab {
  if (tab === "chat") return "details";
  return tab ?? "details";
}

function CircleDetailsTabBar(props: {
  tab: DetailsTab;
  onTab: (tab: DetailsTab) => void;
  t: (key: string) => string;
}) {
  return (
    <div
      className="hoby-browse-toggle circle-details-tabs circle-details-tabs--bottom"
      role="tablist"
      aria-label={props.t("circleDetails.tabListAria")}
    >
      <button
        type="button"
        role="tab"
        className={props.tab === "details" ? "is-active" : ""}
        aria-selected={props.tab === "details"}
        onClick={() => props.onTab("details")}
      >
        {props.t("circleDetails.tabAbout")}
      </button>
      <button
        type="button"
        role="tab"
        className={props.tab === "scheduled" ? "is-active" : ""}
        aria-selected={props.tab === "scheduled"}
        onClick={() => props.onTab("scheduled")}
      >
        {props.t("circleDetails.tabEdit")}
      </button>
    </div>
  );
}

export function CircleDetails(props: {
  circleId: string;
  onBack: () => void;
  initialTab?: DetailsTabInput;
  initialDraft?: string;
  onLeftCircle?: () => void | Promise<void>;
}) {
  const { t, i18n } = useTranslation();
  const [data, setData] = useState<CircleMeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const [tab, setTab] = useState<DetailsTab>(() => normalizeTab(props.initialTab));
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [hobies, setHobies] = useState<Hoby[]>([]);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [scheduledEditTrigger, setScheduledEditTrigger] = useState(0);
  const [copyHint, setCopyHint] = useState<string | null>(null);
  const [chatFocus, setChatFocus] = useState(props.initialTab === "chat");
  const optionsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setTab(normalizeTab(props.initialTab));
    setSelectedMemberId(null);
    setOptionsOpen(false);
    setChatFocus(props.initialTab === "chat");
  }, [props.circleId, props.initialTab]);

  useEffect(() => {
    if (!optionsOpen) return;
    function onDocClick(e: MouseEvent) {
      if (optionsRef.current && !optionsRef.current.contains(e.target as Node)) {
        setOptionsOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [optionsOpen]);

  useEffect(() => {
    void api.getMe().then((me) => setMyUserId(me.id)).catch(() => setMyUserId(null));
  }, []);

  const members = useMemo(() => dedupeMembers(data?.members ?? []), [data?.members]);

  async function load() {
    setError(null);
    try {
      setData(await api.getMyCircle(props.circleId));
    } catch (e) {
      setError(String(e));
    }
  }

  useEffect(() => {
    void load();
  }, [props.circleId]);

  useEffect(() => {
    void api
      .getHobies()
      .then((list) => setHobies(Array.isArray(list) ? list : []))
      .catch(() => setHobies([]));
  }, [i18n.language]);

  const circle = data?.circle ?? null;
  const isCreator = Boolean(data?.isCreator);
  const creatorUserId = data?.creatorUserId ?? null;
  const activeTab: DetailsTab = isCreator ? tab : "details";
  const nextSessionAt = data?.nextSessionRoster?.dateTime ?? null;

  function openChat() {
    setChatFocus(true);
  }

  useEffect(() => {
    if (!isCreator && tab !== "details") setTab("details");
  }, [isCreator, tab]);

  async function leaveOrDrop() {
    setOptionsOpen(false);
    setWorking(true);
    setError(null);
    try {
      if (isCreator) {
        await api.dropCircle(props.circleId);
      } else {
        await api.leaveCircle(props.circleId);
      }
      if (myUserId) markCircleLeftBySelf(myUserId, props.circleId);
      if (props.onLeftCircle) {
        await props.onLeftCircle();
      } else {
        props.onBack();
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setWorking(false);
    }
  }

  function modifyCircle() {
    setOptionsOpen(false);
    setTab("scheduled");
    setScheduledEditTrigger((n) => n + 1);
  }

  async function copyInviteCode() {
    if (!circle?.inviteCode) return;
    setOptionsOpen(false);
    try {
      await navigator.clipboard.writeText(circle.inviteCode);
      setCopyHint(t("circleDetails.inviteCopied"));
      window.setTimeout(() => setCopyHint(null), 2500);
    } catch {
      setCopyHint(t("circleDetails.copyFailed"));
    }
  }

  return (
    <div className="card stack circle-details-page">
      <div className="circle-details-topbar row">
        <button type="button" className="circle-details-back" onClick={props.onBack}>
          {t("circleDetails.back")}
        </button>
        {circle ? (
          <div className="circle-details-options-wrap" ref={optionsRef}>
            <button
              type="button"
              className="circle-details-options-btn"
              aria-label={t("circleDetails.optionsAria")}
              aria-expanded={optionsOpen}
              onClick={() => setOptionsOpen((v) => !v)}
            >
              ⋮
            </button>
            {optionsOpen ? (
              <div className="circle-details-options-panel">
                {circle.inviteCode ? (
                  <button
                    type="button"
                    className="circle-details-menu-action"
                    onClick={() => void copyInviteCode()}
                  >
                    {t("circleDetails.copyInvite")}
                  </button>
                ) : null}
                {isCreator ? (
                  <button
                    type="button"
                    className="circle-details-menu-action"
                    disabled={working}
                    onClick={modifyCircle}
                  >
                    {t("circleDetails.modifyCircle")}
                  </button>
                ) : null}
                <button
                  type="button"
                  className="circle-details-danger-action"
                  disabled={working}
                  onClick={() => void leaveOrDrop()}
                >
                  {isCreator ? t("circleDetails.deleteCircle") : t("circleDetails.leaveCircle")}
                </button>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="circle-details-body stack">
        {activeTab === "scheduled" ? (
          <CircleScheduledTab
            circleId={props.circleId}
            editWhenTrigger={scheduledEditTrigger}
            onCircleUpdated={load}
          />
        ) : (
          <>
            {circle && chatFocus && activeTab === "details" ? (
              <>
                <button
                  type="button"
                  className="circle-details-back"
                  onClick={() => {
                    setChatFocus(false);
                    setSelectedMemberId(null);
                  }}
                >
                  {t("circleChat.backToCircle")}
                </button>
                {selectedMemberId ? (
                  <CircleDetailsMembersSection
                    members={members}
                    circle={circle}
                    hobiesCatalog={hobies}
                    myUserId={myUserId}
                    creatorUserId={creatorUserId}
                    maxSize={circle.maxSize}
                    selectedMemberId={selectedMemberId}
                    onSelectMember={setSelectedMemberId}
                  />
                ) : null}
                <CircleChat
                  circleId={props.circleId}
                  embedded
                  aboutEmbedded
                  memberCount={members.length}
                  maxSize={circle.maxSize}
                  nextSessionAt={nextSessionAt}
                  members={members}
                  creatorUserId={creatorUserId}
                  onOpenMember={setSelectedMemberId}
                  onViewMeeting={() => setChatFocus(false)}
                  onShareInvite={() => void copyInviteCode()}
                  onEditSchedule={() => {
                    setChatFocus(false);
                    modifyCircle();
                  }}
                  initialDraft={props.initialDraft}
                />
              </>
            ) : circle ? (
              <>
                <CircleDetailsSummary
                  circle={circle}
                  hobiesCatalog={hobies}
                  memberCount={members.length}
                  maxSize={circle.maxSize}
                  hasNextSession={Boolean(nextSessionAt)}
                />
                <CircleProgressCard
                  joined={members.length}
                  capacity={circle.maxSize}
                  hasNextSession={Boolean(nextSessionAt)}
                />
                <CircleMomentumNote
                  joined={members.length}
                  capacity={circle.maxSize}
                  hasNextSession={Boolean(nextSessionAt)}
                  viewerIsMember
                />
                <button type="button" className="circle-details-primary" onClick={isCreator ? modifyCircle : openChat}>
                  {isCreator ? t("circleDetails.manageCircle") : t("circleDetails.openChat")}
                </button>
                <CircleDetailsMembersSection
                  members={members}
                  circle={circle}
                  hobiesCatalog={hobies}
                  myUserId={myUserId}
                  creatorUserId={creatorUserId}
                  maxSize={circle.maxSize}
                  selectedMemberId={selectedMemberId}
                  onSelectMember={setSelectedMemberId}
                />
                <section className="circle-details-chat-section stack" aria-label={t("circleDetails.chatAria")}>
                  <div className="circle-details-chat-toggle">
                    <span className="circle-details-chat-toggle-copy">
                      <span className="circle-details-chat-prompt-lead">{t("circleDetails.chatTitle")}</span>
                      <span className="circle-details-chat-prompt-sub">
                        {members.length === 1
                          ? t("circleDetails.onePersonInCircle")
                          : t("circleDetails.peopleInCircle", { count: members.length })}
                      </span>
                      {nextSessionAt ? (
                        <span className="circle-details-chat-prompt-sub">
                          {t("circleDetails.nextMeetupLine", { when: formatSessionDateTimeHero(nextSessionAt) })}
                        </span>
                      ) : null}
                      <span className="circle-details-chat-prompt-sub muted">{t("circleDetails.chatSubtitle")}</span>
                    </span>
                    <div className="circle-details-chat-actions">
                      <button type="button" className="circle-details-primary" onClick={openChat}>
                        {t("circleDetails.openChat")}
                      </button>
                    </div>
                  </div>
                </section>
                <CircleDetailsWhyJoin circle={circle} hobiesCatalog={hobies} />
              </>
            ) : (
              <div className="muted">{t("common.loading")}</div>
            )}
          </>
        )}

        {copyHint ? <p className="circle-details-copy-hint muted">{copyHint}</p> : null}
        {error ? <FormError>{error}</FormError> : null}
      </div>

      {isCreator ? <CircleDetailsTabBar tab={tab} onTab={setTab} t={t} /> : null}
    </div>
  );
}
