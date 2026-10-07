import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api/client";
import type { CircleMemberResponse, CircleMessage, CircleResponse, CitySuggestItem, CountryItem, VenueSuggestionItem } from "../api/types";
import { meetingPlaceValue } from "../venueCardDisplay";
import { markChatFullySeen } from "../chatLastSeen";
import { buildPlaceSuggestMessage, parsePlaceSuggestMessage } from "./circleChatPlaceSuggest";
import {
  buildTimeSuggestMessage,
  defaultSuggestDate,
  parseTimeSuggestMessage,
  toDateInputValue,
} from "./circleChatTimeSuggest";
import { buildFirstSessionIso, todayIsoLocal } from "./createCircleSchedule";
import { CreateCircleVenuePicker } from "./CreateCircleVenuePicker";
import { markCircleChatNotificationsRead } from "../notificationInbox";
import { FormError } from "./FormError";
import { geolocationUserMessage } from "../geolocationMessage";
import { MeetDateTimePicker } from "./MeetDateTimePicker";
import { filterAboutChatMessages } from "./circleChatAboutFilter";
import { suggestionAcceptPayloadFromBody } from "./suggestionAccept";
import {
  CHAT_PLACEHOLDERS,
  canMemberSuggest,
  countPlainMessages,
  isChatQuiet,
  isPlainMessage,
  meetupIsFull,
  ownerOnlyCircle,
  suggestedFirstMessage,
  systemPrompts,
} from "./circleChatUx";
import { CircleChatGuide } from "./CircleChatGuide";
import { useTranslation } from "react-i18next";

