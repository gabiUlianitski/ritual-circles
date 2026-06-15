import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../api/client";
import type { HomeResponse } from "../../api/types";
import {
  clearOnboardingFlow,
  getOnboardingStep,
  setOnboardingStep,
  type OnboardingStep,
} from "../../onboarding/onboardingState";
import { InterestsSelection } from "./InterestsSelection";
import { OnboardingHome } from "./OnboardingHome";
import { RecommendedCircles } from "./RecommendedCircles";

export function OnboardingFlow(props: {
  home: HomeResponse;
  onRefresh: () => Promise<void> | void;
  onGoCreateJoin: () => void;
}) {
  const [step, setStep] = useState<OnboardingStep>(() => getOnboardingStep());
  const [interestSlugs, setInterestSlugs] = useState<string[]>([]);

  function goTo(next: OnboardingStep) {
    setOnboardingStep(next);
    setStep(next);
  }

  function startCreate() {
    clearOnboardingFlow();
    props.onGoCreateJoin();
  }

  async function saveInterests(slugs: string[]) {
    await api.patchMe({
      userHobies: slugs.map((slug) => ({ slug, subtype: null, level: null })),
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
      onFindCircles={() => goTo("interests")}
      onCreateCircle={startCreate}
    />
  );
}
