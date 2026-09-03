import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../api/client";
import type { Hoby, HomeResponse } from "../../api/types";
import { parseHobyLevelKey } from "../hobyLevelKey";
import { parseHobyLevelsFlat } from "../hobyMetadata";
import {
  clearOnboardingFlow,
  getOnboardingStep,
  setOnboardingStep,
  type OnboardingStep,
} from "../../onboarding/onboardingState";
import { InterestsSelection } from "./InterestsSelection";
import { OnboardingHome } from "./OnboardingHome";
import { RecommendedCircles } from "./RecommendedCircles";

/** Lowest catalogue level for a hobby, so a new member can join circles. */
function entryLevelForHoby(hobies: Hoby[], slug: string): string | number {
  const target = slug.trim().toLowerCase();
  const match = hobies.find((h) => h.slug.trim().toLowerCase() === target);
  const first = parseHobyLevelsFlat(match?.levels)[0]?.key;
  return (first ? parseHobyLevelKey(first) : null) ?? "beginner";
}

export function OnboardingFlow(props: {
  home: HomeResponse;
  onRefresh: () => Promise<void> | void;
  onGoCreateJoin: () => void;
  onGoFindCircles?: () => void;
  guest?: boolean;
  onRegisterRequest?: (notice?: string) => void;
  onBackToAuth?: () => void;
}) {
  const { t } = useTranslation();
  const [step, setStep] = useState<OnboardingStep>(() => (props.guest ? "welcome" : getOnboardingStep()));
  const [interestSlugs, setInterestSlugs] = useState<string[]>([]);

  useEffect(() => {
    if (props.guest) return;
    void api.patchMe({ onboardingCompleted: true }).catch(() => {});
  }, [props.guest]);

  function goTo(next: OnboardingStep) {
    setOnboardingStep(next);
    setStep(next);
  }

  function startCreate() {
    clearOnboardingFlow();
    props.onGoCreateJoin();
  }

  async function saveInterests(slugs: string[]) {
    if (props.guest) {
      props.onRegisterRequest?.(t("guest.noticeSaveInterests"));
      return;
    }
    // Joining requires a level on the hobby, so start everyone at the entry level.
    const hobies = await api.getHobies().catch(() => [] as Hoby[]);
    await api.patchMe({
      userHobies: slugs.map((slug) => ({
        slug,
        subtype: null,
        level: entryLevelForHoby(hobies, slug),
      })),
    });
    setInterestSlugs(slugs);
    goTo("recommended");
  }

  async function afterJoin() {
    clearOnboardingFlow();
    await props.onRefresh();
  }

  if (step === "interests") {
    return (
      <InterestsSelection
        initialSelected={interestSlugs}
        onBack={() => goTo("welcome")}
        onContinue={saveInterests}
      />
    );
  }

  if (step === "recommended") {
    return (
      <RecommendedCircles
        interestSlugs={interestSlugs}
        onBack={() => goTo("interests")}
        onCreateCircle={startCreate}
        onJoined={() => void afterJoin()}
      />
    );
  }

  return (
    <OnboardingHome
      onFindCircles={props.guest ? () => props.onGoFindCircles?.() : () => goTo("interests")}
      onCreateCircle={startCreate}
      showStep={!props.guest}
      onBackToAuth={props.guest ? props.onBackToAuth : undefined}
    />
  );
}
