import { useTranslation } from "react-i18next";
import { BidiText } from "./BidiText";
import { CircleMemberAvatar } from "./CircleMemberAvatar";

export type DiscoverMemberPerson = {
  name: string;
  avatarUrl?: string | null;
};

const MAX_PREVIEW = 3;

/** Faces when the card already has people. Otherwise the real member count only. */
export function DiscoverMemberPreview(props: {
  memberCount: number;
  people?: DiscoverMemberPerson[] | null;
}) {
  const { t } = useTranslation();
  const count = Math.max(0, Math.trunc(props.memberCount));
  if (count <= 0) return null;

  const people = (props.people ?? [])
    .map((person) => ({ name: person.name.trim(), avatarUrl: person.avatarUrl?.trim() || null }))
    .filter((person) => person.name.length > 0)
    .slice(0, MAX_PREVIEW);
  const label = t("circleDetails.memberCount", { count });

  return (
    <span className="discover-member-preview">
      {people.length > 0 ? (
        <span className="discover-member-preview-stack" aria-hidden>
          {people.map((person, index) => (
            <CircleMemberAvatar
              key={`${index}:${person.name}`}
              name={person.name}
              avatarUrl={person.avatarUrl}
              compact
            />
          ))}
        </span>
      ) : (
        <span aria-hidden>👥</span>
      )}
      <BidiText>{label}</BidiText>
    </span>
  );
}
