/**
 * How an application signs people in with buildOS ID, and the only package it
 * needs. Registered rather than configured: the id and secret come from the
 * console's Applications page, so adding an app changes no configuration here.
 *
 * One factory call, wired into `src/lib/auth.ts`, `src/proxy.ts` and the routes
 * under `src/app/auth/`. Server-only: it reads a client secret, so its caller
 * should declare `import "server-only"`.
 */
import type { NextRequest, NextResponse } from "next/server";
import { clearCookies } from "./oidc.cookies";
import { createForwardHandlers, type ForwardHandlers } from "./oidc.forward";
import { createSessionGuard } from "./oidc.guard";
import {
  createCallbackHandler,
  createLoginHandler,
  createLogoutHandler,
} from "./oidc.handlers";
import type { IdClientOptions } from "./oidc.options";
import { resolveIdClientOptions } from "./oidc.options";
import type { IdSession } from "./oidc.session";
import { readSession, sessionFromRequest } from "./oidc.session";

export type { ForwardHandlers, ForwardMethod } from "./oidc.forward";
export type { IdClientOptions } from "./oidc.options";
export type { IdSession } from "./oidc.session";

export interface IdClient {
  /**
   * Drop this app's platform session from a response you are about to send:
   * the sign-out that ends the identity session must end this one too, or the
   * next person to sign in on the browser inherits the token.
   */
  readonly clearSession: (response: NextResponse) => void;
  /** The session as this request carries it, or null. Never refreshes. */
  readonly getSession: () => Promise<IdSession | null>;
  /** Wire into `src/proxy.ts`. Renews a stale session rather than re-authorizing. */
  readonly guard: (request: NextRequest) => Promise<NextResponse>;
  readonly handlers: {
    readonly callback: (request: NextRequest) => Promise<NextResponse>;
    readonly login: (request: NextRequest) => Promise<NextResponse>;
    readonly logout: (request: NextRequest) => Promise<NextResponse>;
    /**
     * Wire into `src/app/api/[...path]/route.ts`. Relays to the platform API
     * with the access token attached, so it never reaches the browser.
     */
    readonly forward: ForwardHandlers;
  };
  /** `getSession` for a proxy, read off the request rather than `cookies()`. */
  readonly sessionOf: (request: NextRequest) => IdSession | null;
}

export function createIdClient(options: IdClientOptions = {}): IdClient {
  const resolved = resolveIdClientOptions(options);
  return {
    clearSession: (response) => clearCookies(response, resolved),
    getSession: () => readSession(resolved),
    sessionOf: (request) => sessionFromRequest(resolved, request),
    guard: createSessionGuard(resolved),
    handlers: {
      callback: createCallbackHandler(resolved),
      login: createLoginHandler(resolved),
      logout: createLogoutHandler(resolved),
      forward: createForwardHandlers(resolved),
    },
  };
}
