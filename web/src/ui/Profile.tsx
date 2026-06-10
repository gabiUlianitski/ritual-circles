import React, { useEffect, useState } from "react";
import { api } from "../api/client";
import type { UserLanguageItem, UserMeResponse } from "../api/types";
import {
  normalizeAvailabilityWindows,
  type AvailabilityWindowKey,
} from "../availabilityWindows";
import { FormError } from "./FormError";
import { ProfileHobbiesTab } from "./ProfileHobbiesTab";
import { ProfilePersonalTab } from "./ProfilePersonalTab";

type ProfileTab = "personal" | "hobbies" | "security";

export function Profile(props: { onBack: () => void; onLogout: () => void }) {
  const [tab, setTab] = useState<ProfileTab>("personal");
  const [me, setMe] = useState<UserMeResponse | null>(null);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [city, setCity] = useState("");
  const [hometown, setHometown] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [workSummary, setWorkSummary] = useState("");
  const [educationSummary, setEducationSummary] = useState("");
  const [languages, setLanguages] = useState<UserLanguageItem[]>([]);
  const [phone, setPhone] = useState("");
  const [availabilityWindows, setAvailabilityWindows] = useState<AvailabilityWindowKey[]>([]);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [pwWorking, setPwWorking] = useState(false);
  const [pwMsg, setPwMsg] = useState<string | null>(null);

  async function load() {
    setError(null);
    try {
      const m = await api.getMe();
      setMe(m);
      setFirstName(m.first_name ?? "");
      setLastName(m.last_name ?? "");
      setCity(m.city ?? "");
      setHometown(m.hometown ?? "");
      setBirthDate(m.birthDate?.slice(0, 10) ?? "");
      setWorkSummary(m.workSummary ?? "");
      setEducationSummary(m.educationSummary ?? "");
      setLanguages(m.languages ?? []);
      setPhone(m.phone ?? "");
      setAvailabilityWindows(normalizeAvailabilityWindows(m.availabilityWindows));
    } catch (e) {
      setError(String(e));
    }
  }

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    setInfo(null);
    setError(null);
    setPwMsg(null);
  }, [tab]);

  async function saveGeneral() {
    setWorking(true);
    setError(null);
    setInfo(null);
    try {
      await api.patchMe({
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        city: city.trim() ? city.trim() : null,
        hometown: hometown.trim() ? hometown.trim() : null,
        birthDate: birthDate.trim() ? birthDate.trim() : null,
        workSummary: workSummary.trim() ? workSummary.trim() : null,
        educationSummary: educationSummary.trim() ? educationSummary.trim() : null,
        languages,
        phone: phone.trim() ? phone.trim() : null,
        availabilityWindows,
      });
      setInfo("Personal details saved.");
      await load();
    } catch (e) {
      setError(String(e));
    } finally {
      setWorking(false);
    }
  }

  async function changePassword() {
    setPwMsg(null);
    setInfo(null);
    if (newPw.length < 6) {
      setPwMsg("Choose a new password of at least 6 characters.");
      return;
    }
    if (newPw !== confirmPw) {
      setPwMsg("The two new password fields don’t match — try again.");
      return;
    }
    setPwWorking(true);
    try {
      await api.changePassword({ currentPassword: currentPw, newPassword: newPw });
      setCurrentPw("");
      setNewPw("");
      setConfirmPw("");
      setPwMsg(null);
      setInfo("Password updated.");
    } catch (e) {
      setPwMsg(String(e));
    } finally {
      setPwWorking(false);
    }
  }

  async function copyUserId() {
    if (!me?.id) return;
    try {
      await navigator.clipboard.writeText(me.id);
      setInfo("User ID copied to clipboard.");
    } catch {
      setError("We couldn’t copy from the browser. You can select the ID and copy it by hand.");
    }
  }

  const pushLabel =
    me?.deviceToken && me.deviceToken.trim().length > 0
      ? "On file (session reminders when the app registers a token)"
      : "Not set";

  return (
    <div className="card stack">
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
        <div className="h1" style={{ marginBottom: 0 }}>
          Profile
        </div>
        <button type="button" style={{ width: "auto" }} onClick={props.onBack} disabled={working || pwWorking}>
          Back
        </button>
      </div>

      {!me ? (
        <div className="muted">Loading…</div>
      ) : (
        <>
          <div className="hoby-browse-toggle profile-tabs" role="tablist" aria-label="Profile sections">
            <button
              type="button"
              role="tab"
              className={tab === "personal" ? "is-active" : ""}
              aria-selected={tab === "personal"}
              onClick={() => setTab("personal")}
            >
              Personal details
            </button>
            <button
              type="button"
              role="tab"
              className={tab === "hobbies" ? "is-active" : ""}
              aria-selected={tab === "hobbies"}
              onClick={() => setTab("hobbies")}
            >
              Hobbies
            </button>
            <button
              type="button"
              role="tab"
              className={tab === "security" ? "is-active" : ""}
              aria-selected={tab === "security"}
              onClick={() => setTab("security")}
            >
              Security
            </button>
          </div>

          {tab === "personal" ? (
            <ProfilePersonalTab
              me={me}
              firstName={firstName}
              lastName={lastName}
              city={city}
              hometown={hometown}
              birthDate={birthDate}
              workSummary={workSummary}
              educationSummary={educationSummary}
              languages={languages}
              phone={phone}
              availabilityWindows={availabilityWindows}
              working={working}
              onFirstName={setFirstName}
              onLastName={setLastName}
              onCity={setCity}
              onHometown={setHometown}
              onBirthDate={setBirthDate}
              onWorkSummary={setWorkSummary}
              onEducationSummary={setEducationSummary}
              onLanguages={setLanguages}
              onPhone={setPhone}
              onAvailabilityWindows={setAvailabilityWindows}
              onSave={() => void saveGeneral()}
              saveError={tab === "personal" ? error : null}
              saveInfo={tab === "personal" ? info : null}
            />
          ) : null}

          {tab === "hobbies" ? (
            <ProfileHobbiesTab
              me={me}
              onSaved={load}
              onInfo={setInfo}
              onError={setError}
            />
          ) : null}

          {tab === "security" ? (
            <div className="stack" style={{ gap: 14 }}>
              <div className="stack" style={{ gap: 6, fontSize: "0.95rem" }}>
                <div>
                  <div className="muted" style={{ fontSize: "0.85em" }}>
                    User ID
                  </div>
                  <div
                    style={{
                      fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                      fontSize: "0.82rem",
                      wordBreak: "break-all",
                    }}
                  >
                    {me.id}
                  </div>
                  <button type="button" style={{ width: "auto", marginTop: 6 }} onClick={() => void copyUserId()}>
                    Copy user ID
                  </button>
                </div>
                <div>
                  <div className="muted" style={{ fontSize: "0.85em" }}>
                    Password
                  </div>
                  <div>
                    {me.passwordSet ? "Set (email login)" : "Not set — register with email to add one"}
                  </div>
                </div>
                <div>
                  <div className="muted" style={{ fontSize: "0.85em" }}>
                    Push device token
                  </div>
                  <div className="muted">{pushLabel}</div>
                </div>
              </div>

              {me.passwordSet ? (
                <div className="stack" style={{ gap: 10, paddingTop: 4, borderTop: "1px solid var(--card-border)" }}>
                  <div style={{ fontWeight: 650 }}>Change password</div>
                  <p className="muted" style={{ margin: 0, fontSize: "0.88em" }}>
                    At least 6 characters. You will stay signed in on this device.
                  </p>
                  <input
                    type="password"
                    autoComplete="current-password"
                    placeholder="Current password"
                    value={currentPw}
                    onChange={(e) => setCurrentPw(e.target.value)}
                  />
                  <input
                    type="password"
                    autoComplete="new-password"
                    placeholder="New password"
                    value={newPw}
                    onChange={(e) => setNewPw(e.target.value)}
                  />
                  <input
                    type="password"
                    autoComplete="new-password"
                    placeholder="Confirm new password"
                    value={confirmPw}
                    onChange={(e) => setConfirmPw(e.target.value)}
                  />
                  {pwMsg ? <FormError>{pwMsg}</FormError> : null}
                  <button
                    type="button"
                    disabled={pwWorking || !currentPw || !newPw || !confirmPw}
                    onClick={() => void changePassword()}
                  >
                    {pwWorking ? "Updating…" : "Update password"}
                  </button>
                </div>
              ) : null}

              <button type="button" className="danger" disabled={working || pwWorking} onClick={props.onLogout}>
                Logout
              </button>
            </div>
          ) : null}
        </>
      )}

      {error ? <FormError>{error}</FormError> : null}
      {info ? <div className="muted">{info}</div> : null}
    </div>
  );
}
