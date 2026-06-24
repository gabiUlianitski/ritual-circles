export type CircleParticipationState = {
  isFull: boolean;
  /** Medium emphasis — e.g. "2 people are in" */
  peopleInLine: string | null;
  /** Light secondary — e.g. "(+1 spot left)" */
  spotsLeftLine: string | null;
};

export function formatSpotsLeftLine(spotsLeft: number): string | null {
  if (spotsLeft <= 0) return null;
  if (spotsLeft === 1) return "(+1 spot left)";
  return `(+${spotsLeft} spots left)`;
}

export function formatPeopleInLine(memberCount: number): string | null {
  const joined = Math.max(0, memberCount);
  if (joined <= 1) return null;
  return joined === 2 ? "2 people are in" : `${joined} people are in`;
}

/** Owner counts as joined. Never surfaces empty-circle or RSVP-style copy. */
export function circleParticipationState(memberCount: number, maxSize: number): CircleParticipationState {
  const joined = Math.max(0, memberCount);
  const capacity = Math.max(1, maxSize);
  const spotsLeft = capacity - joined;

  if (joined >= capacity) {
    return { isFull: true, peopleInLine: null, spotsLeftLine: null };
  }

  if (joined <= 1) {
    return {
      isFull: false,
      peopleInLine: null,
      spotsLeftLine: formatSpotsLeftLine(spotsLeft),
    };
  }

  return {
    isFull: false,
    peopleInLine: formatPeopleInLine(joined),
    spotsLeftLine: formatSpotsLeftLine(spotsLeft),
  };
}

/** True when a new member can still join (under maxSize). */
export function isCircleJoinable(memberCount: number, maxSize: number): boolean {
  const capacity = Math.max(1, maxSize);
  return Math.max(0, memberCount) < capacity;
}
