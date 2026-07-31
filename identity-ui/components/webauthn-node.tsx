"use client";

// Kratos's real WebAuthn/passkey integration contract: a `script` node
// loads Kratos's own webauthn.js (which defines window.oryWebAuthnRegistration
// /oryWebAuthnLogin), and trigger nodes carry an `onclick` string that calls
// one of those functions. That function runs the actual
// navigator.credentials.create()/get() browser ceremony, writes the
// resulting attestation into this flow's hidden webauthn_register/
// webauthn_login input, and submits the surrounding form — Kratos verifies
// the real credential server-side, exactly like every other flow submit.
// This file only wires up the two integration points Kratos documents; it
// runs no cryptography itself.

import type { ReactNode } from "react";
import { useEffect } from "react";

export function WebAuthnScript({
  src, async, crossOrigin, integrity, referrerPolicy,
}: {
  src?: string; async?: boolean; crossOrigin?: string; integrity?: string; referrerPolicy?: string;
}): ReactNode {
  useEffect(() => {
    if (!src || document.querySelector(`script[data-webauthn-src="${src}"]`)) return;
    const script = document.createElement("script");
    script.src = src;
    script.async = async ?? true;
    script.dataset.webauthnSrc = src;
    if (crossOrigin) script.crossOrigin = crossOrigin;
    if (integrity) script.integrity = integrity;
    if (referrerPolicy) script.referrerPolicy = referrerPolicy;
    document.body.appendChild(script);
  }, [src, async, crossOrigin, integrity, referrerPolicy]);
  return null;
}

export function WebAuthnTriggerButton({
  label, onclick, disabled,
}: {
  label: string; onclick: string; disabled?: boolean;
}): ReactNode {
  return (
    <button
      className="inline-flex h-9 items-center justify-center rounded-3xl border border-foreground/20 bg-input/50 px-4 text-sm hover:bg-muted"
      disabled={disabled}
      onClick={() => {
        // eslint-disable-next-line no-new-func -- Kratos's own documented
        // WebAuthn integration contract: this string comes from the Kratos
        // Admin/Public API response for this flow, not user input.
        new Function(onclick)();
      }}
      type="button"
    >
      {label}
    </button>
  );
}
