import React, { useEffect, useState } from "react";
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
  onGoFindCircles?: () => void;
  guest?: boolean;
  onRegisterRequest?: (notice?: string) => void;
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
      onFindCircles={props.guest ? () => props.onGoFindCircles?.() : () => goTo("interests")}
      onCreateCircle={startCreate}
    />
  );
}
