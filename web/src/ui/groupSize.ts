export type GroupSizeType = "fixed" | "max" | "min" | "range";

export type GroupSizePayload = {
  type: GroupSizeType;
  min?: number;
  max?: number;
};

export type GroupSizeState = {
  type: GroupSizeType;
  fixedCount: number;
  maxCount: number;
  minCount: number;
  rangeMin: number;
  rangeMax: number;
};

export const DEFAULT_GROUP_SIZE: GroupSizeState = {
  type: "max",
  fixedCount: 2,
  maxCount: 6,
  minCount: 2,
  rangeMin: 2,
  rangeMax: 6,
};

function parsePositiveInt(value: number): number | null {
  if (!Number.isFinite(value) || value <= 0 || !Number.isInteger(value)) return null;
  return value;
}

export function toGroupSizePayload(state: GroupSizeState): GroupSizePayload {
  switch (state.type) {
    case "fixed": {
      const n = parsePositiveInt(state.fixedCount)!;
      return { type: "fixed", min: n, max: n };
    }
    case "max":
      return { type: "max", max: parsePositiveInt(state.maxCount)! };
    case "min":
      return { type: "min", min: parsePositiveInt(state.minCount)! };
    case "range":
      return {
        type: "range",
        min: parsePositiveInt(state.rangeMin)!,
        max: parsePositiveInt(state.rangeMax)!,
      };
  }
}

export function validateGroupSize(state: GroupSizeState): string | null {
  switch (state.type) {
    case "fixed":
      if (parsePositiveInt(state.fixedCount) == null) return "Please enter a valid number";
      return null;
    case "max":
      if (parsePositiveInt(state.maxCount) == null) return "Please enter a valid number";
      return null;
    case "min":
      if (parsePositiveInt(state.minCount) == null) return "Please enter a valid number";
      return null;
    case "range": {
      const min = parsePositiveInt(state.rangeMin);
      const max = parsePositiveInt(state.rangeMax);
      if (min == null || max == null) return "Please enter a valid number";
      if (min > max) return "Minimum must be less than maximum";
      return null;
    }
  }
}

/** Headcount used to estimate split cost at circle creation. */
export function groupSizeSplitDivisor(state: GroupSizeState): number {
  switch (state.type) {
    case "fixed":
      return state.fixedCount;
    case "min":
      return state.minCount;
    case "max":
      return state.maxCount;
    case "range":
      return state.rangeMin;
  }
}

export function splitCostMayDecrease(state: GroupSizeState): boolean {
  return state.type === "min" || state.type === "max" || state.type === "range";
}

export function formatGroupSizeSummary(payload: GroupSizePayload): string {
  switch (payload.type) {
    case "fixed":
      return `Exactly ${payload.min ?? payload.max} people`;
    case "max":
      return `Up to ${payload.max} people`;
    case "min":
      return `At least ${payload.min} people`;
    case "range":
      return `Between ${payload.min} and ${payload.max} people`;
  }
}

/** Upper bound on how many people can join, given the group-size preference. */
export function effectiveGroupSizeCap(state: GroupSizeState): number {
  const cap = 6;
  switch (state.type) {
    case "fixed":
      return Math.min(cap, state.fixedCount);
    case "max":
      return Math.min(cap, state.maxCount);
    case "min":
      return cap;
    case "range":
      return Math.min(cap, state.rangeMax);
  }
}

export function validateGroupSizeForMembers(state: GroupSizeState, memberCount: number): string | null {
  const base = validateGroupSize(state);
  if (base) return base;
  const cap = effectiveGroupSizeCap(state);
  if (memberCount > cap) {
    return `You already have ${memberCount} members — set the limit to at least ${memberCount}.`;
  }
  return null;
}

export function groupSizeStateFromPayload(payload: GroupSizePayload | null | undefined): GroupSizeState {
  if (!payload) return { ...DEFAULT_GROUP_SIZE };
  const base: GroupSizeState = { ...DEFAULT_GROUP_SIZE, type: payload.type };
  switch (payload.type) {
    case "fixed":
      return { ...base, fixedCount: payload.min ?? payload.max ?? DEFAULT_GROUP_SIZE.fixedCount };
    case "max":
      return { ...base, maxCount: payload.max ?? DEFAULT_GROUP_SIZE.maxCount };
    case "min":
      return { ...base, minCount: payload.min ?? DEFAULT_GROUP_SIZE.minCount };
    case "range":
      return {
        ...base,
        rangeMin: payload.min ?? DEFAULT_GROUP_SIZE.rangeMin,
        rangeMax: payload.max ?? DEFAULT_GROUP_SIZE.rangeMax,
      };
  }
}
