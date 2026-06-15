import type { HomeResponse, UserHobyPreference } from "../api/types";

export type OnboardingStep = "welcome" | "interests" | "recommended";

const STEP_KEY = "onboarding_step";
const CHAT_HELLO_KEY = "onboarding_chat_hello";

/** No circles, no sessions — brand-new user. */
export function isNewUser(home: HomeResponse): boolean {
  const circles = home.myCircles ?? [];
  const sessions = home.calendarSessions ?? [];
  return circles.length === 0 && sessions.length === 0 && home.circle == null;
}

export function getOnboardingStep(): OnboardingStep {
  const raw = localStorage.getItem(STEP_KEY);
  if (raw === "interests" || raw === "recommended") return raw;
  return "welcome";
}

export function setOnboardingStep(step: OnboardingStep) {
  localStorage.setItem(STEP_KEY, step);
}

export function clearOnboardingFlow() {
  localStorage.removeItem(STEP_KEY);
}

export function markOnboardingChatHello() {
  localStorage.setItem(CHAT_HELLO_KEY, "1");
}

export type ChecklistProgress = {
  interests: boolean;
  joinedCircle: boolean;
  scheduledActivity: boolean;
  saidHello: boolean;
};

export function getChecklistProgress(
  home: HomeResponse,
  userHobies: UserHobyPreference[],
): ChecklistProgress {
  return {
    interests: userHobies.length > 0,
    joinedCircle: (home.myCircles?.length ?? 0) > 0,
    scheduledActivity: (home.calendarSessions?.length ?? 0) > 0,
    saidHello: localStorage.getItem(CHAT_HELLO_KEY) === "1",
  };
}

export function checklistComplete(progress: ChecklistProgress): boolean {
  return progress.interests && progress.joinedCircle && progress.scheduledActivity && progress.saidHello;
}

export function shouldShowChecklist(home: HomeResponse, progress: ChecklistProgress): boolean {
  if (isNewUser(home)) return false;
  return !checklistComplete(progress);
}
