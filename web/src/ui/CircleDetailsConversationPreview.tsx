import React from "react";
import { useTranslation } from "react-i18next";
import type { CircleMemberResponse, CircleMessage } from "../api/types";
import { memberDisplayName } from "./circleMembers";
import { CircleMemberAvatar } from "./CircleMemberAvatar";
import { parsePlaceSuggestMessage } from "./circleChatPlaceSuggest";
import { parseTimeSuggestMessage } from "./circleChatTimeSuggest";

function messagePreview(body: string, t: (key: string, options?: Record<string, unknown>) => string): string {
  const time = parseTimeSuggestMessage(body);
  if (time) return t("circleDetails.suggestedTime", { value: time.label });
  const place = parsePlaceSuggestMessage(body);
  if (place) return t("circleDetails.suggestedPlace", { value: place.headline });
  return body;
}

function messageTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function CircleDetailsConversationPreview(props: {
  messages: CircleMessage[];
  members: CircleMemberResponse[];
  loading: boolean;
  failed: boolean;
  onRetry: () => void;
  onOpenChat: () => void;
}) {
  const { t } = useTranslation();

  return (
    <section className="circle-details-conversation" aria-labelledby="circle-conversation-title">
      <div className="circle-details-section-head">
        <div>
          <p className="circle-details-section-kicker">{t("circleDetails.stayConnected")}</p>
          <h2 id="circle-conversation-title">{t("circleDetails.conversation")}</h2>
        </div>
        <button type="button" className="circle-details-text-action" onClick={props.onOpenChat}>
          {t("circleDetails.openChat")}
        </button>
      </div>

      {props.loading ? (
        <div className="circle-details-conversation-loading" aria-label={t("common.loading")}>
          <span />
          <span />
        </div>
      ) : props.failed ? (
        <div className="circle-details-local-error" role="alert">
          <span>{t("circleDetails.messagesFailed")}</span>
          <button type="button" onClick={props.onRetry}>{t("circleDetails.retry")}</button>
        </div>
      ) : props.messages.length ? (
        <div className="circle-details-message-list">
          {props.messages.map((message) => {
            const member = props.members.find((item) => item.id === message.userId);
            const name = member ? memberDisplayName(member, props.members) : message.authorName;
            return (
              <article className="circle-details-message-preview" key={message.id}>
                <CircleMemberAvatar
                  name={name}
                  avatarUrl={member?.avatarUrl}
                  compact
                />
                <div>
                  <header>
                    <strong>{name}</strong>
                    <time dateTime={message.createdAt}>{messageTime(message.createdAt)}</time>
                  </header>
                  <p>{messagePreview(message.body, t)}</p>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="circle-details-conversation-empty">
          <strong>{t("circleDetails.noMessages")}</strong>
          <span>{t("circleDetails.startConversation")}</span>
        </div>
      )}
    </section>
  );
}
