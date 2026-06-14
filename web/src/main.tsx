import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import { GoogleOAuthProvider } from "@react-oauth/google";
import { App } from "./ui/App";
import { api } from "./api/client";
import "./i18n";
import "./ui/styles.css";

function Root() {
  const [googleClientId, setGoogleClientId] = useState(
    () => (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined)?.trim() ?? "",
  );

  useEffect(() => {
    if (googleClientId) return;
    void (async () => {
      try {
        const cfg = await api.getAuthConfig();
        if (cfg.googleClientId?.trim()) setGoogleClientId(cfg.googleClientId.trim());
      } catch {
        /* Google sign-in stays hidden */
      }
    })();
  }, [googleClientId]);

  if (googleClientId) {
    return (
      <GoogleOAuthProvider clientId={googleClientId}>
        <App />
      </GoogleOAuthProvider>
    );
  }
  return <App />;
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
);