export function CircleChat(props: {
  circleId: string;
  onBack?: () => void;
  embedded?: boolean;
  aboutEmbedded?: boolean;
  memberCount?: number;
  maxSize?: number;
  nextSessionAt?: string | null;
  members?: CircleMemberResponse[];
  creatorUserId?: string | null;
  onOpenMember?: (id: string) => void;
  onViewMeeting?: () => void;
  onInvite?: () => void;
  onEditSchedule?: () => void;
  initialDraft?: string;
}) {
  const { t } = useTranslation();
  const [messages, setMessages] = useState<CircleMessage[]>([]);
  const [draft, setDraft] = useState(props.initialDraft ?? "");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [circle, setCircle] = useState<CircleResponse | null>(null);
  const [isCreator, setIsCreator] = useState(false);
  const [memberCount, setMemberCount] = useState(props.memberCount ?? 0);
  const [members, setMembers] = useState<CircleMemberResponse[]>(props.members ?? []);
  const [creatorUserId, setCreatorUserId] = useState<string | null>(props.creatorUserId ?? null);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [placeOpen, setPlaceOpen] = useState(false);
  const [meetDate, setMeetDate] = useState(() => toDateInputValue(defaultSuggestDate()));
  const [meetHour, setMeetHour] = useState(() => String(defaultSuggestDate().getHours()));
  const [repeatsWeekly, setRepeatsWeekly] = useState(true);
  const [nextSessionAt, setNextSessionAt] = useState<string | null>(props.nextSessionAt ?? null);
  const [placeholderIdx, setPlaceholderIdx] = useState(0);
  const [cityQuery, setCityQuery] = useState("");
  const [citySelected, setCitySelected] = useState("");
  const [countryCode, setCountryCode] = useState("");
  const [countries, setCountries] = useState<CountryItem[]>([]);
  const [meetingPlace, setMeetingPlace] = useState("");
  const [selectedVenueKey, setSelectedVenueKey] = useState<string | null>(null);
  const [selectedVenue, setSelectedVenue] = useState<VenueSuggestionItem | null>(null);
  const [locateBusy, setLocateBusy] = useState(false);
  const [venueSearchNonce, setVenueSearchNonce] = useState(0);

  const bottomRef = useRef<HTMLDivElement | null>(null);
  const messagesRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const minMeetDate = todayIsoLocal();
  const maxSize = props.maxSize ?? circle?.maxSize ?? 6;

  const visibleMessages = useMemo(() => {
    const excludeOwnerSuggestions = isCreator && myUserId ? myUserId : null;
    const list = props.aboutEmbedded
      ? filterAboutChatMessages(messages, excludeOwnerSuggestions)
      : messages.filter((m) => {
          if (!excludeOwnerSuggestions || m.userId !== excludeOwnerSuggestions) return true;
          return !parseTimeSuggestMessage(m.body) && !parsePlaceSuggestMessage(m.body);
        });
    return list;
  }, [messages, props.aboutEmbedded, isCreator, myUserId]);

  const plainCount = useMemo(() => countPlainMessages(messages), [messages]);
  const isFull = meetupIsFull(memberCount, maxSize);
  const soloOwner = ownerOnlyCircle(memberCount) && isCreator;
  const canSuggest = canMemberSuggest(memberCount, isCreator);
  const quiet = isChatQuiet(messages);
  const ritualType = circle?.ritualType ?? "";
  const starters = useMemo(
    () => [
      t("circleChat.starterLevel"),
      t("circleChat.starterDays"),
      t("circleChat.starterBefore"),
      t("circleChat.starterEnjoy"),
    ],
    [t],
  );
  const pendingDateVote = useMemo(
    () => messages.some((m) => Boolean(parseTimeSuggestMessage(m.body))),
    [messages],
  );
  const latestTimeSuggestId = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      if (parseTimeSuggestMessage(messages[i].body)) return messages[i].id;
    }
    return null;
  }, [messages]);
  const prompts = useMemo(
    () =>
      systemPrompts({
        memberCount,
        maxSize,
        nextSessionAt,
        isFull,
        plainCount,
      }),
    [memberCount, maxSize, nextSessionAt, isFull, plainCount],
  );
  const firstMessage = useMemo(() => suggestedFirstMessage(ritualType), [ritualType]);
  const showFirstMessageCard = plainCount <= 1 && !soloOwner && memberCount > 1;

  useEffect(() => {
    if (props.memberCount != null) setMemberCount(props.memberCount);
  }, [props.memberCount]);

  useEffect(() => {
    if (props.nextSessionAt !== undefined) setNextSessionAt(props.nextSessionAt);
  }, [props.nextSessionAt]);

  useEffect(() => {
    const id = window.setInterval(() => {
      setPlaceholderIdx((i) => (i + 1) % CHAT_PLACEHOLDERS.length);
    }, 8000);
    return () => window.clearInterval(id);
  }, []);

  function applySuggestFromDate(d: Date) {
    setMeetDate(toDateInputValue(d));
    setMeetHour(String(d.getHours()));
  }

  function prefillWhereFromCircle() {
    const city = circle?.cityName?.trim() || circle?.city?.trim() || "";
    setCityQuery(city);
    setCitySelected(city);
    setCountryCode(circle?.countryCode?.trim().toUpperCase() || "");
    setMeetingPlace(circle?.meetingPlace?.trim() || "");
    setSelectedVenueKey(null);
    setSelectedVenue(null);
    if (city) setVenueSearchNonce((n) => n + 1);
  }

  function openTimeSuggest(prefill?: Date) {
    setPlaceOpen(false);
    if (prefill) applySuggestFromDate(prefill);
    else if (!meetDate || meetHour === "") applySuggestFromDate(defaultSuggestDate());
    setRepeatsWeekly(circle?.isRecurring !== false);
    setSuggestOpen(true);
  }

  function openPlaceSuggest(cityHint?: string) {
    setSuggestOpen(false);
    prefillWhereFromCircle();
    if (cityHint?.trim()) {
      setCityQuery(cityHint.trim());
      setCitySelected(cityHint.trim());
      setVenueSearchNonce((n) => n + 1);
    }
    setPlaceOpen(true);
  }

  useEffect(() => {
    void api.getMe().then((me) => setMyUserId(me.id)).catch(() => setMyUserId(null));
  }, []);

  const load = useCallback(async () => {
    setError(null);
    try {
      const list = await api.getCircleMessages(props.circleId);
      const arr = Array.isArray(list) ? list : [];
      setMessages(arr);
      if (myUserId) {
        markChatFullySeen(myUserId, props.circleId, arr);
        markCircleChatNotificationsRead(myUserId, props.circleId);
      }
    } catch (e) {
      setError(String(e));
    }
  }, [props.circleId, myUserId]);

  useEffect(() => {
    void load();
    const id = window.setInterval(() => void load(), 5000);
    return () => window.clearInterval(id);
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const me = await api.getMyCircle(props.circleId);
        if (!cancelled) {
          setCircle(me.circle ?? null);
          setIsCreator(Boolean(me.isCreator));
          setCreatorUserId(me.creatorUserId ?? null);
          setMembers(me.members ?? []);
          if (props.memberCount == null) setMemberCount(me.members?.length ?? 0);
        }
      } catch {
        if (!cancelled) setCircle(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [props.circleId, props.memberCount]);

  useEffect(() => {
    if (props.members) setMembers(props.members);
  }, [props.members]);

  useEffect(() => {
    if (props.creatorUserId !== undefined) setCreatorUserId(props.creatorUserId);
  }, [props.creatorUserId]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const rows = await api.getCountries();
        if (!cancelled) setCountries(Array.isArray(rows) ? rows : []);
      } catch {
        if (!cancelled) setCountries([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (props.nextSessionAt !== undefined) return;
    let cancelled = false;
    void (async () => {
      try {
        const home = await api.getHome();
        if (cancelled) return;
        const ns = home.nextSession;
        if (ns && ns.circleId === props.circleId) {
          setNextSessionAt(ns.dateTime);
          applySuggestFromDate(new Date(ns.dateTime));
        } else {
          setNextSessionAt(null);
        }
      } catch {
        if (!cancelled) setNextSessionAt(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [props.circleId, props.nextSessionAt]);

  useEffect(() => {
    const box = messagesRef.current;
    if (!box) return;
    box.scrollTop = box.scrollHeight;
  }, [messages.length, suggestOpen, placeOpen, plainCount]);

  async function postMessage(body: string) {
    setSending(true);
    setError(null);
    try {
      await api.postCircleMessage(props.circleId, { body });
      await load();
    } catch (e) {
      setError(String(e));
      throw e;
    } finally {
      setSending(false);
    }
  }

  async function send(bodyOverride?: string) {
    const body = (bodyOverride ?? draft).trim();
    if (!body || sending) return;
    try {
      await postMessage(body);
      if (!bodyOverride) setDraft("");
    } catch {
      /* error set in postMessage */
    }
  }

  function insertDraft(text: string) {
    setDraft((current) => (current.trim() && !starters.includes(current.trim()) ? current : text));
    window.requestAnimationFrame(() => inputRef.current?.focus());
  }

  function focusVote() {
    document.getElementById("circle-chat-open-vote")?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function suggestDate() {
    if (isCreator && props.onEditSchedule) {
      props.onEditSchedule();
      return;
    }
    openTimeSuggest();
  }

  function suggestPlace() {
    if (isCreator && props.onEditSchedule) {
      props.onEditSchedule();
      return;
    }
    openPlaceSuggest();
  }

  async function acceptSuggestion(messageId: string, body: string) {
    setSending(true);
    setError(null);
    try {
      const schedule = suggestionAcceptPayloadFromBody(body);
      await api.respondToCircleSuggestion(
        props.circleId,
        messageId,
        schedule
          ? {
              action: "accept",
              firstSessionAt: schedule.firstSessionAt,
              recurringTime: schedule.recurringTime,
              isRecurring: circle?.isRecurring !== false && repeatsWeekly,
            }
          : { action: "accept" },
      );
      await load();
    } catch (e) {
      setError(String(e));
    } finally {
      setSending(false);
    }
  }

  async function declineSuggestion(messageId: string) {
    setSending(true);
    setError(null);
    try {
      await api.respondToCircleSuggestion(props.circleId, messageId, { action: "decline" });
      await load();
    } catch (e) {
      setError(String(e));
    } finally {
      setSending(false);
    }
  }

  async function sendPlaceSuggestion(item: VenueSuggestionItem, cityLabel: string) {
    try {
      await postMessage(
        buildPlaceSuggestMessage({
          city: cityLabel,
          name: item.name,
          address: item.address,
          mapsUrl: item.mapsUrl ?? null,
          hobyRelation: item.hobyRelation,
        }),
      );
      setPlaceOpen(false);
    } catch {
      /* error set in postMessage */
    }
  }

  async function sendTimeSuggestion() {
    if (!meetDate || meetHour === "") {
      setError("Pick a date and time for the meeting.");
      return;
    }
    const when = new Date(buildFirstSessionIso(meetDate, meetHour));
    if (Number.isNaN(when.getTime()) || sending) {
      setError("Pick a valid date and time for the meeting.");
      return;
    }
    if (when.getTime() < Date.now() - 60_000) {
      setError("That time is in the past — pick a future date.");
      return;
    }
    try {
      await postMessage(buildTimeSuggestMessage(when));
      setSuggestOpen(false);
    } catch {
      /* error set in postMessage */
    }
  }

  function onCityQueryChange(q: string) {
    setCityQuery(q);
    setCitySelected("");
    setMeetingPlace("");
    setSelectedVenueKey(null);
    setSelectedVenue(null);
  }

  function onCitySelect(item: CitySuggestItem) {
    const display = item.displayName.trim() || item.shortName.trim();
    setCityQuery(item.shortName.trim() || display);
    setCitySelected(display);
    const cc = item.countryCode?.trim().toUpperCase();
    if (cc && cc.length === 2) setCountryCode(cc);
    setMeetingPlace("");
    setSelectedVenueKey(null);
    setSelectedVenue(null);
    setError(null);
    setVenueSearchNonce((n) => n + 1);
  }

  async function fillFromBrowserLocation() {
    if (!window.isSecureContext) {
      throw new Error("Location only works on HTTPS or localhost. Pick a city from the list instead.");
    }
    if (!navigator.geolocation) {
      throw new Error("Location not available in this browser. Pick a city from the list instead.");
    }
    const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: false,
        maximumAge: 300_000,
        timeout: 15_000,
      });
    });
    const r = await api.reverseLocate({ lat: pos.coords.latitude, lon: pos.coords.longitude });
    const cc =
      countries.find((c) => c.code === r.countryCode)?.code ??
      countries.find((c) => c.code.toLowerCase() === r.countryCode.toLowerCase())?.code ??
      r.countryCode;
    if (cc) setCountryCode(cc);
    const display = (r.displayName ?? "").trim() || r.cityShortName;
    setCityQuery(r.cityShortName);
    setCitySelected(display);
    setMeetingPlace("");
    setSelectedVenueKey(null);
    setSelectedVenue(null);
    setError(null);
    setVenueSearchNonce((n) => n + 1);
  }

  function onSelectVenue(venue: VenueSuggestionItem, key: string) {
    setSelectedVenueKey(key);
    setSelectedVenue(venue);
    setMeetingPlace(meetingPlaceValue(venue));
    setError(null);
  }

  async function sendSelectedPlace() {
    if (!selectedVenue) {
      setError("Pick a meeting place first.");
      return;
    }
    const cityLabel = citySelected.trim() || cityQuery.trim();
    if (!cityLabel) {
      setError("Pick a city first.");
      return;
    }
    await sendPlaceSuggestion(selectedVenue, cityLabel);
  }

  function formatMsgTime(iso: string) {
    return new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function renderSuggestionCard(m: CircleMessage) {
    const timeSuggest = parseTimeSuggestMessage(m.body);
    const placeSuggest = !timeSuggest ? parsePlaceSuggestMessage(m.body) : null;
    const isMine = m.userId === myUserId;
    const canRespond = isCreator && !isMine;

    if (timeSuggest) {
      return (
        <div
          id={m.id === latestTimeSuggestId ? "circle-chat-open-vote" : undefined}
          className={`circle-chat-msg-card circle-chat-suggest-card${isMine ? " circle-chat-msg-card--mine" : ""}`}
        >
          <div className="circle-chat-msg-meta">
            <span className="circle-chat-msg-author">{m.authorName}{isMine ? " · You" : ""}</span>
            <span className="circle-chat-msg-time">{formatMsgTime(m.createdAt)}</span>
          </div>
          <div className="circle-chat-time-suggest">
            <div className="circle-chat-time-suggest-label">Suggested meeting time</div>
            <div className="circle-chat-time-suggest-when">{timeSuggest.label}</div>
            {!canRespond ? (
              <div className="circle-chat-suggest-status muted">Waiting for the organizer to respond</div>
            ) : null}
          </div>
          {canRespond ? (
            <div className="circle-chat-suggest-actions row">
              <button type="button" className="primary" style={{ width: "auto" }} disabled={sending} onClick={() => void acceptSuggestion(m.id, m.body)}>
                Accept time
              </button>
              <button type="button" style={{ width: "auto" }} disabled={sending} onClick={() => void declineSuggestion(m.id)}>
                Not now
              </button>
            </div>
          ) : null}
        </div>
      );
    }

    if (placeSuggest) {
      return (
        <div className={`circle-chat-msg-card circle-chat-suggest-card${isMine ? " circle-chat-msg-card--mine" : ""}`}>
          <div className="circle-chat-msg-meta">
            <span className="circle-chat-msg-author">{m.authorName}{isMine ? " · You" : ""}</span>
            <span className="circle-chat-msg-time">{formatMsgTime(m.createdAt)}</span>
          </div>
          <div className="circle-chat-place-suggest">
            <div className="circle-chat-place-suggest-label">Suggested meeting place</div>
            <div className="circle-chat-place-suggest-name">{placeSuggest.name}</div>
            {placeSuggest.address ? <div className="muted circle-chat-suggest-detail">{placeSuggest.address}</div> : null}
            {placeSuggest.city ? <div className="muted circle-chat-suggest-detail">{placeSuggest.city}</div> : null}
            {!canRespond ? (
              <div className="circle-chat-suggest-status muted">Waiting for the organizer to respond</div>
            ) : null}
          </div>
          {canRespond ? (
            <div className="circle-chat-suggest-actions row">
              <button type="button" className="primary" style={{ width: "auto" }} disabled={sending} onClick={() => void acceptSuggestion(m.id, m.body)}>
                Accept place
              </button>
              <button type="button" style={{ width: "auto" }} disabled={sending} onClick={() => void declineSuggestion(m.id)}>
                Not now
              </button>
            </div>
          ) : null}
        </div>
      );
    }

    return null;
  }

  function renderPlainMessage(m: CircleMessage) {
    const isMine = m.userId === myUserId;
    return (
      <div className={`circle-chat-msg-card${isMine ? " circle-chat-msg-card--mine" : ""}`}>
        <div className="circle-chat-msg-meta">
          <span className="circle-chat-msg-author">{m.authorName}{isMine ? " · You" : ""}</span>
          <span className="circle-chat-msg-time">{formatMsgTime(m.createdAt)}</span>
        </div>
        <div className="circle-chat-msg-body">{m.body}</div>
      </div>
    );
  }

  const icebreakerSection = soloOwner ? null : (
    <div className="circle-chat-icebreakers stack">
      {plainCount === 0 ? (
        <>
          <p className="circle-chat-empty-title">{t("circleChat.quietTitle")}</p>
          <p className="circle-chat-empty-sub muted">{t("circleChat.quietHint")}</p>
        </>
      ) : null}
      {quiet || plainCount === 0 ? (
        <div className="circle-chat-chips" role="list">
          {starters.map((text) => (
            <button
              key={text}
              type="button"
              className="circle-chat-chip"
              disabled={sending}
              onClick={() => insertDraft(text)}
            >
              {text}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );

  const messageList = (
    <div className="circle-chat-messages stack" ref={messagesRef}>
      {isFull ? (
        <div className="circle-chat-system-prompt circle-chat-system-prompt--confirmed">
          ✅ Meetup confirmed
        </div>
      ) : null}
      {prompts.map((p) => (
        <div key={p} className="circle-chat-system-prompt">{p}</div>
      ))}

      {visibleMessages.length === 0 ? icebreakerSection : null}

      {visibleMessages.map((m) => {
        const card = isPlainMessage(m.body) ? renderPlainMessage(m) : renderSuggestionCard(m);
        return card ? <div key={m.id}>{card}</div> : null;
      })}

      {visibleMessages.length > 0 && quiet ? icebreakerSection : null}
      <div ref={bottomRef} />
    </div>
  );

  const timeForm = (
    <div className={`circles-search-expand${suggestOpen ? " circles-search-expand-open" : ""}`} aria-hidden={!suggestOpen}>
      <div className="circles-search-expand-surface stack circle-chat-inline-form">
        <h3 className="circle-chat-form-title">When do you meet?</h3>
        <p className="muted circle-chat-form-sub">Propose a new time to meet. Everyone in the circle will see it in chat.</p>
        <MeetDateTimePicker
          dateId="circle-chat-suggest-datetime"
          dateValue={meetDate}
          hourValue={meetHour}
          minDate={minMeetDate}
          onDateChange={setMeetDate}
          onHourChange={setMeetHour}
          disabled={sending}
        />
        {circle?.isRecurring !== false ? (
          <label className="create-circle-repeat-row row">
            <input
              type="checkbox"
              className="create-circle-repeat-checkbox"
              checked={repeatsWeekly}
              onChange={(e) => setRepeatsWeekly(e.target.checked)}
              disabled={sending}
            />
            <span className="create-circle-helper muted">This repeats every week</span>
          </label>
        ) : null}
        <button type="button" className="primary" style={{ width: "auto", alignSelf: "flex-start" }} disabled={sending || !meetDate || meetHour === ""} onClick={() => void sendTimeSuggestion()}>
          {sending ? "Sending…" : "Send time suggestion"}
        </button>
      </div>
    </div>
  );

  const placeForm = (
    <div className={`circles-search-expand${placeOpen && circle ? " circles-search-expand-open" : ""}`} aria-hidden={!placeOpen || !circle}>
      <div className="circles-search-expand-surface circle-chat-inline-form">
        {circle ? (
          <div className="stack" style={{ gap: 12 }}>
            <h3 className="circle-chat-form-title">Where do you meet?</h3>
            <p className="muted circle-chat-form-sub">Suggest a new place. Everyone in the circle will see it in chat.</p>
            <CreateCircleVenuePicker
              cityQuery={cityQuery}
              citySelected={citySelected}
              onCityQueryChange={onCityQueryChange}
              onCitySelect={onCitySelect}
              ritualType={circle.ritualType}
              ritualSubtype={circle.ritualSubtype ?? ""}
              ritualLevel={circle.ritualLevel ?? null}
              venueSearchNonce={venueSearchNonce}
              locateBusy={locateBusy}
              onUseLocation={async () => {
                setLocateBusy(true);
                setError(null);
                try {
                  await fillFromBrowserLocation();
                } catch (e) {
                  const message = geolocationUserMessage(e);
                  setError(message);
                  throw new Error(message);
                } finally {
                  setLocateBusy(false);
                }
              }}
              meetingPlace={meetingPlace}
              selectedKey={selectedVenueKey}
              onSelectVenue={onSelectVenue}
              onClearMeetingPlace={() => {
                setMeetingPlace("");
                setSelectedVenueKey(null);
                setSelectedVenue(null);
              }}
              disabled={sending}
            />
            <button type="button" className="primary" style={{ width: "auto", alignSelf: "flex-start" }} disabled={sending || !selectedVenue || !citySelected.trim()} onClick={() => void sendSelectedPlace()}>
              {sending ? "Sending…" : "Send place suggestion"}
            </button>
          </div>
        ) : (
          <div className="muted">Loading circle…</div>
        )}
      </div>
    </div>
  );

  const compose = soloOwner ? (
    <div className="circle-chat-solo-owner muted">
      Once someone joins, you&apos;ll be able to chat here
    </div>
  ) : (
    <div className="circle-chat-compose stack">
      {showFirstMessageCard ? (
        <div className="circle-chat-first-suggest card stack">
          <div className="circle-chat-first-suggest-label">👋 Suggested first message</div>
          <p className="circle-chat-first-suggest-text">&ldquo;{firstMessage}&rdquo;</p>
          <button type="button" className="primary" style={{ width: "auto", alignSelf: "flex-start" }} disabled={sending} onClick={() => insertDraft(firstMessage)}>
            {t("circleChat.useMessage")}
          </button>
        </div>
      ) : null}

      <div className="circle-chat-quick-actions row">
        <button type="button" className="circle-chat-quick-btn" disabled={sending} onClick={() => insertDraft(t("circleChat.starterHello"))}>
          {t("circleChat.sayHi")}
        </button>
        {canSuggest ? (
          <>
            <button type="button" className={`circle-chat-quick-btn${suggestOpen ? " is-active" : ""}`} disabled={sending} onClick={() => (suggestOpen ? setSuggestOpen(false) : openTimeSuggest())}>
              Suggest new time
            </button>
            <button type="button" className={`circle-chat-quick-btn${placeOpen ? " is-active" : ""}`} disabled={sending || !circle} onClick={() => (placeOpen ? setPlaceOpen(false) : openPlaceSuggest())}>
              Suggest meeting place
            </button>
          </>
        ) : null}
      </div>

      {canSuggest ? (
        <>
          {timeForm}
          {placeForm}
        </>
      ) : null}

      <textarea
        ref={inputRef}
        rows={2}
        className="circle-chat-input"
        value={draft}
        placeholder={CHAT_PLACEHOLDERS[placeholderIdx]}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            void send();
          }
        }}
      />
      <button type="button" className="primary circle-chat-send" disabled={sending || !draft.trim()} onClick={() => void send()}>
        {sending ? "Sending…" : "Send"}
      </button>
    </div>
  );

  const guide = circle ? (
    <CircleChatGuide
      circle={circle}
      joined={memberCount}
      isCreator={isCreator}
      members={members}
      myUserId={myUserId}
      creatorUserId={creatorUserId}
      hasNextSession={Boolean(nextSessionAt)}
      pendingDateVote={pendingDateVote}
      onSuggestDate={suggestDate}
      onSuggestPlace={suggestPlace}
      onVote={focusVote}
      onViewMeeting={() => props.onViewMeeting?.()}
      onInvite={() => props.onInvite?.()}
      onOpenMember={(id) => props.onOpenMember?.(id)}
    />
  ) : null;

  if (props.embedded) {
    return (
      <div className="circle-chat-embedded stack">
        {guide}
        {messageList}
        {error ? <FormError>{error}</FormError> : null}
        {compose}
      </div>
    );
  }

  return (
    <div className="card stack circle-chat-page">
      <div className="row" style={{ justifyContent: "space-between", flexShrink: 0 }}>
        {props.onBack ? (
          <button type="button" style={{ width: "auto" }} onClick={props.onBack}>
            Back
          </button>
        ) : null}
      </div>
      {guide}
      {messageList}
      {error ? <FormError>{error}</FormError> : null}
      {compose}
    </div>
  );
}
