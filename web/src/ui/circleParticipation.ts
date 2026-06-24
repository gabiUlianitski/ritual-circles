const DEFAULT_MAX_SIZE = 6;

export type CircleParticipationState = {
  isFull: boolean;
  joined: number;
  capacity: number;
  /** Medium emphasis — e.g. "2 people are in" */
  peopleInLine: string | null;
  /** Light secondary — e.g. "(+1 spot left)" */
  spotsLeftLine: string | null;
};

export function normalizeMemberCount(memberCount: unknown): number {
  const value = Number(memberCount);
  return Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;
}

export function normalizeMaxSize(maxSize: unknown): number {
  const value = Number(maxSize);
  return Number.isFinite(value) && value >= 1 ? Math.floor(value) : DEFAULT_MAX_SIZE;
}

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
export function circleParticipationState(memberCount: unknown, maxSize: unknown): CircleParticipationState {
  const joined = normalizeMemberCount(memberCount);
  const capacity = normalizeMaxSize(maxSize);
  const spotsLeft = capacity - joined;

  if (joined >= capacity) {
    return { isFull: true, joined, capacity, peopleInLine: null, spotsLeftLine: null };
  }

  if (joined <= 1) {
    return {
      isFull: false,
      joined,
      capacity,
      peopleInLine: null,
      spotsLeftLine: formatSpotsLeftLine(spotsLeft),
    };
  }

  return {
    isFull: false,
    joined,
    capacity,
    peopleInLine: formatPeopleInLine(joined),
    spotsLeftLine: formatSpotsLeftLine(spotsLeft),
  };
}

/** True when a new member can still join (under maxSize). */
export function isCircleJoinable(memberCount: unknown, maxSize: unknown): boolean {
  const joined = normalizeMemberCount(memberCount);
  const capacity = normalizeMaxSize(maxSize);
  return joined < capacity;
}
