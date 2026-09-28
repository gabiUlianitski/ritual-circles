import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useGoogleLogin } from "@react-oauth/google";
import { api, setAuthToken } from "../api/client";
import type { CitySuggestItem } from "../api/types";
import { CityAutocompleteField } from "./CityAutocompleteField";
import { FormError } from "./FormError";
import { LandingChoose } from "./LandingChoose";
import {
  CircleCluster,
  FeatureRow,
  PrimaryButton,
  SecondaryButton,
  WelcomeActions,
  WelcomeDescription,
  WelcomeDivider,
  WelcomeHeadline,
  WelcomePageShell,
  WelcomeReassurance,
  WelcomeTextAction,
} from "./welcome/WelcomeUIKit";

function FieldBlock(props: { id: string; label: string; optional?: string; children: React.ReactNode }) {
  return (
    <div className="welcome-field-block">
      <label className="welcome-field-caption" htmlFor={props.id}>
        {props.label}
        {props.optional ? <span> ({props.optional})</span> : null}
      </label>
      {props.children}
    </div>
  );
}

function GoogleWelcomeButton(props: {
  label: string;
  disabled?: boolean;
  onSuccess: (accessToken: string | undefined) => void;
  onError: () => void;
}) {
  const login = useGoogleLogin({
    scope: "openid email profile",
    onSuccess: (res) => props.onSuccess(res.access_token),
    onError: () => props.onError(),
  });

  return (
    <button
      type="button"
      className="welcome-btn welcome-btn--secondary"
      disabled={props.disabled}
      onClick={() => login()}
    >
      {props.label}
    </button>
  );
}

type LoginMode = "choose" | "login" | "register" | "google-setup";

