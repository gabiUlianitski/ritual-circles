import React, { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../api/client";
import type { CircleMeResponse, CircleMessage, Hoby } from "../api/types";
import { CircleChat } from "./CircleChat";
import { CircleScheduledTab } from "./CircleScheduledTab";
import { dedupeMembers } from "./circleMembers";
import { markCircleLeftBySelf } from "../notificationInbox";
import { FormError } from "./FormError";
import { CircleDetailsSummary } from "./CircleDetailsSummary";
import { CircleDetailsMembersSection } from "./CircleDetailsMembersSection";
import { CircleDetailsNextActivity } from "./CircleDetailsNextActivity";
import { CircleDetailsInformation } from "./CircleDetailsInformation";
import { CircleDetailsConversationPreview } from "./CircleDetailsConversationPreview";
import { CircleInviteModal } from "./CircleInviteModal";
import { formatCircleLocationShort } from "./circleDetailsFormat";

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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const [tab, setTab] = useState<DetailsTab>(() => normalizeTab(props.initialTab));
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [hobies, setHobies] = useState<Hoby[]>([]);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [scheduledEditTrigger, setScheduledEditTrigger] = useState(0);
  const [inviteSheetOpen, setInviteSheetOpen] = useState(false);
  const [chatFocus, setChatFocus] = useState(props.initialTab === "chat");
  const [messages, setMessages] = useState<CircleMessage[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(true);
  const [messagesFailed, setMessagesFailed] = useState(false);
  const optionsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setTab(normalizeTab(props.initialTab));
    setSelectedMemberId(null);
    setOptionsOpen(false);
    setInviteSheetOpen(false);
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
    setLoading(true);
    try {
      setData(await api.getMyCircle(props.circleId));
    } catch {
      setData(null);
      setError(t("circleDetails.loadFailed"));
    } finally {
      setLoading(false);
    }
  }

  async function loadMessages() {
    setMessagesLoading(true);
    setMessagesFailed(false);
    try {
      setMessages(await api.getCircleMessages(props.circleId, { limit: 3 }));
    } catch {
      setMessagesFailed(true);
    } finally {
      setMessagesLoading(false);
    }
  }

  useEffect(() => {
    void load();
    void loadMessages();
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
    const confirmed = window.confirm(
      isCreator ? t("circleDetails.deleteConfirm") : t("circleDetails.leaveConfirm"),
    );
    if (!confirmed) return;
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
    } catch {
      setError(
        isCreator
          ? t("circleDetails.deleteFailed")
          : t("circleDetails.leaveFailed"),
      );
    } finally {
      setWorking(false);
    }
  }

  function openInviteSheet() {
    if (!isCreator) return;
    setOptionsOpen(false);
    setInviteSheetOpen(true);
  }

  function modifyCircle() {
    setOptionsOpen(false);
    setTab("scheduled");
    setScheduledEditTrigger((n) => n + 1);
  }

  return (
    <div className="card stack circle-details-page" aria-busy={loading || working}>
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
                {isCreator ? (
                  <button
                    type="button"
                    className="circle-details-menu-action"
                    onClick={openInviteSheet}
                  >
                    {t("circleDetails.inviteTitle")}
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
                    void loadMessages();
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
                  onInvite={isCreator ? openInviteSheet : undefined}
                  onEditSchedule={() => {
                    setChatFocus(false);
                    modifyCircle();
                  }}
                  initialDraft={props.initialDraft}
                />
              </>
            ) : loading ? (
              <div className="circle-details-skeleton" aria-label={t("common.loading")}>
                <div className="circle-details-skeleton-hero" />
                <div className="circle-details-skeleton-action" />
                <div className="circle-details-skeleton-row" />
                <div className="circle-details-skeleton-row circle-details-skeleton-row--short" />
              </div>
            ) : circle ? (
              <>
                <CircleDetailsSummary
                  circle={circle}
                  hobiesCatalog={hobies}
                  members={members}
                  myUserId={myUserId}
                  memberCount={members.length}
                  maxSize={circle.maxSize}
                  hasNextSession={Boolean(nextSessionAt)}
                />
                <div className="circle-details-primary-area">
                  <button type="button" className="circle-details-primary" onClick={isCreator ? modifyCircle : openChat}>
                    {isCreator ? t("circleDetails.manageCircle") : t("circleDetails.openChat")}
                  </button>
                  {isCreator ? (
                    <button type="button" className="circle-details-secondary" onClick={openChat}>
                      {t("circleDetails.openChat")}
                    </button>
                  ) : null}
                </div>

                <div className="circle-details-content-grid">
                  <main className="circle-details-main-column">
                    <CircleDetailsNextActivity
                      circle={circle}
                      roster={data?.nextSessionRoster}
                      myUserId={myUserId}
                      isCreator={isCreator}
                      onManage={modifyCircle}
                      onRefresh={load}
                    />
                    <CircleDetailsMembersSection
                      members={members}
                      circle={circle}
                      hobiesCatalog={hobies}
                      myUserId={myUserId}
                      creatorUserId={creatorUserId}
                      maxSize={circle.maxSize}
                      selectedMemberId={selectedMemberId}
                      onSelectMember={setSelectedMemberId}
                      onInviteSeat={isCreator ? openInviteSheet : undefined}
                    />
                  </main>
                  <aside className="circle-details-side-column">
                    <CircleDetailsConversationPreview
                      messages={messages}
                      members={members}
                      loading={messagesLoading}
                      failed={messagesFailed}
                      onRetry={() => void loadMessages()}
                      onOpenChat={openChat}
                    />
                    <CircleDetailsInformation circle={circle} />
                  </aside>
                </div>
                <section className="circle-details-member-actions" aria-label={t("circleDetails.membershipActions")}>
                  <h2>{t("circleDetails.membershipActions")}</h2>
                  <p>{t("circleDetails.invitePeopleHint")}</p>
                  <div>
                    {isCreator ? (
                      <button type="button" className="circle-details-secondary" onClick={openInviteSheet}>
                        {t("circleDetails.inviteTitle")}
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="circle-details-danger-outline"
                      disabled={working}
                      onClick={() => void leaveOrDrop()}
                    >
                      {isCreator ? t("circleDetails.deleteCircle") : t("circleDetails.leaveCircle")}
                    </button>
                  </div>
                </section>
              </>
            ) : (
              <div className="circle-details-load-error" role="alert">
                <h2>{t("circleDetails.notAvailable")}</h2>
                <p>{error ?? t("circleDetails.loadFailed")}</p>
                <button type="button" className="circle-details-secondary" onClick={() => void load()}>
                  {t("circleDetails.retry")}
                </button>
              </div>
            )}
          </>
        )}

        {circle ? (
          <CircleInviteModal
            isOpen={inviteSheetOpen}
            circle={circle}
            joined={members.length}
            capacity={Math.max(members.length, circle.maxSize || 6)}
            meetingAt={nextSessionAt}
            location={formatCircleLocationShort(circle, t)}
            canInviteMembers={isCreator}
            onClose={() => setInviteSheetOpen(false)}
          />
        ) : null}
        {error && circle ? <FormError>{error}</FormError> : null}
      </div>

      {isCreator ? <CircleDetailsTabBar tab={tab} onTab={setTab} t={t} /> : null}
    </div>
  );
}
