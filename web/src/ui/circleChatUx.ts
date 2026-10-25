import type { CircleMessage } from "../api/types";
import { parsePlaceSuggestMessage } from "./circleChatPlaceSuggest";
import { parseTimeSuggestMessage } from "./circleChatTimeSuggest";
export const CHAT_PLACEHOLDERS = [
  "Say something to the group...",
  "Say hi to your circle...",
  "Break the ice...",
  "Ask a quick question...",
] as const;

const GENERIC_ICEBREAKERS = [
  "Hey everyone 👋 looking forward to it",
  "Should we meet a few minutes early?",
  "Excited to join this circle",
  "Anyone been here before?",
] as const;

const HOBBY_ICEBREAKERS: Record<string, string[]> = {
  chess: ["Anyone bringing a board?", "I'm still a beginner, excited to play"],
  tennis: ["Should we warm up first?", "What level is everyone around?"],
  padel: ["Anyone need a spare racket?", "Should we book a court together?"],
  bicycle: ["What pace are people planning?", "Should we meet at the trail start?"],
  cycling: ["What pace are people planning?", "Should we meet at the trail start?"],
  cooking: ["Should we decide what to bring?", "Any dietary preferences?"],
  coffee: ["Know a good spot nearby?", "Should we grab a table first?"],
  dancing: ["What should we wear?", "Anyone new to this style?"],
  walking: ["Where exactly should we meet?", "Comfortable pace for everyone?"],
};

const PRE_MEETUP_CHIPS = [
  "Should we meet near the entrance?",
  "Is the time still good for everyone?",
  "Anyone arriving a bit early?",
  "Should we share the exact location?",
] as const;

export function isPlainMessage(body: string): boolean {
  return !parseTimeSuggestMessage(body) && !parsePlaceSuggestMessage(body);
}

export function countPlainMessages(messages: CircleMessage[]): number {
  return messages.filter((m) => isPlainMessage(m.body)).length;
}

export function isChatQuiet(messages: CircleMessage[], hours = 48): boolean {
  const plain = messages.filter((m) => isPlainMessage(m.body));
  if (plain.length === 0) return true;
  const latest = plain[plain.length - 1];
  const age = Date.now() - new Date(latest.createdAt).getTime();
  return age > hours * 3_600_000;
}

export function icebreakerChips(ritualType: string): string[] {
  const slug = ritualType.trim().toLowerCase().replace(/-/g, "_");
  const hobby = HOBBY_ICEBREAKERS[slug] ?? [];
  const merged = [...hobby, ...GENERIC_ICEBREAKERS];
  const unique: string[] = [];
  for (const line of merged) {
    if (!unique.includes(line)) unique.push(line);
    if (unique.length >= 4) break;
  }
  return unique;
}

export function suggestedFirstMessage(ritualType: string): string {
  const slug = ritualType.trim().toLowerCase().replace(/-/g, "_");
  const hobby = HOBBY_ICEBREAKERS[slug]?.[0];
  if (hobby) return hobby;
  return "Hey, looking forward to meeting everyone!";
}

export function coordinationChips(ritualType: string): string[] {
  const slug = ritualType.trim().toLowerCase().replace(/-/g, "_");
  const hobby = HOBBY_ICEBREAKERS[slug]?.[0];
  return [...PRE_MEETUP_CHIPS, ...(hobby ? [hobby] : [])].slice(0, 4);
}

export function systemPrompts(input: { memberCount: number; plainCount: number }): string[] {
  if (input.plainCount === 0 && input.memberCount > 1) return ["Say hi to get the conversation started"];
  return [];
}

export function silenceRecoveryLines(): string[] {
  return [
    "Want to break the ice?",
    "A quick hello can make the meetup feel easier",
  ];
}

export function ownerOnlyCircle(memberCount: number): boolean {
  return memberCount <= 1;
}

export function canMemberSuggest(memberCount: number, isCreator: boolean): boolean {
  return !isCreator && memberCount > 1;
}