export function Login(props: {
  onAuthed: () => Promise<void> | void;
  loading: boolean;
  googleClientId?: string;
  /** Start read-only browsing without an account. */
  onGuest?: () => void;
  /** Shown when the user was sent here from a guest action that needs an account. */
  notice?: string | null;
  /** Return to guest browsing instead of signing in. */
  onKeepLooking?: () => void;
  initialMode?: "login" | "register";
}) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<LoginMode>(props.initialMode ?? "choose");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [cityQuery, setCityQuery] = useState("");
  const [citySelected, setCitySelected] = useState("");

  const [googleRegToken, setGoogleRegToken] = useState<string | null>(null);
  const [googleEmail, setGoogleEmail] = useState("");

  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [fetchedGoogleClientId, setFetchedGoogleClientId] = useState("");
  const googleClientId = props.googleClientId?.trim() || fetchedGoogleClientId;
  const googleEnabled = Boolean(googleClientId);

  useEffect(() => {
    if (props.googleClientId?.trim()) return;
    void (async () => {
      try {
        const cfg = await api.getAuthConfig();
        if (cfg.googleClientId?.trim()) setFetchedGoogleClientId(cfg.googleClientId.trim());
      } catch {
        /* no Google button */
      }
    })();
  }, [props.googleClientId]);

  function pickCity(item: CitySuggestItem) {
    const name = item.shortName.trim() || item.displayName.trim();
    setCityQuery(name);
    setCitySelected(name);
  }

  function validateRegister(): string | null {
    if (!firstName.trim()) return "Please enter your first name.";
    if (password.length < 6) return "Choose a password of at least 6 characters.";
    const em = email.trim();
    if (!em || !em.includes("@")) return "Please enter a valid email address.";
    return null;
  }

  function validateGoogleSetup(): string | null {
    if (!firstName.trim()) return "Please enter your first name.";
    if (!googleRegToken) return "Google sign-in expired — try again.";
    return null;
  }

  async function finishAuth(token: string) {
    setAuthToken(token);
    await props.onAuthed();
  }

  async function handleGoogleCredential(accessToken: string | undefined) {
    if (!accessToken) {
      setError("Google sign-in did not return a token. Try again.");
      return;
    }
    setWorking(true);
    setError(null);
    try {
      const res = await api.googleAuth({ accessToken });
      if (res.status === "authenticated" && res.token) {
        await finishAuth(res.token);
        return;
      }
      if (res.status === "needs_profile" && res.registrationToken) {
        setGoogleRegToken(res.registrationToken);
        setGoogleEmail(res.email?.trim() ?? "");
        setEmail(res.email?.trim() ?? "");
        setFirstName(res.firstName?.trim() ?? "");
        setLastName(res.lastName?.trim() ?? "");
        setMode("google-setup");
        return;
      }
      setError("Unexpected response from Google sign-in.");
    } catch (e) {
      setError(String(e));
    } finally {
      setWorking(false);
    }
  }

  async function submitGoogleSetup() {
    const v = validateGoogleSetup();
    if (v) {
      setError(v);
      return;
    }
    setWorking(true);
    setError(null);
    try {
      const { token } = await api.googleAuthComplete({
        registrationToken: googleRegToken!,
        first_name: firstName.trim(),
        last_name: lastName.trim() ? lastName.trim() : null,
        city: (citySelected || cityQuery).trim() || null,
        availability_day: "Mon",
        availability_time: "18:00:00",
      });
      await finishAuth(token);
    } catch (e) {
      setError(String(e));
    } finally {
      setWorking(false);
    }
  }

  async function submit() {
    setWorking(true);
    setError(null);
    try {
      if (mode === "google-setup") {
        await submitGoogleSetup();
        return;
      }
      if (mode === "login") {
        if (password.length < 6) {
          setError("Choose a password of at least 6 characters.");
          return;
        }
        const ident = email.trim();
        if (!ident || !ident.includes("@")) {
          setError(t("login.needEmailOrUsername"));
          return;
        }
        const { token } = await api.login({ email: ident, password });
        await finishAuth(token);
      } else {
        const v = validateRegister();
        if (v) {
          setError(v);
          return;
        }
        const { token } = await api.register({
          email: email.trim(),
          password,
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          city: (citySelected || cityQuery).trim() || null,
          availability_day: "Mon",
          availability_time: "18:00:00",
        });
        await finishAuth(token);
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setWorking(false);
    }
  }

  const registerReady = firstName.trim().length > 0 && password.length >= 6 && email.trim().includes("@");

  const googleSetupReady = firstName.trim().length > 0;

  if (mode === "choose") {
    const lookAround = props.onKeepLooking ?? props.onGuest;
    return (
      <LandingChoose
        notice={props.notice}
        disabled={props.loading || working}
        lookAroundDisabled={!lookAround}
        onSignIn={() => {
          setError(null);
          setMode("login");
        }}
        onCreateAccount={() => {
          setError(null);
          setMode("register");
        }}
        onLookAround={() => {
          if (lookAround) lookAround();
        }}
      />
    );
  }

  if (mode === "google-setup") {
    return (
      <WelcomePageShell surfaceAriaLabelledBy="google-setup-title">
        <CircleCluster />
        <WelcomeHeadline id="google-setup-title">Finish your account</WelcomeHeadline>
        <WelcomeDescription>
          Signed in with Google as {googleEmail || email}. Add your name to finish. You'll sign in with this email.
        </WelcomeDescription>
        <div className="welcome-form">
          <FieldBlock id="google-first-name" label={t("login.firstName")}>
            <input
              id="google-first-name"
              className="welcome-field"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              autoComplete="given-name"
            />
          </FieldBlock>
          <FieldBlock id="google-last-name" label={t("login.lastName")} optional={t("login.optional")}>
            <input
              id="google-last-name"
              className="welcome-field"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              autoComplete="family-name"
            />
          </FieldBlock>
          <FieldBlock id="google-city" label={t("login.city")} optional={t("login.optional")}>
            <CityAutocompleteField
              id="google-city"
              hideLabel
              compact
              value={cityQuery}
              selectedDisplay={citySelected}
              onValueChange={(q) => {
                setCityQuery(q);
                setCitySelected("");
              }}
              onSelect={(item) => pickCity(item)}
            />
          </FieldBlock>
          {error ? <FormError>{error}</FormError> : null}
        </div>
        <WelcomeActions>
          <PrimaryButton
            disabled={props.loading || working || !googleSetupReady}
            onClick={() => void submit()}
          >
            {working ? t("common.working") : t("welcome.createAccount")}
          </PrimaryButton>
          <SecondaryButton
            disabled={working}
            onClick={() => {
              setMode("login");
              setGoogleRegToken(null);
              setError(null);
            }}
          >
            {t("common.cancel")}
          </SecondaryButton>
        </WelcomeActions>
        <FeatureRow variant="welcome" />
        <WelcomeReassurance>{t("welcome.reassurance")}</WelcomeReassurance>
      </WelcomePageShell>
    );
  }

  const titleId = mode === "login" ? "sign-in-title" : "create-account-title";
  const title = mode === "login" ? t("welcome.signIn") : t("welcome.createAccount");
  const lead = mode === "login" ? t("login.subtitle") : t("login.registerLead");

  return (
    <WelcomePageShell surfaceAriaLabelledBy={titleId}>
      <CircleCluster />
      {props.notice ? <p className="welcome-notice">{props.notice}</p> : null}
      <WelcomeHeadline id={titleId}>{title}</WelcomeHeadline>
      <WelcomeDescription>{lead}</WelcomeDescription>

      <div className="welcome-form">
        {mode === "login" ? (
          <>
            <input
              className="welcome-field"
              placeholder={t("login.email")}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
            />
            <input
              className="welcome-field"
              placeholder={t("login.password")}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          </>
        ) : null}

        {mode === "register" ? (
          <>
            <FieldBlock id="register-email" label={t("login.email")}>
              <input
                id="register-email"
                className="welcome-field"
                placeholder={t("login.email")}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
              />
            </FieldBlock>
            <FieldBlock id="register-password" label={t("login.password")}>
              <input
                id="register-password"
                className="welcome-field"
                placeholder={t("login.password")}
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
              />
            </FieldBlock>
            <FieldBlock id="register-first-name" label={t("login.firstName")}>
              <input
                id="register-first-name"
                className="welcome-field"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                autoComplete="given-name"
              />
            </FieldBlock>
            <FieldBlock id="register-last-name" label={t("login.lastName")} optional={t("login.optional")}>
              <input
                id="register-last-name"
                className="welcome-field"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                autoComplete="family-name"
              />
            </FieldBlock>
            <FieldBlock id="register-city" label={t("login.city")} optional={t("login.optional")}>
              <CityAutocompleteField
                id="register-city"
                hideLabel
                compact
                value={cityQuery}
                selectedDisplay={citySelected}
                onValueChange={(q) => {
                  setCityQuery(q);
                  setCitySelected("");
                }}
                onSelect={(item) => pickCity(item)}
              />
            </FieldBlock>
          </>
        ) : null}

        {error ? <FormError>{error}</FormError> : null}
      </div>

      <WelcomeActions>
        <PrimaryButton
          disabled={
            props.loading ||
            working ||
            !email.trim() ||
            !password ||
            password.length < 6 ||
            (mode === "register" && !registerReady)
          }
          onClick={() => void submit()}
        >
          {working ? t("common.working") : title}
        </PrimaryButton>

        <SecondaryButton
          disabled={working}
          onClick={() => {
            setMode((m) => (m === "login" ? "register" : "login"));
            setError(null);
          }}
        >
          {mode === "login" ? t("welcome.createAccount") : t("welcome.signIn")}
        </SecondaryButton>

        {googleEnabled ? (
          <GoogleWelcomeButton
            label={t("login.continueWithGoogle")}
            disabled={props.loading || working}
            onSuccess={(accessToken) => void handleGoogleCredential(accessToken)}
            onError={() => setError("Google sign-in was cancelled or failed.")}
          />
        ) : null}

        <WelcomeDivider label={t("welcome.or")} />

        <WelcomeTextAction
          disabled={working}
          onClick={() => {
            setError(null);
            setMode("choose");
          }}
        >
          {t("common.back")}
        </WelcomeTextAction>
      </WelcomeActions>

      <FeatureRow variant="welcome" />
      <WelcomeReassurance>{t("welcome.reassurance")}</WelcomeReassurance>
    </WelcomePageShell>
  );
}
