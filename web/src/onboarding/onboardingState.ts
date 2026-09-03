import type { HomeResponse, UserHobyPreference } from "../api/types";

export type OnboardingStep = "welcome" | "interests" | "recommended";

const STEP_KEY = "onboarding_step";
const CHECKLIST_DISMISSED_KEY = "onboarding_checklist_dismissed";

/** No circles, no sessions — empty home. */
export function isNewUser(home: HomeResponse): boolean {
  const circles = home.myCircles ?? [];
  const sessions = home.calendarSessions ?? [];
  return circles.length === 0 && sessions.length === 0 && home.circle == null;
}

/** Full 3-step welcome: guests always; signed-in users only until first login. */
export function shouldShowWelcomeTutorial(
  home: HomeResponse,
  opts: { guest?: boolean; meLoaded: boolean; onboardingCompleted?: boolean },
): boolean {
  if (opts.guest) return true;
  if (!opts.meLoaded) return false;
  if (opts.onboardingCompleted) return false;
  return isNewUser(home);
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

export type ChecklistProgress = {
  joinedCircle: boolean;
  createdCircle: boolean;
  interests: boolean;
};

export function getChecklistProgress(
  home: HomeResponse,
  userHobies: UserHobyPreference[],
): ChecklistProgress {
  const circles = home.myCircles ?? [];
  return {
    joinedCircle: circles.some((item) => !item.isCreator),
    createdCircle: circles.some((item) => item.isCreator === true),
    interests: userHobies.length > 0,
  };
}

export function checklistComplete(progress: ChecklistProgress): boolean {
  return progress.joinedCircle && progress.createdCircle && progress.interests;
}

export function isChecklistDismissed(): boolean {
  return localStorage.getItem(CHECKLIST_DISMISSED_KEY) === "1";
}

export function dismissChecklist() {
  localStorage.setItem(CHECKLIST_DISMISSED_KEY, "1");
}

export function shouldShowChecklist(progress: ChecklistProgress, dismissed: boolean): boolean {
  return !dismissed && !checklistComplete(progress);
}
