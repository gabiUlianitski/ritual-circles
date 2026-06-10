import type { CircleMemberResponse } from "../api/types";
import { userDisplayLabel } from "../userDisplay";

/** One row per user id (defensive; API should already be unique). */
export function dedupeMembers(members: readonly CircleMemberResponse[]): CircleMemberResponse[] {
  const byId = new Map<string, CircleMemberResponse>();
  for (const m of members) {
    if (!byId.has(m.id)) byId.set(m.id, m);
  }
  return [...byId.values()].sort((a, b) => userDisplayLabel(a).localeCompare(userDisplayLabel(b)));
}

/** When labels collide, show @user_name for clarity. */
export function memberDisplayName(
  member: CircleMemberResponse,
  all: readonly CircleMemberResponse[],
): string {
  const label = userDisplayLabel(member);
  const key = label.toLowerCase();
  const sameLabel = all.filter((m) => userDisplayLabel(m).toLowerCase() === key);
  if (sameLabel.length <= 1) return label;
  return `${label} (@${member.user_name})`;
}
