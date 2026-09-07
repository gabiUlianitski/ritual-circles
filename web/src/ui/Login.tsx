import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { GoogleLogin } from "@react-oauth/google";
import { api, setAuthToken } from "../api/client";
import { FormError } from "./FormError";
import { LandingChoose } from "./LandingChoose";
import { LandingIllustration } from "./LandingIllustration";
import { LandingLogo } from "./LandingLogo";

const USER_NAME_RE = /^[a-zA-Z0-9_]{3,32}$/;

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

  const [userName, setUserName] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [city, setCity] = useState("");

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

  useEffect(() => {
    if (mode !== "google-setup" || userName.trim()) return;
    const base = googleEmail.split("@")[0]?.replace(/[^a-zA-Z0-9_]/g, "_").slice(0, 32);
    if (base && base.length >= 3) setUserName(base.toLowerCase());
  }, [mode, googleEmail, userName]);

  function validateRegister(): string | null {
    const un = userName.trim();
    if (!USER_NAME_RE.test(un)) {
      return "Username must be 3–32 characters: letters, numbers, and underscore only.";
    }
    if (!firstName.trim()) return "Please enter your first name.";
    if (password.length < 6) return "Choose a password of at least 6 characters.";
    const em = email.trim();
    if (!em || !em.includes("@")) return "Please enter a valid email address.";
    return null;
  }

  function validateGoogleSetup(): string | null {
    const un = userName.trim();
    if (!USER_NAME_RE.test(un)) {
      return "Username must be 3–32 characters: letters, numbers, and underscore only.";
    }
    if (!firstName.trim()) return "Please enter your first name.";
    if (!googleRegToken) return "Google sign-in expired — try again.";
    return null;
  }

  async function finishAuth(token: string) {
    setAuthToken(token);
    await props.onAuthed();
  }

  async function handleGoogleCredential(idToken: string | undefined) {
    if (!idToken) {
      setError("Google sign-in did not return a token. Try again.");
      return;
    }
    setWorking(true);
    setError(null);
    try {
      const res = await api.googleAuth({ idToken });
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
        user_name: userName.trim().toLowerCase(),
        first_name: firstName.trim(),
        last_name: lastName.trim() ? lastName.trim() : null,
        city: city.trim() ? city.trim() : null,
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
        if (!ident) {
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
          user_name: userName.trim().toLowerCase(),
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          city: city.trim() ? city.trim() : null,
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

  const registerReady =
    USER_NAME_RE.test(userName.trim()) && firstName.trim().length > 0 && password.length >= 6;

  const googleSetupReady = USER_NAME_RE.test(userName.trim()) && firstName.trim().length > 0;

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
      <div className="landing-screen">
        <div className="landing-screen-inner landing-form">
          <LandingLogo />
          <h1 className="landing-form-title">Finish your account</h1>
          <p className="landing-form-lead">
            Signed in with Google as <strong>{googleEmail || email}</strong>. Pick a username — this is how others find
            you in the app.
          </p>
          <input
            className="landing-input"
            placeholder="Username (unique, e.g. gabi_tennis)"
            value={userName}
            onChange={(e) => setUserName(e.target.value.replace(/\s/g, "_"))}
            autoComplete="username"
          />
          <input
            className="landing-input"
            placeholder="First name"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            autoComplete="given-name"
          />
          <input
            className="landing-input"
            placeholder="Last name (optional)"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            autoComplete="family-name"
          />
          <input
            className="landing-input"
            placeholder="City (optional)"
            value={city}
            onChange={(e) => setCity(e.target.value)}
          />
          {error ? <FormError>{error}</FormError> : null}
          <div className="landing-actions">
            <button
              className="landing-btn landing-btn-primary"
              disabled={props.loading || working || !googleSetupReady}
              onClick={() => void submit()}
            >
              {working ? "Creating account…" : t("login.createAccountCta")}
            </button>
            <button
              type="button"
              className="landing-btn landing-btn-secondary"
              disabled={working}
              onClick={() => {
                setMode("login");
                setGoogleRegToken(null);
                setError(null);
              }}
            >
              {t("common.cancel")}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="landing-screen">
      <div className="landing-screen-inner landing-form">
        <LandingLogo />
        <h1 className="landing-form-title">{mode === "login" ? t("login.signInCta") : t("login.createAccountCta")}</h1>
        {props.notice ? <p className="landing-notice">{props.notice}</p> : null}
        <p className="landing-form-lead">
          {mode === "login" ? t("login.subtitle") : t("login.registerLead")}
        </p>

        {googleEnabled ? (
          <div className="login-google-block stack">
            <div className="login-google-btn-wrap">
              <GoogleLogin
                onSuccess={(cred) => void handleGoogleCredential(cred.credential)}
                onError={() => setError("Google sign-in was cancelled or failed.")}
                text={mode === "register" ? "signup_with" : "signin_with"}
                shape="rectangular"
                theme="outline"
                size="large"
                width="100%"
              />
            </div>
            <div className="login-divider landing-muted" aria-hidden>
              <span>or</span>
            </div>
          </div>
        ) : null}

        <input
          className="landing-input"
          placeholder={mode === "login" ? t("login.emailOrUsername") : t("login.email")}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <input
          className="landing-input"
          placeholder={t("login.password")}
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        {mode === "register" ? (
          <>
            <input
              className="landing-input"
              placeholder="Username (unique, e.g. gabi_tennis)"
              value={userName}
              onChange={(e) => setUserName(e.target.value.replace(/\s/g, "_"))}
              autoComplete="username"
            />
            <input
              className="landing-input"
              placeholder="First name"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              autoComplete="given-name"
            />
            <input
              className="landing-input"
              placeholder="Last name"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              autoComplete="family-name"
            />
            <input
              className="landing-input"
              placeholder="City (optional)"
              value={city}
              onChange={(e) => setCity(e.target.value)}
            />
          </>
        ) : null}

        {error ? <FormError>{error}</FormError> : null}

        <div className="landing-actions">
          <button
            className="landing-btn landing-btn-primary"
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
            {working ? "Working…" : mode === "login" ? t("login.signInCta") : t("login.createAccountCta")}
          </button>

          <button
            type="button"
            className="landing-btn landing-btn-secondary"
            disabled={working}
            onClick={() => {
              setMode((m) => (m === "login" ? "register" : "login"));
              setError(null);
            }}
          >
            {mode === "login" ? t("login.createAccount") : t("login.haveAccount")}
          </button>

          <button
            type="button"
            className="landing-btn-tertiary"
            disabled={working}
            onClick={() => {
              setError(null);
              setMode("choose");
            }}
          >
            {t("common.back")}
          </button>
        </div>
      </div>
    </div>
  );
}
