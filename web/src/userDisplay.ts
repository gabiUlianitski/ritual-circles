export type UserNameFields = {
  user_name: string;
  first_name: string;
  last_name: string;
};

export function userFullName(u: Pick<UserNameFields, "first_name" | "last_name">): string {
  return [u.first_name, u.last_name].map((s) => s?.trim()).filter(Boolean).join(" ");
}

export function userDisplayLabel(u: UserNameFields): string {
  const full = userFullName(u);
  return full || u.user_name?.trim() || "Unknown";
}
