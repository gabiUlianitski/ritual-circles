import React, { useEffect, useState } from "react";
import { GoogleLogin } from "@react-oauth/google";
import { api, setAuthToken } from "../api/client";
import { FormError } from "./FormError";

const USER_NAME_RE = /^[a-zA-Z0-9_]{3,32}$/;

type LoginMode = "login" | "register" | "google-setup";

export function Login(props: {
  onAuthed: () => Promise<void> | void;
  loading: boolean;
  googleClientId?: string;
}) {
  const [mode, setMode] = useState<LoginMode>("login");
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
        const em = email.trim();
        if (!em || !em.includes("@")) {
          setError("Please enter a valid email address.");
          return;
        }
        const { token } = await api.login({ email: em, password });
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

  if (mode === "google-setup") {
    return (
      <div className="card stack">
        <div className="h1">Finish your account</div>
        <p className="muted" style={{ margin: 0 }}>
          Signed in with Google as <strong>{googleEmail || email}</strong>. Pick a username — this is how others find
          you in the app.
        </p>
        <input
          placeholder="Username (unique, e.g. gabi_tennis)"
          value={userName}
          onChange={(e) => setUserName(e.target.value.replace(/\s/g, "_"))}
          autoComplete="username"
        />
        <input
          placeholder="First name"
          value={firstName}
          onChange={(e) => setFirstName(e.target.value)}
          autoComplete="given-name"
        />
        <input
          placeholder="Last name (optional)"
          value={lastName}
          onChange={(e) => setLastName(e.target.value)}
          autoComplete="family-name"
        />
        <input placeholder="City (optional)" value={city} onChange={(e) => setCity(e.target.value)} />
        {error ? <FormError>{error}</FormError> : null}
        <button
          className="primary"
          disabled={props.loading || working || !googleSetupReady}
          onClick={() => void submit()}
        >
          {working ? "Creating account…" : "Create account"}
        </button>
        <button
          type="button"
          disabled={working}
          onClick={() => {
            setMode("login");
            setGoogleRegToken(null);
            setError(null);
          }}
        >
          Cancel
        </button>
      </div>
    );
  }

  return (
    <div className="card stack">
      <div className="h1">{mode === "login" ? "Sign in" : "Create account"}</div>
      <div className="muted">
        {mode === "login" ? (
          <>Sign in with the email and password you used when you joined, or continue with Google.</>
        ) : (
          <>
            Your <strong>username</strong> is unique in the app (like a handle). First and last name are what people
            see in your circle. Or create an account with Google below.
          </>
        )}
      </div>

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
          <div className="login-divider muted" aria-hidden>
            <span>or</span>
          </div>
        </div>
      ) : null}

      <input placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
      <input
        placeholder="Password"
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />

      {mode === "register" ? (
        <>
          <input
            placeholder="Username (unique, e.g. gabi_tennis)"
            value={userName}
            onChange={(e) => setUserName(e.target.value.replace(/\s/g, "_"))}
            autoComplete="username"
          />
          <input
            placeholder="First name"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            autoComplete="given-name"
          />
          <input
            placeholder="Last name"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            autoComplete="family-name"
          />
          <input placeholder="City (optional)" value={city} onChange={(e) => setCity(e.target.value)} />
        </>
      ) : null}

      {error ? <FormError>{error}</FormError> : null}

      <button
        className="primary"
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
        {working ? "Working…" : mode === "login" ? "Sign in with email" : "Create account with email"}
      </button>

      <button
        type="button"
        disabled={working}
        onClick={() => {
          setMode((m) => (m === "login" ? "register" : "login"));
          setError(null);
        }}
      >
        {mode === "login" ? "New here? Create account" : "Already have an account? Sign in"}
      </button>
    </div>
  );
}
