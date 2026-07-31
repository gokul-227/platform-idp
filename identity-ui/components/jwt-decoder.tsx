"use client";

import type { ReactNode } from "react";
import { useState } from "react";

import { Field, FieldLabel } from "@/components/vendor/ui/field";
import { Input } from "@/components/vendor/ui/input";

function base64UrlDecode(segment: string): string {
  const padded = segment.replace(/-/g, "+").replace(/_/g, "/").padEnd(
    segment.length + ((4 - (segment.length % 4)) % 4),
    "=",
  );
  return decodeURIComponent(
    atob(padded)
      .split("")
      .map((c) => `%${c.charCodeAt(0).toString(16).padStart(2, "0")}`)
      .join(""),
  );
}

function formatExpiry(exp: unknown): { text: string; expired: boolean } | null {
  if (typeof exp !== "number") return null;
  const date = new Date(exp * 1000);
  const expired = date.getTime() < Date.now();
  return { expired, text: date.toISOString() };
}

// Client-side only: a JWT's header and payload are base64url-encoded JSON,
// not encrypted — decoding needs no server round trip and no secret. This
// never verifies the signature (that requires the issuer's real JWKS,
// already exposed above via OIDC discovery) — it only decodes the two
// segments a developer needs to eyeball while integrating.
export function JwtDecoder(): ReactNode {
  const [token, setToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [header, setHeader] = useState<Record<string, unknown> | null>(null);
  const [payload, setPayload] = useState<Record<string, unknown> | null>(null);

  function decode(value: string): void {
    setToken(value);
    setError(null);
    setHeader(null);
    setPayload(null);
    if (!value.trim()) return;
    const parts = value.trim().split(".");
    if (parts.length < 2) {
      setError("Not a JWT — expected at least a header.payload segment pair.");
      return;
    }
    try {
      setHeader(JSON.parse(base64UrlDecode(parts[0])) as Record<string, unknown>);
      setPayload(JSON.parse(base64UrlDecode(parts[1])) as Record<string, unknown>);
    } catch {
      setError("Could not decode — is this a valid JWT?");
    }
  }

  const expiry = payload ? formatExpiry(payload.exp) : null;

  return (
    <div className="flex flex-col gap-4">
      <Field>
        <FieldLabel htmlFor="jwt_input">Token</FieldLabel>
        <Input
          id="jwt_input"
          onChange={(e) => decode(e.target.value)}
          placeholder="Paste an access token or ID token"
          value={token}
        />
      </Field>
      {error ? <p className="text-destructive text-sm">{error}</p> : null}
      {header || payload ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div>
            <p className="mb-1 font-medium text-sm">Header</p>
            <pre className="overflow-x-auto rounded bg-muted px-3 py-2 text-xs">
              {JSON.stringify(header, null, 2)}
            </pre>
          </div>
          <div>
            <p className="mb-1 font-medium text-sm">Payload</p>
            <pre className="overflow-x-auto rounded bg-muted px-3 py-2 text-xs">
              {JSON.stringify(payload, null, 2)}
            </pre>
            {expiry ? (
              <p className={`mt-2 text-xs ${expiry.expired ? "text-destructive" : "text-muted-foreground"}`}>
                {expiry.expired ? "Expired" : "Expires"} {expiry.text}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
      <p className="text-muted-foreground text-xs">
        Decodes the header and payload only — this does not verify the signature. To verify one,
        check it against this issuer&apos;s real JWKS URI above.
      </p>
    </div>
  );
}
