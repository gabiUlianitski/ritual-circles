import React, { useState } from "react";
import type { CircleResponse } from "../api/types";
import { CircleCreationSuccess } from "./CircleCreationSuccess";
import { CreateCircleWizard } from "./CreateCircleWizard";

export function CreateJoinCircle(props: {
  onDone: (joinedCircleId?: string) => Promise<void> | void;
  /** Called when the circle was created but the response had no id. */
  onCreated: (createdCircleId: string | null) => Promise<void> | void;
  /** Open the circle that was just created. Details is view; scheduled is the existing editor. */
  onOpenCircle: (circleId: string, tab: "details" | "scheduled") => Promise<void> | void;
  onBack: () => void;
  /** When opening from Circles → join flow */
  initialTab?: "create" | "join";
  /** Pre-fill the When step date (YYYY-MM-DD) */
  initialMeetDate?: string;
  initialHobbySlug?: string;
  initialHobbySubtype?: string | null;
  initialHobbyLevel?: string | null;
}) {
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdCircle, setCreatedCircle] = useState<CircleResponse | null>(null);
  const [createdMeetingAt, setCreatedMeetingAt] = useState<string | null>(null);

  if (createdCircle?.id) {
    return (
      <CircleCreationSuccess
        circle={createdCircle}
        meetingAt={createdMeetingAt}
        onViewCircle={() => props.onOpenCircle(createdCircle.id, "details")}
        onEditCircle={() => props.onOpenCircle(createdCircle.id, "scheduled")}
      />
    );
  }

  return (
    <div className="card stack">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div className="h1">Circle</div>
        <button style={{ width: "auto" }} onClick={props.onBack} disabled={working}>
          Back
        </button>
      </div>

      <CreateCircleWizard
          onDone={async (created, firstSessionAt) => {
            if (!created?.id?.trim()) {
              await props.onCreated(null);
              return;
            }
            setCreatedMeetingAt(firstSessionAt?.trim() || null);
            setCreatedCircle(created);
          }}
          working={working}
          setWorking={setWorking}
          error={error}
          setError={setError}
          initialMeetDate={props.initialMeetDate}
          initialHobbySlug={props.initialHobbySlug}
          initialHobbySubtype={props.initialHobbySubtype}
          initialHobbyLevel={props.initialHobbyLevel}
        />
    </div>
  );
}
