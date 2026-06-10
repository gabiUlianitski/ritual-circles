import React from "react";

/** Dynamic validation / API errors: announced to assistive tech. */
export function FormError(props: { children: React.ReactNode }) {
  return (
    <div className="error" role="alert" aria-live="polite">
      {props.children}
    </div>
  );
}
