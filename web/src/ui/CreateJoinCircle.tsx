import React, { useState } from "react";
import { api } from "../api/client";
import { FormError } from "./FormError";
import { CreateCircleWizard } from "./CreateCircleWizard";

export function CreateJoinCircle(props: {
  onDone: () => Promise<void> | void;
  onBack: () => void;
  /** When opening from Circles → join flow */
  initialTab?: "create" | "join";
  /** Pre-fill the When step date (YYYY-MM-DD) */
  initialMeetDate?: string;
}) {
  const [tab, setTab] = useState<"create" | "join">(() => props.initialTab ?? "create");
  const [inviteCode, setInviteCode] = useState("");
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function join() {
    setWorking(true);
    setError(null);
    try {
      await api.joinCircle(inviteCode.trim());
      await props.onDone();
    } catch (e) {
      setError(String(e));
    } finally {
      setWorking(false);
    }
  }

  return (
    <div className="card stack">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div className="h1">Circle</div>
        <button style={{ width: "auto" }} onClick={props.onBack} disabled={working}>
          Back
        </button>
      </div>

      {tab === "join" ? (
        <div className="row create-join-mode-tabs">
          <button className={tab === "create" ? "primary" : ""} onClick={() => setTab("create")} disabled={working}>
            Create
          </button>
          <button className={tab === "join" ? "primary" : ""} onClick={() => setTab("join")} disabled={working}>
            Join
          </button>
        </div>
      ) : null}

      {tab === "create" ? (
        <CreateCircleWizard
          onDone={props.onDone}
          working={working}
          setWorking={setWorking}
          error={error}
          setError={setError}
          initialMeetDate={props.initialMeetDate}
        />
      ) : (
        <>
          <input placeholder="Invite code" value={inviteCode} onChange={(e) => setInviteCode(e.target.value)} />
          {error ? <FormError>{error}</FormError> : null}
          <button className="primary" disabled={working || !inviteCode.trim()} onClick={() => void join()}>
            {working ? "Working…" : "Join circle"}
          </button>
        </>
      )}
    </div>
  );
}
