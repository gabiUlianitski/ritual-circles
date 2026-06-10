import React from "react";
import type { UserMeResponse } from "../api/types";
import { ProfileAvailabilityPicker } from "./ProfileAvailabilityPicker";
import { FormError } from "./FormError";
import { formatLanguagesSummary, ProfileLanguagesPicker } from "./ProfileLanguagesPicker";
import { ProfilePlaceAutocomplete } from "./ProfilePlaceAutocomplete";
import type { UserLanguageItem } from "../api/types";
import type { AvailabilityWindowKey } from "../availabilityWindows";
import {
  IconAvailability,
  IconBirthday,
  IconEducation,
  IconEmail,
  IconHomeTown,
  IconLanguages,
  IconLocation,
  IconMemberSince,
  IconPhone,
  IconUsername,
  IconWork,
} from "./profileFbIcons";

function formatBirthday(iso: string | null | undefined): string {
  if (!iso?.trim()) return "";
  try {
    const d = new Date(iso.includes("T") ? iso : `${iso}T12:00:00`);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleDateString(undefined, {
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

function formatMemberSince(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}

function toDateInputValue(iso: string | null | undefined): string {
  if (!iso?.trim()) return "";
  const s = iso.trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : "";
}

function ProfileFbSection(props: { title: string; children: React.ReactNode }) {
  return (
    <section className="profile-fb-section">
      <header className="profile-fb-section-head">
        <h3 className="profile-fb-section-title">{props.title}</h3>
      </header>
      <div className="profile-fb-card profile-fb-card--dark">{props.children}</div>
    </section>
  );
}

function ProfileFbRow(props: {
  icon: React.ReactNode;
  children: React.ReactNode;
  last?: boolean;
}) {
  return (
    <div className={`profile-fb-about-row${props.last ? " profile-fb-about-row--last" : ""}`}>
      <div className="profile-fb-about-icon">{props.icon}</div>
      <div className="profile-fb-about-body">{props.children}</div>
    </div>
  );
}

export function ProfilePersonalTab(props: {
  me: UserMeResponse;
  firstName: string;
  lastName: string;
  city: string;
  hometown: string;
  birthDate: string;
  workSummary: string;
  educationSummary: string;
  languages: UserLanguageItem[];
  phone: string;
  availabilityWindows: AvailabilityWindowKey[];
  working: boolean;
  onFirstName: (v: string) => void;
  onLastName: (v: string) => void;
  onCity: (v: string) => void;
  onHometown: (v: string) => void;
  onBirthDate: (v: string) => void;
  onWorkSummary: (v: string) => void;
  onEducationSummary: (v: string) => void;
  onLanguages: (v: UserLanguageItem[]) => void;
  onPhone: (v: string) => void;
  onAvailabilityWindows: (v: AvailabilityWindowKey[]) => void;
  onSave: () => void;
  saveError?: string | null;
  saveInfo?: string | null;
}) {
  const { me } = props;
  const fullName = [props.firstName.trim(), props.lastName.trim()].filter(Boolean).join(" ") || "—";

  return (
    <div className="profile-personal-fb stack" aria-labelledby="profile-personal-heading">
      <p id="profile-personal-heading" className="profile-personal-fb-sub">
        Like Facebook About — what your circle can see. Tap fields to edit, then save.
      </p>

      <ProfileFbSection title="Personal details">
        <ProfileFbRow icon={<IconLocation />}>
          <div className="profile-fb-about-primary">Lives in</div>
          <ProfilePlaceAutocomplete
            value={props.city}
            onChange={props.onCity}
            placeholder="Start typing a city…"
            disabled={props.working}
            ariaLabel="City you live in"
          />
        </ProfileFbRow>
        <ProfileFbRow icon={<IconHomeTown />}>
          <div className="profile-fb-about-primary">From</div>
          <ProfilePlaceAutocomplete
            value={props.hometown}
            onChange={props.onHometown}
            placeholder="Start typing your hometown…"
            disabled={props.working}
            ariaLabel="Hometown"
          />
        </ProfileFbRow>
        <ProfileFbRow icon={<IconBirthday />}>
          <div className="profile-fb-about-primary">Birthday</div>
          <input
            type="date"
            className="profile-fb-about-input profile-fb-about-input--date"
            value={toDateInputValue(props.birthDate || me.birthDate)}
            onChange={(e) => props.onBirthDate(e.target.value)}
            disabled={props.working}
            aria-label="Birthday"
          />
          {props.birthDate || me.birthDate ? (
            <div className="profile-fb-about-secondary">{formatBirthday(props.birthDate || me.birthDate)}</div>
          ) : null}
        </ProfileFbRow>
        <ProfileFbRow icon={<IconLanguages />}>
          <div className="profile-fb-about-primary">Languages</div>
          <ProfileLanguagesPicker
            value={props.languages}
            onChange={props.onLanguages}
            disabled={props.working}
          />
          {props.languages.length > 0 ? (
            <div className="profile-fb-about-secondary">{formatLanguagesSummary(props.languages)}</div>
          ) : (
            <div className="profile-fb-about-secondary muted">Add languages you speak</div>
          )}
        </ProfileFbRow>
        <ProfileFbRow icon={<IconUsername />}>
          <div className="profile-fb-about-primary">Name</div>
          <div className="profile-fb-about-name-row">
            <input
              className="profile-fb-about-input"
              placeholder="First name"
              value={props.firstName}
              onChange={(e) => props.onFirstName(e.target.value)}
              disabled={props.working}
              aria-label="First name"
            />
            <input
              className="profile-fb-about-input"
              placeholder="Last name (optional)"
              value={props.lastName}
              onChange={(e) => props.onLastName(e.target.value)}
              disabled={props.working}
              aria-label="Last name"
            />
          </div>
          {fullName !== "—" ? <div className="profile-fb-about-secondary">{fullName}</div> : null}
        </ProfileFbRow>
        <ProfileFbRow icon={<IconUsername />}>
          <div className="profile-fb-about-primary">Username</div>
          <div className="profile-fb-about-value">@{me.user_name}</div>
        </ProfileFbRow>
        <ProfileFbRow icon={<IconAvailability />} last>
          <div className="profile-fb-about-primary">Availability</div>
          <ProfileAvailabilityPicker
            value={props.availabilityWindows}
            onChange={props.onAvailabilityWindows}
            disabled={props.working}
          />
        </ProfileFbRow>
      </ProfileFbSection>

      <ProfileFbSection title="Work">
        <ProfileFbRow icon={<IconWork />} last>
          <input
            className="profile-fb-about-input"
            placeholder="Company and role, e.g. Amdocs · Solution manager"
            value={props.workSummary}
            onChange={(e) => props.onWorkSummary(e.target.value)}
            disabled={props.working}
            aria-label="Work"
          />
          {props.workSummary.trim() ? (
            <div className="profile-fb-about-secondary">{props.workSummary}</div>
          ) : (
            <div className="profile-fb-about-secondary muted">Add where you work</div>
          )}
        </ProfileFbRow>
      </ProfileFbSection>

      <ProfileFbSection title="Education">
        <ProfileFbRow icon={<IconEducation />} last>
          <input
            className="profile-fb-about-input"
            placeholder="School and year, e.g. Afeka · Class of 2006"
            value={props.educationSummary}
            onChange={(e) => props.onEducationSummary(e.target.value)}
            disabled={props.working}
            aria-label="Education"
          />
          {props.educationSummary.trim() ? (
            <div className="profile-fb-about-secondary">{props.educationSummary}</div>
          ) : (
            <div className="profile-fb-about-secondary muted">Add your education</div>
          )}
        </ProfileFbRow>
      </ProfileFbSection>

      <ProfileFbSection title="Contact info">
        <ProfileFbRow icon={<IconEmail />}>
          <div className="profile-fb-about-primary">Email</div>
          <div className="profile-fb-about-value">{me.email?.trim() ? me.email : "—"}</div>
        </ProfileFbRow>
        <ProfileFbRow icon={<IconPhone />}>
          <div className="profile-fb-about-primary">Phone</div>
          <input
            className="profile-fb-about-input"
            type="tel"
            placeholder="Add phone number"
            value={props.phone}
            onChange={(e) => props.onPhone(e.target.value)}
            disabled={props.working}
            aria-label="Phone"
          />
        </ProfileFbRow>
        <ProfileFbRow icon={<IconMemberSince />} last>
          <div className="profile-fb-about-primary">Member since</div>
          <div className="profile-fb-about-value">{formatMemberSince(me.createdAt)}</div>
        </ProfileFbRow>
      </ProfileFbSection>

      {!props.firstName.trim() ? (
        <p className="profile-save-hint muted" role="status">
          Add a first name above to save your profile.
        </p>
      ) : null}
      {props.saveError ? <FormError>{props.saveError}</FormError> : null}
      {props.saveInfo ? <div className="profile-save-info muted">{props.saveInfo}</div> : null}
      <button
        type="button"
        className="primary profile-save-btn"
        disabled={props.working || !props.firstName.trim()}
        onClick={props.onSave}
      >
        {props.working ? "Saving…" : "Save changes"}
      </button>
    </div>
  );
}
