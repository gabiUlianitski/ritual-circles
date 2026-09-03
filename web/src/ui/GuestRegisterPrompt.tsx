import React, { useEffect } from "react";
import { useTranslation } from "react-i18next";

export function GuestRegisterPrompt(props: {
  message: string;
  onConfirm: () => void;
  onDismiss: () => void;
}) {
  const { t } = useTranslation();

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") props.onDismiss();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [props.onDismiss]);

  return (
    <div className="guest-gate-overlay" role="presentation" onClick={props.onDismiss}>
      <div
        className="guest-gate-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="guest-gate-title"
        aria-describedby="guest-gate-body"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="guest-gate-title" className="guest-gate-title">
          {t("guest.mustRegisterTitle")}
        </h2>
        <p id="guest-gate-body" className="guest-gate-body">
          {props.message}
        </p>
        <div className="guest-gate-actions">
          <button type="button" className="primary" onClick={props.onConfirm}>
            {t("guest.createAccount")}
          </button>
          <button type="button" className="guest-gate-stay" onClick={props.onDismiss}>
            {t("guest.keepLooking")}
          </button>
        </div>
      </div>
    </div>
  );
}
